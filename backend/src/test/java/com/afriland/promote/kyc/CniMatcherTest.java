package com.afriland.promote.kyc;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CniMatcherTest {

    private final CniMatcher matcher = new CniMatcher();

    private static CniData cni(String nom, String prenom, String numero) {
        return new CniData(nom, prenom, numero, "M", "12/03/2031", "raw");
    }

    @Test
    void matchesWhenDataAgrees() {
        CniMatch m = matcher.match(cni("EFRAIM", "ZRA TAKOUA", "119876543"),
                "Zra Takoua", "Efraim", "119876543");
        assertTrue(m.nameMatch());
        assertTrue(m.numberMatch());
        assertEquals(1.0, m.confidence());
    }

    @Test
    void nameMatchIsOrderInsensitiveAndAccentTolerant() {
        // Client swapped nom/prenom and used accents; tokens still match.
        CniMatch m = matcher.match(cni("NGONO", "MARIE CLAIRE", "123456"),
                "Ngono", "Marie Clairé", "123456");
        assertTrue(m.nameMatch());
    }

    @Test
    void flagsWrongName() {
        CniMatch m = matcher.match(cni("EFRAIM", "ZRA TAKOUA", "119876543"),
                "Jean", "Dupont", "119876543");
        assertFalse(m.nameMatch());
        assertTrue(m.numberMatch());
        assertTrue(m.hasMismatch());
    }

    @Test
    void flagsWrongNumberButToleratesOneOcrCharOff() {
        assertFalse(matcher.match(cni("EFRAIM", "ZRA", "119876543"), "Zra", "Efraim", "987654321").numberMatch());
        // single mis-read digit, same length → still a match
        assertTrue(matcher.match(cni("EFRAIM", "ZRA", "119876543"), "Zra", "Efraim", "119876549").numberMatch());
    }

    @Test
    void nullWhenOcrReadNothing() {
        assertEquals(CniMatch.UNAVAILABLE, matcher.match(CniData.EMPTY, "Zra", "Efraim", "119876543"));
        // number unreadable → numberMatch null, name still compared
        CniMatch m = matcher.match(cni("EFRAIM", "ZRA", null), "Zra", "Efraim", "119876543");
        assertNull(m.numberMatch());
        assertTrue(m.nameMatch());
    }
}
