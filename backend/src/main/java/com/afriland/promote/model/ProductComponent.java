package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

/**
 * One named tariff line of a {@link Product} (used by the {@code CARD} product to break the card
 * offer into its configurable amounts: fees, transport, recharge initiale, pass premium, and their
 * bancaire variants). Keeping it as a generic key/amount table avoids widening {@link Product} with
 * card-only columns.
 */
@Entity
@Table(name = "product_component", indexes = {
        @Index(name = "idx_pcomp_product", columnList = "productId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductComponent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long productId;

    /** Component key (e.g. {@code fees}, {@code transport}, {@code rechargeInitiale}, {@code passPremium}). */
    @Column(nullable = false, length = 60)
    private String ckey;

    @Column(length = 120)
    private String label;

    @Column(nullable = false)
    private int amount;
}
