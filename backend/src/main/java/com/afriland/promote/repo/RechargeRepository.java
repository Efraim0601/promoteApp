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

    /** Reconciliation sweep: still-pending recharges in [windowStart, pullCutoff) (batch-limited).
     *  Oldest-first so the pending sweep reaches (and can expire) the oldest pending rows first. */
    List<Recharge> findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
            PayStatus payStatus, Instant windowStart, Instant pullCutoff, Pageable pageable);

    /** Failed-recharge recheck: failed recharges in [windowStart, now) (batch-limited), NEWEST first —
     *  recent failures are the recoverable ones, so a backlog of old failures can't starve them. */
    List<Recharge> findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            PayStatus payStatus, Instant windowStart, Instant now, Pageable pageable);

    /** Recent MoMo recharges (any status) for duplicate-debit guard and resume. */
    @Query("select r from Recharge r where lower(r.pay) = lower(:pay) and r.amount = :amount "
            + "and r.createdAt >= :since and lower(r.pay) in ('om', 'mtn') order by r.createdAt desc")
    List<Recharge> findRecentMomoAttempts(
            @Param("pay") String pay, @Param("amount") int amount, @Param("since") Instant since);

    /** Cashier fulfillment queue: paid recharges not yet credited to the card (oldest first). Indexed
     *  on pay_status — replaces a full-table scan + in-memory filter. */
    List<Recharge> findByPayStatusAndFulfilledFalseOrderByCreatedAtAsc(PayStatus payStatus);

    /** Manual reconciliation: MoMo recharges still pending/failed with a gateway id, since a cutoff
     *  (batch-limited). NEWEST first so a large window with a backlog of old genuine failures still
     *  reconciles the most recent (recoverable) orders rather than the oldest, unrecoverable ones. */
    @Query("select r from Recharge r where r.createdAt >= :since "
            + "and r.payStatus in (com.afriland.promote.model.PayStatus.pending, com.afriland.promote.model.PayStatus.failed) "
            + "and r.gatewayRef is not null "
            + "and lower(r.pay) in ('om', 'mtn') "
            + "order by r.createdAt desc")
    List<Recharge> findMoMoReconcilableSince(@Param("since") Instant since, Pageable pageable);

    /**
     * Search recharges by ref, full_name, pan, phone or card_number. Native query for performance.
     */
    @Query(value = "select * from recharge r where "
            + "(lower(r.ref) like concat('%', :needle, '%') or lower(r.full_name) like concat('%', :needle, '%')) "
            + "or (:digits <> '' and (regexp_replace(coalesce(r.pan,''), '\\\\D', '', 'g') like concat('%', :digits, '%') "
            + "or regexp_replace(coalesce(r.phone,''), '\\\\D', '', 'g') like concat('%', :digits, '%'))) "
            + "order by r.created_at desc limit 30", nativeQuery = true)
    List<Recharge> searchByAny(@Param("needle") String needle, @Param("digits") String digits);
}
