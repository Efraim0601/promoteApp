package com.afriland.promote.kyc;

import org.springframework.stereotype.Component;

import java.text.Normalizer;

/**
 * Compares the fields a client typed (surname, given name, CNI number) against what
 * {@link CniExtractor} read off the card, tolerantly: names are accent-/case-folded and
 * matched with an edit-distance ratio (OCR rarely reads a long name perfectly), the number
 * is compared on its normalised alphanumerics.
 *
 * <p>The check is advisory. A field OCR could not read stays {@code null} (no comparison),
 * so only a genuine contradiction surfaces as a warning to the client.
 */
@Component
public class CniMatcher {

    /** Names accepted as a match at/above this similarity ratio (0..1). */
    private static final double NAME_THRESHOLD = 0.72;

    public CniMatch match(CniData ocr, String typedPrenom, String typedNom, String typedCni) {
        if (ocr == null || ocr.isEmpty()) return CniMatch.UNAVAILABLE;

        Boolean nameMatch = matchNames(ocr, typedPrenom, typedNom);
        Boolean numberMatch = matchNumber(ocr.numero(), typedCni);

        return new CniMatch(nameMatch, numberMatch,
                ocr.nom(), ocr.prenom(), ocr.numero(), confidence(nameMatch, numberMatch));
    }

    /**
     * Compare the typed full name against the OCR full name. We concatenate surname + given
     * names on both sides because OCR (and clients) often split or swap the two fields — what
     * matters is that the same words are present, so a sorted-token comparison is robust.
     */
    private Boolean matchNames(CniData ocr, String typedPrenom, String typedNom) {
        String typed = norm(join(typedNom, typedPrenom));
        String read = norm(join(ocr.nom(), ocr.prenom()));
        if (read.isBlank()) return null;            // OCR read no name → nothing to compare
        if (typed.isBlank()) return null;
        double ratio = similarity(sortTokens(typed), sortTokens(read));
        return ratio >= NAME_THRESHOLD;
    }

    /** Compare normalised (alphanumeric, upper) document numbers; tolerate one OCR character off. */
    private Boolean matchNumber(String ocrNumero, String typedCni) {
        String read = normAlnum(ocrNumero);
        String typed = normAlnum(typedCni);
        if (read.length() < 6 || typed.length() < 6) return null;   // not enough to compare
        if (read.equals(typed)) return true;
        // OCR commonly mis-reads a single digit/letter; accept a near-identical number of same length.
        if (read.length() == typed.length() && levenshtein(read, typed) <= 1) return true;
        return false;
    }

    private static double confidence(Boolean name, Boolean number) {
        int comparable = 0, matched = 0;
        if (name != null) { comparable++; if (name) matched++; }
        if (number != null) { comparable++; if (number) matched++; }
        return comparable == 0 ? 1.0 : (double) matched / comparable;
    }

    /**
     * Token-sorted, accent-/case-insensitive similarity in [0,1] between two full names. Word order
     * is ignored ("ZRA EFRAIM" ≡ "EFRAIM ZRA"). Used by the anti-duplicate identity check, which
     * treats two names as the same person at/above 0.80 (≤ 20 % difference — absorbs OCR noise).
     * Returns 0 when either side is blank (nothing to compare → not a match).
     */
    public static double nameSimilarity(String fullNameA, String fullNameB) {
        String a = sortTokens(norm(fullNameA));
        String b = sortTokens(norm(fullNameB));
        if (a.isBlank() || b.isBlank()) return 0.0;
        return similarity(a, b);
    }

    // --- text helpers ---------------------------------------------------------

    private static String join(String a, String b) {
        return ((a == null ? "" : a) + " " + (b == null ? "" : b)).trim();
    }

    /** Upper-case, strip accents, keep letters and spaces only, collapse runs of space. */
    private static String norm(String s) {
        if (s == null) return "";
        String noAccents = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return noAccents.toUpperCase().replaceAll("[^A-Z ]+", " ").replaceAll("\\s+", " ").trim();
    }

    private static String normAlnum(String s) {
        return s == null ? "" : s.replaceAll("[^0-9A-Za-z]", "").toUpperCase();
    }

    /** Sort the words so "ZRA TAKOUA EFRAIM" and "EFRAIM ZRA TAKOUA" compare equal. */
    private static String sortTokens(String s) {
        String[] tokens = s.split(" ");
        java.util.Arrays.sort(tokens);
        return String.join(" ", tokens).trim();
    }

    /** Normalised similarity in [0,1] from Levenshtein distance. */
    private static double similarity(String a, String b) {
        if (a.isEmpty() && b.isEmpty()) return 1.0;
        int max = Math.max(a.length(), b.length());
        if (max == 0) return 1.0;
        return 1.0 - (double) levenshtein(a, b) / max;
    }

    /** Classic iterative Levenshtein edit distance (two-row, O(min) memory). */
    static int levenshtein(String a, String b) {
        int n = a.length(), m = b.length();
        if (n == 0) return m;
        if (m == 0) return n;
        int[] prev = new int[m + 1];
        int[] cur = new int[m + 1];
        for (int j = 0; j <= m; j++) prev[j] = j;
        for (int i = 1; i <= n; i++) {
            cur[0] = i;
            for (int j = 1; j <= m; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev; prev = cur; cur = tmp;
        }
        return prev[m];
    }
}
