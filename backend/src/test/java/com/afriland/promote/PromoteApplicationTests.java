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
                "Test", "Client", "M", "445566778", "01/01/2031", "618641969",
                "test@client.cm", "Bonamoussadi", "Littoral",
                "om", "promote", true, null, null, null, null);
        Subscription s = service.create(req, "self", null);
        service.applyPayment(s.getRef(), "validate");

        ClaimResult ok = service.claim("a1", "618641969", "445566778");
        assertTrue(ok.ok());
        // claiming again is now "taken"
        ClaimResult again = service.claim("a1", "618641969", "445566778");
        assertFalse(again.ok());
        assertEquals("taken", again.reason());
        // unknown -> notfound
        assertEquals("notfound", service.claim("a1", "600000000", "000000").reason());
    }
}
