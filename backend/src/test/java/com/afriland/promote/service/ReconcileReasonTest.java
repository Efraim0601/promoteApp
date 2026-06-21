package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.payment.PaymentGateway.GatewayStatus;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import com.afriland.promote.web.dto.Dtos.ReconcilePullResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Manual reconciliation must align the portal with TrustPayWay's live state AND keep the failure
 * reason in sync — the aggregator's decline message for a failed order can change over time.
 */
@SpringBootTest
class ReconcileReasonTest {

    @Autowired SubscriptionService service;
    @Autowired SubscriptionRepository subs;

    @MockBean(name = "activePaymentGateway")
    PaymentGateway gateway;

    private CreateSubscriptionRequest selfMomo(String cni, String phone) {
        return new CreateSubscriptionRequest(
                "QR", "Recon", "M", "cni", cni, null, "01/01/2031", phone,
                "recon@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
    }

    @Test
    void refreshesFailureReasonThenClearsItOnRecovery() {
        when(gateway.requestPayment(any(), any()))
                .thenReturn(new PaymentGateway.PaymentRequest("EXT-9", "om", true, null));
        Subscription s = service.create(selfMomo("RC12CD34", "699778899"), "self", null);
        assertEquals(PayStatus.pending, s.getPayStatus());
        String ref = s.getRef();

        // 1) pending → failed, the aggregator gives a first decline reason.
        when(gateway.queryReconciledStatus(any()))
                .thenReturn(Optional.of(new GatewayStatus(PayStatus.failed, "Solde insuffisant")));
        ReconcilePullResult r1 = service.reconcileFromGateway(ref);
        assertTrue(r1.changed());
        assertEquals(PayStatus.failed.name(), r1.statusAfter());
        assertEquals("Solde insuffisant", r1.reason());
        assertEquals("Solde insuffisant", subs.findByRefIgnoreCase(ref).orElseThrow().getPaymentMessage());

        // 2) still failed, but the reason changed → portal message must be corrected.
        when(gateway.queryReconciledStatus(any()))
                .thenReturn(Optional.of(new GatewayStatus(PayStatus.failed, "Transaction annulée par l'abonné")));
        ReconcilePullResult r2 = service.reconcileFromGateway(ref);
        assertTrue(r2.changed());
        assertEquals("reason_updated", r2.note());
        assertEquals("Transaction annulée par l'abonné", r2.reason());
        assertEquals("Transaction annulée par l'abonné",
                subs.findByRefIgnoreCase(ref).orElseThrow().getPaymentMessage());

        // 3) same reason again → no-op (idempotent, not reported as a change).
        ReconcilePullResult r3 = service.reconcileFromGateway(ref);
        assertFalse(r3.changed());

        // 4) the aggregator finally confirms success → status paid, reason cleared.
        when(gateway.queryReconciledStatus(any()))
                .thenReturn(Optional.of(new GatewayStatus(PayStatus.paid, null)));
        ReconcilePullResult r4 = service.reconcileFromGateway(ref);
        assertTrue(r4.changed());
        assertEquals(PayStatus.paid.name(), r4.statusAfter());
        Subscription after = subs.findByRefIgnoreCase(ref).orElseThrow();
        assertEquals(PayStatus.paid, after.getPayStatus());
        assertNull(after.getPaymentMessage());
    }
}
