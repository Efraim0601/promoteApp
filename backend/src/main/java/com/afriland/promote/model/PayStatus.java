package com.afriland.promote.model;

/** Payment lifecycle, mirrors the prototype's payStatus values. */
public enum PayStatus {
    pending,  // MoMo push sent, awaiting client PIN
    paid,     // MoMo validated
    cash,     // to be paid in cash at the print point
    failed    // client declined / timed out
}
