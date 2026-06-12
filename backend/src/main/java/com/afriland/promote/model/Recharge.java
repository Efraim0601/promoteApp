package com.afriland.promote.model;

import com.afriland.promote.payment.Payable;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

/**
 * A prepaid-card top-up (recharge). A lightweight sibling of {@link Subscription}: it has no KYC
 * file, only what's needed to take a payment for an existing card (holder name, PAN, amount, method).
 * Kept in its own table so the card-sale + print pipeline (and its KPIs) is never affected.
 *
 * <p>The business reference uses a distinct, hyphen-free 8-char scheme (e.g. {@code RC000123}).
 */
@Entity
@Table(name = "recharge", indexes = {
        @Index(name = "idx_rch_pay_status", columnList = "pay_status"),
        @Index(name = "idx_rch_created_at", columnList = "created_at"),
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Recharge implements Payable {

    @Id
    private String ref;             // business reference, e.g. "RC000123" (no hyphen, 8 chars)

    private String prenom;
    private String nom;
    private String fullName;

    /** Cardholder's contact phone — may differ from the MoMo number used to pay ({@link #payPhone}). */
    private String phone;

    /** Primary Account Number of the card being topped up. Captured as-is (format-checked only). */
    private String pan;

    private int amount;             // top-up amount, in XAF

    /** Optional browser GPS captured at recharge time (consistent with subscriptions, for the map). */
    private Double latitude;
    private Double longitude;
    private Double geoAccuracy;

    private String pay;             // om | mtn | cash | sara
    private String payPhone;        // MoMo number used for payment (om/mtn)

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PayStatus payStatus;

    /** Globally-unique aggregator order id (random/epoch suffix); echoed back by the webhook. */
    private String gatewayRef;
    /** Aggregator-side transaction id; null for cash / SARA / simulated. */
    private String paymentTxId;
    private Instant paidAt;

    @Column(length = 500)
    private String paymentMessage;  // decline reason shown to the client (e.g. "Solde insuffisant")

    /** SARA money: receipt key + the fields confirmed by the agent at the point of sale. */
    private String saraReceiptKey;
    private String saraRef;
    private String saraPayerPhone;
    private Integer saraAmount;

    /** Cash collection trace (set when a cashier validates a {@code cash} recharge). */
    private String cashCollectedBy;
    private String cashCollectedById;
    private Instant cashCollectedAt;

    /** Fulfillment trace: once a recharge is paid, the cashier actually credits the prepaid card,
     *  then validates here. {@code fulfilled} flips a paid recharge from "à créditer" to "rechargée".
     *  Nullable-safe default so the column adds cleanly to existing rows (ddl-auto: update). */
    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean fulfilled;
    private String fulfilledBy;     // cashier display name
    private String fulfilledById;   // cashier id (stats attribution)
    private Instant fulfilledAt;

    @Column(nullable = false)
    private Instant createdAt;

    /** Resolve a stored image key by kind (only the SARA receipt exists for a recharge). */
    @Transient
    public String imageKey(String kind) {
        return "sara-receipt".equals(kind) ? saraReceiptKey : null;
    }

    /** Overall display status. After payment, a recharge must still be credited to the card by a
     *  cashier: {@code to_fulfill} (payée, à créditer) → {@code fulfilled} (rechargée). */
    @Transient
    public String getStatus() {
        if (payStatus == PayStatus.failed) return "failed";
        if (payStatus == PayStatus.cash) return "cash";
        if (payStatus == PayStatus.sara_pending) return "sara_pending";
        if (payStatus == PayStatus.pending) return "pending";
        return fulfilled ? "fulfilled" : "to_fulfill";
    }
}
