package com.afriland.promote.repo;

import com.afriland.promote.model.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {

    Optional<ProductCategory> findByCode(String code);

    boolean existsByCode(String code);

    List<ProductCategory> findAllByOrderBySortOrderAscLabelAsc();

    List<ProductCategory> findByActiveTrueAndSubscriptionVisibleTrueOrderBySortOrderAscLabelAsc();
}
