package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A Promote card subscription — combines the transaction and the KYC file.
 * Mirrors the prototype's transaction record (app.jsx / kyc.jsx recordPayload).
 */
@Entity
@Table(name = "subscription")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    private String ref;             // business reference, e.g. "PRM-1009"

    private String prenom;
    private String nom;
    private String fullName;

    private String cni;             // ID card number
    private String cniExp;          // expiry, displayed dd/MM/yyyy
    private String phone;           // "+237 6XXXXXXXX"

    private String pay;             // om | mtn | cash
    private String delivery;        // promote | agence | home

    private int amount;             // total paid/due
    private int transport;          // transport fee portion (0 unless home)

    private String channel;         // agent | self

    private String agentId;         // owning officer (nullable for unattributed self sales)
    private String referrerName;    // resolved referrer (self path)
    private String referrerPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PayStatus payStatus;

    /** Aggregator-side transaction id (e.g. TrustPayWay "transaction_id"); null for cash/simulated. */
    private String paymentTxId;

    /** Last aggregator message — the reason shown to the client on failure (e.g. "Solde insuffisant"). */
    @Column(length = 500)
    private String paymentMessage;

    private boolean printed;
    private boolean selfieVerified;

    /** Object-storage keys of the captured KYC images (null if not captured). */
    private String selfieKey;      // client photo (face)
    private String cniRectoKey;    // ID card — front
    private String cniVersoKey;    // ID card — back

    /** Resolve a stored image key by kind. */
    @Transient
    public String imageKey(String kind) {
        return switch (kind) {
            case "selfie" -> selfieKey;
            case "cni-recto" -> cniRectoKey;
            case "cni-verso" -> cniVersoKey;
            default -> null;
        };
    }

    @Column(nullable = false)
    private Instant createdAt;

    /** Overall display status — ports components.jsx:recordStatus(). */
    @Transient
    public String getStatus() {
        if (printed) return "printed";
        if (payStatus == PayStatus.failed) return "failed";
        if (payStatus == PayStatus.cash) return "cash";
        return "awaiting"; // paid (awaiting print) or pending
    }
}
