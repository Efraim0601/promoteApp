package com.afriland.promote.repo;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RechargeRepository extends JpaRepository<Recharge, String> {
    List<Recharge> findAllByOrderByCreatedAtAsc();
    Optional<Recharge> findByRefIgnoreCase(String ref);
    Optional<Recharge> findByGatewayRef(String gatewayRef);
    long countByPayStatus(PayStatus payStatus);
}
