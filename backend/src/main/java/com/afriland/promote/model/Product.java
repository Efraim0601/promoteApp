package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

/**
 * A product or service sold in the app — the single source of truth that replaces the values
 * previously hard-coded in {@link CardConfig} (the Promote card) and in {@code CollecteService}
 * (the four bank products). A {@code MANAGER} configures these from the catalog screen.
 *
 * <p>{@link #kind} distinguishes the prepaid/bancaire card ({@code CARD}) — whose tariff is broken
 * down into {@link ProductComponent}s and mirrored back to {@link CardConfig} for the legacy
 * subscription runtime — from the bank products captured as collectes ({@code BANK}), which carry a
 * single {@code basePrice} used as the commission base.
 */
@Entity
@Table(name = "product", indexes = {
        @Index(name = "idx_product_code", columnList = "code", unique = true),
        @Index(name = "idx_product_group", columnList = "groupCode")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    public enum Kind { CARD, BANK }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable business code (e.g. {@code carte_promote}, {@code compte_ouvert}). Unique. */
    @Column(nullable = false, unique = true, length = 60)
    private String code;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(length = 500)
    private String description;

    /** Group used to bucket products and to attach group-level commission rules (e.g. {@code bancaire}). */
    @Column(length = 60)
    private String groupCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private Kind kind = Kind.BANK;

    /** Reference price in XAF (before any active promotion). */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("0")
    private int basePrice = 0;

    /** Built-in products (the card + the four seeded bank products) cannot be deleted, only edited. */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean builtin = false;

    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean active = true;

    /** Object-storage key for the representative product image (prefix {@code product-image}). */
    @Column(length = 500)
    private String imageKey;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;
}
