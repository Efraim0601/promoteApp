package com.afriland.promote.bootstrap;

import com.afriland.promote.model.ProductCategory;
import com.afriland.promote.repo.ProductCategoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds default product categories once. Idempotent: existing rows (by code) are left untouched.
 */
@Component
@Order(25)
@RequiredArgsConstructor
@Slf4j
public class CategoryInitializer implements ApplicationRunner {

    private final ProductCategoryRepository categories;

    private record CatSeed(String code, String label, int sortOrder, boolean subscriptionVisible) {}

    private static final CatSeed[] DEFAULTS = {
            new CatSeed("carte", "Cartes", 1, true),
            new CatSeed("compte", "Comptes", 2, true),
            new CatSeed("service", "Services", 3, true),
            new CatSeed("bancaire", "Bancaire", 99, false),
    };

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (CatSeed seed : DEFAULTS) {
            if (categories.findByCode(seed.code()).isPresent()) continue;
            categories.save(ProductCategory.builder()
                    .code(seed.code())
                    .label(seed.label())
                    .description("Catégorie " + seed.label())
                    .sortOrder(seed.sortOrder())
                    .subscriptionVisible(seed.subscriptionVisible())
                    .active(true)
                    .builtin(true)
                    .build());
            log.info("Seeded product category '{}'", seed.code());
        }
    }
}
