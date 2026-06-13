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
 * {@code paymentExecutor}. When saturated, extra reconcile tasks are dropped (never executed on the
 * caller thread) so live payment pushes are never delayed by reconciliation back-pressure.
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
        // Never borrow the submitting thread (scheduler / HTTP) — drop when saturated; payments stay fast.
        ex.setRejectedExecutionHandler((r, executor) ->
                log.warn("Reconcile pool saturated (active={}, queue={}) — task dropped; payments unaffected",
                        executor.getActiveCount(), executor.getQueue().size()));
        ex.setWaitForTasksToCompleteOnShutdown(true);
        ex.setAwaitTerminationSeconds(30);
        ex.initialize();
        return ex;
    }
}
