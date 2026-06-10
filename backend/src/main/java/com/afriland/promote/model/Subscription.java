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
    private String sexe;            // M | F
    private String email;

    private String docType;         // type de pièce : cni | passport | recepisse (défaut cni)
    private String cni;             // ID document number (CNI / passport / récépissé)
    private String niu;             // Numéro d'Identification Unique (taxpayer id) — optional
    private String cniExp;          // expiry, displayed dd/MM/yyyy
    private String phone;           // "+237 6XXXXXXXX"
    private String quartier;        // neighborhood
    private String region;          // administrative region
    private String ville;           // city / town

    private String pay;             // om | mtn | cash | sara
    private String payPhone;        // "+237 6XXXXXXXX" — MoMo number used for payment (may differ from phone)
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
    private String cardNumber;      // physical card number, entered at the print point before printing
    private String pan;             // PAN (Primary Account Number) captured when the card is activated
    private String printedById;     // staff id who printed the card (print-point stats attribution)
    private Instant printedAt;      // when the card was printed
    private boolean selfieVerified;

    /** Object-storage keys of the captured KYC images (null if not captured). */
    private String selfieKey;      // client photo (face)
    private String cniRectoKey;    // ID card — front
    private String cniVersoKey;    // ID card — back

    /** Object-storage key of the SARA money receipt (image or PDF); null unless pay == sara. */
    private String saraReceiptKey;

    /** Fields extracted from the SARA receipt (PDF text / OCR) — prefilled for the agent to
     *  confirm at the point of sale; any may be null when extraction failed. */
    private String saraRef;          // transaction reference, e.g. W2026051112422763
    private String saraPayerPhone;   // sender ("Émetteur") account, "+237 XXXXXXXXX"
    private Integer saraAmount;      // total amount on the receipt, in XAF

    /** Cash collection trace: who (cashier name) confirmed the in-person cash payment, and when.
     *  Set when a CASHIER validates a {@code cash} subscription (cash → paid). */
    private String cashCollectedBy;     // cashier display name (shown on screens)
    private String cashCollectedById;   // cashier id (stats attribution)
    private Instant cashCollectedAt;

    /** Resolve a stored image key by kind. */
    @Transient
    public String imageKey(String kind) {
        return switch (kind) {
            case "selfie" -> selfieKey;
            case "cni-recto" -> cniRectoKey;
            case "cni-verso" -> cniVersoKey;
            case "sara-receipt" -> saraReceiptKey;
            default -> null;
        };
    }

    @Column(nullable = false)
    private Instant createdAt;

    /** Overall display status — ports components.jsx:recordStatus(). */
    @Transient
    public String getStatus() {
        if (payStatus == PayStatus.failed) return "failed";   // un échec ne doit jamais être masqué par une impression
        if (printed) return "printed";
        if (payStatus == PayStatus.cash) return "cash";
        if (payStatus == PayStatus.sara_pending) return "sara_pending";
        if (payStatus == PayStatus.pending) return "pending"; // en attente de paiement (PIN client non saisi)
        return "paid"; // payé, pas encore imprimé -> « à imprimer »
    }
}
