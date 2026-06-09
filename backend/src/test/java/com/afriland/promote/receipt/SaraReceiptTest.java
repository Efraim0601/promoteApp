package com.afriland.promote.receipt;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The {@link SaraReceipt} value object: when it is considered "empty". */
class SaraReceiptTest {

    @Test
    void emptyConstantHasNoUsableFields() {
        assertTrue(SaraReceipt.EMPTY.isEmpty());
    }

    @Test
    void aReferenceAloneMakesItNonEmpty() {
        assertFalse(new SaraReceipt("W123", null, null, null, null).isEmpty());
    }

    @Test
    void onlyStatusOrDateStillCountsAsEmpty() {
        // reference, payer and amount are the meaningful fields — status/date alone are not.
        assertTrue(new SaraReceipt(null, null, null, "COMPLETED", "11/05/2026").isEmpty());
    }
}
