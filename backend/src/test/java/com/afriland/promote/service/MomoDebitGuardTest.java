package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

/** Anti-double-debit: resume recent MoMo attempts instead of a second TrustPayWay push. */
@SpringBootTest
class MomoDebitGuardTest {

    @Autowired SubscriptionService service;
    @Autowired SubscriptionRepository subs;

    private CreateSubscriptionRequest momo(String cni, String phone) {
        return new CreateSubscriptionRequest(
                "Mo", "Mo", "M", "cni", cni, null, "01/01/2031", phone,
                "mo@test.cm", "Douala", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
    }

    @Test
    void secondCreateWithinFiveMinutesResumesSameSubscription() {
        Subscription first = service.create(momo("DD11AA22", "690066677"), "self", null);
        service.pushGateway(first.getRef());
        Subscription pushed = service.byRef(first.getRef());
        assertTrue(pushed.isGatewayPushAccepted());

        Subscription second = service.create(momo("DD11AA33", "690066677"), "self", null);
        assertEquals(first.getRef(), second.getRef(), "must resume, not create a second debit");
    }

    @Test
    void secondCreateAfterPaidResumesPaidSubscription() {
        Subscription first = service.create(momo("DD22BB33", "690077788"), "self", null);
        service.applyPayment(first.getRef(), "validate", null);
        assertEquals(PayStatus.paid, service.byRef(first.getRef()).getPayStatus());

        Subscription second = service.create(momo("DD22BB44", "690077788"), "self", null);
        assertEquals(first.getRef(), second.getRef());
        assertEquals(PayStatus.paid, second.getPayStatus());
    }

    @Test
    void pushGatewaySkipsWhenSameLineAlreadyAccepted() {
        Subscription a = service.create(momo("DD33CC44", "690088899"), "self", null);
        service.pushGateway(a.getRef());
        assertTrue(service.byRef(a.getRef()).isGatewayPushAccepted());

        // Simulate a race: a second pending row for the same MoMo line (should not happen via create()).
        Subscription b = Subscription.builder()
                .ref("PRM-RACE01")
                .prenom("X").nom("Y").fullName("X Y")
                .pay("om").payPhone("690088899").amount(a.getAmount())
                .payStatus(PayStatus.pending).gatewayRef("PRM-RACE01-TEST")
                .gatewayPushAccepted(false).printed(false).createdAt(Instant.now())
                .build();
        subs.save(b);

        service.pushGateway(b.getRef());
        assertFalse(service.byRef(b.getRef()).isGatewayPushAccepted(),
                "second push must be skipped when the same tel/montant was already sent to TrustPayWay");
    }
}
