package com.afriland.promote.payment;

/**
 * Signals that a freshly-created MoMo order (subscription or recharge) has been committed as
 * {@code pending} and now needs its USSD push sent to the aggregator. Published inside the
 * create transaction and consumed AFTER COMMIT by {@code PaymentDispatcher}, so the background
 * worker always sees the persisted row.
 *
 * @param kind which table the {@code ref} belongs to
 * @param ref  the business reference (PRM-#### / RC######) of the pending order
 */
public record PaymentInitiationEvent(Kind kind, String ref) {

    public enum Kind { SUBSCRIPTION, RECHARGE }
}
