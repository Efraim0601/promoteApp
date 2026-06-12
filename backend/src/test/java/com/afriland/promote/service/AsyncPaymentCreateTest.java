package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Async mode ({@code app.payment.async=true}): a MoMo create must persist the order as
 * {@code pending} and return immediately, WITHOUT folding the gateway result onto the returned
 * object — that push happens off the request thread (PaymentDispatcher), so the response no longer
 * blocks on the aggregator. Runs against H2 + the simulated gateway (test profile).
 */
@SpringBootTest(properties = "app.payment.async=true")
class AsyncPaymentCreateTest {

    @Autowired SubscriptionService service;

    private CreateSubscriptionRequest req(String pay) {
        return new CreateSubscriptionRequest(
                "Async", "Client", "M", "cni", "9999ZZZZ", null, "12/04/2030", "677005599",
                "async@example.com", "Bonamoussadi", "Littoral", "Douala",
                pay, "677005599", "promote", false, null, null, null, null, null, null);
    }

    @Test
    void momoCreateReturnsPendingAndDefersTheGatewayPush() {
        Subscription s = service.create(req("om"), "self", null);
        assertEquals(PayStatus.pending, s.getPayStatus(), "the request returns immediately as pending");
        assertNotNull(s.getGatewayRef(), "the unique gateway order id is persisted before the async push");
        assertNull(s.getPaymentTxId(),
                "the gateway result is applied off-thread to a reloaded row, never to the returned object");
    }
}
