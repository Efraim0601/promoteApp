package com.afriland.promote.service;

import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

/**
 * The single source of business references, shared by subscriptions AND recharges so both draw from
 * the same {@code PRM-####} sequence and never collide. The counter is initialised above the highest
 * existing PRM number across BOTH tables (after seeding), so a restart can't reuse a number.
 */
@Service
public class ReferenceSequence {

    private static final int START = 1008;   // prototype demo data used 1000..1008
    private static final String PREFIX = "PRM-";

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final AtomicInteger seq = new AtomicInteger(START);

    public ReferenceSequence(SubscriptionRepository subs, RechargeRepository recharges) {
        this.subs = subs;
        this.recharges = recharges;
    }

    /** Next reference, e.g. "PRM-1010" — unique across subscriptions and recharges. */
    public String next() {
        return PREFIX + seq.incrementAndGet();
    }

    /** Raise the counter above the highest existing PRM reference in BOTH tables. */
    public synchronized void init() {
        int max = Math.max(START, Math.max(
                maxRef(subs.findAll().stream().map(com.afriland.promote.model.Subscription::getRef)),
                maxRef(recharges.findAll().stream().map(com.afriland.promote.model.Recharge::getRef))));
        seq.set(max);
    }

    private static int maxRef(Stream<String> refs) {
        return refs.filter(r -> r != null && r.startsWith(PREFIX))
                .map(r -> { try { return Integer.parseInt(r.substring(PREFIX.length())); } catch (Exception e) { return 0; } })
                .max(Integer::compareTo).orElse(START);
    }
}
