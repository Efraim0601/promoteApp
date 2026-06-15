package com.afriland.promote.service;

import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

/**
 * Source of business references.
 *  - Subscriptions: {@code PRM-####} (shared prefix, counter starts at 1008 to skip demo data)
 *  - Recharges:     {@code RC-####}  (distinct prefix, own counter)
 * Each counter is initialised above the highest existing number in its respective table so a
 * restart never reuses a reference.
 */
@Service
public class ReferenceSequence {

    private static final int  SUB_START = 1008;   // demo data used PRM-1000..PRM-1008
    private static final int  RC_START  = 1000;
    private static final String SUB_PREFIX = "PRM-";
    private static final String RC_PREFIX  = "RC-";

    private final SubscriptionRepository subs;
    private final RechargeRepository recharges;
    private final AtomicInteger seq   = new AtomicInteger(SUB_START);
    private final AtomicInteger seqRc = new AtomicInteger(RC_START);

    public ReferenceSequence(SubscriptionRepository subs, RechargeRepository recharges) {
        this.subs = subs;
        this.recharges = recharges;
    }

    /** Next subscription reference, e.g. {@code PRM-1010}. */
    public String next() {
        return SUB_PREFIX + seq.incrementAndGet();
    }

    /** Next recharge reference, e.g. {@code RC-1001}. */
    public String nextRecharge() {
        return RC_PREFIX + seqRc.incrementAndGet();
    }

    /** Raise both counters above the highest existing reference in each table. */
    public synchronized void init() {
        int maxSub = Math.max(SUB_START,
                maxRef(subs.findAll().stream().map(com.afriland.promote.model.Subscription::getRef), SUB_PREFIX));
        seq.set(maxSub);

        int maxRc = Math.max(RC_START,
                maxRef(recharges.findAll().stream().map(com.afriland.promote.model.Recharge::getRef), RC_PREFIX));
        seqRc.set(maxRc);
    }

    private static int maxRef(Stream<String> refs, String prefix) {
        return refs.filter(r -> r != null && r.startsWith(prefix))
                .map(r -> { try { return Integer.parseInt(r.substring(prefix.length())); } catch (Exception e) { return 0; } })
                .max(Integer::compareTo).orElse(0);
    }
}
