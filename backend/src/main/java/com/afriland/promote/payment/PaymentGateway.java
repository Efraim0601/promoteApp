package com.afriland.promote.payment;

import com.afriland.promote.model.PayStatus;

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
    PaymentRequest requestPayment(Payable order, String operator);

    /**
     * Pull the current status from the aggregator (fallback for polling when the
     * webhook has not arrived yet). Default: unknown — the simulated gateway and
     * any provider without a status API simply return empty.
     */
    default Optional<PayStatus> queryStatus(Payable order) {
        return queryDetailedStatus(order).map(GatewayStatus::status);
    }

    /**
     * Like {@link #queryStatus} but also carries the aggregator's current reason/message — so manual
     * reconciliation can refresh the failure reason shown on the portal, even when the status itself
     * is unchanged (the aggregator's reason for a failed order can change over time). Default:
     * unknown — providers without a status API return empty.
     */
    default Optional<GatewayStatus> queryDetailedStatus(Payable order) {
        return Optional.empty();
    }

    /**
     * Pull the FINAL, reconciled status — used by manual/scheduled reconciliation, not the live
     * polling path. Aggregators with a dedicated reconciliation endpoint (TrustPayWay's
     * {@code GET /api/verify/{orderId}}, which returns the outcome after their background
     * operator-check) override this to recover "client débité mais statut expiré": an order our
     * local timeout force-failed that the operator actually completed. Default: same as the live
     * status, so providers without a reconciliation endpoint are unaffected.
     */
    default Optional<GatewayStatus> queryReconciledStatus(Payable order) {
        return queryDetailedStatus(order);
    }

    /** A live status pulled from the aggregator: the mapped {@link PayStatus} plus the raw reason
     *  message (e.g. "Solde insuffisant"), null when none was provided. */
    record GatewayStatus(PayStatus status, String message) {}

    /** Result of a payment request initiation. {@code message} carries the aggregator's
     *  reason on rejection (e.g. "Solde insuffisant"), null/empty when accepted. */
    record PaymentRequest(String externalRef, String operator, boolean accepted, String message) {}
}
