package com.afriland.promote.service;

import com.afriland.promote.model.Subscription;

import java.time.Duration;
import java.time.Instant;

/**
 * Classifies a failed Mobile Money payment into an actionable category, from the aggregator's stored
 * decline message and (as a fallback when the message is empty) the failure latency:
 * a long wait before failure ≈ the USSD prompt expired (PIN never entered); an immediate failure
 * ≈ a network/operator/API rejection.
 *
 * <p>This is a best-effort heuristic. The definitive cause comes from the operator (MTN/Orange) via
 * TrustPayWay's response codes — feed those into {@link #fromMessage} once the grille is available.
 */
public final class PaymentFailures {

    private PaymentFailures() {}

    public enum Category {
        INSUFFICIENT_FUNDS,   // solde insuffisant
        WRONG_PIN,            // code secret erroné
        CANCELLED,            // annulé / refusé par le client
        INVALID_SUBSCRIBER,   // numéro / abonné invalide ou introuvable
        TIMEOUT,              // délai dépassé — PIN jamais saisi (prompt expiré)
        NETWORK,              // erreur réseau / opérateur indisponible
        API_ERROR,            // erreur technique / aggrégateur
        UNKNOWN               // motif non déterminé
    }

    /** Latency (s) at/above which a message-less failure is read as an expired prompt (PIN not entered). */
    private static final long TIMEOUT_SECONDS = 45;
    /** Latency (s) at/below which a message-less failure is read as an immediate network/API rejection. */
    private static final long IMMEDIATE_SECONDS = 6;

    public static Category classify(Subscription s) {
        long latency = -1;
        if (s.getCreatedAt() != null && s.getFailedAt() != null) {
            latency = Duration.between(s.getCreatedAt(), s.getFailedAt()).getSeconds();
        }
        return classify(s.getPaymentMessage(), latency);
    }

    /** Classify from the raw message and (optional, -1 if unknown) the failure latency in seconds. */
    public static Category classify(String message, long latencySeconds) {
        Category byMsg = fromMessage(message);
        if (byMsg != Category.UNKNOWN) return byMsg;
        // No usable message → lean on the latency signal.
        if (latencySeconds >= 0) {
            if (latencySeconds >= TIMEOUT_SECONDS) return Category.TIMEOUT;
            if (latencySeconds <= IMMEDIATE_SECONDS) return Category.NETWORK;
        }
        return Category.UNKNOWN;
    }

    /** Keyword mapping of the aggregator's decline message (FR/EN). UNKNOWN when nothing matches. */
    public static Category fromMessage(String message) {
        String m = message == null ? "" : message.toLowerCase();
        if (m.isBlank()) return Category.UNKNOWN;
        if (m.matches(".*(insuffisan|insufficient|solde|provision|fonds|funds|balance|montant).*")) return Category.INSUFFICIENT_FUNDS;
        if (m.matches(".*(pin|code secret|code pin|mot de passe|wrong pin|invalid pin|erron).*")) return Category.WRONG_PIN;
        if (m.matches(".*(annul|cancel|refus|declin|rejet|reject|abort).*")) return Category.CANCELLED;
        if (m.matches(".*(abonn|subscriber|introuvable|not found|invalid number|numero|num[ée]ro|inconnu|unknown|barred|suspendu).*")) return Category.INVALID_SUBSCRIBER;
        if (m.matches(".*(expir|timeout|time out|d[ée]lai|no response|pas de r[ée]ponse).*")) return Category.TIMEOUT;
        if (m.matches(".*(network|r[ée]seau|operator|op[ée]rateur|unavailable|indisponible|service|connexion|connection).*")) return Category.NETWORK;
        if (m.matches(".*(api|technical|technique|internal|server|serveur|exception|gateway|aggr[ée]gateur).*")) return Category.API_ERROR;
        return Category.UNKNOWN;
    }
}
