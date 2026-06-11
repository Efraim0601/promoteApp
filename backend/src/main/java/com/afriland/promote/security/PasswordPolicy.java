package com.afriland.promote.security;

/**
 * Password complexity policy (Standard): at least {@value #MIN_LENGTH} characters, containing
 * at least one letter and one digit. Applied whenever a password is set or changed.
 */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 8;

    private PasswordPolicy() {}

    /** @return an error code if the password violates the policy, or {@code null} if it is valid. */
    public static String validate(String pw) {
        if (pw == null || pw.length() < MIN_LENGTH) return "password_too_short";
        boolean hasLetter = pw.chars().anyMatch(Character::isLetter);
        boolean hasDigit = pw.chars().anyMatch(Character::isDigit);
        if (!hasLetter || !hasDigit) return "password_needs_letter_and_digit";
        return null;
    }
}
