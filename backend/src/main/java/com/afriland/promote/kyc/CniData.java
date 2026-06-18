package com.afriland.promote.kyc;

/**
 * Fields read by OCR from the front side of a Cameroonian national ID card (CNI).
 * Any field may be {@code null} when it could not be located (worn card, glare, OCR
 * noise) — extraction is best-effort and never blocks the enrolment.
 *
 * @param nom      surname as printed ("NOM")
 * @param prenom   given name(s) as printed ("PRENOMS")
 * @param numero   document number (alphanumeric)
 * @param sexe     "M" or "F" when readable
 * @param dateExp  expiry date as printed (e.g. {@code 12/03/2031})
 * @param rawText  the full OCR text, kept for debugging / fallback matching
 */
public record CniData(String nom, String prenom, String numero, String sexe, String dateExp, String rawText) {

    public static final CniData EMPTY = new CniData(null, null, null, null, null, null);

    /** True when nothing usable for matching (name or number) was extracted. */
    public boolean isEmpty() {
        return blank(nom) && blank(prenom) && blank(numero);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
