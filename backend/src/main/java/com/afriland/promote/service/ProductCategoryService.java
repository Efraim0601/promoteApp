package com.afriland.promote.service;

import com.afriland.promote.model.ProductCategory;
import com.afriland.promote.repo.ProductCategoryRepository;
import com.afriland.promote.repo.ProductRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

@Service
public class ProductCategoryService {

    private final ProductCategoryRepository categories;
    private final ProductRepository products;

    public ProductCategoryService(ProductCategoryRepository categories, ProductRepository products) {
        this.categories = categories;
        this.products = products;
    }

    public List<ProductCategory> all() {
        return categories.findAllByOrderBySortOrderAscLabelAsc();
    }

    public List<ProductCategory> subscriptionCategories() {
        return categories.findByActiveTrueAndSubscriptionVisibleTrueOrderBySortOrderAscLabelAsc();
    }

    public Optional<ProductCategory> find(Long id) {
        return categories.findById(id);
    }

    public ProductCategory byCode(String code) {
        if (code == null || code.isBlank()) return null;
        return categories.findByCode(code.trim()).orElse(null);
    }

    public boolean exists(String code) {
        return code != null && !code.isBlank() && categories.existsByCode(code.trim());
    }

    /** Count products linked to a category code (via {@code Product.groupCode}). */
    public long productCount(String code) {
        if (code == null || code.isBlank()) return 0;
        return products.findByGroupCodeOrderByLabelAsc(code.trim()).size();
    }

    @Transactional
    public ProductCategory create(ProductCategory req) {
        String code = norm(req.getCode());
        if (code.isEmpty()) throw bad("invalid_code");
        if (categories.existsByCode(code)) throw new ResponseStatusException(HttpStatus.CONFLICT, "code_exists");
        ProductCategory c = ProductCategory.builder()
                .code(code)
                .label(trimOr(code, req.getLabel()))
                .description(trim(req.getDescription()))
                .sortOrder(Math.max(0, req.getSortOrder()))
                .subscriptionVisible(req.isSubscriptionVisible())
                .active(req.isActive())
                .builtin(false)
                .build();
        return categories.save(c);
    }

    @Transactional
    public ProductCategory update(Long id, ProductCategory req) {
        ProductCategory c = categories.findById(id).orElseThrow(this::notFound);
        if (!c.isBuiltin()) {
            String code = norm(req.getCode());
            if (!code.isEmpty() && !code.equals(c.getCode())) {
                if (categories.existsByCode(code)) throw new ResponseStatusException(HttpStatus.CONFLICT, "code_exists");
                String oldCode = c.getCode();
                c.setCode(code);
                // Keep product links in sync when a non-builtin category code is renamed.
                products.findByGroupCodeOrderByLabelAsc(oldCode).forEach(p -> {
                    p.setGroupCode(code);
                    products.save(p);
                });
            }
        }
        if (req.getLabel() != null && !req.getLabel().isBlank()) c.setLabel(req.getLabel().trim());
        c.setDescription(trim(req.getDescription()));
        c.setSortOrder(Math.max(0, req.getSortOrder()));
        c.setSubscriptionVisible(req.isSubscriptionVisible());
        c.setActive(req.isActive());
        return categories.save(c);
    }

    @Transactional
    public void delete(Long id) {
        ProductCategory c = categories.findById(id).orElseThrow(this::notFound);
        if (c.isBuiltin()) throw bad("builtin_category");
        if (productCount(c.getCode()) > 0) throw bad("category_has_products");
        categories.delete(c);
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase().replaceAll("\\s+", "_");
    }

    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String trimOr(String fallback, String s) {
        return s == null || s.isBlank() ? fallback : s.trim();
    }

    private ResponseStatusException bad(String code) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, code);
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "category_not_found");
    }
}
