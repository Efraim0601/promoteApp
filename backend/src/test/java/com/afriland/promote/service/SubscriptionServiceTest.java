package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Business-logic coverage for {@link SubscriptionService}: referrer matching, channel attribution,
 * payment status, card activation (number + PAN) and the SARA receipt reference override.
 * Runs against the in-memory H2 + memory storage + simulated gateway (test profile).
 */
@SpringBootTest
class SubscriptionServiceTest {

    @Autowired SubscriptionService service;
    @Autowired ImageStorage storage;

    /** Build a valid create request; tweak the bits a test cares about via the explicit args. */
    private CreateSubscriptionRequest req(String pay, String saraReceiptKey, String saraRef, String referrerPhone) {
        return new CreateSubscriptionRequest(
                "Jean", "Kamga", "M", "1234ABCD", null, "12/04/2030", "677001122",
                "jean@example.com", "Bonamoussadi", "Littoral", "Douala",
                pay, null, "promote", false, null, null, null, saraReceiptKey, saraRef, referrerPhone);
    }

    @Test
    void selfCashSubscriptionAttributesReferrerAndStaysCash() {
        // Awa Fall (a1) is seeded with phone 699123456.
        Subscription s = service.create(req("cash", null, null, "699123456"), "self", null);
        assertEquals("self", s.getChannel());
        assertEquals(PayStatus.cash, s.getPayStatus());
        assertEquals("Awa Fall", s.getReferrerName());
        assertEquals("a1", s.getAgentId(), "self sale is attributed to the matched referrer");
    }

    @Test
    void referrerMatchesEvenWithCountryCodeAndSpaces() {
        Subscription s = service.create(req("cash", null, null, "+237 699 123 456"), "self", null);
        assertEquals("a1", s.getAgentId());
        assertEquals("Awa Fall", s.getReferrerName());
    }

    @Test
    void assistedSubscriptionKeepsTheLoggedInAgent() {
        Subscription s = service.create(req("cash", null, null, null), "agent", "a1");
        assertEquals("agent", s.getChannel());
        assertEquals("a1", s.getAgentId());
    }

    @Test
    void momoSubscriptionStartsPendingOrResolvedByGateway() {
        Subscription s = service.create(req("om", null, null, null), "self", null);
        // simulated gateway: never null status; cash/sara excluded here.
        assertNotNull(s.getPayStatus());
        assertNotEquals(PayStatus.cash, s.getPayStatus());
    }

    @Test
    void saraSubscriptionRequiresAReceipt() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(req("sara", null, null, null), "self", null));
        assertTrue(ex.getReason() != null && ex.getReason().contains("sara_receipt"));
    }

    @Test
    void clientReceiptReferenceOverridesExtraction() {
        String key = storage.store("not a real receipt".getBytes(StandardCharsets.UTF_8), "image/jpeg", "sara-receipt");
        Subscription s = service.create(req("sara", key, "CLIENT-CORRECTED-REF", null), "self", null);
        assertEquals(PayStatus.sara_pending, s.getPayStatus());
        assertEquals("CLIENT-CORRECTED-REF", s.getSaraRef(), "the client's confirmed reference wins over extraction");
    }

    @Test
    void markPrintedStoresCardNumberAndPan() {
        Subscription s = service.create(req("cash", null, null, null), "self", null);
        Subscription printed = service.markPrinted(s.getRef(), "CARD-001", "PAN-12345");
        assertTrue(printed.isPrinted());
        assertEquals("CARD-001", printed.getCardNumber());
        assertEquals("PAN-12345", printed.getPan());
    }

    @Test
    void markPrintedRejectsBlankCardNumber() {
        Subscription s = service.create(req("cash", null, null, null), "self", null);
        assertThrows(ResponseStatusException.class, () -> service.markPrinted(s.getRef(), "  ", "PAN-1"));
    }

    @Test
    void panIsOptionalAtActivation() {
        Subscription s = service.create(req("cash", null, null, null), "self", null);
        Subscription printed = service.markPrinted(s.getRef(), "CARD-002", null);
        assertTrue(printed.isPrinted());
        assertNull(printed.getPan());
    }

    @Test
    void unknownReferrerPhoneResolvesToNull() {
        assertNull(service.resolveAgentByPhone("600000000"));
        assertNull(service.resolveAgentByPhone(null));
    }
}
