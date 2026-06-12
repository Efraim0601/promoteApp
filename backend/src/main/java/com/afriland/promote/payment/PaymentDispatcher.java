package com.afriland.promote.payment;

import com.afriland.promote.service.RechargeService;
import com.afriland.promote.service.SubscriptionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Background half of the asynchronous payment flow. Listens for {@link PaymentInitiationEvent}s
 * published by the create transactions and, once that transaction has COMMITTED, pushes the USSD
 * prompt to the aggregator on the {@code paymentExecutor} pool — never on the HTTP request thread.
 *
 * <p>Lives in its own bean (not inside the services) for two reasons: {@code @Async} only works
 * through the Spring proxy (a self-invocation would run inline), and AFTER_COMMIT guarantees the
 * pending row is visible to the fresh transaction opened by {@code pushGateway}.
 */
@Component
public class PaymentDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PaymentDispatcher.class);

    private final SubscriptionService subscriptions;
    private final RechargeService recharges;

    public PaymentDispatcher(SubscriptionService subscriptions, RechargeService recharges) {
        this.subscriptions = subscriptions;
        this.recharges = recharges;
    }

    @Async("paymentExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaymentInitiation(PaymentInitiationEvent event) {
        try {
            switch (event.kind()) {
                case SUBSCRIPTION -> subscriptions.pushGateway(event.ref());
                case RECHARGE -> recharges.pushGateway(event.ref());
            }
        } catch (RuntimeException ex) {
            // pushGateway already marks the order failed on a gateway error; this guards against any
            // unexpected throwable so a single bad push never kills the worker thread.
            log.error("Async payment push failed for {} {}: {}", event.kind(), event.ref(), ex.getMessage(), ex);
        }
    }
}
