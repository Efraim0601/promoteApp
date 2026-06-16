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

    /** Reconciliation sweep: still-pending orders in [windowStart, pullCutoff) (batch-limited). */
    List<Subscription> findByPayStatusAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
            PayStatus payStatus, Instant windowStart, Instant pullCutoff, Pageable pageable);

    /** Agent portfolio (mine): sales the agent owns (agent_id) OR sales referring the agent's phone
     *  (referrer_phone9). Both columns are indexed — replaces a full-table scan + in-memory match. */
    List<Subscription> findByAgentIdOrReferrerPhone9OrderByCreatedAtAsc(String agentId, String referrerPhone9);

    /** Resume-window de-dup: narrow the candidate set in SQL (status + method + amount + recent) so the
     *  last-9-digit phone match runs in memory over a handful of rows, not the whole table. */
    List<Subscription> findByPayStatusAndPayAndAmountAndCreatedAtAfter(
            PayStatus payStatus, String pay, int amount, Instant createdAt);

    /** Recent MoMo attempts (any status) for duplicate-debit guard and resume. */
    @Query("select s from Subscription s where lower(s.pay) = lower(:pay) and s.amount = :amount "
            + "and s.createdAt >= :since and lower(s.pay) in ('om', 'mtn') order by s.createdAt desc")
    List<Subscription> findRecentMomoAttempts(
            @Param("pay") String pay, @Param("amount") int amount, @Param("since") Instant since);

    /** Manual reconciliation: MoMo orders still pending/failed with a gateway id, since a cutoff (batch-limited). */
    @Query("select s from Subscription s where s.createdAt >= :since "
            + "and s.payStatus in (com.afriland.promote.model.PayStatus.pending, com.afriland.promote.model.PayStatus.failed) "
            + "and s.gatewayRef is not null "
            + "and lower(s.pay) in ('om', 'mtn') "
            + "order by s.createdAt asc")
    List<Subscription> findMoMoReconcilableSince(@Param("since") Instant since, Pageable pageable);

    /** True when this CNI already has a non-failed subscription (one card per CNI). */
    boolean existsByCniNormAndPayStatusNot(String cniNorm, PayStatus payStatus);

    /** Count non-failed subscriptions for this CNI (limit to 2 cards max per person). */
    long countByCniNormAndPayStatusNot(String cniNorm, PayStatus payStatus);

    /** Backfill {@link Subscription#getCniNorm()} for legacy CNI rows (batch-limited). */
    @Query("select s from Subscription s where s.cniNorm is null and s.cni is not null and s.cni <> '' "
            + "and (s.docType is null or lower(s.docType) = 'cni')")
    List<Subscription> findCniNormBackfillBatch(Pageable pageable);

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

    /**
     * Search subscription by ref, full_name, phone digits, cni, email, pan or card_number.
     * Uses a native query for efficient SQL matching and limits results to 30 most recent.
     */
    @Query(value = "select * from subscription s where "
            + "(lower(s.ref) like concat('%', :needle, '%') or lower(s.full_name) like concat('%', :needle, '%') "
            + "or lower(s.cni) like concat('%', :needle, '%') or lower(s.email) like concat('%', :needle, '%')) "
            + "or (:digits <> '' and (regexp_replace(coalesce(s.phone,''), '\\\\D', '', 'g') like concat('%', :digits, '%') "
            + "or regexp_replace(coalesce(s.pan,''), '\\\\D', '', 'g') like concat('%', :digits, '%') "
            + "or coalesce(s.card_number,'') like concat('%', :digits, '%'))) "
            + "order by s.created_at desc limit 30", nativeQuery = true)
    List<Subscription> searchByAny(@Param("needle") String needle, @Param("digits") String digits);

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

    /** Monitoring dashboard — all subscriptions in a time window (oldest first). */
    List<Subscription> findByCreatedAtGreaterThanEqualAndCreatedAtLessThanEqualOrderByCreatedAtAsc(
            Instant from, Instant to);

    /** Monitoring dashboard — cards actually printed in a given window (bucketed by printedAt). */
    List<Subscription> findByPrintedTrueAndPrintedAtBetween(Instant from, Instant to);

    /** Overview — total subscriptions created in a date window. */
    long countByCreatedAtBetween(Instant from, Instant to);

    /** Overview — paid subscriptions in a date window. */
    long countByPayStatusAndCreatedAtBetween(PayStatus payStatus, Instant from, Instant to);

    /** Overview — cash pending subscriptions in a date window (not yet printed). */
    long countByPayStatusAndPrintedFalseAndCreatedAtBetween(PayStatus payStatus, Instant from, Instant to);

    /** Overview — amount collected in a date window. */
    @Query("select coalesce(sum(s.amount), 0) from Subscription s "
            + "where s.payStatus = :st and s.createdAt >= :from and s.createdAt < :to")
    long sumAmountByPayStatusAndCreatedAtBetween(
            @Param("st") PayStatus st, @Param("from") Instant from, @Param("to") Instant to);

    /** Overview today — amount collected since a given instant. */
    @Query("select coalesce(sum(s.amount), 0) from Subscription s "
            + "where s.payStatus = :st and s.createdAt >= :since")
    long sumAmountByPayStatusAndCreatedAtGreaterThanEqual(
            @Param("st") PayStatus st, @Param("since") Instant since);

    /** Monitoring dashboard — count all subscriptions created since a given instant. */
    long countByCreatedAtGreaterThanEqual(Instant since);

    /** Monitoring dashboard — count subscriptions with a given status created since a given instant. */
    long countByPayStatusAndCreatedAtGreaterThanEqual(PayStatus payStatus, Instant since);

    /** Monitoring dashboard — count printed cards with printedAt since a given instant. */
    long countByPrintedTrueAndPrintedAtGreaterThanEqual(Instant since);

    /** Monitoring dashboard — count created today per agent. */
    long countByAgentIdAndCreatedAtGreaterThanEqual(String agentId, Instant since);

    /** Monitoring dashboard — count paid today per agent. */
    long countByAgentIdAndPayStatusAndPaidAtGreaterThanEqual(String agentId, PayStatus payStatus, Instant since);

    /** Agency stats — subscriptions grouped by chosen pickup branch, with optional date window. */
    @Query("SELECT s.pickupAgencyId, s.pickupAgencyName, COUNT(s) FROM Subscription s "
            + "WHERE s.delivery = 'agence' AND s.pickupAgencyId IS NOT NULL "
            + "AND (:from IS NULL OR s.createdAt >= :from) "
            + "AND (:to IS NULL OR s.createdAt < :to) "
            + "GROUP BY s.pickupAgencyId, s.pickupAgencyName ORDER BY COUNT(s) DESC")
    List<Object[]> countGroupedByPickupAgency(
            @Param("from") java.time.Instant from, @Param("to") java.time.Instant to);

    /** Agency stats — delivery-mode count with optional date window. */
    @Query("SELECT COUNT(s) FROM Subscription s WHERE s.delivery = :delivery "
            + "AND (:from IS NULL OR s.createdAt >= :from) "
            + "AND (:to IS NULL OR s.createdAt < :to)")
    long countByDeliveryInWindow(
            @Param("delivery") String delivery,
            @Param("from") java.time.Instant from,
            @Param("to") java.time.Instant to);
}
