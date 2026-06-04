package com.afriland.promote;

import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.ClaimResult;
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
        // Régine Atangana (self, paid, unattributed): phone 618641969 / cni 445566778
        ClaimResult ok = service.claim("a2", "618641969", "445566778");
        assertTrue(ok.ok());
        // claiming again is now "taken"
        ClaimResult again = service.claim("a3", "618641969", "445566778");
        assertFalse(again.ok());
        assertEquals("taken", again.reason());
        // unknown -> notfound
        assertEquals("notfound", service.claim("a1", "600000000", "000000").reason());
    }
}
