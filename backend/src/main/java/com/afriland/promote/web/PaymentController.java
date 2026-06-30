package com.afriland.promote.web;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.payment.TrustPayWayGateway;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.IntegrationSettingsService;
import com.afriland.promote.service.RechargeService;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.service.PaymentReconciliationService;
import com.afriland.promote.service.PaymentReconciliationService.ReconcileSink;
import com.afriland.promote.web.dto.Dtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

/** Aggregator-facing payment endpoints: webhook (push notifications) + provider info. */
@Tag(name = "Paiements", description = "Agrégateur Mobile Money, webhooks et réconciliation")
@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final SubscriptionService service;
    private final RechargeService rechargeService;
    private final PaymentReconciliationService reconciliationService;
    private final PaymentGateway gateway;            // the active (@Primary) gateway
    private final IntegrationSettingsService settings;
    private final ActionAuditService audit;
    private final ObjectMapper json;
    private final ThreadPoolTaskExecutor reconcileExecutor;

    public PaymentController(SubscriptionService service, RechargeService rechargeService,
                             PaymentReconciliationService reconciliationService,
                             PaymentGateway gateway, IntegrationSettingsService settings,
                             ActionAuditService audit, ObjectMapper json,
                             @Qualifier("reconcileExecutor") ThreadPoolTaskExecutor reconcileExecutor) {
        this.service = service;
        this.rechargeService = rechargeService;
        this.reconciliationService = reconciliationService;
        this.gateway = gateway;
        this.settings = settings;
        this.audit = audit;
        this.json = json;
        this.reconcileExecutor = reconcileExecutor;
    }

    /** Lets the frontend know which gateway is live (e.g. show demo buttons only when simulated). */
    @GetMapping("/provider")
    public PaymentProviderDto provider() {
        return new PaymentProviderDto(gateway.provider());
    }

    /**
     * Admin-only manual reconciliation: pull TrustPayWay get-status for MoMo orders in the last
     * {@code hours} (default 1, max 168, capped by {@code lookback-seconds}) that are still
     * {@code pending} or {@code failed}.
     */
    @PostMapping("/reconcile")
    public ReconcileReport reconcile(@RequestParam(defaultValue = "1") int hours) {
        if (!"trustpayway".equalsIgnoreCase(gateway.provider())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT, "reconcile_requires_trustpayway");
        }
        return reconciliationService.reconcileSince(hours);
    }

    /**
     * Admin-only live verification (SSE): re-check EVERY MoMo order still pending/failed (all history,
     * newest first, capped by {@code app.payment.reconcile.stream-max}) one at a time — the same per-order
     * check as {@code GET /api/verify/{orderId}} — streaming one {@code log} event per order so the admin
     * UI can show progress live, then a final {@code done} event with the summary.
     *
     * <p>Events: {@code start} {total}, {@code log} {index, ref, statusBefore, statusAfter, changed, note,
     * reason}, {@code done} (the {@link ReconcileReport}), or {@code error} {error} on a conflict/failure.
     */
    @GetMapping(value = "/reconcile/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter reconcileStream(Authentication auth, HttpServletResponse response) {
        if (!"trustpayway".equalsIgnoreCase(gateway.provider())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "reconcile_requires_trustpayway");
        }
        // Defeat nginx response buffering so each log line reaches the browser the moment it's sent.
        response.setHeader("X-Accel-Buffering", "no");
        SseEmitter emitter = new SseEmitter(0L); // no servlet timeout; the sweep is bounded by stream-max
        reconcileExecutor.execute(() -> {
            try {
                ReconcileReport report = reconciliationService.verifyAllPendingFailed(new ReconcileSink() {
                    @Override public void started(int total) { emit(emitter, "start", Map.of("total", total)); }
                    @Override public void each(int index, ReconcilePullResult r) {
                        emit(emitter, "log", Map.of(
                                "index", index,
                                "ref", nz(r.ref()), "statusBefore", nz(r.statusBefore()),
                                "statusAfter", nz(r.statusAfter()), "changed", r.changed(),
                                "note", nz(r.note()), "reason", nz(r.reason())));
                    }
                });
                emit(emitter, "done", report);
                audit.record(auth, "VERIFY_STREAM", "PAYMENT", "-",
                        "Vérification live: " + report.updated() + " régularisé(s) sur " + report.scanned() + " vérifié(s)");
                emitter.complete();
            } catch (ClientGoneException gone) {
                log.info("Live verification stopped: client disconnected");
                emitter.complete();
            } catch (ResponseStatusException busy) {
                emit(emitter, "error", Map.of("error", String.valueOf(busy.getReason())));
                emitter.complete();
            } catch (RuntimeException e) {
                log.warn("Live verification aborted: {}", e.toString());
                emit(emitter, "error", Map.of("error", "stream_failed"));
                emitter.complete();
            }
        });
        return emitter;
    }

    /** Serialise + push one SSE event. A broken pipe means the admin closed the panel → abort the sweep
     *  (so we stop hitting the gateway) by surfacing a {@link ClientGoneException} the run loop unwinds. */
    private void emit(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(json.writeValueAsString(data), MediaType.APPLICATION_JSON));
        } catch (IOException io) {
            throw new ClientGoneException(io);
        }
    }

    private static String nz(String s) { return s == null ? "" : s; }

    /** Signals the SSE client went away mid-stream; unwinds the run loop to release the sweep mutex. */
    private static final class ClientGoneException extends RuntimeException {
        ClientGoneException(Throwable cause) { super(cause); }
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

        String expected = settings.tpwWebhookSecret();
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
        // The webhook is shared: route by order id. A subscription takes priority; if none matches,
        // it's a recharge (order ids are globally unique, so there is no ambiguity).
        if (before != null) {
            service.applyWebhook(body.orderId(), status, reason);
        } else {
            rechargeService.applyWebhook(body.orderId(), status, reason);
        }
        return ResponseEntity.ok().build();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v.trim();
        return null;
    }
}
