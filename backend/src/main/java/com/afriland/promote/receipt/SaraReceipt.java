package com.afriland.promote.receipt;

/**
 * Fields extracted from a SARA money "Relevé d'opération" receipt. Any field may be
 * {@code null} when it could not be located (OCR noise, unexpected layout) — the agent
 * then fills it in by hand at the point of sale.
 *
 * @param reference   transaction reference (e.g. {@code W2026051112422763})
 * @param payerPhone  sender ("Émetteur") account, normalised to "+237 XXXXXXXXX"
 * @param amount      total amount ("Montant total"), in XAF
 * @param status      transaction status (e.g. {@code COMPLETED})
 * @param date        transaction date as printed (e.g. {@code 11/05/2026})
 */
public record SaraReceipt(String reference, String payerPhone, Integer amount, String status, String date) {

    public static final SaraReceipt EMPTY = new SaraReceipt(null, null, null, null, null);

    /** True when nothing usable was extracted. */
    public boolean isEmpty() {
        return reference == null && payerPhone == null && amount == null;
    }
}
