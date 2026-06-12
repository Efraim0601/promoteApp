package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/**
 * Safety net for the asynchronous payment flow: a periodic sweep that rescues {@code pending}
 * orders the webhook never confirmed.
 *
 * <p>For each still-pending order older than {@code pull-after-seconds} it pulls a live status from
 * the aggregator (get-status); orders still pending after {@code expire-after-seconds} are forced to
 * {@code failed} (beyond any realistic USSD window). Every step is idempotent — it only ever moves a
 * row that is still {@code pending} — and batch-limited, so it never loads the whole table.
 *
 * <p>Disabled by default ({@code app.payment.reconcile.enabled=false}). With several backend
 * replicas, enable it on EXACTLY ONE instance to avoid duplicate (harmless but wasteful) gateway
 * polls; idempotency keeps correctness even if more than one runs it.
 */
@Component
public class PaymentReconciliationJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationJob.class);

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final SubscriptionService subscriptionService;
    private final RechargeService rechargeService;

    @Value("${app.payment.reconcile.enabled:false}")
    private boolean enabled;
    @Value("${app.payment.reconcile.pull-after-seconds:20}")
    private long pullAfterSeconds;
    @Value("${app.payment.reconcile.expire-after-seconds:900}")
    private long expireAfterSeconds;
    @Value("${app.payment.reconcile.batch:200}")
    private int batch;

    public PaymentReconciliationJob(SubscriptionRepository subs, RechargeRepository recharges,
                                    SubscriptionService subscriptionService, RechargeService rechargeService) {
        this.subs = subs;
        this.recharges = recharges;
        this.subscriptionService = subscriptionService;
        this.rechargeService = rechargeService;
    }

    @Scheduled(fixedDelayString = "${app.payment.reconcile.interval-ms:60000}")
    public void reconcile() {
        if (!enabled) return;
        Instant now = Instant.now();
        Instant pullCutoff = now.minusSeconds(pullAfterSeconds);
        Instant expireCutoff = now.minusSeconds(expireAfterSeconds);
        var page = PageRequest.of(0, Math.max(1, batch));

        int touched = 0;
        try {
            List<Subscription> sPending = subs.findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
                    PayStatus.pending, pullCutoff, page);
            for (Subscription s : sPending) {
                Subscription after = subscriptionService.refreshStatus(s.getRef());  // pull live status
                if (after != null && after.getPayStatus() == PayStatus.pending
                        && after.getCreatedAt() != null && after.getCreatedAt().isBefore(expireCutoff)) {
                    subscriptionService.expirePending(s.getRef());
                }
                touched++;
            }

            List<Recharge> rPending = recharges.findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
                    PayStatus.pending, pullCutoff, page);
            for (Recharge r : rPending) {
                Recharge after = rechargeService.refreshStatus(r.getRef());
                if (after != null && after.getPayStatus() == PayStatus.pending
                        && after.getCreatedAt() != null && after.getCreatedAt().isBefore(expireCutoff)) {
                    rechargeService.expirePending(r.getRef());
                }
                touched++;
            }
        } catch (RuntimeException ex) {
            // Never let a sweep failure kill the scheduler; it retries on the next tick.
            log.warn("Payment reconciliation sweep failed: {}", ex.getMessage());
        }
        if (touched > 0) log.info("Payment reconciliation: processed {} pending order(s)", touched);
    }
}
