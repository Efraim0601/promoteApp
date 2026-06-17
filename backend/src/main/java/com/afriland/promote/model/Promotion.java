package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;

/**
 * A promotion on a {@link Product}: either a flat promo price ({@code PRICE}) or a percentage
 * discount ({@code PERCENT}), bounded by an optional date window. A product's effective price is the
 * promo price when a promotion is active today, otherwise the product's {@code basePrice}.
 */
@Entity
@Table(name = "promotion", indexes = {
        @Index(name = "idx_promo_product", columnList = "productId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Promotion {

    public enum Type { PRICE, PERCENT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long productId;

    @Column(length = 120)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private Type type = Type.PERCENT;

    /** Promo price in XAF (type=PRICE) or discount percentage 0–100 (type=PERCENT).
     *  Column renamed ({@code value} is a reserved word in some databases, incl. H2). */
    @Column(name = "promo_value", nullable = false)
    private int value;

    /** Optional window. Null start = always started; null end = no expiry. */
    private LocalDate startDate;
    private LocalDate endDate;

    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;

    /** True when this promotion is enabled and today falls within its (optional) window. */
    public boolean isLiveOn(LocalDate day) {
        if (!active) return false;
        if (startDate != null && day.isBefore(startDate)) return false;
        if (endDate != null && day.isAfter(endDate)) return false;
        return true;
    }

    /** Apply this promotion to a base price, clamped to ≥ 0. */
    public int apply(int basePrice) {
        int p = type == Type.PRICE ? value : basePrice - (basePrice * value / 100);
        return Math.max(0, p);
    }
}
