package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Product category configured by a manager. Products reference a category via {@link Product#getGroupCode()}.
 * Categories with {@code subscriptionVisible=true} appear as filter pills in the public subscription funnel.
 */
@Entity
@Table(name = "product_category", indexes = {
        @Index(name = "idx_product_category_code", columnList = "code", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable business code (e.g. {@code carte}, {@code compte}). Unique. */
    @Column(nullable = false, unique = true, length = 60)
    private String code;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(length = 500)
    private String description;

    /** Display order in manager console and subscription funnel (lower = first). */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("0")
    private int sortOrder = 0;

    /** When true, products in this category are offered in the public subscription funnel. */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean subscriptionVisible = true;

    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean active = true;

    /** Seeded categories cannot be deleted, only edited. */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean builtin = false;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;
}
