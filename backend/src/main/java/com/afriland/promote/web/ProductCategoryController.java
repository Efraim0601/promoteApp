package com.afriland.promote.web;

import com.afriland.promote.model.ProductCategory;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.ProductCategoryService;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Catalogue — Catégories", description = "Catégories affichées dans le parcours de souscription")
@RestController
@RequestMapping("/api/product-categories")
public class ProductCategoryController {

    private final ProductCategoryService service;
    private final ActionAuditService audit;

    public ProductCategoryController(ProductCategoryService service, ActionAuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping
    public List<ProductCategoryDto> list(@RequestParam(required = false) Boolean subscription) {
        List<ProductCategory> rows = Boolean.TRUE.equals(subscription)
                ? service.subscriptionCategories()
                : service.all();
        return rows.stream().map(this::toDto).toList();
    }

    @GetMapping("/{id}")
    public ProductCategoryDto get(@PathVariable Long id) {
        return service.find(id).map(this::toDto).orElse(null);
    }

    @PostMapping
    public ProductCategoryDto create(@RequestBody ProductCategoryRequest req, Authentication auth) {
        ProductCategory saved = service.create(fromRequest(req));
        audit.record(auth, "CREATE_CATEGORY", "CATEGORY", saved.getCode(),
                "Création catégorie " + saved.getLabel());
        return toDto(saved);
    }

    @PutMapping("/{id}")
    public ProductCategoryDto update(@PathVariable Long id, @RequestBody ProductCategoryRequest req, Authentication auth) {
        ProductCategory saved = service.update(id, fromRequest(req));
        audit.record(auth, "UPDATE_CATEGORY", "CATEGORY", saved.getCode(),
                "Modification catégorie " + saved.getLabel());
        return toDto(saved);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, Authentication auth) {
        var c = service.find(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "category_not_found"));
        service.delete(id);
        audit.record(auth, "DELETE_CATEGORY", "CATEGORY", c.getCode(), "Suppression catégorie");
    }

    private ProductCategoryDto toDto(ProductCategory c) {
        return new ProductCategoryDto(c.getId(), c.getCode(), c.getLabel(), c.getDescription(),
                c.getSortOrder(), c.isSubscriptionVisible(), c.isActive(), c.isBuiltin(),
                service.productCount(c.getCode()));
    }

    private static ProductCategory fromRequest(ProductCategoryRequest req) {
        return ProductCategory.builder()
                .code(req.code())
                .label(req.label())
                .description(req.description())
                .sortOrder(req.sortOrder())
                .subscriptionVisible(req.subscriptionVisible())
                .active(req.active())
                .build();
    }
}
