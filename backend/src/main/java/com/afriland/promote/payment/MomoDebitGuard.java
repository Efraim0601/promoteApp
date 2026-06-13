package com.afriland.promote.payment;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.Subscription;

import java.time.Instant;

/**
 * Prevents a second TrustPayWay debit for the same MoMo number + amount + operator within a short
 * window when a prior attempt already registered a push (or settled as paid).
 */
public final class MomoDebitGuard {

    /** Default anti-double-debit window (5 minutes). */
    public static final long WINDOW_SECONDS = 300;

    private MomoDebitGuard() {}

  public static String payPhone9(String phone) {
        if (phone == null) return "";
        String d = phone.replaceAll("\\D", "");
        return d.length() > 9 ? d.substring(d.length() - 9) : d;
    }

    public static boolean withinWindow(Instant createdAt, long windowSeconds) {
        return createdAt != null && createdAt.isAfter(Instant.now().minusSeconds(windowSeconds));
    }

    /** True when we should return an existing subscription instead of creating a new one. */
    public static boolean shouldResumeSubscription(Subscription s, long windowSeconds) {
        if (s == null || !withinWindow(s.getCreatedAt(), windowSeconds)) return false;
        if (s.getPayStatus() == PayStatus.paid) return true;
        if (s.getPayStatus() == PayStatus.pending) return true;
        if (s.getPayStatus() == PayStatus.failed) {
            return !GatewayClientMessages.isBusinessDecline(s.getPaymentMessage());
        }
        return false;
    }

    /** True when we should return an existing recharge instead of creating a new one. */
    public static boolean shouldResumeRecharge(Recharge r, long windowSeconds) {
        if (r == null || !withinWindow(r.getCreatedAt(), windowSeconds)) return false;
        if (r.getPayStatus() == PayStatus.paid) return true;
        if (r.getPayStatus() == PayStatus.pending) return true;
        if (r.getPayStatus() == PayStatus.failed) {
            return !GatewayClientMessages.isBusinessDecline(r.getPaymentMessage());
        }
        return false;
    }

    /**
     * True when TrustPayWay already has (or had) a live debit attempt for this MoMo line — a second
     * process-payment must not be sent.
     */
    public static boolean blocksDuplicatePush(Subscription s, long windowSeconds) {
        if (s == null || !withinWindow(s.getCreatedAt(), windowSeconds)) return false;
        if (s.getPayStatus() == PayStatus.paid) return true;
        if (!s.isGatewayPushAccepted()) return false;
        return s.getPayStatus() == PayStatus.pending
                || (s.getPayStatus() == PayStatus.failed
                && !GatewayClientMessages.isBusinessDecline(s.getPaymentMessage()));
    }

    public static boolean blocksDuplicatePush(Recharge r, long windowSeconds) {
        if (r == null || !withinWindow(r.getCreatedAt(), windowSeconds)) return false;
        if (r.getPayStatus() == PayStatus.paid) return true;
        if (!r.isGatewayPushAccepted()) return false;
        return r.getPayStatus() == PayStatus.pending
                || (r.getPayStatus() == PayStatus.failed
                && !GatewayClientMessages.isBusinessDecline(r.getPaymentMessage()));
    }
}
