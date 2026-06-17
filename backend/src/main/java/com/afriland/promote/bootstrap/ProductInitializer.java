package com.afriland.promote.bootstrap;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.model.Product;
import com.afriland.promote.model.ProductComponent;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.ProductComponentRepository;
import com.afriland.promote.repo.ProductRepository;
import com.afriland.promote.service.ProductService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Seeds the product catalog once, migrating the values previously hard-coded in {@link CardConfig}
 * (the Promote card) and in {@code CollecteService} (the four bank products) into {@link Product}
 * rows. Idempotent: a product already present (by code) is left untouched, so this is safe to run on
 * every boot with {@code ddl-auto=update} and never overwrites a manager's edits.
 */
@Component
@Order(30)
@RequiredArgsConstructor
@Slf4j
public class ProductInitializer implements ApplicationRunner {

    private final ProductRepository products;
    private final ProductComponentRepository components;
    private final CardConfigRepository configs;

    /** The four bank products historically captured as collectes (code → label). */
    private static final Map<String, String> BANK_PRODUCTS = Map.of(
            "compte_ouvert", "Compte Ouvert",
            "carte_bancaire", "Carte Bancaire",
            "sara_money", "Sara Money",
            "e_first", "E-First");

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedCard();
        seedBankProducts();
    }

    private void seedCard() {
        if (products.findByCode(ProductService.CARD_CODE).isPresent()) return;
        CardConfig c = configs.findById(1L).orElseGet(() ->
                CardConfig.builder().id(1L).price(10000).fees(500).transport(1000).build());
        Product card = products.save(Product.builder()
                .code(ProductService.CARD_CODE)
                .label("Carte Promote")
                .description("Carte prépayée / bancaire Promote")
                .groupCode("carte")
                .kind(Product.Kind.CARD)
                .basePrice(c.getPrice())
                .builtin(true)
                .active(true)
                .build());
        saveComponent(card.getId(), "fees", "Frais d'émission", c.getFees());
        saveComponent(card.getId(), "transport", "Transport (livraison)", c.getTransport());
        saveComponent(card.getId(), "rechargeInitiale", "Recharge initiale (prépayée)", c.rechargeInitialeOr());
        saveComponent(card.getId(), "passPremium", "Pass Premium (prépayée)", c.passPremiumOr());
        saveComponent(card.getId(), "rechargeInitialeBancaire", "Recharge initiale (bancaire)", c.rechargeInitialeBancaireOr());
        saveComponent(card.getId(), "passPremiumBancaire", "Pass Premium (bancaire)", c.passPremiumBancaireOr());
        log.info("Seeded CARD product '{}' from CardConfig", ProductService.CARD_CODE);
    }

    private void seedBankProducts() {
        List<String> created = new java.util.ArrayList<>();
        BANK_PRODUCTS.forEach((code, label) -> {
            if (products.findByCode(code).isPresent()) return;
            products.save(Product.builder()
                    .code(code).label(label).groupCode("bancaire")
                    .kind(Product.Kind.BANK).basePrice(0).builtin(true).active(true)
                    .build());
            created.add(code);
        });
        if (!created.isEmpty()) log.info("Seeded BANK products: {}", created);
    }

    private void saveComponent(Long productId, String key, String label, int amount) {
        components.save(ProductComponent.builder()
                .productId(productId).ckey(key).label(label).amount(amount).build());
    }
}
