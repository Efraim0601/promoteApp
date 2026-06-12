package com.afriland.promote.repo;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RechargeRepository extends JpaRepository<Recharge, String> {
    List<Recharge> findAllByOrderByCreatedAtAsc();
    Optional<Recharge> findByRefIgnoreCase(String ref);
    Optional<Recharge> findByGatewayRef(String gatewayRef);
    long countByPayStatus(PayStatus payStatus);

    /** Reconciliation sweep: oldest still-pending recharges created before a cutoff (batch-limited). */
    List<Recharge> findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
            PayStatus payStatus, Instant createdAt, Pageable pageable);

    /** Cashier fulfillment queue: paid recharges not yet credited to the card (oldest first). Indexed
     *  on pay_status — replaces a full-table scan + in-memory filter. */
    List<Recharge> findByPayStatusAndFulfilledFalseOrderByCreatedAtAsc(PayStatus payStatus);
}
