package com.afriland.promote.security;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory brute-force protection for the login endpoints.
 *
 * <p>A key (email or normalised phone number) is locked out for {@value #LOCKOUT_MINUTES} minutes
 * once it accumulates {@value #MAX_FAILURES} failed attempts within a {@value #WINDOW_MINUTES}-minute
 * sliding window. The lockout expires automatically; no admin action is required to unblock.
 *
 * <p>A successful login clears the counter immediately.
 *
 * <p>Thread-safety: each {@link LockState} guards its own mutable state with {@code synchronized}
 * so concurrent login attempts for the same key are serialised without contending on a global lock.
 */
@Component
public class LoginRateLimiter {

    static final int MAX_FAILURES = 6;
    static final long WINDOW_MINUTES = 15;
    static final long LOCKOUT_MINUTES = 30;

    private static final Duration WINDOW = Duration.ofMinutes(WINDOW_MINUTES);
    private static final Duration LOCKOUT = Duration.ofMinutes(LOCKOUT_MINUTES);

    private final ConcurrentHashMap<String, LockState> state = new ConcurrentHashMap<>();

    /** Returns true when {@code key} is currently locked out. */
    public boolean isLocked(String key) {
        LockState s = state.get(key);
        return s != null && s.isLocked();
    }

    /** Records a failed attempt. Triggers a lockout once the threshold is reached. */
    public void recordFailure(String key) {
        state.computeIfAbsent(key, k -> new LockState()).addFailure();
    }

    /** Clears the failure history for {@code key} after a successful authentication. */
    public void recordSuccess(String key) {
        state.remove(key);
    }

    private static final class LockState {

        private final ArrayDeque<Instant> failures = new ArrayDeque<>();
        private Instant lockedUntil;

        synchronized void addFailure() {
            Instant now = Instant.now();
            failures.addLast(now);
            // Drop entries that have slid out of the window.
            while (!failures.isEmpty() && failures.peekFirst().isBefore(now.minus(WINDOW))) {
                failures.pollFirst();
            }
            if (failures.size() >= MAX_FAILURES) {
                lockedUntil = now.plus(LOCKOUT);
            }
        }

        synchronized boolean isLocked() {
            if (lockedUntil == null) return false;
            if (Instant.now().isAfter(lockedUntil)) {
                lockedUntil = null;
                failures.clear();
                return false;
            }
            return true;
        }
    }
}
