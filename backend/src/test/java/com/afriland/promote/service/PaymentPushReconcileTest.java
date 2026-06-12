package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Deterministic coverage of the async building blocks {@code pushGateway} and {@code expirePending}
 * (the methods the dispatcher and the reconciliation sweep call). Kept in the default synchronous
 * profile so no background dispatcher races with the explicit calls under test.
 */
@SpringBootTest
class PaymentPushReconcileTest {

    @Autowired SubscriptionService service;

    private CreateSubscriptionRequest req() {
        return new CreateSubscriptionRequest(
                "Push", "Client", "M", "cni", "8888YYYY", null, "12/04/2030", "677004488",
                "push@example.com", "Bonamoussadi", "Littoral", "Douala",
                "om", "677004488", "promote", false, null, null, null, null, null, null);
    }

    @Test
    void pushGatewayAppliesTheResultThenIsIdempotentOnceSettled() {
        Subscription s = service.create(req(), "self", null);
        service.pushGateway(s.getRef());
        Subscription pushed = service.byRef(s.getRef());
        assertEquals(PayStatus.pending, pushed.getPayStatus(), "an accepted push stays pending until confirmation");
        assertNotNull(pushed.getPaymentTxId(), "the simulated gateway returns a transaction id");

        // Once the payment is settled, a re-dispatched push must not touch it.
        service.applyPayment(s.getRef(), "validate", null);
        service.pushGateway(s.getRef());
        assertEquals(PayStatus.paid, service.byRef(s.getRef()).getPayStatus(), "push is a no-op on a non-pending order");
    }

    @Test
    void expirePendingFailsOnlyAStillPendingOrder() {
        Subscription s = service.create(req(), "self", null);
        service.expirePending(s.getRef());
        Subscription expired = service.byRef(s.getRef());
        assertEquals(PayStatus.failed, expired.getPayStatus());
        assertEquals("Délai de paiement dépassé", expired.getPaymentMessage());

        // A settled order is never overturned by the reconciliation sweep.
        Subscription paidOne = service.create(req(), "self", null);
        service.applyPayment(paidOne.getRef(), "validate", null);
        service.expirePending(paidOne.getRef());
        assertEquals(PayStatus.paid, service.byRef(paidOne.getRef()).getPayStatus());
    }
}
