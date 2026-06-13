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
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Manual reconciliation: query TrustPayWay get-status for MoMo orders in a time window and align
 * local {@code pay_status} with the aggregator (including {@code failed} → {@code paid} recovery).
 */
@Service
public class PaymentReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationService.class);

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final SubscriptionService subscriptionService;
    private final RechargeService rechargeService;
    private final ThreadPoolTaskExecutor reconcileExecutor;

    @Value("${app.payment.reconcile.batch-timeout-seconds:120}")
    private long batchTimeoutSeconds;

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
     * Reconcile all MoMo subscriptions and recharges created in the last {@code hours} that are still
     * {@code pending} or {@code failed} and have a gateway order id. Calls run in parallel.
     */
    public ReconcileReport reconcileSince(int hours) {
        int window = Math.max(1, Math.min(hours, 168));
        Instant since = Instant.now().minusSeconds(window * 3600L);
        List<Subscription> subRows = subs.findMoMoReconcilableSince(since);
        List<Recharge> rechRows = recharges.findMoMoReconcilableSince(since);
        int scanned = subRows.size() + rechRows.size();
        if (scanned == 0) {
            log.info("Manual payment reconciliation: no MoMo orders to check in the last {}h", window);
            return new ReconcileReport(window, 0, 0, 0, 0, List.of());
        }

        log.info("Manual payment reconciliation: checking {} order(s) from the last {}h (subs={}, recharges={})",
                scanned, window, subRows.size(), rechRows.size());

        List<CompletableFuture<ReconcilePullResult>> tasks = new ArrayList<>(scanned);
        for (Subscription s : subRows) {
            tasks.add(CompletableFuture.supplyAsync(
                    () -> subscriptionService.reconcileFromGateway(s.getRef()), reconcileExecutor));
        }
        for (Recharge r : rechRows) {
            tasks.add(CompletableFuture.supplyAsync(
                    () -> rechargeService.reconcileFromGateway(r.getRef()), reconcileExecutor));
        }

        List<ReconcilePullResult> details = Collections.synchronizedList(new ArrayList<>(scanned));
        try {
            CompletableFuture.allOf(tasks.toArray(CompletableFuture[]::new))
                    .orTimeout(batchTimeoutSeconds, TimeUnit.SECONDS)
                    .join();
            for (CompletableFuture<ReconcilePullResult> t : tasks) {
                details.add(t.join());
            }
        } catch (RuntimeException ex) {
            log.warn("Manual payment reconciliation timed out or failed: {}", ex.getMessage());
            for (CompletableFuture<ReconcilePullResult> t : tasks) {
                if (t.isDone() && !t.isCompletedExceptionally()) details.add(t.join());
            }
        }

        int updated = 0, unchanged = 0, errors = 0;
        for (ReconcilePullResult row : details) {
            if (row.note() != null && !row.note().isBlank() && !row.changed()) errors++;
            else if (row.changed()) updated++;
            else unchanged++;
        }

        log.info("Manual payment reconciliation done: scanned={} updated={} unchanged={} errors={}",
                scanned, updated, unchanged, errors);
        return new ReconcileReport(window, scanned, updated, unchanged, errors, List.copyOf(details));
    }
}
