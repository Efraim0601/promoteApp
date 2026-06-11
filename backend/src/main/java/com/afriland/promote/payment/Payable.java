package com.afriland.promote.payment;

/**
 * Anything that can be pushed to the Mobile Money aggregator: a card {@code Subscription} or a card
 * {@code Recharge}. The {@link PaymentGateway} reads only these fields, so the same gateway code
 * (login, retry, status mapping) serves both without duplication.
 */
public interface Payable {

    /** Human business reference (used in the description), e.g. "PRM-1009" or "RC000123". */
    String getRef();

    /** Globally-unique order id sent to the aggregator (survives DB resets); null for cash/SARA/simulated. */
    String getGatewayRef();

    /** Aggregator-side transaction id, once a push has been initiated. */
    String getPaymentTxId();

    /** Amount due, in XAF. */
    int getAmount();

    /** Mobile Money number that receives the USSD prompt, in E.164 form. */
    String getPayPhone();

    /** Payment method / operator: om | mtn. */
    String getPay();
}
