package com.afriland.promote.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

/**
 * Enables background execution for the asynchronous payment pipeline.
 *
 * <p>{@code paymentExecutor} runs the aggregator USSD push off the HTTP request thread (see
 * {@code PaymentDispatcher}). It is intentionally bounded: under a burst the small queue fills,
 * the pool grows to {@code max}, and beyond that {@link ThreadPoolExecutor.CallerRunsPolicy}
 * makes the submitting thread run the task itself — graceful back-pressure that degrades toward
 * the legacy synchronous behaviour rather than dropping a payment.
 *
 * <p>{@code reconcileExecutor} runs reconciliation sweeps on its own bounded pool, separate from
 * {@code paymentExecutor}, so live payment pushes are never delayed by reconciliation back-pressure.
 * When saturated it applies {@code CallerRunsPolicy}: the submitting reconcile thread runs the task
 * itself rather than the task being dropped. Dropping was unsafe here — reconcile jobs are submitted as
 * {@link java.util.concurrent.CompletableFuture}s, and a silently-discarded task leaves its future
 * uncompleted, hanging the batch await for the full timeout (the 120 s manual-reconcile freeze that the
 * operator sees as "Échec de la réconciliation"). Because this pool is independent of
 * {@code paymentExecutor}, borrowing the caller thread never slows a payment.
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {

    private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

    @Value("${app.payment.pool.core:32}")
    private int core;
    @Value("${app.payment.pool.max:256}")
    private int max;
    @Value("${app.payment.pool.queue:64}")
    private int queue;
    @Value("${app.payment.pool.keep-alive-seconds:60}")
    private int keepAliveSeconds;

    @Value("${app.payment.reconcile.pool.core:4}")
    private int reconcileCore;
    @Value("${app.payment.reconcile.pool.max:16}")
    private int reconcileMax;
    @Value("${app.payment.reconcile.pool.queue:64}")
    private int reconcileQueue;

    @Bean("paymentExecutor")
    public ThreadPoolTaskExecutor paymentExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(core);
        ex.setMaxPoolSize(max);
        ex.setQueueCapacity(queue);
        ex.setKeepAliveSeconds(keepAliveSeconds);
        ex.setThreadNamePrefix("pay-");
        // Back-pressure instead of dropping: the caller runs the push when the pool+queue are full.
        ex.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // Idle non-core threads are reclaimed so the pool sits at `core` between bursts.
        ex.setAllowCoreThreadTimeOut(false);
        // Let in-flight pushes finish on shutdown (a deploy) instead of being interrupted mid-call.
        ex.setWaitForTasksToCompleteOnShutdown(true);
        ex.setAwaitTerminationSeconds(20);
        ex.initialize();
        return ex;
    }

    @Bean("reconcileExecutor")
    public ThreadPoolTaskExecutor reconcileExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(reconcileCore);
        ex.setMaxPoolSize(reconcileMax);
        ex.setQueueCapacity(reconcileQueue);
        ex.setKeepAliveSeconds(keepAliveSeconds);
        ex.setThreadNamePrefix("reconcile-");
        // Graceful back-pressure: when the pool+queue are full the submitting reconcile thread runs the task
        // itself. We must NOT silently drop it — reconcile jobs are CompletableFutures, and a discarded task
        // leaves its future uncompleted, hanging the batch await for the full timeout (the 120 s freeze the
        // operator sees as "Échec de la réconciliation"). This pool is separate from paymentExecutor, so
        // borrowing the caller thread never delays a payment.
        ex.setRejectedExecutionHandler((r, executor) -> {
            if (executor.isShutdown()) return;
            log.warn("Reconcile pool saturated (active={}, queue={}) — running on caller thread; payments unaffected",
                    executor.getActiveCount(), executor.getQueue().size());
            r.run();
        });
        ex.setWaitForTasksToCompleteOnShutdown(true);
        ex.setAwaitTerminationSeconds(30);
        ex.initialize();
        return ex;
    }
}
