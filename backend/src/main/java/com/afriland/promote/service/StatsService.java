package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Role;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** KPI aggregation for the admin and agent dashboards (ports admin.jsx / agent.jsx). */
@Service
public class StatsService {

    private final SubscriptionService subscriptions;
    private final SubscriptionRepository subs;
    private final AppUserRepository users;

    public StatsService(SubscriptionService subscriptions, SubscriptionRepository subs, AppUserRepository users) {
        this.subscriptions = subscriptions;
        this.subs = subs;
        this.users = users;
    }

    private boolean isPending(Subscription s) {
        String st = s.getStatus();
        return "awaiting".equals(st) || "cash".equals(st);
    }

    private long collected(List<Subscription> list) {
        return list.stream().filter(s -> s.getPayStatus() == PayStatus.paid)
                .mapToLong(Subscription::getAmount).sum();
    }

    public AdminStats adminStats(LocalDate from, LocalDate to) {
        ZoneId zone = ZoneId.systemDefault();
        Instant todayStart = startOfToday();

        // Window-filtered counts — support one-sided ranges (only from OR only to).
        long total, paid, pending, collected, totalPrinted;
        boolean hasFilter = (from != null || to != null);
        if (hasFilter) {
            // Open lower bound → Instant.EPOCH; open upper bound → far future (today + 10 years).
            Instant fromInst = from != null ? from.atStartOfDay(zone).toInstant() : Instant.EPOCH;
            Instant toInst   = to   != null ? to.plusDays(1).atStartOfDay(zone).toInstant()
                                            : todayStart.plusSeconds(86400L * 3650);
            total        = subs.countByCreatedAtBetween(fromInst, toInst);
            paid         = subs.countByPayStatusAndCreatedAtBetween(PayStatus.paid, fromInst, toInst);
            pending      = subs.countByPayStatusAndPrintedFalseAndCreatedAtBetween(PayStatus.cash, fromInst, toInst);
            collected    = subs.sumAmountByPayStatusAndCreatedAtBetween(PayStatus.paid, fromInst, toInst);
            totalPrinted = subs.countByPrintedTrueAndPrintedAtBetween(fromInst, toInst);
        } else {
            total        = subs.count();
            paid         = subs.countByPayStatus(PayStatus.paid);
            pending      = subs.countByPayStatusAndPrintedFalse(PayStatus.cash);
            collected    = subs.sumAmountByPayStatus(PayStatus.paid);
            totalPrinted = subs.countByPrintedTrue();
        }

        // Today's KPIs — use paidAt (not createdAt) so a pending from yesterday confirmed today is counted.
        long todayPaid      = subs.countByPayStatusAndPaidAtGreaterThanEqual(PayStatus.paid, todayStart);
        long todayPrinted   = subs.countByPrintedTrueAndPrintedAtGreaterThanEqual(todayStart);
        long todayCollected = subs.sumAmountByPayStatusAndPaidAtGreaterThanEqual(PayStatus.paid, todayStart);
        // Cash + SARA created today and still awaiting manual validation.
        long todayPending   = subs.countByPayStatusAndCreatedAtGreaterThanEqual(PayStatus.cash, todayStart)
                            + subs.countByPayStatusAndCreatedAtGreaterThanEqual(PayStatus.sara_pending, todayStart);

        List<AgentBreakdown> rows = new ArrayList<>();
        // Enumerate everyone who holds the AGENT role (primary OR secondary) — not just those whose
        // primary role is AGENT — so multi-role sellers aren't missing from the ranking. Count each
        // agent's sales with the same attribution as their own dashboard (owned ∪ referred), so the
        // published classement matches the "Mes souscriptions" figure agents see on their phone.
        for (AppUser a : users.findByEffectiveRole(Role.AGENT)) {
            String phone9 = SubscriptionService.local9(a.getPhone());
            rows.add(new AgentBreakdown(a.getId(), a.getName(), a.getAgency(), "agent",
                    subs.countOwnedOrReferred(a.getId(), phone9),
                    subs.collectedPaidOwnedOrReferred(a.getId(), phone9)));
        }
        rows.add(new AgentBreakdown("online", "online", null, "online",
                subs.countByAgentIdIsNull(), subs.collectedPaidOnline()));
        rows.sort(Comparator.comparingLong(AgentBreakdown::count).reversed());

        return new AdminStats(total, paid, pending, collected, totalPrinted, todayPaid, todayPrinted, todayCollected, todayPending, rows);
    }

    public AgentStats agentStats(String agentId) {
        List<Subscription> mine = subscriptions.mine(agentId);
        long paid = mine.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long pending = mine.stream().filter(this::isPending).count();
        return new AgentStats(mine.size(), paid, pending, collected(mine));
    }

    /** Start of the current day in the server's zone — the cut-off for "today" counters. */
    private Instant startOfToday() {
        return LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant();
    }

    /** Print-point statistics for a given staff member (aggregated in SQL). */
    public PrintStats printStats(String printerId) {
        Instant today = startOfToday();
        long myPrinted = subs.countByPrintedById(printerId);
        long myToday = subs.countByPrintedByIdAndPrintedAtGreaterThanEqual(printerId, today);
        // Queue = settled payments still waiting for a card (paid, not yet printed).
        long queue = subs.countByPrintedFalseAndPayStatus(PayStatus.paid);
        long totalPrinted = subs.countByPrintedTrue();
        return new PrintStats(myPrinted, myToday, queue, totalPrinted);
    }

    /** Mobile Money payment funnel for the admin dashboard: volumes & success per network, failure
     *  causes (from the stored decline reason), and the confirmation latency (createdAt → paidAt). */
    public PaymentStats paymentStats() {
        List<Subscription> momo = subscriptions.all().stream()
                .filter(s -> "om".equals(s.getPay()) || "mtn".equals(s.getPay()))
                .toList();
        long paid = momo.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long failed = momo.stream().filter(s -> s.getPayStatus() == PayStatus.failed).count();
        long pending = momo.stream().filter(s -> s.getPayStatus() == PayStatus.pending).count();

        List<Subscription> orange = momo.stream().filter(s -> "om".equals(s.getPay())).toList();
        List<Subscription> mtn = momo.stream().filter(s -> "mtn".equals(s.getPay())).toList();
        long orangePaid = orange.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long mtnPaid = mtn.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long orangeFailed = orange.stream().filter(s -> s.getPayStatus() == PayStatus.failed).count();
        long mtnFailed = mtn.stream().filter(s -> s.getPayStatus() == PayStatus.failed).count();

        // Failure causes — full categorisation (message + latency) for the failure-analysis view.
        java.util.EnumMap<PaymentFailures.Category, Long> byCat = new java.util.EnumMap<>(PaymentFailures.Category.class);
        for (PaymentFailures.Category c : PaymentFailures.Category.values()) byCat.put(c, 0L);
        for (Subscription s : momo) {
            if (s.getPayStatus() != PayStatus.failed) continue;
            byCat.merge(PaymentFailures.classify(s), 1L, Long::sum);
        }
        // Keep the three legacy buckets the overview already shows (derived from the categories).
        long insufficient = byCat.get(PaymentFailures.Category.INSUFFICIENT_FUNDS);
        long expired = byCat.get(PaymentFailures.Category.TIMEOUT);
        long other = failed - insufficient - expired;
        // Detailed breakdown: merge NETWORK + UNKNOWN for dashboard display (technical failures).
        long networkOrUnknown = byCat.get(PaymentFailures.Category.NETWORK)
                + byCat.get(PaymentFailures.Category.UNKNOWN);
        List<FailureBucket> failuresByCategory = new ArrayList<>();
        if (networkOrUnknown > 0) {
            failuresByCategory.add(new FailureBucket("NETWORK_OR_UNKNOWN", networkOrUnknown));
        }
        byCat.entrySet().stream()
                .filter(e -> e.getValue() > 0
                        && e.getKey() != PaymentFailures.Category.NETWORK
                        && e.getKey() != PaymentFailures.Category.UNKNOWN)
                .sorted(java.util.Map.Entry.<PaymentFailures.Category, Long>comparingByValue().reversed())
                .forEach(e -> failuresByCategory.add(new FailureBucket(e.getKey().name(), e.getValue())));

        // Confirmation latency (PENDING → paid), in seconds, for MoMo payments we have a paidAt for.
        List<Long> secs = momo.stream()
                .filter(s -> s.getPayStatus() == PayStatus.paid && s.getPaidAt() != null && s.getCreatedAt() != null)
                .map(s -> java.time.Duration.between(s.getCreatedAt(), s.getPaidAt()).getSeconds())
                .filter(v -> v >= 0)
                .sorted()
                .toList();
        long avg = secs.isEmpty() ? 0 : Math.round(secs.stream().mapToLong(Long::longValue).average().orElse(0));
        long median = secs.isEmpty() ? 0 : secs.get(secs.size() / 2);

        List<PaymentTrendBucket> trends = paymentTrends(momo, 14);

        return new PaymentStats(momo.size(), paid, failed, pending, orange.size(), orangePaid,
                mtn.size(), mtnPaid, insufficient, expired, other, avg, median,
                orangeFailed, mtnFailed, networkOrUnknown, failuresByCategory, trends);
    }

    /** Daily MoMo volumes for the last {@code days} (inclusive), oldest first. */
    private List<PaymentTrendBucket> paymentTrends(List<Subscription> momo, int days) {
        int window = Math.max(1, Math.min(days, 90));
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        LocalDate start = today.minusDays(window - 1L);
        Instant since = start.atStartOfDay(zone).toInstant();

        Map<LocalDate, long[]> buckets = new TreeMap<>();
        for (int i = 0; i < window; i++) {
            buckets.put(start.plusDays(i), new long[4]); // paid, failed, pending, total
        }
        for (Subscription s : momo) {
            if (s.getCreatedAt() == null || s.getCreatedAt().isBefore(since)) continue;
            LocalDate day = s.getCreatedAt().atZone(zone).toLocalDate();
            long[] b = buckets.get(day);
            if (b == null) continue;
            b[3]++;
            if (s.getPayStatus() == PayStatus.paid) b[0]++;
            else if (s.getPayStatus() == PayStatus.failed) b[1]++;
            else if (s.getPayStatus() == PayStatus.pending) b[2]++;
        }
        List<PaymentTrendBucket> out = new ArrayList<>(window);
        for (var e : buckets.entrySet()) {
            long[] b = e.getValue();
            out.add(new PaymentTrendBucket(e.getKey().toString(), b[0], b[1], b[2], b[3]));
        }
        return out;
    }

    /** Cashier statistics for a given staff member (aggregated in SQL). */
    public CashierStats cashierStats(String cashierId) {
        Instant today = startOfToday();
        long myCount = subs.countByCashCollectedById(cashierId);
        long myCollected = subs.sumAmountByCashCollectedById(cashierId);
        long myToday = subs.countByCashCollectedByIdAndCashCollectedAtGreaterThanEqual(cashierId, today);
        // Queue = cash subscriptions still awaiting collection.
        long pendingCount = subs.countByPayStatus(PayStatus.cash);
        long pendingAmount = subs.sumAmountByPayStatus(PayStatus.cash);
        return new CashierStats(myCount, myCollected, myToday, pendingCount, pendingAmount);
    }

    /** Pickup-agency stats: delivery-mode breakdown + ranking of branches, with optional date window. */
    public AgencyPickupStats agencyStats(LocalDate from, LocalDate to) {
        ZoneId zone = ZoneId.systemDefault();
        Instant fromInst = from != null ? from.atStartOfDay(zone).toInstant() : null;
        Instant toInst   = to   != null ? to.plusDays(1).atStartOfDay(zone).toInstant() : null;
        long totalAgence  = subs.countByDeliveryInWindow("agence",   fromInst, toInst);
        long totalPromote = subs.countByDeliveryInWindow("promote",  fromInst, toInst);
        long totalHome    = subs.countByDeliveryInWindow("home",     fromInst, toInst);
        List<AgencyPickupBucket> byAgency = subs.countGroupedByPickupAgency(fromInst, toInst).stream()
                .map(r -> new AgencyPickupBucket((String) r[0], (String) r[1], (Long) r[2]))
                .toList();
        return new AgencyPickupStats(totalAgence, totalPromote, totalHome, byAgency);
    }
}
