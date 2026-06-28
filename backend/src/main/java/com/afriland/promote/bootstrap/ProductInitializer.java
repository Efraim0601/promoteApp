package com.afriland.promote.bootstrap;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.model.Product;
import com.afriland.promote.model.ProductComponent;
import com.afriland.promote.model.Promotion;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.ProductComponentRepository;
import com.afriland.promote.repo.ProductRepository;
import com.afriland.promote.repo.PromotionRepository;
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
    private final PromotionRepository promotions;

    /** The four bank products historically captured as collectes (code → label). */
    private static final Map<String, String> BANK_PRODUCTS = Map.of(
            "compte_ouvert", "Compte Ouvert",
            "carte_bancaire", "Carte Bancaire",
            "sara_money", "Sara Money",
            "e_first", "E-First");

    private record CardSeed(String code, String label, int price, int recharge, int pass, int transport) {}

    /** Card choices shown in the public funnel, aligned with the bundled portal prototype. */
    private static final List<CardSeed> CARD_PRODUCTS = List.of(
            new CardSeed("visa_classic", "Carte Visa Classic", 15000, 7500, 2500, 1000),
            new CardSeed("visa_gold", "Carte Visa Gold", 30000, 15000, 5000, 1500),
            new CardSeed("visa_premium", "Carte Visa Premium", 60000, 0, 0, 1500),
            new CardSeed("mc_standard", "Mastercard Standard", 15000, 7500, 2500, 1000),
            new CardSeed("mc_world", "Mastercard World", 45000, 15000, 5000, 1500),
            new CardSeed("carte_virtuelle", "Carte Virtuelle", 5000, 0, 0, 0));

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedCard();
        seedAdditionalCards();
        seedBankProducts();
        seedDemoPromo();
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

    private void seedAdditionalCards() {
        List<String> created = new java.util.ArrayList<>();
        for (CardSeed seed : CARD_PRODUCTS) {
            if (products.findByCode(seed.code()).isPresent()) continue;
            Product card = products.save(Product.builder()
                    .code(seed.code())
                    .label(seed.label())
                    .description("Carte physique")
                    .groupCode("carte")
                    .kind(Product.Kind.CARD)
                    .basePrice(seed.price())
                    .builtin(false)
                    .active(true)
                    .build());
            saveComponent(card.getId(), "transport", "Livraison domicile", seed.transport());
            saveComponent(card.getId(), "rechargeInitiale", "Recharge initiale", seed.recharge());
            saveComponent(card.getId(), "passPremium", "Pass Premium", seed.pass());
            saveComponent(card.getId(), "rechargeInitialeBancaire", "Recharge initiale", seed.recharge());
            saveComponent(card.getId(), "passPremiumBancaire", "Pass Premium", seed.pass());
            created.add(seed.code());
        }
        if (!created.isEmpty()) log.info("Seeded extra CARD products: {}", created);
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

    /** Demo promo on Visa Classic — aligned with the portal prototype (15000 → 12000 XAF). */
    private void seedDemoPromo() {
        products.findByCode("visa_classic").ifPresent(p -> {
            if (!promotions.findByProductId(p.getId()).isEmpty()) return;
            promotions.save(Promotion.builder()
                    .productId(p.getId())
                    .label("Promo lancement")
                    .type(Promotion.Type.PRICE)
                    .value(12000)
                    .active(true)
                    .build());
            log.info("Seeded demo promotion on visa_classic");
        });
    }

    private void saveComponent(Long productId, String key, String label, int amount) {
        components.save(ProductComponent.builder()
                .productId(productId).ckey(key).label(label).amount(amount).build());
    }
}
