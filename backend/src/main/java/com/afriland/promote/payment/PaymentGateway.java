package com.afriland.promote.payment;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;

import java.util.Optional;

/**
 * Mobile Money payment abstraction. The default implementation is simulated
 * (mirrors the prototype's USSD-push flow). A real aggregator — MAVIANCE or
 * Trustpayway — can be plugged in later by adding an implementation selected via
 * {@code app.payment.provider} without touching the rest of the application.
 */
public interface PaymentGateway {

    /** Identifier matched against {@code app.payment.provider}. */
    String provider();

    /**
     * Push a payment request to the customer's phone (USSD prompt).
     * Returns the operator-side request reference.
     */
    PaymentRequest requestPayment(Subscription sub, String operator);

    /**
     * Pull the current status from the aggregator (fallback for polling when the
     * webhook has not arrived yet). Default: unknown — the simulated gateway and
     * any provider without a status API simply return empty.
     */
    default Optional<PayStatus> queryStatus(Subscription sub) {
        return Optional.empty();
    }

    /** Result of a payment request initiation. */
    record PaymentRequest(String externalRef, String operator, boolean accepted) {}
}
