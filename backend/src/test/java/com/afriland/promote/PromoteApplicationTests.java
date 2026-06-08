package com.afriland.promote;

import com.afriland.promote.model.Subscription;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.ClaimResult;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class PromoteApplicationTests {

    @Autowired
    SubscriptionService service;

    @Test
    void contextLoads() {
        assertNotNull(service.config());
    }

    @Test
    void resolvesReferrerByPhone() {
        assertNotNull(service.resolveAgentByPhone("699123456"), "Awa Fall should resolve");
        assertEquals("Awa Fall", service.resolveAgentByPhone("699123456").getName());
        assertNull(service.resolveAgentByPhone("600000000"));
    }

    @Test
    void claimRejectsAndAcceptsCorrectly() {
        // a paid, unattributed self (QR) subscription can be claimed once
        CreateSubscriptionRequest req = new CreateSubscriptionRequest(
                "Test", "Client", "M", "445566778", null, "01/01/2031", "618641969",
                "test@client.cm", "Bonamoussadi", "Littoral",
                "om", null, "promote", true, null, null, null, null, null, null);
        Subscription s = service.create(req, "self", null);
        service.applyPayment(s.getRef(), "validate");

        // claiming captures the optional NIU on the linked record
        ClaimResult ok = service.claim("a1", "618641969", "445566778", "P099887766001X");
        assertTrue(ok.ok());
        assertEquals("P099887766001X", ok.record().niu());
        // claiming again is now "taken"
        ClaimResult again = service.claim("a1", "618641969", "445566778", null);
        assertFalse(again.ok());
        assertEquals("taken", again.reason());
        // unknown -> notfound
        assertEquals("notfound", service.claim("a1", "600000000", "000000", null).reason());
    }
}
