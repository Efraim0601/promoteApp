package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Safety net for the asynchronous payment flow: a periodic sweep that rescues {@code pending}
 * orders the webhook never confirmed.
 *
 * <p>Only orders created in the last {@code lookback-seconds} (default 1 h) are considered, so
 * the sweep stays small and never competes with live payment traffic for long.
 *
 * <p>For each still-pending order older than {@code pull-after-seconds} it pulls a live status from
 * the aggregator (get-status) <em>in parallel on {@code reconcileExecutor}</em>; orders still pending
 * after {@code expire-after-seconds} are forced to {@code failed}. Every step is idempotent.
 *
 * <p>The {@code @Scheduled} tick only enqueues work and returns immediately — it never blocks on
 * gateway I/O, and uses a dedicated thread pool separate from {@code paymentExecutor}.
 */
@Component
public class PaymentReconciliationJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationJob.class);

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final SubscriptionService subscriptionService;
    private final RechargeService rechargeService;
    private final PaymentReconciliationService reconciliationService;
    private final ThreadPoolTaskExecutor reconcileExecutor;

    @Value("${app.payment.reconcile.enabled:false}")
    private boolean enabled;
    @Value("${app.payment.reconcile.pull-after-seconds:20}")
    private long pullAfterSeconds;
    @Value("${app.payment.reconcile.expire-after-seconds:900}")
    private long expireAfterSeconds;
    @Value("${app.payment.reconcile.lookback-seconds:3600}")
    private long lookbackSeconds;
    @Value("${app.payment.reconcile.batch:200}")
    private int batch;
    @Value("${app.payment.reconcile.batch-timeout-seconds:120}")
    private long batchTimeoutSeconds;

    public PaymentReconciliationJob(SubscriptionRepository subs, RechargeRepository recharges,
                                    SubscriptionService subscriptionService, RechargeService rechargeService,
                                    PaymentReconciliationService reconciliationService,
                                    @Qualifier("reconcileExecutor") ThreadPoolTaskExecutor reconcileExecutor) {
        this.subs = subs;
        this.recharges = recharges;
        this.subscriptionService = subscriptionService;
        this.rechargeService = rechargeService;
        this.reconciliationService = reconciliationService;
        this.reconcileExecutor = reconcileExecutor;
    }

    /** Enqueue a sweep; never block the scheduler thread on gateway I/O. */
    @Scheduled(fixedDelayString = "${app.payment.reconcile.interval-ms:300000}")
    public void reconcile() {
        if (!enabled) return;
        if (!reconciliationService.tryAcquireSweep()) {
            log.debug("Payment reconciliation: sweep already running, skip tick");
            return;
        }
        reconcileExecutor.execute(() -> {
            try {
                runSweep();
            } catch (RuntimeException ex) {
                log.warn("Payment reconciliation sweep failed: {}", ex.getMessage());
            } finally {
                reconciliationService.releaseSweep();
            }
        });
    }

    private void runSweep() {
        Instant now = Instant.now();
        Instant windowStart = now.minusSeconds(Math.max(60, lookbackSeconds));
        Instant pullCutoff = now.minusSeconds(pullAfterSeconds);
        Instant expireCutoff = now.minusSeconds(expireAfterSeconds);
        var page = PageRequest.of(0, Math.max(1, batch));

        if (!windowStart.isBefore(pullCutoff)) {
            log.debug("Payment reconciliation: lookback window empty (lookback={}s, pullAfter={}s)",
                    lookbackSeconds, pullAfterSeconds);
            return;
        }

        List<Subscription> sPending = subs.findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
                PayStatus.pending, windowStart, pullCutoff, page);
        List<Recharge> rPending = recharges.findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
                PayStatus.pending, windowStart, pullCutoff, page);

        int total = sPending.size() + rPending.size();
        if (total == 0) return;

        // Bounded chunks so the reconcile pool never rejects a task (a dropped task's future would never
        // complete and hang the await on the full batch timeout). Shared with the manual sweep.
        List<Supplier<Void>> jobs = new ArrayList<>(total);
        for (Subscription s : sPending) jobs.add(() -> { reconcileSubscription(s, expireCutoff); return null; });
        for (Recharge r : rPending) jobs.add(() -> { reconcileRecharge(r, expireCutoff); return null; });
        PaymentReconciliationService.runBounded(jobs, reconcileExecutor, batchTimeoutSeconds, log);

        log.info("Payment reconciliation: processed {} pending order(s) from last {}s (subs={}, recharges={})",
                total, lookbackSeconds, sPending.size(), rPending.size());
    }

    private void reconcileSubscription(Subscription s, Instant expireCutoff) {
        try {
            PayStatus before = s.getPayStatus();
            Subscription after = subscriptionService.refreshStatus(s.getRef());
            if (after != null && after.getPayStatus() != before && after.getPayStatus() != PayStatus.pending) {
                log.info("Payment reconciliation: subscription {} get-status -> {}",
                        after.getRef(), after.getPayStatus());
            }
            if (after != null && after.getPayStatus() == PayStatus.pending
                    && after.getCreatedAt() != null && after.getCreatedAt().isBefore(expireCutoff)) {
                subscriptionService.expirePending(s.getRef());
                log.info("Payment reconciliation: subscription {} expired (no confirmation within {}s)",
                        s.getRef(), expireAfterSeconds);
            }
        } catch (RuntimeException ex) {
            log.warn("Payment reconciliation: subscription {} failed: {}", s.getRef(), ex.getMessage());
        }
    }

    private void reconcileRecharge(Recharge r, Instant expireCutoff) {
        try {
            PayStatus before = r.getPayStatus();
            Recharge after = rechargeService.refreshStatus(r.getRef());
            if (after != null && after.getPayStatus() != before && after.getPayStatus() != PayStatus.pending) {
                log.info("Payment reconciliation: recharge {} get-status -> {}",
                        after.getRef(), after.getPayStatus());
            }
            if (after != null && after.getPayStatus() == PayStatus.pending
                    && after.getCreatedAt() != null && after.getCreatedAt().isBefore(expireCutoff)) {
                rechargeService.expirePending(r.getRef());
                log.info("Payment reconciliation: recharge {} expired (no confirmation within {}s)",
                        r.getRef(), expireAfterSeconds);
            }
        } catch (RuntimeException ex) {
            log.warn("Payment reconciliation: recharge {} failed: {}", r.getRef(), ex.getMessage());
        }
    }
}
