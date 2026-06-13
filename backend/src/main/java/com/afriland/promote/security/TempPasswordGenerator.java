package com.afriland.promote.security;

import java.security.SecureRandom;

/** Generates readable temporary passwords that satisfy {@link PasswordPolicy}. */
public final class TempPasswordGenerator {

    // Unambiguous alphabet (no O/0, I/l/1) for readable temporary passwords.
    private static final char[] PW = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final char[] LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private static final char[] DIGITS = "23456789".toCharArray();
    private static final SecureRandom RAND = new SecureRandom();

    private TempPasswordGenerator() {}

    /** 4-digit login PIN for collecteur phone sign-in (e.g. "0427"). */
    public static String pin() {
        return String.format("%04d", RAND.nextInt(10000));
    }

    /** 10-char password with at least one letter and one digit. */
    public static String password() {
        char[] out = new char[10];
        out[0] = LETTERS[RAND.nextInt(LETTERS.length)];
        out[1] = DIGITS[RAND.nextInt(DIGITS.length)];
        for (int i = 2; i < out.length; i++) out[i] = PW[RAND.nextInt(PW.length)];
        for (int i = out.length - 1; i > 0; i--) {
            int j = RAND.nextInt(i + 1);
            char t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return new String(out);
    }
}
