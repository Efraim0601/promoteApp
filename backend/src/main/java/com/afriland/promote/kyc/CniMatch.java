package com.afriland.promote.kyc;

/**
 * Result of cross-checking the data the client typed against what OCR read on the CNI.
 *
 * <p>{@code nameMatch} / {@code numberMatch} are {@link Boolean} on purpose: {@code null} means
 * "OCR couldn't read this field, nothing to compare" — only an explicit {@code false} is a real
 * contradiction worth warning about. This keeps the check advisory: a worn card that OCRs poorly
 * produces no false alarm.
 *
 * @param nameMatch       TRUE/FALSE when names could be compared, null when OCR read no name
 * @param numberMatch     TRUE/FALSE when the number could be compared, null when OCR read no number
 * @param extractedNom    surname OCR read (or null)
 * @param extractedPrenom given name(s) OCR read (or null)
 * @param extractedNumero document number OCR read (or null)
 * @param confidence      fraction of comparable fields that matched (0..1), 1 when nothing comparable
 */
public record CniMatch(Boolean nameMatch, Boolean numberMatch,
                       String extractedNom, String extractedPrenom, String extractedNumero,
                       double confidence) {

    public static final CniMatch UNAVAILABLE = new CniMatch(null, null, null, null, null, 1.0);

    /** True when at least one compared field explicitly contradicts the typed data. */
    public boolean hasMismatch() {
        return Boolean.FALSE.equals(nameMatch) || Boolean.FALSE.equals(numberMatch);
    }
}
