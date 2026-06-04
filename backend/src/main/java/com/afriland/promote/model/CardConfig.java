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

    private int price;        // card price
    private int fees;         // issuance fee
    private int transport;    // home-delivery transport fee
}
