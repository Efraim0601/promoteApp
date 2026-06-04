package com.afriland.promote.payment;

import com.afriland.promote.model.Subscription;

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

    /** Result of a payment request initiation. */
    record PaymentRequest(String externalRef, String operator, boolean accepted) {}
}
