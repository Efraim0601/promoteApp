package com.afriland.promote.repo;

import com.afriland.promote.model.ProductComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductComponentRepository extends JpaRepository<ProductComponent, Long> {
    List<ProductComponent> findByProductId(Long productId);
    void deleteByProductId(Long productId);
}
