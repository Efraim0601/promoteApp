package com.afriland.promote.payment;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuration of the TrustPayWay aggregator, bound from {@code app.trustpayway.*}
 * (application.yml / environment variables). Kept separate from the gateway so the
 * credentials live in one typed place and can be injected anywhere.
 */
@Component
@ConfigurationProperties(prefix = "app.trustpayway")
@Getter
@Setter
public class TrustPayWayProperties {

    /** Base URL of the API, e.g. https://api.trustpayway.com (no trailing slash). */
    private String baseUrl;

    /** Long-lived SECRET_KEY used as a Bearer token on /api/login only. */
    private String secretKey;

    /** Merchant application id sent in the /api/login body. */
    private String applicationId;

    /**
     * Public URL TrustPayWay will POST the payment result to (our webhook).
     * Must be reachable from the internet, e.g. https://promote.example.com/api/payment/webhook/trustpayway
     */
    private String notifUrl;

    /**
     * Optional shared secret: if set, the webhook must carry it in the
     * {@code X-Webhook-Secret} header, otherwise the call is rejected.
     */
    private String webhookSecret;

    /** TCP connect timeout (ms) for every aggregator call. Guards against a hung/unreachable host. */
    private int connectTimeoutMs = 5000;

    /** Read timeout (ms) for every aggregator call — the hard ceiling a worker thread can block. */
    private int readTimeoutMs = 15000;
}
