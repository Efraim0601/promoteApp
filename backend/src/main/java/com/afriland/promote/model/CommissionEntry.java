package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One commission credited to a beneficiary for a single settled sale. Generated automatically when a
 * subscription is paid or a collecte is recorded.
 *
 * <p>The unique {@code (saleType, saleRef, beneficiaryId)} constraint makes generation idempotent:
 * replaying a payment webhook / reconciliation never double-credits.
 */
@Entity
@Table(name = "commission_entry",
        uniqueConstraints = @UniqueConstraint(name = "uk_commission_sale_beneficiary",
                columnNames = {"saleType", "saleRef", "beneficiaryId"}),
        indexes = {
                @Index(name = "idx_comm_beneficiary", columnList = "beneficiaryId"),
                @Index(name = "idx_comm_product", columnList = "productCode")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CommissionEntry {

    public enum SaleType { SUBSCRIPTION, COLLECTE }
    public enum Status { PENDING, VALIDATED, PAID }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SaleType saleType;

    /** Business reference of the sale (subscription ref or collecte ref). */
    @Column(nullable = false, length = 40)
    private String saleRef;

    @Column(nullable = false, length = 60)
    private String productCode;

    @Column(nullable = false, length = 40)
    private String beneficiaryId;

    private String beneficiaryName;

    /** Sale base the commission was computed from (XAF). */
    @Column(nullable = false)
    private int baseAmount;

    /** Commission amount credited (XAF). */
    @Column(nullable = false)
    private int amount;

    /** The {@link CommissionRule} that produced this entry (null if none matched → amount 0). */
    private Long ruleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    @Builder.Default
    private Status status = Status.PENDING;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;
}
