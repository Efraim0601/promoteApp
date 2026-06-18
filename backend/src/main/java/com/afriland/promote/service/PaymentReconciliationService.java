package com.afriland.promote.service;

import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.ReconcilePullResult;
import com.afriland.promote.web.dto.Dtos.ReconcileReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import static org.springframework.http.HttpStatus.CONFLICT;

/**
 * Manual reconciliation: query TrustPayWay get-status for MoMo orders in a time window and align
 * local {@code pay_status} with the aggregator (including {@code failed} → {@code paid} recovery).
 *
 * <p>Work runs on {@code reconcileExecutor} only — never on {@code paymentExecutor} — and a single
 * sweep mutex prevents overlapping scheduled + manual runs from piling up gateway calls.
 */
@Service
public class PaymentReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationService.class);

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final SubscriptionService subscriptionService;
    private final RechargeService rechargeService;
    private final ThreadPoolTaskExecutor reconcileExecutor;

    private final AtomicBoolean sweepRunning = new AtomicBoolean();

    @Value("${app.payment.reconcile.batch:200}")
    private int batch;
    @Value("${app.payment.reconcile.batch-timeout-seconds:120}")
    private long batchTimeoutSeconds;
    /** Manual-reconcile window cap, in hours — independent of the scheduled sweep's lookback so an
     *  operator can reconcile the last 24 h / 48 h on demand. The batch cap still bounds the work. */
    @Value("${app.payment.reconcile.manual-max-hours:168}")
    private int manualMaxHours;

    public PaymentReconciliationService(SubscriptionRepository subs, RechargeRepository recharges,
                                        SubscriptionService subscriptionService,
                                        RechargeService rechargeService,
                                        @Qualifier("reconcileExecutor") ThreadPoolTaskExecutor reconcileExecutor) {
        this.subs = subs;
        this.recharges = recharges;
        this.subscriptionService = subscriptionService;
        this.rechargeService = rechargeService;
        this.reconcileExecutor = reconcileExecutor;
    }

    /** Shared with {@link PaymentReconciliationJob} — only one sweep at a time. */
    boolean tryAcquireSweep() {
        return sweepRunning.compareAndSet(false, true);
    }

    void releaseSweep() {
        sweepRunning.set(false);
    }

    /**
     * Reconcile MoMo subscriptions and recharges created in the last {@code hours} (default 1, capped
     * by {@code lookback-seconds}) that are still {@code pending} or {@code failed} with a gateway id.
     * Gateway calls run in parallel on the reconcile pool (not the payment pool).
     */
    public ReconcileReport reconcileSince(int hours) {
        if (!tryAcquireSweep()) {
            throw new ResponseStatusException(CONFLICT, "reconcile_already_running");
        }
        try {
            int maxHours = Math.max(1, manualMaxHours);
            int windowHours = Math.max(1, Math.min(hours, maxHours));
            long windowSeconds = windowHours * 3600L;
            Instant since = Instant.now().minusSeconds(windowSeconds);
            var page = PageRequest.of(0, Math.max(1, batch));

            List<Subscription> subRows = subs.findMoMoReconcilableSince(since, page);
            List<Recharge> rechRows = recharges.findMoMoReconcilableSince(since, page);
            int scanned = subRows.size() + rechRows.size();
            if (scanned == 0) {
                log.info("Manual payment reconciliation: no MoMo orders to check in the last {}s", windowSeconds);
                return new ReconcileReport(windowHours, 0, 0, 0, 0, List.of());
            }

            log.info("Manual payment reconciliation: checking {} order(s) from the last {}s (subs={}, recharges={})",
                    scanned, windowSeconds, subRows.size(), rechRows.size());

            List<Supplier<ReconcilePullResult>> jobs = new ArrayList<>(scanned);
            for (Subscription s : subRows) jobs.add(() -> subscriptionService.reconcileFromGateway(s.getRef()));
            for (Recharge r : rechRows) jobs.add(() -> rechargeService.reconcileFromGateway(r.getRef()));

            // Bounded chunks so the reconcile pool never rejects a task. A rejected task would leave its
            // future uncompleted, hanging the await for the full batch timeout (the 120s freeze seen in prod
            // when >80 orders matched) and returning partial results.
            List<ReconcilePullResult> details = runBounded(jobs, reconcileExecutor, batchTimeoutSeconds, log);

            int updated = 0, unchanged = 0, errors = 0;
            for (ReconcilePullResult row : details) {
                if (row.note() != null && !row.note().isBlank() && !row.changed()) errors++;
                else if (row.changed()) updated++;
                else unchanged++;
            }

            log.info("Manual payment reconciliation done: scanned={} updated={} unchanged={} errors={}",
                    scanned, updated, unchanged, errors);
            return new ReconcileReport(windowHours, scanned, updated, unchanged, errors, List.copyOf(details));
        } finally {
            releaseSweep();
        }
    }

    /**
     * Run {@code jobs} on the reconcile pool in chunks no larger than the pool can hold
     * ({@code maxPoolSize + queueCapacity}), awaiting each chunk before submitting the next. This
     * guarantees a task is never rejected — a rejected task is silently discarded by the pool's
     * drop handler, so its {@link CompletableFuture} would never complete and the {@code allOf}
     * await would block for the whole timeout. Stops submitting once the overall deadline passes and
     * returns the results that completed normally (partial, but bounded — never a dead 120 s freeze).
     * Shared by the manual sweep and {@link PaymentReconciliationJob}.
     */
    static <T> List<T> runBounded(List<Supplier<T>> jobs, ThreadPoolTaskExecutor pool,
                                  long timeoutSeconds, Logger log) {
        int chunkSize = Math.max(1, pool.getMaxPoolSize() + pool.getQueueCapacity());
        long deadlineNanos = System.nanoTime() + timeoutSeconds * 1_000_000_000L;
        List<T> results = new ArrayList<>(jobs.size());
        for (int i = 0; i < jobs.size(); i += chunkSize) {
            List<Supplier<T>> chunk = jobs.subList(i, Math.min(i + chunkSize, jobs.size()));
            List<CompletableFuture<T>> futures = new ArrayList<>(chunk.size());
            for (Supplier<T> job : chunk) futures.add(CompletableFuture.supplyAsync(job, pool));
            long remainingNanos = deadlineNanos - System.nanoTime();
            try {
                CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
                        .orTimeout(Math.max(1, remainingNanos), TimeUnit.NANOSECONDS)
                        .join();
            } catch (RuntimeException ex) {
                log.warn("Reconciliation chunk timed out or failed: {}", ex.getMessage());
            }
            for (CompletableFuture<T> f : futures) {
                if (f.isDone() && !f.isCompletedExceptionally()) results.add(f.join());
            }
            if (System.nanoTime() >= deadlineNanos) break;
        }
        return results;
    }
}
