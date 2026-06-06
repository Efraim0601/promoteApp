package com.afriland.promote.receipt;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Parser tests against the exact text of the sample SARA receipt (wallet_transaction_detail). */
class SaraReceiptParserTest {

    private final SaraReceiptParser parser = new SaraReceiptParser();

    // Whitespace-normalised text as produced from the sample receipt (PDF text layer or OCR).
    private static final String SAMPLE = """
            Relevé d'opération
            Détails de la transaction
            Montant 5 000 XAF
            Frais 0 XAF
            TTA 0 XAF
            Montant total 5 000 XAF
            Type de Transaction Transfert Wallet vers Wallet
            Reférence W2026051112422763
            Statut COMPLETED
            Date 11/05/2026 | 07:36:55
            Émetteur Nom EFRAIM ZRA TAKOUA Compte 237686857113 Entité légale Sara Money
            Bénéficiaire Nom Tontine DDPI Compte 237681260577 Entité légale Sara Money
            Motif TONTINE_CONTRIBUTIONScheduleId:83553
            """;

    @Test
    void extractsAllFieldsFromSample() {
        SaraReceipt r = parser.parse(SAMPLE);
        assertEquals("W2026051112422763", r.reference());
        assertEquals(5000, r.amount());
        assertEquals("+237 686857113", r.payerPhone());   // Émetteur (payer), not the beneficiary
        assertEquals("COMPLETED", r.status());
        assertEquals("11/05/2026", r.date());
    }

    @Test
    void toleratesOcrNoiseDeaccentedLabelsAndExtraSpaces() {
        // Accents lost and spacing mangled, as a noisy OCR pass might produce.
        String ocr = "Montant  total   5 000  XAF   Reference  W2026051112422763  Statut COMPLETED  "
                + "Emetteur Nom JEAN Compte  237699112233  Beneficiaire Nom X Compte 237681260577";
        SaraReceipt r = parser.parse(ocr);
        assertEquals("W2026051112422763", r.reference());
        assertEquals(5000, r.amount());
        assertEquals("+237 699112233", r.payerPhone());
    }

    @Test
    void returnsEmptyOnUnrelatedText() {
        SaraReceipt r = parser.parse("Ceci n'est pas un reçu.");
        assertNull(r.reference());
        assertNull(r.amount());
        assertNull(r.payerPhone());
    }
}
