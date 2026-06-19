package com.afriland.promote.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate-limits the live "get-status" call the public {@code /status} polling endpoints make to the
 * payment gateway. Without it, every poll of a still-{@code pending} order triggers a slow gateway
 * call; under load that exhausted the DB connection pool (the call used to run inside a transaction).
 *
 * <p>The gateway call itself is now made OUTSIDE any DB transaction by the callers; this guard simply
 * caps how often it happens: at most once per {@code min-interval} per order reference, and never
 * during a short grace window after creation (so the webhook gets a head start). The webhook and the
 * reconciliation sweep remain the primary settlement paths — this is only the polling fallback.
 *
 * <p>State is in-memory (per reference); a restart just allows an immediate re-pull. Entries are
 * dropped once an order settles (see {@link #clear(String)}) to keep the map bounded.
 */
@Component
public class LiveStatusThrottle {

    private final ConcurrentHashMap<String, Instant> lastPull = new ConcurrentHashMap<>();
    private final long minIntervalMs;
    private final long graceMs;

    public LiveStatusThrottle(
            @Value("${app.payment.status-pull.min-interval-ms:8000}") long minIntervalMs,
            @Value("${app.payment.status-pull.grace-ms:5000}") long graceMs) {
        this.minIntervalMs = minIntervalMs;
        this.graceMs = graceMs;
    }

    /**
     * True when the caller may make a live gateway pull for {@code ref} now. Returns false during the
     * post-creation grace window and when a pull happened less than {@code min-interval} ago. Atomic
     * per reference, so a burst of concurrent pollers yields a single pull rather than a thundering herd.
     */
    public boolean allow(String ref, Instant createdAt) {
        Instant now = Instant.now();
        if (createdAt != null && now.isBefore(createdAt.plusMillis(graceMs))) return false;
        boolean[] allow = {false};
        lastPull.compute(ref, (k, prev) -> {
            if (prev == null || now.isAfter(prev.plusMillis(minIntervalMs))) {
                allow[0] = true;
                return now;
            }
            return prev;
        });
        return allow[0];
    }

    /** Drop the bookkeeping for an order once it is terminal, keeping the map bounded. */
    public void clear(String ref) {
        lastPull.remove(ref);
    }
}
