package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

/** Single configurable row (id = 1) holding the amounts applied to every new subscription. */
@Entity
@Table(name = "card_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CardConfig {

    @Id
    private Long id;          // always 1 (singleton)

    private int price;        // card price — kept as the reference ("ancien prix" barré dans l'offre)
    private int fees;         // issuance fee
    private int transport;    // home-delivery transport fee

    /** Recharge (top-up) free-entry bounds, in XAF. Nullable so the columns add cleanly to an
     *  existing row (ddl-auto: update); null falls back to the built-in defaults. */
    private Integer rechargeMin;
    private Integer rechargeMax;

    /** Offre Promote — la carte est gratuite ; le client règle la recharge initiale + le Pass
     *  Premium (ce qui forme le total de la souscription). Nullable pour s'ajouter proprement à une
     *  ligne existante (ddl-auto: update) ; null retombe sur les valeurs par défaut.
     *  <p>Ces deux montants s'appliquent à la <b>carte prépayée</b>. La <b>carte bancaire</b> a son
     *  propre couple de montants ({@code *Bancaire}) — le client choisit le type au moment de la
     *  souscription et le total varie en conséquence. */
    private Integer rechargeInitiale;
    private Integer passPremium;

    /** Mêmes deux postes, mais pour la carte bancaire (montants configurables séparément). */
    private Integer rechargeInitialeBancaire;
    private Integer passPremiumBancaire;

    public static final int DEFAULT_RECHARGE_INITIALE = 2500;
    public static final int DEFAULT_PASS_PREMIUM = 2000;

    /** Effective values (config value, or the built-in default when unset). */
    public int rechargeInitialeOr() { return rechargeInitiale != null ? rechargeInitiale : DEFAULT_RECHARGE_INITIALE; }
    public int passPremiumOr() { return passPremium != null ? passPremium : DEFAULT_PASS_PREMIUM; }

    /** Carte bancaire : montants effectifs (valeur configurée, ou le montant prépayée par défaut). */
    public int rechargeInitialeBancaireOr() { return rechargeInitialeBancaire != null ? rechargeInitialeBancaire : rechargeInitialeOr(); }
    public int passPremiumBancaireOr() { return passPremiumBancaire != null ? passPremiumBancaire : passPremiumOr(); }
}
