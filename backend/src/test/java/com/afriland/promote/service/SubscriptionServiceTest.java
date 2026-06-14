package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.ClaimResult;
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
        return req(pay, saraReceiptKey, saraRef, referrerPhone, "1234ABCD");
    }

    private CreateSubscriptionRequest req(String pay, String saraReceiptKey, String saraRef, String referrerPhone, String cni) {
        return new CreateSubscriptionRequest(
                "Jean", "Kamga", "M", "cni", cni, null, "12/04/2030", "677001122",
                "jean@example.com", "Bonamoussadi", "Littoral", "Douala",
                pay, null, "promote", false, null, null, null, saraReceiptKey, saraRef, referrerPhone);
    }

    @Test
    void selfCashSubscriptionAttributesReferrerAndStaysCash() {
        // Awa Fall (a1) is seeded with phone 699123456.
        Subscription s = service.create(req("cash", null, null, "699123456", "CNI00001"), "self", null);
        assertEquals("self", s.getChannel());
        assertEquals(PayStatus.cash, s.getPayStatus());
        assertEquals("Awa Fall", s.getReferrerName());
        assertEquals("a1", s.getAgentId(), "self sale is attributed to the matched referrer");
    }

    @Test
    void referrerMatchesEvenWithCountryCodeAndSpaces() {
        Subscription s = service.create(req("cash", null, null, "+237 699 123 456", "CNI00002"), "self", null);
        assertEquals("a1", s.getAgentId());
        assertEquals("Awa Fall", s.getReferrerName());
    }

    @Test
    void assistedSubscriptionKeepsTheLoggedInAgent() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00003"), "agent", "a1");
        assertEquals("a1", s.getAgentId());
    }

    @Test
    void momoSubscriptionStartsPendingOrResolvedByGateway() {
        Subscription s = service.create(req("om", null, null, null, "CNI00004"), "self", null);
        assertNotNull(s.getPayStatus());
        assertNotEquals(PayStatus.cash, s.getPayStatus());
    }

    @Test
    void saraSubscriptionRequiresAReceipt() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(req("sara", null, null, null, "CNI00011"), "self", null));
        assertTrue(ex.getReason() != null && ex.getReason().contains("sara_receipt"));
    }

    @Test
    void clientReceiptReferenceOverridesExtraction() {
        String key = storage.store("not a real receipt".getBytes(StandardCharsets.UTF_8), "image/jpeg", "sara-receipt");
        Subscription s = service.create(req("sara", key, "CLIENT-CORRECTED-REF", null, "CNI00005"), "self", null);
        assertEquals(PayStatus.sara_pending, s.getPayStatus());
        assertEquals("CLIENT-CORRECTED-REF", s.getSaraRef(), "the client's confirmed reference wins over extraction");
    }

    @Test
    void markPrintedStoresCardNumberAndPan() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00006"), "self", null);
        Subscription printed = service.markPrinted(s.getRef(), "CARD-001", "PAN-12345", "print");
        assertTrue(printed.isPrinted());
        assertEquals("CARD-001", printed.getCardNumber());
        assertEquals("PAN-12345", printed.getPan());
    }

    @Test
    void markPrintedRejectsBlankCardNumber() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00007"), "self", null);
        assertThrows(ResponseStatusException.class, () -> service.markPrinted(s.getRef(), "  ", "PAN-1", "print"));
    }

    @Test
    void panIsOptionalAtActivation() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00008"), "self", null);
        Subscription printed = service.markPrinted(s.getRef(), "CARD-002", null, "print");
        assertTrue(printed.isPrinted());
        assertNull(printed.getPan());
    }

    @Test
    void unknownReferrerPhoneResolvesToNull() {
        assertNull(service.resolveAgentByPhone("600000000"));
        assertNull(service.resolveAgentByPhone(null));
    }

    @Test
    void cashierValidatingCashMarksPaidAndTracesTheCollector() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00012"), "agent", "a1");
        assertEquals(PayStatus.cash, s.getPayStatus());
        // "a1" is the seeded agent Awa Fall — the cashier's name is resolved for the trace.
        Subscription paid = service.validateCash(s.getRef(), "validate", null, "a1", "GAB-123");
        assertEquals(PayStatus.paid, paid.getPayStatus());
        assertEquals("Awa Fall", paid.getCashCollectedBy());
        assertEquals("GAB-123", paid.getCashPaymentReference());
        assertNotNull(paid.getCashCollectedAt());
    }

    @Test
    void cashierRejectingCashMarksFailedWithReason() {
        Subscription s = service.create(req("cash", null, null, null, "CNI00013"), "agent", "a1");
        Subscription failed = service.validateCash(s.getRef(), "reject", "Client jamais venu payer", "a1", null);
        assertEquals(PayStatus.failed, failed.getPayStatus());
        assertEquals("Client jamais venu payer", failed.getPaymentMessage());
        assertNull(failed.getCashCollectedBy(), "a rejected cash payment is not traced as collected");
    }

    @Test
    void claimMatchesByPaymentNumberAndAlphanumericCni() {
        // A QR (self) sale whose Mobile Money payer number differs from the contact phone, with a
        // hexadecimal CNI carrying letters.
        CreateSubscriptionRequest req = new CreateSubscriptionRequest(
                "QR", "Client", "M", "cni", "12AB34CD", null, "01/01/2031", "677001122",
                "qr@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", "699888777", "promote", false, null, null, null, null, null, null);
        Subscription s = service.create(req, "self", null);
        service.applyPayment(s.getRef(), "validate", null);   // QR payment succeeds → paid

        // The agent only has the number the client PAID with, and types the CNI loosely (space + lowercase).
        ClaimResult r = service.claim("a1", "+237 699 888 777", "12ab 34cd", null);
        assertTrue(r.ok(), "should match by the payment number and alphanumeric CNI");
        assertEquals("a1", r.record().agentId(), "the sale is linked to the claiming agent");
    }

    @Test
    void claimRejectsAWrongCni() {
        CreateSubscriptionRequest req = new CreateSubscriptionRequest(
                "QR", "Client", "M", "cni", "AAAA1111", null, "01/01/2031", "677001133",
                "qr2@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", null, "promote", false, null, null, null, null, null, null);
        Subscription s = service.create(req, "self", null);
        service.applyPayment(s.getRef(), "validate", null);
        ClaimResult r = service.claim("a1", "677001133", "BBBB2222", null);
        assertFalse(r.ok());
        assertEquals("notfound", r.reason(), "a non-matching CNI must not be linked");
    }

    @Test
    void validateCashIsIdempotentOnAlreadySettledRecords() {
        // A MoMo subscription is never 'cash', so the cashier endpoint must leave it untouched.
        Subscription s = service.create(req("om", null, null, null, "CNI00014"), "self", null);
        PayStatus before = s.getPayStatus();
        Subscription after = service.validateCash(s.getRef(), "validate", null, "a1", null);
        assertEquals(before, after.getPayStatus(), "non-cash records are not changed by the cashier");
        assertNull(after.getCashCollectedBy());
    }
}
