package com.afriland.promote.repo;

import com.afriland.promote.model.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {
    List<Promotion> findByProductId(Long productId);
    List<Promotion> findByProductIdAndActiveTrue(Long productId);
    List<Promotion> findAllByOrderByCreatedAtDesc();
}
