package com.afriland.promote.repo;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RechargeRepository extends JpaRepository<Recharge, String> {
    List<Recharge> findAllByOrderByCreatedAtAsc();
    Optional<Recharge> findByRefIgnoreCase(String ref);
    Optional<Recharge> findByGatewayRef(String gatewayRef);
    long countByPayStatus(PayStatus payStatus);

    /** Reconciliation sweep: still-pending recharges in [windowStart, pullCutoff) (batch-limited). */
    List<Recharge> findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
            PayStatus payStatus, Instant windowStart, Instant pullCutoff, Pageable pageable);

    /** Recent MoMo recharges (any status) for duplicate-debit guard and resume. */
    @Query("select r from Recharge r where lower(r.pay) = lower(:pay) and r.amount = :amount "
            + "and r.createdAt >= :since and lower(r.pay) in ('om', 'mtn') order by r.createdAt desc")
    List<Recharge> findRecentMomoAttempts(
            @Param("pay") String pay, @Param("amount") int amount, @Param("since") Instant since);

    /** Cashier fulfillment queue: paid recharges not yet credited to the card (oldest first). Indexed
     *  on pay_status — replaces a full-table scan + in-memory filter. */
    List<Recharge> findByPayStatusAndFulfilledFalseOrderByCreatedAtAsc(PayStatus payStatus);

    /** Manual reconciliation: MoMo recharges still pending/failed with a gateway id, since a cutoff (batch-limited). */
    @Query("select r from Recharge r where r.createdAt >= :since "
            + "and r.payStatus in (com.afriland.promote.model.PayStatus.pending, com.afriland.promote.model.PayStatus.failed) "
            + "and r.gatewayRef is not null "
            + "and lower(r.pay) in ('om', 'mtn') "
            + "order by r.createdAt asc")
    List<Recharge> findMoMoReconcilableSince(@Param("since") Instant since, Pageable pageable);
}
