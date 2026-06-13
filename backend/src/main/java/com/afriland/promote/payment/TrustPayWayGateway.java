package com.afriland.promote.payment;

import com.afriland.promote.model.PayStatus;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
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
    private final ObjectMapper json;

    // Cached access token + its expiry instant (login is reused until it nears expiry).
    private volatile String accessToken;
    private volatile Instant tokenExpiry = Instant.EPOCH;

    public TrustPayWayGateway(TrustPayWayProperties props, ObjectMapper json) {
        this.props = props;
        this.json = json;
        // Bounded connect/read timeouts so a slow or hung aggregator never pins a worker thread
        // indefinitely (the root cause of thread-pool exhaustion under load).
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofMillis(props.getConnectTimeoutMs()))
                .withReadTimeout(Duration.ofMillis(props.getReadTimeoutMs()));
        this.http = RestClient.builder()
                .baseUrl(props.getBaseUrl() == null ? "" : props.getBaseUrl())
                .requestFactory(ClientHttpRequestFactories.get(settings))
                .build();
    }

    @Override
    public String provider() {
        return "trustpayway";
    }

    @Override
    public PaymentRequest requestPayment(Payable sub, String operator) {
        String network = network(operator);
        String msisdn = msisdn(sub);
        // Send the globally-unique gateway order id (falls back to the bare ref for safety). It is
        // echoed back in the webhook and avoids "Duplicate transaction detected" after DB resets.
        String orderId = sub.getGatewayRef() != null && !sub.getGatewayRef().isBlank()
                ? sub.getGatewayRef() : sub.getRef();
        Map<String, String> payload = Map.of(
                "amount", String.valueOf(sub.getAmount()),
                "currency", "XAF",
                "subscriberMsisdn", msisdn,
                "description", sub.getPaymentLabel(),
                "orderId", orderId,
                "notifUrl", props.getNotifUrl()
        );
        // Capture the raw body + HTTP status ourselves: on failure the API may answer either a
        // structured 417 ({data.status, message}) OR a bare {"error": "..."} — the latter has no
        // data/message, so without the raw body the cause is invisible (logged as null/null).
        ResponseEntity<String> entity = postProcessPayment(network, payload);
        // One retry on a transient 5xx (e.g. nginx 502/503/504): the request didn't reach the app,
        // so re-sending the SAME orderId is idempotent. Business declines (4xx) are never retried.
        if (entity.getStatusCode().is5xxServerError()) {
            log.warn("TrustPayWay process-payment {} for ref={} — retry once after a short delay",
                    entity.getStatusCode().value(), sub.getRef());
            try { Thread.sleep(800); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            entity = postProcessPayment(network, payload);
        }

        String raw = entity.getBody();
        ProcessResponse resp = parse(raw);
        // Real success shape: { data: { status, transaction_id }, message, status_code }.
        String dataStatus = resp != null && resp.data() != null ? resp.data().status() : null;
        String txId = resp != null && resp.data() != null ? resp.data().transactionId() : null;
        // A USSD push is "accepted" once it is *initiated* — TrustPayWay answers 2xx (202
        // "Payment request successful") with a transaction_id and NO terminal data.status.
        // It is only rejected up front on a non-2xx answer or an explicit FAILED status
        // (e.g. "Beneficiaire introuvable"). The final outcome (client PIN) arrives later
        // via the webhook or get-status polling, so an accepted push stays PENDING — it is
        // never marked failed here, otherwise a successful push would surface as an error.
        boolean httpOk = entity.getStatusCode().is2xxSuccessful();
        boolean explicitlyFailed = "FAILED".equalsIgnoreCase(dataStatus)
                || map(dataStatus).orElse(null) == PayStatus.failed;
        boolean accepted = httpOk && !explicitlyFailed;
        // Surface the aggregator's reason only on rejection; fall back to {"error": "..."} / raw body.
        String message = accepted ? null
                : (resp != null && resp.message() != null ? resp.message() : errorField(raw));
        // Orange often answers 500 on the first push (order registered) then 400 Duplicate on our
        // retry — the USSD was already sent; treat as accepted and wait for the webhook.
        if (!accepted && isDuplicateOrder(raw)) {
            log.info("TrustPayWay process-payment DUPLICATE ref={} network={} http={} — treating as accepted (push likely already sent)",
                    sub.getRef(), network, entity.getStatusCode().value());
            accepted = true;
            message = null;
        }
        if (accepted) {
            log.info("TrustPayWay process-payment ACCEPTED ref={} network={} http={} status={} txId={}",
                    sub.getRef(), network, entity.getStatusCode().value(), dataStatus, txId);
        } else {
            // Log the HTTP status + raw body so the real reason is never hidden again.
            log.warn("TrustPayWay process-payment REJECTED ref={} network={} msisdn={} http={} status={} msg={} body={}",
                    sub.getRef(), network, msisdn, entity.getStatusCode().value(), dataStatus, message, raw);
        }
        return new PaymentRequest(txId, operator, accepted, message);
    }

    /** POST process-payment, reading the body regardless of HTTP status (we never let RestClient throw).
     *  TrustPayWay/Orange sometimes answers with {@code Content-Type: application/octet-stream}
     *  even when the payload is JSON — RestClient's {@code toEntity(String.class)} then fails
     *  before we can inspect the body, so we always read raw bytes. */
    private ResponseEntity<String> postProcessPayment(String network, Map<String, String> payload) {
        return http.post()
                .uri("/api/{network}/process-payment", network)
                .header("Authorization", "Bearer " + token())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .exchange((req, res) -> ResponseEntity.status(res.getStatusCode()).body(readBody(res)));
    }

    /** Read the response body as UTF-8 text regardless of Content-Type. */
    private static String readBody(ClientHttpResponse res) {
        try (InputStream in = res.getBody()) {
            if (in == null) return null;
            byte[] bytes = in.readAllBytes();
            return bytes.length == 0 ? null : new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** Parse the process-payment body into our response shape; null/empty/garbage → null. */
    private ProcessResponse parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return json.readValue(raw, ProcessResponse.class);
        } catch (Exception ex) {
            log.warn("TrustPayWay: unparseable process-payment body: {}", raw);
            return null;
        }
    }

    /** TrustPayWay returns 400 when our 5xx-retry re-sends an orderId that the first attempt registered. */
    static boolean isDuplicateOrder(String raw) {
        if (raw == null || raw.isBlank()) return false;
        String l = raw.toLowerCase();
        return l.contains("duplicate") && l.contains("already exists");
    }

    /** Extract a top-level {@code {"error": "..."}} message, when the API returns that shape. */
    private String errorField(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            var node = json.readTree(raw).get("error");
            return node == null ? null : node.asText();
        } catch (Exception ex) {
            return null;
        }
    }

    @Override
    public Optional<PayStatus> queryStatus(Payable sub) {
        if (sub.getPaymentTxId() == null) return Optional.empty();
        try {
            StatusResponse resp = http.get()
                    .uri("/api/{network}/get-status/{id}", network(sub.getPay()), sub.getPaymentTxId())
                    .header("Authorization", "Bearer " + token())
                    .accept(MediaType.APPLICATION_JSON)
                    .exchange((req, res) -> {
                        String raw = readBody(res);
                        if (!res.getStatusCode().is2xxSuccessful() || raw == null || raw.isBlank()) return null;
                        try {
                            return json.readValue(raw, StatusResponse.class);
                        } catch (Exception ex) {
                            log.warn("TrustPayWay: unparseable get-status body: {}", raw);
                            return null;
                        }
                    });
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
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("applicationId", props.getApplicationId()))
                .exchange((req, res) -> {
                    String raw = readBody(res);
                    if (!res.getStatusCode().is2xxSuccessful() || raw == null || raw.isBlank()) {
                        throw new IllegalStateException("TrustPayWay login failed: HTTP "
                                + res.getStatusCode().value());
                    }
                    try {
                        return json.readValue(raw, LoginResponse.class);
                    } catch (Exception ex) {
                        throw new IllegalStateException("TrustPayWay login returned unparseable body", ex);
                    }
                });
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

    /** MoMo number to charge → digits with country code (e.g. "2376XXXXXXXX") expected by the API.
     *  Uses the payment number the client gave for this operator (payPhone), falling back to the KYC
     *  phone. Numbers carry their country code (E.164, "+CC…"); a bare national number is assumed
     *  Cameroon for backward compatibility. */
    private String msisdn(Payable order) {
        // payPhone is the number the client gave for this operator; for MoMo it is always set
        // (the create flow defaults it to the KYC phone), so it is the single source here.
        String raw = order.getPayPhone();
        boolean hasCountryCode = raw != null && raw.trim().startsWith("+");
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (hasCountryCode) return digits;
        return digits.startsWith("237") ? digits : "237" + digits;
    }

    /**
     * Map a TrustPayWay status string to our internal enum (empty = still pending). Matched by
     * keyword rather than exact value so any provider variant of a decline/cancel/timeout is caught
     * — this is what lets a USSD cancellation auto-notify the platform (via webhook / get-status
     * polling) without the client pressing "Cancel". Unknown/PENDING/PROCESSING leave the state as-is.
     */
    public static Optional<PayStatus> map(String status) {
        if (status == null) return Optional.empty();
        String s = status.trim().toUpperCase();
        if (s.isEmpty()) return Optional.empty();
        if (s.contains("SUCCES") || s.contains("COMPLET") || s.contains("APPROV") || s.equals("PAID") || s.equals("OK")) {
            return Optional.of(PayStatus.paid);
        }
        if (s.contains("FAIL") || s.contains("CANCEL") || s.contains("DECLIN") || s.contains("REJECT")
                || s.contains("EXPIR") || s.contains("ABORT") || s.contains("TIMEOUT") || s.contains("TIMED")
                || s.contains("INSUFFIC") || s.contains("REFUS") || s.contains("DENIED") || s.contains("ERROR")) {
            return Optional.of(PayStatus.failed);
        }
        return Optional.empty(); // PENDING / PROCESSING / INITIATED / unknown → leave as-is
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
