package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;

/**
 * A commission rule: how much a beneficiary earns on a sale. Defined per {@code PRODUCT} or per
 * {@code GROUP} of products, and applicable to a {@code ROLE}/profile or to a specific {@code USER}
 * (individual override). The amount is a {@code FIXED} sum or a {@code PERCENT} of the sale base.
 *
 * <p>Resolution order when several rules match a sale (see {@code CommissionService}):
 * user override &gt; role; product scope &gt; group scope; most recent active rule wins.
 */
@Entity
@Table(name = "commission_rule")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CommissionRule {

    public enum ScopeType { PRODUCT, GROUP }
    public enum TargetType { ROLE, USER }
    public enum RateType { FIXED, PERCENT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ScopeType scopeType;

    /** Product code (scopeType=PRODUCT) or group code (scopeType=GROUP). */
    @Column(nullable = false, length = 60)
    private String scopeCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private TargetType targetType;

    /** Role name (targetType=ROLE) or user id (targetType=USER). */
    @Column(nullable = false, length = 60)
    private String targetValue;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private RateType rateType;

    /** Fixed amount in XAF (rateType=FIXED) or percentage 0–100 (rateType=PERCENT). */
    @Column(nullable = false)
    private int rateValue;

    private LocalDate startDate;
    private LocalDate endDate;

    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;

    /** True when enabled and today is within the (optional) date window. */
    public boolean isLiveOn(LocalDate day) {
        if (!active) return false;
        if (startDate != null && day.isBefore(startDate)) return false;
        if (endDate != null && day.isAfter(endDate)) return false;
        return true;
    }

    /** Commission amount for a sale base, clamped to ≥ 0. */
    public int compute(int base) {
        int amount = rateType == RateType.FIXED ? rateValue : base * rateValue / 100;
        return Math.max(0, amount);
    }
}
