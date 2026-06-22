package com.afriland.promote.service;

import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.ReconcilePullResult;
import com.afriland.promote.web.dto.Dtos.ReconcileReport;
import com.afriland.promote.web.dto.Dtos.VerifyResult;
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

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

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
    /** Hard cap on the streaming "verify all pending/failed (history)" sweep, so an unbounded backlog
     *  can't pin the gateway or the connection forever. NEWEST first, so the cap keeps the recoverable
     *  (recent) orders. */
    @Value("${app.payment.reconcile.stream-max:3000}")
    private int streamMax;

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

    /**
     * Per-order verification — the merchant-facing reconciliation entry point (GET /api/verify/{orderId}).
     * Resolves the order by its gateway order id (subscriptions first; ids are globally unique, then
     * recharges), pulls the live TrustPayWay status and realigns the local record. This is exactly
     * what regularises a "débité mais expiré/échoué" case: {@link SubscriptionService#reconcileFromGateway}
     * recovers a {@code failed} (displayed "Expiré") order to {@code paid} once the aggregator confirms.
     *
     * <p>Lightweight and idempotent: no sweep mutex (it's a single targeted gateway call), and the
     * gateway is only contacted while the order is still {@code pending}/{@code failed} — an already
     * settled order returns its status without an external call.
     */
    public VerifyResult verifyOrder(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "order_id_required");
        }
        String id = orderId.trim();
        Subscription sub = subscriptionService.findByOrderId(id);
        if (sub != null) {
            ReconcilePullResult r = subscriptionService.reconcileFromGateway(sub.getRef());
            return new VerifyResult(id, sub.getRef(), "subscription", r.statusAfter(), r.changed(), r.reason());
        }
        Recharge rec = rechargeService.findByOrderId(id);
        if (rec != null) {
            ReconcilePullResult r = rechargeService.reconcileFromGateway(rec.getRef());
            return new VerifyResult(id, rec.getRef(), "recharge", r.statusAfter(), r.changed(), r.reason());
        }
        throw new ResponseStatusException(NOT_FOUND, "order_not_found");
    }

    /** Progress sink for the streaming "verify all pending/failed" sweep — lets the controller push each
     *  per-order outcome to the admin UI over SSE as it happens. */
    public interface ReconcileSink {
        /** Called once with the number of candidate orders, before any is verified. */
        void started(int total);
        /** Called after each order is verified (1-based index), with its realignment result. */
        void each(int index, ReconcilePullResult result);
    }

    /**
     * Verify EVERY MoMo order still {@code pending}/{@code failed} (all history, newest first, capped by
     * {@code stream-max}) one at a time — the same per-order live check as {@code GET /api/verify/{orderId}}
     * — pushing each outcome to {@code sink} so the admin can watch a live log. Sequential on purpose:
     * ordered logs and a steady, gentle load on the aggregator rather than a burst. Guarded by the shared
     * sweep mutex, so it never overlaps the scheduled sweep or a manual {@link #reconcileSince}.
     */
    public ReconcileReport verifyAllPendingFailed(ReconcileSink sink) {
        if (!tryAcquireSweep()) {
            throw new ResponseStatusException(CONFLICT, "reconcile_already_running");
        }
        try {
            var page = PageRequest.of(0, Math.max(1, streamMax));
            List<Subscription> subRows = subs.findMoMoReconcilableSince(Instant.EPOCH, page);
            List<Recharge> rechRows = recharges.findMoMoReconcilableSince(Instant.EPOCH, page);
            int total = subRows.size() + rechRows.size();
            sink.started(total);
            log.info("Streaming verification: {} candidate MoMo order(s) (subs={}, recharges={})",
                    total, subRows.size(), rechRows.size());

            List<ReconcilePullResult> details = new ArrayList<>(total);
            int updated = 0, unchanged = 0, errors = 0, i = 0;
            for (Subscription s : subRows) {
                ReconcilePullResult r = verifyOne(s.getRef(), () -> subscriptionService.reconcileFromGateway(s.getRef()));
                details.add(r);
                sink.each(++i, r);
                if (isError(r)) errors++; else if (r.changed()) updated++; else unchanged++;
            }
            for (Recharge rec : rechRows) {
                ReconcilePullResult r = verifyOne(rec.getRef(), () -> rechargeService.reconcileFromGateway(rec.getRef()));
                details.add(r);
                sink.each(++i, r);
                if (isError(r)) errors++; else if (r.changed()) updated++; else unchanged++;
            }
            log.info("Streaming verification done: scanned={} updated={} unchanged={} errors={}",
                    total, updated, unchanged, errors);
            // hours = 0 marks an "all history" run (no time window).
            return new ReconcileReport(0, total, updated, unchanged, errors, List.copyOf(details));
        } finally {
            releaseSweep();
        }
    }

    /** A non-blank note on an unchanged result is the failure signal ({@code reconcileFromGateway}
     *  catches gateway errors and reports them this way); {@code reason_updated} is a real change, not an error. */
    private static boolean isError(ReconcilePullResult r) {
        return !r.changed() && r.note() != null && !r.note().isBlank();
    }

    /** Run one per-order verification, never letting an unexpected failure abort the whole stream. */
    private ReconcilePullResult verifyOne(String ref, Supplier<ReconcilePullResult> call) {
        try {
            return call.get();
        } catch (RuntimeException ex) {
            log.warn("Streaming verification failed for {}: {}", ref, ex.toString());
            return new ReconcilePullResult(ref, null, null, false, ex.getMessage());
        }
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

            // Bounded chunks keep parallelism in step with the pool. If a chunk still overflows the pool, the
            // executor's CallerRunsPolicy runs the overflow on this thread (never drops it), so every future
            // completes and the await can't hang on an orphaned task.
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
     * ({@code maxPoolSize + queueCapacity}), awaiting each chunk before submitting the next, so
     * parallelism stays matched to the pool. Should a chunk still overflow (the active/worker count
     * race at exactly capacity), the pool's {@code CallerRunsPolicy} runs the overflow on the calling
     * thread — the task is never dropped, so every {@link CompletableFuture} completes and the
     * {@code allOf} await can't hang on an orphan. Stops submitting once the overall deadline passes and
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
