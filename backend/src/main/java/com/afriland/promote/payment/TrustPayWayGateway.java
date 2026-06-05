package com.afriland.promote.payment;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * Real gateway backed by the TrustPayWay aggregator (Orange / MTN MoMo).
 *
 * <p>Flow:
 * <ol>
 *   <li>{@code POST /api/login} with the SECRET_KEY → short-lived access token (cached).</li>
 *   <li>{@code POST /api/{method}/process-payment} → pushes the USSD prompt, returns a
 *       transaction id we store on the subscription.</li>
 *   <li>The customer enters their PIN; TrustPayWay calls our webhook ({@code notifUrl})
 *       with the final status. As a fallback, {@link #queryStatus} pulls
 *       {@code GET /api/{method}/get-status/{id}} while the client polls.</li>
 * </ol>
 *
 * <p>Active only when {@code app.payment.provider=trustpayway}.
 */
@Component
public class TrustPayWayGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(TrustPayWayGateway.class);

    private final TrustPayWayProperties props;
    private final RestClient http;

    // Cached access token + its expiry instant (login is reused until it nears expiry).
    private volatile String accessToken;
    private volatile Instant tokenExpiry = Instant.EPOCH;

    public TrustPayWayGateway(TrustPayWayProperties props) {
        this.props = props;
        this.http = RestClient.builder().baseUrl(props.getBaseUrl() == null ? "" : props.getBaseUrl()).build();
    }

    @Override
    public String provider() {
        return "trustpayway";
    }

    @Override
    public PaymentRequest requestPayment(Subscription sub, String operator) {
        String network = network(operator);
        ProcessResponse resp = http.post()
                .uri("/api/{network}/process-payment", network)
                .header("Authorization", "Bearer " + token())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "amount", String.valueOf(sub.getAmount()),
                        "currency", "XAF",
                        "subscriberMsisdn", msisdn(sub),
                        "description", "Carte Promote " + sub.getRef(),
                        "orderId", sub.getRef(),          // our reference — echoed back in the webhook
                        "notifUrl", props.getNotifUrl()
                ))
                .retrieve()
                // The API answers HTTP 417 with a JSON body on failure — don't let RestClient
                // throw, we want to read data.status / message and the transaction_id.
                .onStatus(HttpStatusCode::isError, (req, res) -> { })
                .body(ProcessResponse.class);

        // Real response shape: { data: { status, transaction_id }, message, status_code }.
        String dataStatus = resp != null && resp.data() != null ? resp.data().status() : null;
        String txId = resp != null && resp.data() != null ? resp.data().transactionId() : null;
        // The USSD push is "accepted" when initiated (PENDING / INITIATED / COMPLETED),
        // not when it failed up front (FAILED, e.g. "Beneficiaire introuvable").
        boolean accepted = dataStatus != null
                && !"FAILED".equalsIgnoreCase(dataStatus)
                && map(dataStatus).orElse(null) != PayStatus.failed;
        if (accepted) {
            log.info("TrustPayWay process-payment ref={} network={} status={} txId={}",
                    sub.getRef(), network, dataStatus, txId);
        } else {
            log.warn("TrustPayWay process-payment REJECTED ref={} network={} status={} msg={}",
                    sub.getRef(), network, dataStatus, resp != null ? resp.message() : "no/invalid response");
        }
        return new PaymentRequest(txId, operator, accepted);
    }

    @Override
    public Optional<PayStatus> queryStatus(Subscription sub) {
        if (sub.getPaymentTxId() == null) return Optional.empty();
        try {
            StatusResponse resp = http.get()
                    .uri("/api/{network}/get-status/{id}", network(sub.getPay()), sub.getPaymentTxId())
                    .header("Authorization", "Bearer " + token())
                    .retrieve()
                    .body(StatusResponse.class);
            return resp == null ? Optional.empty() : map(resp.status());
        } catch (RuntimeException ex) {
            log.warn("TrustPayWay get-status failed ref={}: {}", sub.getRef(), ex.getMessage());
            return Optional.empty();
        }
    }

    // ---- helpers ---------------------------------------------------------

    /** Reuse the access token until ~30 s before it expires, then re-login. */
    private synchronized String token() {
        if (accessToken != null && Instant.now().isBefore(tokenExpiry.minusSeconds(30))) {
            return accessToken;
        }
        LoginResponse login = http.post()
                .uri("/api/login")
                .header("Authorization", "Bearer " + props.getSecretKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("applicationId", props.getApplicationId()))
                .retrieve()
                .body(LoginResponse.class);
        if (login == null || login.accessToken() == null) {
            throw new IllegalStateException("TrustPayWay login returned no access_token");
        }
        accessToken = login.accessToken();
        // Docs: the token lasts 2h. The response carries no expires_in, so default to 7200s.
        long ttl = login.expiresIn() > 0 ? login.expiresIn() : 7200;
        tokenExpiry = Instant.now().plusSeconds(ttl);
        return accessToken;
    }

    /** Map our operator code to the TrustPayWay {network} path segment (per docs: mtn | orange). */
    private String network(String operator) {
        return switch (operator == null ? "" : operator.toLowerCase()) {
            case "om", "orange" -> "orange";
            case "mtn", "momo" -> "mtn";
            default -> operator;
        };
    }

    /** Phone stored as "+237 6XXXXXXXX" → digits "2376XXXXXXXX" expected by the API. */
    private String msisdn(Subscription sub) {
        String digits = sub.getPhone() == null ? "" : sub.getPhone().replaceAll("\\D", "");
        return digits.startsWith("237") ? digits : "237" + digits;
    }

    /** Map TrustPayWay status strings to our internal enum (empty = still pending). */
    public static Optional<PayStatus> map(String status) {
        if (status == null) return Optional.empty();
        return switch (status.toUpperCase()) {
            case "COMPLETED", "SUCCESS", "SUCCESSFUL" -> Optional.of(PayStatus.paid);
            case "FAILED", "CANCELLED", "CANCELED", "EXPIRED", "REJECTED" -> Optional.of(PayStatus.failed);
            default -> Optional.empty(); // PENDING / PROCESSING / unknown → leave as-is
        };
    }

    // ---- API response shapes (only the fields we need) -------------------

    @JsonIgnoreProperties(ignoreUnknown = true)
    record LoginResponse(@JsonProperty("access_token") String accessToken,
                         @JsonProperty("token_type") String tokenType,
                         @JsonProperty("expires_in") long expiresIn) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ProcessResponse(String message, @JsonProperty("status_code") Integer statusCode, ProcessData data) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ProcessData(String status, @JsonProperty("transaction_id") String transactionId,
                       String orderId, String subscriberMsisdn) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record StatusResponse(String status) {}
}
