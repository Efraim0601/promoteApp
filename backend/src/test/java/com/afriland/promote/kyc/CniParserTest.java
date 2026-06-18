package com.afriland.promote.kyc;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Parser tests against representative OCR text from a Cameroonian CNI front. */
class CniParserTest {

    private final CniParser parser = new CniParser();

    // OCR-like text from a CNI front (bilingual labels, mixed spacing as Tesseract produces).
    private static final String SAMPLE = """
            REPUBLIQUE DU CAMEROUN  REPUBLIC OF CAMEROON
            CARTE NATIONALE D'IDENTITE  N° 119876543
            NOM / SURNAME  EFRAIM
            PRENOMS / GIVEN NAMES  ZRA TAKOUA
            DATE DE NAISSANCE / DATE OF BIRTH  04/02/1990
            SEXE / SEX  M
            DATE D'EXPIRATION / DATE OF EXPIRY  12/03/2031
            """;

    @Test
    void extractsCoreFields() {
        CniData d = parser.parse(SAMPLE);
        assertEquals("EFRAIM", d.nom());
        assertEquals("ZRA TAKOUA", d.prenom());
        assertEquals("119876543", d.numero());
        assertEquals("M", d.sexe());
        assertEquals("12/03/2031", d.dateExp());
        assertTrue(!d.isEmpty());
    }

    @Test
    void emptyOnBlank() {
        assertEquals(CniData.EMPTY, parser.parse(""));
        assertEquals(CniData.EMPTY, parser.parse(null));
    }

    @Test
    void numberFallsBackToLongDigitRun() {
        CniData d = parser.parse("CARTE NATIONALE  100200300  NOM SURNAME DUPONT");
        assertEquals("100200300", d.numero());
    }

    @Test
    void toleratesMissingSexAndExpiry() {
        CniData d = parser.parse("NOM / SURNAME  NGONO  PRENOMS / GIVEN NAMES  MARIE CLAIRE  N° 123456");
        assertEquals("NGONO", d.nom());
        assertEquals("MARIE CLAIRE", d.prenom());
        assertEquals("123456", d.numero());
        assertNull(d.sexe());
    }
}
