package com.afriland.promote.payment;

/** Maps gateway I/O failures to a short, client-facing French reason. */
public final class GatewayClientMessages {

    private GatewayClientMessages() {}

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
