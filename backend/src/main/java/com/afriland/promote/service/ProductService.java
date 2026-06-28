package com.afriland.promote.service;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.model.Product;
import com.afriland.promote.model.ProductComponent;
import com.afriland.promote.model.Promotion;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.ProductComponentRepository;
import com.afriland.promote.repo.ProductRepository;
import com.afriland.promote.repo.PromotionRepository;
import com.afriland.promote.storage.ImageStorage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Single source of truth for the products/services sold in the app and their prices/promotions.
 * Replaces the values previously hard-coded in {@link CardConfig} (the Promote card) and in
 * {@code CollecteService} (the four bank products).
 *
 * <p>The {@code CARD} product is kept in sync with the legacy {@link CardConfig} singleton so the
 * unchanged subscription runtime keeps reading the same amounts — the catalog is the editing
 * surface, {@code CardConfig} is the mirrored runtime store.
 */
@Service
public class ProductService {

    public static final String CARD_CODE = "carte_promote";

    private final ProductRepository products;
    private final ProductComponentRepository components;
    private final PromotionRepository promotions;
    private final CardConfigRepository configs;
    private final ProductCategoryService categories;
    private final ImageStorage storage;

    public ProductService(ProductRepository products, ProductComponentRepository components,
                          PromotionRepository promotions, CardConfigRepository configs,
                          ProductCategoryService categories, ImageStorage storage) {
        this.products = products;
        this.components = components;
        this.promotions = promotions;
        this.configs = configs;
        this.categories = categories;
        this.storage = storage;
    }

    // ---- reads ----

    public List<Product> all() { return products.findAllByOrderByKindAscLabelAsc(); }

    public Product byCode(String code) { return products.findByCode(code).orElse(null); }

    public Optional<Product> find(Long id) { return products.findById(id); }

    public List<ProductComponent> componentsOf(Long productId) {
        return components.findByProductId(productId);
    }

    public List<Promotion> promotionsOf(Long productId) {
        return promotions.findByProductId(productId);
    }

    public List<Promotion> allPromotions() { return promotions.findAllByOrderByCreatedAtDesc(); }

    /** Best (lowest) live promotion for a product today, or empty when none applies. */
    public Optional<Promotion> livePromotion(Long productId) {
        LocalDate today = LocalDate.now();
        return promotions.findByProductIdAndActiveTrue(productId).stream()
                .filter(p -> p.isLiveOn(today))
                .min(java.util.Comparator.comparingInt(p -> p.apply(priceOf(productId))));
    }

    private int priceOf(Long productId) {
        return products.findById(productId).map(Product::getBasePrice).orElse(0);
    }

    /** Effective price for a product code = base price with the best live promotion applied. */
    public int effectivePrice(String code) {
        Product p = byCode(code);
        if (p == null) return 0;
        return livePromotion(p.getId()).map(promo -> promo.apply(p.getBasePrice())).orElse(p.getBasePrice());
    }

    // ---- product CRUD ----

    @Transactional
    public Product create(Product req) {
        String code = norm(req.getCode());
        if (code.isEmpty()) throw bad("invalid_code");
        if (products.existsByCode(code)) throw new ResponseStatusException(HttpStatus.CONFLICT, "code_exists");
        String groupCode = resolveGroupCode(trim(req.getGroupCode()));
        Product p = Product.builder()
                .code(code)
                .label(req.getLabel() == null ? code : req.getLabel().trim())
                .description(trim(req.getDescription()))
                .groupCode(groupCode)
                .kind(req.getKind() == null ? Product.Kind.BANK : req.getKind())
                .basePrice(Math.max(0, req.getBasePrice()))
                .active(req.isActive())
                .imageKey(trim(req.getImageKey()))
                .builtin(false)
                .build();
        return products.save(p);
    }

    @Transactional
    public Product update(Long id, Product req) {
        Product p = products.findById(id).orElseThrow(() -> notFound());
        // The business code and kind of a built-in product are immutable (they anchor the runtime).
        if (!p.isBuiltin()) {
            String code = norm(req.getCode());
            if (!code.isEmpty() && !code.equals(p.getCode())) {
                if (products.existsByCode(code)) throw new ResponseStatusException(HttpStatus.CONFLICT, "code_exists");
                p.setCode(code);
            }
            if (req.getKind() != null) p.setKind(req.getKind());
        }
        if (req.getLabel() != null && !req.getLabel().isBlank()) p.setLabel(req.getLabel().trim());
        p.setDescription(trim(req.getDescription()));
        p.setGroupCode(resolveGroupCode(trim(req.getGroupCode())));
        p.setBasePrice(Math.max(0, req.getBasePrice()));
        p.setActive(req.isActive());
        if (req.getImageKey() != null) p.setImageKey(trim(req.getImageKey()));
        Product saved = products.save(p);
        if (ProductService.CARD_CODE.equals(saved.getCode())) syncCardToConfig(saved);
        return saved;
    }

    @Transactional
    public void delete(Long id) {
        Product p = products.findById(id).orElseThrow(() -> notFound());
        if (p.isBuiltin()) throw bad("builtin_product");
        components.deleteByProductId(id);
        for (Promotion promo : promotions.findByProductId(id)) promotions.delete(promo);
        products.delete(p);
    }

    /** Replace a product's tariff components (used for the CARD product), then mirror to CardConfig. */
    @Transactional
    public Product setComponents(Long id, List<ProductComponent> incoming) {
        Product p = products.findById(id).orElseThrow(() -> notFound());
        components.deleteByProductId(id);
        for (ProductComponent c : incoming) {
            components.save(ProductComponent.builder()
                    .productId(id).ckey(c.getCkey()).label(c.getLabel()).amount(Math.max(0, c.getAmount()))
                    .build());
        }
        if (ProductService.CARD_CODE.equals(p.getCode())) syncCardToConfig(p);
        return p;
    }

    // ---- promotion CRUD ----

    @Transactional
    public Promotion createPromotion(Long productId, Promotion req) {
        products.findById(productId).orElseThrow(() -> notFound());
        Promotion promo = Promotion.builder()
                .productId(productId)
                .label(trim(req.getLabel()))
                .type(req.getType() == null ? Promotion.Type.PERCENT : req.getType())
                .value(Math.max(0, req.getValue()))
                .startDate(req.getStartDate())
                .endDate(req.getEndDate())
                .active(req.isActive())
                .build();
        return promotions.save(promo);
    }

    @Transactional
    public Promotion updatePromotion(Long promoId, Promotion req) {
        Promotion promo = promotions.findById(promoId).orElseThrow(() -> notFound());
        promo.setLabel(trim(req.getLabel()));
        if (req.getType() != null) promo.setType(req.getType());
        promo.setValue(Math.max(0, req.getValue()));
        promo.setStartDate(req.getStartDate());
        promo.setEndDate(req.getEndDate());
        promo.setActive(req.isActive());
        return promotions.save(promo);
    }

    @Transactional
    public void deletePromotion(Long promoId) {
        if (!promotions.existsById(promoId)) throw notFound();
        promotions.deleteById(promoId);
    }

    /** Store a representative image for a product and persist its object-storage key. */
    @Transactional
    public Product setImage(Long id, byte[] data, String contentType) {
        Product p = products.findById(id).orElseThrow(() -> notFound());
        String key = storage.store(data, contentType, "product-image");
        p.setImageKey(key);
        return products.save(p);
    }

    /** Remove the representative image reference (object in storage is left orphaned). */
    @Transactional
    public Product clearImage(Long id) {
        Product p = products.findById(id).orElseThrow(() -> notFound());
        p.setImageKey(null);
        return products.save(p);
    }

    // ---- card ↔ CardConfig mirror ----

    /** Push the CARD product's basePrice + components into the legacy {@link CardConfig} singleton so
     *  the unchanged subscription runtime keeps reading consistent amounts. */
    private void syncCardToConfig(Product card) {
        CardConfig c = configs.findById(1L).orElseGet(() -> CardConfig.builder().id(1L).build());
        c.setPrice(card.getBasePrice());
        for (ProductComponent comp : components.findByProductId(card.getId())) {
            int v = comp.getAmount();
            switch (comp.getCkey()) {
                case "fees" -> c.setFees(v);
                case "transport" -> c.setTransport(v);
                case "rechargeInitiale" -> c.setRechargeInitiale(v);
                case "passPremium" -> c.setPassPremium(v);
                case "rechargeInitialeBancaire" -> c.setRechargeInitialeBancaire(v);
                case "passPremiumBancaire" -> c.setPassPremiumBancaire(v);
                case "rechargeMin" -> c.setRechargeMin(v);
                case "rechargeMax" -> c.setRechargeMax(v);
                default -> { /* ignore unknown component keys */ }
            }
        }
        configs.save(c);
    }

    // ---- helpers ----

    private String resolveGroupCode(String groupCode) {
        if (groupCode == null || groupCode.isBlank()) return null;
        if (!categories.exists(groupCode)) throw bad("unknown_category");
        return groupCode;
    }

    private static String norm(String s) { return s == null ? "" : s.trim().toLowerCase().replaceAll("\\s+", "_"); }
    private static String trim(String s) { return s == null || s.isBlank() ? null : s.trim(); }
    private static ResponseStatusException bad(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }
    private static ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "product_not_found"); }
}
