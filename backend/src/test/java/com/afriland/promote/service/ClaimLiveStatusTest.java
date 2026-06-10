package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.web.dto.Dtos.ClaimResult;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * A QR (self) sale paid by the client may stay {@code pending} locally when the aggregator webhook
 * never arrives (e.g. no public callback URL). {@link SubscriptionService#claim} must pull a live
 * status before refusing the sale, so the agent can still attribute a genuinely-paid sale.
 */
@SpringBootTest
class ClaimLiveStatusTest {

    @Autowired SubscriptionService service;

    // Replace the active (@Primary) gateway so we can drive requestPayment / queryStatus.
    @MockBean(name = "activePaymentGateway")
    PaymentGateway gateway;

    private CreateSubscriptionRequest selfMomo(String cni, String phone) {
        return new CreateSubscriptionRequest(
                "QR", "Live", "M", "cni", cni, null, "01/01/2031", phone,
                "qrlive@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
    }

    @Test
    void claimResolvesAPendingSaleViaLiveStatus() {
        // Push accepted → the QR sale starts pending; no webhook ever arrives.
        when(gateway.requestPayment(any(), any()))
                .thenReturn(new PaymentGateway.PaymentRequest("EXT-1", "om", true, null));
        Subscription s = service.create(selfMomo("AB12CD34", "699112233"), "self", null);
        assertEquals(PayStatus.pending, s.getPayStatus());

        // The aggregator confirms the payment on get-status → claim must link the sale.
        when(gateway.queryStatus(any())).thenReturn(Optional.of(PayStatus.paid));
        ClaimResult r = service.claim("a1", "699112233", "AB12CD34", null);
        assertTrue(r.ok(), "a pending-but-actually-paid QR sale should be linked after the live pull");
        assertEquals("a1", r.record().agentId());
        assertEquals(PayStatus.paid.name(), r.record().payStatus());
    }

    @Test
    void claimStillRefusesWhenTheAggregatorCannotConfirm() {
        when(gateway.requestPayment(any(), any()))
                .thenReturn(new PaymentGateway.PaymentRequest("EXT-2", "om", true, null));
        Subscription s = service.create(selfMomo("EE99FF88", "699445566"), "self", null);
        assertEquals(PayStatus.pending, s.getPayStatus());

        when(gateway.queryStatus(any())).thenReturn(Optional.empty());  // status still unknown
        ClaimResult r = service.claim("a1", "699445566", "EE99FF88", null);
        assertFalse(r.ok());
        assertEquals("unpaid", r.reason(), "without confirmation the sale is not linked");
    }
}
