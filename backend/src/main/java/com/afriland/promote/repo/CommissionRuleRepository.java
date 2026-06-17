package com.afriland.promote.repo;

import com.afriland.promote.model.CommissionRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommissionRuleRepository extends JpaRepository<CommissionRule, Long> {
    List<CommissionRule> findByActiveTrue();
    List<CommissionRule> findAllByOrderByCreatedAtDesc();
}
