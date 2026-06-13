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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Safety net for the asynchronous payment flow: a periodic sweep that rescues {@code pending}
 * orders the webhook never confirmed.
 *
 * <p>For each still-pending order older than {@code pull-after-seconds} it pulls a live status from
 * the aggregator (get-status) <em>in parallel</em>; orders still pending after
 * {@code expire-after-seconds} are forced to {@code failed} (beyond any realistic USSD window).
 * Every step is idempotent — it only ever moves a row that is still {@code pending} — and
 * batch-limited, so it never loads the whole table.
 *
 * <p>The {@code @Scheduled} tick only enqueues work on {@code reconcileExecutor} and returns
 * immediately, so the scheduler thread is never blocked by slow gateway calls.
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
    private final ThreadPoolTaskExecutor reconcileExecutor;

    @Value("${app.payment.reconcile.enabled:false}")
    private boolean enabled;
    @Value("${app.payment.reconcile.pull-after-seconds:20}")
    private long pullAfterSeconds;
    @Value("${app.payment.reconcile.expire-after-seconds:900}")
    private long expireAfterSeconds;
    @Value("${app.payment.reconcile.batch:200}")
    private int batch;
    @Value("${app.payment.reconcile.batch-timeout-seconds:120}")
    private long batchTimeoutSeconds;

    private final AtomicBoolean running = new AtomicBoolean();

    public PaymentReconciliationJob(SubscriptionRepository subs, RechargeRepository recharges,
                                    SubscriptionService subscriptionService, RechargeService rechargeService,
                                    @Qualifier("reconcileExecutor") ThreadPoolTaskExecutor reconcileExecutor) {
        this.subs = subs;
        this.recharges = recharges;
        this.subscriptionService = subscriptionService;
        this.rechargeService = rechargeService;
        this.reconcileExecutor = reconcileExecutor;
    }

    /** Enqueue a sweep; never block the scheduler thread on gateway I/O. */
    @Scheduled(fixedDelayString = "${app.payment.reconcile.interval-ms:300000}")
    public void reconcile() {
        if (!enabled) return;
        if (!running.compareAndSet(false, true)) {
            log.debug("Payment reconciliation: previous sweep still running, skip tick");
            return;
        }
        reconcileExecutor.execute(() -> {
            try {
                runSweep();
            } catch (RuntimeException ex) {
                log.warn("Payment reconciliation sweep failed: {}", ex.getMessage());
            } finally {
                running.set(false);
            }
        });
    }

    private void runSweep() {
        Instant now = Instant.now();
        Instant pullCutoff = now.minusSeconds(pullAfterSeconds);
        Instant expireCutoff = now.minusSeconds(expireAfterSeconds);
        var page = PageRequest.of(0, Math.max(1, batch));

        List<Subscription> sPending = subs.findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
                PayStatus.pending, pullCutoff, page);
        List<Recharge> rPending = recharges.findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
                PayStatus.pending, pullCutoff, page);

        int total = sPending.size() + rPending.size();
        if (total == 0) return;

        List<CompletableFuture<Void>> tasks = new ArrayList<>(total);
        for (Subscription s : sPending) {
            tasks.add(CompletableFuture.runAsync(
                    () -> reconcileSubscription(s, expireCutoff), reconcileExecutor));
        }
        for (Recharge r : rPending) {
            tasks.add(CompletableFuture.runAsync(
                    () -> reconcileRecharge(r, expireCutoff), reconcileExecutor));
        }

        try {
            CompletableFuture.allOf(tasks.toArray(CompletableFuture[]::new))
                    .orTimeout(batchTimeoutSeconds, TimeUnit.SECONDS)
                    .join();
        } catch (RuntimeException ex) {
            log.warn("Payment reconciliation: batch timed out or failed after {}s ({} order(s) in flight): {}",
                    batchTimeoutSeconds, total, ex.getMessage());
        }
        log.info("Payment reconciliation: processed {} pending order(s) (subs={}, recharges={})",
                total, sPending.size(), rPending.size());
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
