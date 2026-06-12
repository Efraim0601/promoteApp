package com.afriland.promote.repo;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    List<Subscription> findAllByOrderByCreatedAtAsc();
    List<Subscription> findByAgentIdOrderByCreatedAtAsc(String agentId);
    Optional<Subscription> findByRefIgnoreCase(String ref);
    Optional<Subscription> findByGatewayRef(String gatewayRef);

    /** Reconciliation sweep: oldest still-pending orders created before a cutoff (batch-limited via
     *  Pageable — never loads the whole table). Indexed on (pay_status, created_at). */
    List<Subscription> findByPayStatusAndCreatedAtLessThanOrderByCreatedAtAsc(
            PayStatus payStatus, Instant createdAt, Pageable pageable);

    /** Agent portfolio (mine): sales the agent owns (agent_id) OR sales referring the agent's phone
     *  (referrer_phone9). Both columns are indexed — replaces a full-table scan + in-memory match. */
    List<Subscription> findByAgentIdOrReferrerPhone9OrderByCreatedAtAsc(String agentId, String referrerPhone9);

    /** Resume-window de-dup: narrow the candidate set in SQL (status + method + amount + recent) so the
     *  last-9-digit phone match runs in memory over a handful of rows, not the whole table. */
    List<Subscription> findByPayStatusAndPayAndAmountAndCreatedAtAfter(
            PayStatus payStatus, String pay, int amount, Instant createdAt);

    /** Backfill of {@link Subscription#getReferrerPhone9()} for legacy rows (batch-limited). */
    List<Subscription> findByReferrerPhone9IsNullAndReferrerPhoneIsNotNull(Pageable pageable);

    // ---- aggregated KPIs (computed in SQL instead of loading the whole table into memory) ----
    long countByPayStatus(PayStatus payStatus);
    long countByPayStatusAndPrintedFalse(PayStatus payStatus);    // admin "pending" == cash, not yet printed
    long countByPrintedTrue();
    long countByPrintedFalseAndPayStatus(PayStatus payStatus);    // print queue == paid, not yet printed
    long countByPrintedById(String printedById);
    long countByPrintedByIdAndPrintedAtGreaterThanEqual(String printedById, Instant since);
    long countByCashCollectedById(String cashCollectedById);
    long countByCashCollectedByIdAndCashCollectedAtGreaterThanEqual(String cashCollectedById, Instant since);
    long countByAgentId(String agentId);
    long countByAgentIdIsNull();

    @Query("select coalesce(sum(s.amount), 0) from Subscription s where s.payStatus = :st")
    long sumAmountByPayStatus(@Param("st") PayStatus st);

    @Query("select coalesce(sum(s.amount), 0) from Subscription s where s.cashCollectedById = :id")
    long sumAmountByCashCollectedById(@Param("id") String id);

    @Query("select coalesce(sum(s.amount), 0) from Subscription s "
            + "where s.agentId = :aid and s.payStatus = com.afriland.promote.model.PayStatus.paid")
    long collectedPaidByAgentId(@Param("aid") String agentId);

    @Query("select coalesce(sum(s.amount), 0) from Subscription s "
            + "where s.agentId is null and s.payStatus = com.afriland.promote.model.PayStatus.paid")
    long collectedPaidOnline();
}
