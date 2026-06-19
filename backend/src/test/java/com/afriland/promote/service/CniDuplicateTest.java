package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** Two Promote cards per IDENTITY max — a third active subscription is refused when it shares the same
 *  CNI number + birth date + name (typed or CNI-read, within a 20% OCR tolerance). */
@SpringBootTest
class CniDuplicateTest {

    @Autowired SubscriptionService service;

    private static CreateSubscriptionRequest momo(String cni, String phone) {
        return new CreateSubscriptionRequest(
                "Jean", "Dupont", "M", "cni", cni, null, "01/01/2031", phone,
                "jean@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
    }

    /** Full-identity request: CNI + birth date (dd/MM/yyyy or yyyy-MM-dd) + given name + surname. */
    private static CreateSubscriptionRequest id(String cni, String phone, String naissance,
                                                String prenom, String nom) {
        return new CreateSubscriptionRequest(
                prenom, nom, "M", "cni", cni, null, "01/01/2031", phone,
                "client@client.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null,
                null, null, null, null, "prepaid", naissance, null, null);
    }

    @Test
    void allowsSecondButRejectsThirdSubscriptionWithSameCni() {
        // First card — paid.
        var first = service.create(momo("AB12CD34", "690011122"), "self", null);
        service.applyPayment(first.getRef(), "validate", null);
        assertEquals(PayStatus.paid, service.byRef(first.getRef()).getPayStatus());

        // Second card with the same CNI (normalised: spaces/dashes ignored) is allowed — the limit is two.
        assertDoesNotThrow(() -> service.create(momo("AB 12-CD34", "690033344"), "self", null));

        // Third active card with the same CNI is refused.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(momo("AB12CD34", "690044455"), "self", null));
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

    @Test
    void rejectsThirdWhenFullIdentityMatches() {
        service.create(id("ID111111", "690100001", "01/01/1990", "Paul", "Mbarga"), "self", null);
        service.create(id("ID 11-1111", "690100002", "01/01/1990", "Paul", "Mbarga"), "self", null);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(id("ID111111", "690100003", "01/01/1990", "Paul", "Mbarga"), "self", null));
        assertEquals(409, ex.getStatusCode().value());
        assertEquals("cni_exists", ex.getReason());
    }

    @Test
    void allowsThirdWhenBirthDateDiffers() {
        service.create(id("ID222222", "690200001", "01/01/1990", "Alice", "Nkeng"), "self", null);
        service.create(id("ID222222", "690200002", "01/01/1990", "Alice", "Nkeng"), "self", null);
        // Same CNI + name but a different birth date is NOT the same person (tuple = CNI + birth + name).
        assertDoesNotThrow(() -> service.create(
                id("ID222222", "690200003", "15/06/1992", "Alice", "Nkeng"), "self", null));
    }

    @Test
    void allowsThirdWhenNameDiffers() {
        service.create(id("ID333333", "690300001", "01/01/1990", "Bruno", "Etoa"), "self", null);
        service.create(id("ID333333", "690300002", "01/01/1990", "Bruno", "Etoa"), "self", null);
        // Same CNI + birth date but a clearly different name is allowed under the tuple rule.
        assertDoesNotThrow(() -> service.create(
                id("ID333333", "690300003", "01/01/1990", "Sandra", "Fotso"), "self", null));
    }

    @Test
    void toleratesOcrTypoWithinTwentyPercent() {
        service.create(id("ID444444", "690400001", "01/01/1990", "Christine", "Abena"), "self", null);
        service.create(id("ID444444", "690400002", "01/01/1990", "Christine", "Abena"), "self", null);
        // Surname retyped with a one-letter OCR-style typo (Abena → Abna) is still ≥80% similar → refused.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(id("ID444444", "690400003", "01/01/1990", "Christine", "Abna"), "self", null));
        assertEquals("cni_exists", ex.getReason());
    }
}
