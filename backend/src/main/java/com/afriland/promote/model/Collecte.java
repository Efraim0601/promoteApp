package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A "collecte" — one record of a bank product sold by a commercial, captured natively in the app
 * (replacing the KoboToolbox "Questionnaire 4: LES DIFFÉRENTS PRODUITS DE LA BANQUE"). The client
 * fields are conditional on {@code product}:
 *
 * <ul>
 *   <li>{@code compte_ouvert} → clientNom, accountNumber, clientPhone</li>
 *   <li>{@code carte_bancaire} → clientNom, cardNumber, cardType, clientPhone</li>
 *   <li>{@code sara_money} / {@code e_first} → clientNom, clientPhone</li>
 * </ul>
 *
 * Kept in its own table — independent of the card sale / recharge pipelines.
 */
@Entity
@Table(name = "collecte", indexes = {
        @Index(name = "idx_col_product", columnList = "product"),
        @Index(name = "idx_col_collected_by_id", columnList = "collected_by_id"),
        @Index(name = "idx_col_created_at", columnList = "created_at"),
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Collecte {

    @Id
    private String ref;             // business reference, e.g. "COL-000123"

    /** Product sold: compte_ouvert | carte_bancaire | sara_money | e_first. */
    @Column(nullable = false)
    private String product;

    private String clientNom;       // client full name
    private String clientPhone;     // client phone

    private String accountNumber;   // N° de compte (compte_ouvert)
    private String cardNumber;      // N° de la carte (carte_bancaire)
    private String cardType;        // type de carte code (carte_bancaire)

    /** The commercial who made the sale (the logged-in collecteur, or the admin who captured). */
    private String collectedById;
    private String collectedByName;

    @Column(nullable = false)
    private Instant createdAt;
}
