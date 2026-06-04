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

    private boolean printed;
    private boolean selfieVerified;

    /** Object-storage key of the captured KYC selfie (null if none / simulated). */
    private String selfieKey;

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
