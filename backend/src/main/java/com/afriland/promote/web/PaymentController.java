package com.afriland.promote.web;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.payment.TrustPayWayGateway;
import com.afriland.promote.payment.TrustPayWayProperties;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Aggregator-facing payment endpoints: webhook (push notifications) + provider info. */
@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final SubscriptionService service;
    private final PaymentGateway gateway;            // the active (@Primary) gateway
    private final TrustPayWayProperties trustPayWay;

    public PaymentController(SubscriptionService service, PaymentGateway gateway,
                            TrustPayWayProperties trustPayWay) {
        this.service = service;
        this.gateway = gateway;
        this.trustPayWay = trustPayWay;
    }

    /** Lets the frontend know which gateway is live (e.g. show demo buttons only when simulated). */
    @GetMapping("/provider")
    public PaymentProviderDto provider() {
        return new PaymentProviderDto(gateway.provider());
    }

    /**
     * TrustPayWay notification endpoint (the {@code notifUrl} we register). Public — but
     * if {@code app.trustpayway.webhook-secret} is set, the caller must echo it in the
     * {@code X-Webhook-Secret} header. We always answer 200 once accepted so the
     * aggregator stops retrying.
     */
    @PostMapping("/webhook/trustpayway")
    public ResponseEntity<Void> trustPayWayWebhook(
            @RequestBody TrustPayWayWebhook body,
            @RequestHeader(value = "X-Webhook-Secret", required = false) String secret) {

        String expected = trustPayWay.getWebhookSecret();
        if (expected != null && !expected.isBlank() && !expected.equals(secret)) {
            log.warn("Rejected TrustPayWay webhook for orderId={} (bad secret)", body.orderId());
            return ResponseEntity.status(403).build();
        }

        PayStatus status = TrustPayWayGateway.map(body.status()).orElse(null);
        // The decline reason (e.g. "Solde insuffisant") may ride in confirmationStatus or description;
        // log the full body so the exact field is always visible, and keep it for the client UI.
        String reason = firstNonBlank(body.confirmationStatus(), body.description());
        // The aggregator often delivers the same webhook twice. Log the full body at INFO only on the
        // FIRST terminal delivery (the transaction is still pending); duplicates go to DEBUG to cut noise.
        Subscription before = service.findByOrderId(body.orderId());
        boolean firstDelivery = before != null && before.getPayStatus() == PayStatus.pending;
        String line = "TrustPayWay webhook orderId={} status={} -> {} reason={} amount={} txId={} description={} confirmationStatus={}";
        if (firstDelivery) {
            log.info(line, body.orderId(), body.status(), status, reason, body.amount(), body.transactionId(),
                    body.description(), body.confirmationStatus());
        } else {
            log.debug(line, body.orderId(), body.status(), status, reason, body.amount(), body.transactionId(),
                    body.description(), body.confirmationStatus());
        }
        service.applyWebhook(body.orderId(), status, reason);
        return ResponseEntity.ok().build();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v.trim();
        return null;
    }
}
