package com.afriland.promote.repo;

import com.afriland.promote.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {
    Optional<Product> findByCode(String code);
    boolean existsByCode(String code);
    List<Product> findByActiveTrueOrderByLabelAsc();
    List<Product> findAllByOrderByKindAscLabelAsc();
    List<Product> findByGroupCodeOrderByLabelAsc(String groupCode);
}
