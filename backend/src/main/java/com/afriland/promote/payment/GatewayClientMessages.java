package com.afriland.promote.payment;

/** Maps gateway I/O failures to a short, client-facing French reason. */
public final class GatewayClientMessages {

    private GatewayClientMessages() {}

    /** True when the aggregator/network error is transient — the payment may still complete via webhook. */
    public static boolean isTransient(Throwable ex) {
        String msg = ex.getMessage() == null ? "" : ex.getMessage().toLowerCase();
        return msg.contains("timed out") || msg.contains("timeout") || msg.contains("read timed")
                || msg.contains("502") || msg.contains("503") || msg.contains("504")
                || msg.contains("bad gateway");
    }

    /** True when a failed payment was declined for a business reason (not a technical glitch). */
    public static boolean isBusinessDecline(String paymentMessage) {
        if (paymentMessage == null || paymentMessage.isBlank()) return false;
        String m = paymentMessage.toLowerCase();
        return m.contains("insuffisan") || m.contains("insufficient") || m.contains("solde")
                || m.contains("bloqu") || m.contains("60019") || m.contains("90025")
                || m.contains("refus") || m.contains("declin");
    }

    public static String from(Throwable ex) {
        String msg = ex.getMessage() == null ? "" : ex.getMessage().toLowerCase();
        if (msg.contains("timed out") || msg.contains("timeout") || msg.contains("read timed")) {
            return "L'opérateur met trop de temps à répondre. Réessayez dans un instant.";
        }
        if (msg.contains("502") || msg.contains("503") || msg.contains("504") || msg.contains("bad gateway")) {
            return "Service de paiement momentanément indisponible.";
        }
        return "Service de paiement indisponible";
    }
}
