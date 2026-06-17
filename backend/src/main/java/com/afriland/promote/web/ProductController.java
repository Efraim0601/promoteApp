package com.afriland.promote.web;

import com.afriland.promote.model.Product;
import com.afriland.promote.model.ProductComponent;
import com.afriland.promote.model.Promotion;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.ProductService;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Catalog management: products, their tariff components and promotions. Reads are open to any
 * authenticated staff (and a couple of public-price lookups); writes are restricted to
 * MANAGER/ADMIN in {@link com.afriland.promote.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService service;
    private final ActionAuditService audit;

    public ProductController(ProductService service, ActionAuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    // ---- products ----

    @GetMapping
    public List<ProductDto> list() {
        return service.all().stream().map(this::toDto).toList();
    }

    @GetMapping("/{id}")
    public ProductDto get(@PathVariable Long id) {
        return service.find(id).map(this::toDto).orElse(null);
    }

    @PostMapping
    public ProductDto create(@RequestBody ProductRequest req, Authentication auth) {
        Product saved = service.create(fromRequest(req));
        audit.record(auth, "CREATE_PRODUCT", "PRODUCT", saved.getCode(),
                "Création produit " + saved.getLabel());
        return toDto(saved);
    }

    @PutMapping("/{id}")
    public ProductDto update(@PathVariable Long id, @RequestBody ProductRequest req, Authentication auth) {
        Product saved = service.update(id, fromRequest(req));
        if (req.components() != null && !req.components().isEmpty()) {
            saved = service.setComponents(id, req.components().stream()
                    .map(c -> ProductComponent.builder().ckey(c.ckey()).label(c.label()).amount(c.amount()).build())
                    .toList());
        }
        audit.record(auth, "UPDATE_PRODUCT", "PRODUCT", saved.getCode(),
                "Modification produit " + saved.getLabel() + " (prix=" + saved.getBasePrice() + ")");
        return toDto(saved);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, Authentication auth) {
        service.delete(id);
        audit.record(auth, "DELETE_PRODUCT", "PRODUCT", String.valueOf(id), "Suppression produit");
    }

    // ---- promotions ----

    @PostMapping("/{id}/promotions")
    public PromotionDto addPromotion(@PathVariable Long id, @RequestBody PromotionRequest req, Authentication auth) {
        Promotion saved = service.createPromotion(id, fromRequest(req, id));
        audit.record(auth, "CREATE_PROMOTION", "PRODUCT", String.valueOf(id),
                "Promotion " + saved.getType() + " " + saved.getValue());
        return PromotionDto.of(saved);
    }

    @PutMapping("/promotions/{promoId}")
    public PromotionDto updatePromotion(@PathVariable Long promoId, @RequestBody PromotionRequest req, Authentication auth) {
        Promotion saved = service.updatePromotion(promoId, fromRequest(req, null));
        audit.record(auth, "UPDATE_PROMOTION", "PROMOTION", String.valueOf(promoId), "Modification promotion");
        return PromotionDto.of(saved);
    }

    @DeleteMapping("/promotions/{promoId}")
    public void deletePromotion(@PathVariable Long promoId, Authentication auth) {
        service.deletePromotion(promoId);
        audit.record(auth, "DELETE_PROMOTION", "PROMOTION", String.valueOf(promoId), "Suppression promotion");
    }

    // ---- mapping ----

    private ProductDto toDto(Product p) {
        List<ProductComponentDto> comps = service.componentsOf(p.getId()).stream()
                .map(ProductComponentDto::of).toList();
        List<PromotionDto> promos = service.promotionsOf(p.getId()).stream()
                .map(PromotionDto::of).toList();
        return new ProductDto(p.getId(), p.getCode(), p.getLabel(), p.getDescription(), p.getGroupCode(),
                p.getKind().name(), p.getBasePrice(), service.effectivePrice(p.getCode()),
                p.isBuiltin(), p.isActive(), comps, promos);
    }

    private static Product fromRequest(ProductRequest req) {
        return Product.builder()
                .code(req.code())
                .label(req.label())
                .description(req.description())
                .groupCode(req.groupCode())
                .kind(parseKind(req.kind()))
                .basePrice(req.basePrice())
                .active(req.active())
                .build();
    }

    private static Product.Kind parseKind(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Product.Kind.valueOf(s.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return null; }
    }

    private static Promotion fromRequest(PromotionRequest req, Long productId) {
        return Promotion.builder()
                .productId(productId)
                .label(req.label())
                .type(parseType(req.type()))
                .value(req.value())
                .startDate(parseDate(req.startDate()))
                .endDate(parseDate(req.endDate()))
                .active(req.active())
                .build();
    }

    private static Promotion.Type parseType(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Promotion.Type.valueOf(s.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return null; }
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }
}
