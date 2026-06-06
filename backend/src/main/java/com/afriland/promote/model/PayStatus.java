package com.afriland.promote.model;

/** Payment lifecycle, mirrors the prototype's payStatus values. */
public enum PayStatus {
    pending,       // MoMo push sent, awaiting client PIN
    paid,          // MoMo validated
    cash,          // to be paid in cash at the print point
    sara_pending,  // SARA money: receipt uploaded, awaiting staff validation at a point of sale
    failed         // client declined / timed out / SARA receipt rejected
}
