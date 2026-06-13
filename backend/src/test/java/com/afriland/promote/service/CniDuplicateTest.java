package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** One Promote card per CNI — duplicate subscriptions are refused. */
@SpringBootTest
class CniDuplicateTest {

    @Autowired SubscriptionService service;

    private static CreateSubscriptionRequest momo(String cni, String phone) {
        return new CreateSubscriptionRequest(
                "Jean", "Dupont", "M", "cni", cni, null, "01/01/2031", phone,
                "jean@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
    }

    @Test
    void rejectsSecondSubscriptionWithSameCniAfterPayment() {
        var first = service.create(momo("AB12CD34", "690011122"), "self", null);
        service.applyPayment(first.getRef(), "validate", null);
        assertEquals(PayStatus.paid, service.byRef(first.getRef()).getPayStatus());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(momo("AB 12-CD34", "690033344"), "self", null));
        assertEquals(409, ex.getStatusCode().value());
        assertEquals("cni_exists", ex.getReason());
    }

    @Test
    void allowsRetryWithSameCniAfterFailedPayment() {
        var first = service.create(momo("EE99FF88", "690055566"), "self", null);
        service.applyPayment(first.getRef(), "fail", "Solde insuffisant");
        assertEquals(PayStatus.failed, service.byRef(first.getRef()).getPayStatus());

        var second = service.create(momo("EE99FF88", "690055566"), "self", null);
        assertNotEquals(first.getRef(), second.getRef());
    }

    @Test
    void passportNumberIsNotSubjectToCniRule() {
        var passport = new CreateSubscriptionRequest(
                "Marie", "Martin", "F", "passport", "P1234567", null, "01/01/2031", "690077788",
                "marie@client.cm", "Akwa", "Littoral", "Douala",
                "om", "690077788", "promote", false, null, null, null, null, null, null);
        service.create(passport, "self", null);
        assertDoesNotThrow(() -> service.create(passport, "self", null));
    }
}
