package com.afriland.promote.util;

public final class PanUtils {

    private PanUtils() {}

    /** Returns true if the PAN is already in masked form (e.g. "5078 **** **** 5678"). */
    public static boolean isMasked(String pan) {
        return pan != null && pan.matches("\\d{4} \\*{4} \\*{4} \\d{4}");
    }

    /**
     * Masks a card PAN, keeping only the first 4 and last 4 digits visible.
     * Input may be raw digits ("5078230012345678") or formatted ("5078 2300 1234 5678").
     * Returns "5078 **** **** 5678" for a valid 16-digit PAN.
     * Returns the original value unchanged if the input is null, already masked, or not 16 digits.
     */
    public static String mask(String pan) {
        if (pan == null) return null;
        if (isMasked(pan)) return pan;
        String digits = pan.replaceAll("\\D", "");
        if (digits.length() != 16) return pan;
        return digits.substring(0, 4) + " **** **** " + digits.substring(12);
    }
}
