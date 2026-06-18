package com.afriland.promote.kyc;

import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts the surname, given name(s), document number, sex and expiry date from the OCR
 * text of a Cameroonian national ID card (CNI). The text comes from Tesseract, so the
 * patterns are deliberately tolerant of extra whitespace, missing accents and the usual
 * OCR confusions.
 *
 * <p>Front-side layout (bilingual FR/EN), roughly:
 * <pre>
 *   REPUBLIQUE DU CAMEROUN
 *   CARTE NATIONALE D'IDENTITE  N° 123456789
 *   NOM / SURNAME      EFRAIM
 *   PRENOMS / GIVEN NAMES  ZRA TAKOUA
 *   DATE DE NAISSANCE ...  SEXE / SEX  M
 *   DATE D'EXPIRATION / DATE OF EXPIRY  12/03/2031
 * </pre>
 *
 * Everything is best-effort: any field that cannot be located is left {@code null} and the
 * client keeps the value they typed in.
 */
@Component
public class CniParser {

    // Surname / given names — anchor on the (de-accented, bilingual) label, capture the rest of the line.
    // Stop at the next label keyword so we don't swallow the following field.
    private static final Pattern NOM = Pattern.compile(
            "\\bNOM\\b(?:\\s*/\\s*SURNAME)?\\s*[:.]?\\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ '\\-]{1,40}?)"
                    + "(?=\\s+(?:PRENOM|GIVEN|DATE|SEXE|SEX|NE|BORN|N[°O]|$))",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRENOM = Pattern.compile(
            "\\bPR[EÉ]NOMS?\\b(?:\\s*/\\s*GIVEN(?:\\s+NAMES?)?)?\\s*[:.]?\\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ '\\-]{1,40}?)"
                    + "(?=\\s+(?:NOM|DATE|SEXE|SEX|NE|BORN|PROF|TAILLE|N[°O]|$))",
            Pattern.CASE_INSENSITIVE);

    // Document number: labelled "N°" / "No" then a digit-led token (CNI numbers are numeric, may end
    // in a few letters). Digit-led on purpose so the label can't swallow an adjacent word like "PRENOMS".
    private static final Pattern NUM_LABELLED =
            Pattern.compile("N[°ºo]\\s*[:.]?\\s*(\\d{5,}[0-9A-Z]*)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NUM_TOKEN = Pattern.compile("\\b\\d{8,12}\\b");

    private static final Pattern SEXE =
            Pattern.compile("SEXE?\\b(?:\\s*/\\s*SEX)?\\s*[:.]?\\s*([MF])\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXPIRY =
            Pattern.compile("(?:EXPIRATION|EXPIRY|VALABLE\\s+JUSQU)[^0-9]{0,12}(\\d{2}[/.\\-]\\d{2}[/.\\-]\\d{2,4})",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern ANY_DATE = Pattern.compile("\\b(\\d{2}[/.\\-]\\d{2}[/.\\-]\\d{4})\\b");

    /** Parse a CNI's raw OCR text into structured fields (best effort; missing fields are null). */
    public CniData parse(String rawText) {
        if (rawText == null || rawText.isBlank()) return CniData.EMPTY;
        // Collapse all Unicode whitespace to single ASCII spaces so the line-spanning labels match.
        String text = rawText.replaceAll("(?U)\\s+", " ").trim();

        CniData d = new CniData(
                first(NOM, text), first(PRENOM, text), number(text), sex(text), expiry(text), rawText);
        return d.isEmpty() ? CniData.EMPTY : d;
    }

    private static String first(Pattern p, String text) {
        Matcher m = p.matcher(text);
        return m.find() ? clean(m.group(1)) : null;
    }

    private String number(String text) {
        Matcher m = NUM_LABELLED.matcher(text);
        if (m.find()) return m.group(1).toUpperCase();
        Matcher t = NUM_TOKEN.matcher(text);
        return t.find() ? t.group() : null;
    }

    private String sex(String text) {
        Matcher m = SEXE.matcher(text);
        return m.find() ? m.group(1).toUpperCase() : null;
    }

    private String expiry(String text) {
        Matcher m = EXPIRY.matcher(text);
        if (m.find()) return m.group(1);
        Matcher d = ANY_DATE.matcher(text);
        return d.find() ? d.group(1) : null;
    }

    /** Trim trailing label punctuation/whitespace from a captured name fragment. */
    private static String clean(String s) {
        return s == null ? null : s.replaceAll("[\\s:.\\-]+$", "").trim();
    }
}
