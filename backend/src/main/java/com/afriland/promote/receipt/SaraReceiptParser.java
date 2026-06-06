package com.afriland.promote.receipt;

import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts the reference, payer phone and total amount from the (fixed-layout) text of a
 * SARA money receipt. The text comes either from a PDF text layer or from OCR, so the
 * patterns are deliberately tolerant of extra whitespace and missing accents.
 *
 * <p>Reference layout (whitespace-normalised):
 * <pre>
 *   ... Montant total 5 000 XAF ... Reference W2026051112422763 Statut COMPLETED Date 11/05/2026 | 07:36:55
 *   Emetteur Nom EFRAIM ZRA TAKOUA Compte 237686857113 Entite legale Sara Money
 *   Beneficiaire Nom Tontine DDPI Compte 237681260577 ...
 * </pre>
 */
@Component
public class SaraReceiptParser {

    // Reference printed after the (sometimes misspelled / de-accented) "Reference" label.
    private static final Pattern REF_LABELLED =
            Pattern.compile("R[ée]f[ée]rence[^A-Za-z0-9]{0,4}([A-Za-z0-9]{8,})", Pattern.CASE_INSENSITIVE);
    // Fallback: the SARA reference is a 'W' followed by a long run of digits — distinctive on its own.
    private static final Pattern REF_TOKEN = Pattern.compile("\\bW\\d{12,}\\b");

    // "Montant total 5 000 XAF" — prefer the total; fall back to a bare "Montant ... XAF".
    private static final Pattern AMOUNT_TOTAL =
            Pattern.compile("Montant\\s+total\\s+([0-9][0-9\\s]*?)\\s*XAF", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT_ANY =
            Pattern.compile("Montant\\s+([0-9][0-9\\s]*?)\\s*XAF", Pattern.CASE_INSENSITIVE);

    // A 9-to-15 digit account number following a "Compte" label.
    private static final Pattern COMPTE = Pattern.compile("Compte[^0-9]{0,4}(\\d{9,15})");

    private static final Pattern STATUS = Pattern.compile("Statut\\s+([A-Za-z]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE = Pattern.compile("\\b(\\d{2}/\\d{2}/\\d{4})\\b");

    /** Parse a receipt's raw text into structured fields (best effort; missing fields are null). */
    public SaraReceipt parse(String rawText) {
        if (rawText == null || rawText.isBlank()) return SaraReceipt.EMPTY;
        // Normalise: collapse ALL Unicode whitespace (newlines, the non-breaking / narrow spaces
        // SARA uses as the "5 000" thousands separator, OCR artefacts) to single ASCII spaces.
        // The (?U) flag makes \s match Unicode whitespace, which it does not by default.
        String text = rawText.replaceAll("(?U)\\s+", " ").trim();

        return new SaraReceipt(reference(text), payerPhone(text), amount(text), status(text), date(text));
    }

    private String reference(String text) {
        Matcher m = REF_LABELLED.matcher(text);
        if (m.find()) return m.group(1).toUpperCase();
        Matcher t = REF_TOKEN.matcher(text);
        return t.find() ? t.group() : null;
    }

    private Integer amount(String text) {
        Matcher total = AMOUNT_TOTAL.matcher(text);
        if (total.find()) return toInt(total.group(1));
        Matcher any = AMOUNT_ANY.matcher(text);
        return any.find() ? toInt(any.group(1)) : null;
    }

    private static Integer toInt(String digitsWithSpaces) {
        String digits = digitsWithSpaces.replaceAll("\\D", "");
        if (digits.isEmpty()) return null;
        try {
            return Integer.valueOf(digits);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Phone of the "Émetteur" (payer). We anchor on the de-accented "metteur" so it matches
     * "Émetteur"/"Emetteur", then take the first "Compte" account after it (the sender's),
     * normalised to the app's "+237 XXXXXXXXX" form.
     */
    private String payerPhone(String text) {
        int i = indexOfIgnoreCase(text, "metteur");           // Émetteur / Emetteur
        String scope = i >= 0 ? text.substring(i) : text;     // search from the sender block onward
        Matcher m = COMPTE.matcher(scope);
        if (!m.find()) return null;
        return formatPhone(m.group(1));
    }

    /** "237686857113" → "+237 686857113"; otherwise keep the national digits prefixed with +237. */
    private static String formatPhone(String digits) {
        String national = digits.startsWith("237") ? digits.substring(3) : digits;
        return "+237 " + national;
    }

    private String status(String text) {
        Matcher m = STATUS.matcher(text);
        return m.find() ? m.group(1).toUpperCase() : null;
    }

    private String date(String text) {
        Matcher m = DATE.matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private static int indexOfIgnoreCase(String haystack, String needle) {
        return haystack.toLowerCase().indexOf(needle.toLowerCase());
    }
}
