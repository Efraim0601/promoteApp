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

    public AdminStats adminStats() {
        // Aggregated in SQL — no longer loads the whole table into memory.
        long total = subs.count();
        long paid = subs.countByPayStatus(PayStatus.paid);
        // "pending" preserves the previous semantics: a cash subscription not yet printed (status == "cash").
        long pending = subs.countByPayStatusAndPrintedFalse(PayStatus.cash);
        long collected = subs.sumAmountByPayStatus(PayStatus.paid);

        List<AgentBreakdown> rows = new ArrayList<>();
        for (AppUser a : users.findByRole(Role.AGENT)) {
            rows.add(new AgentBreakdown(a.getId(), a.getName(), a.getAgency(), "agent",
                    subs.countByAgentId(a.getId()), subs.collectedPaidByAgentId(a.getId())));
        }
        rows.add(new AgentBreakdown("online", "online", null, "online",
                subs.countByAgentIdIsNull(), subs.collectedPaidOnline()));
        rows.sort(Comparator.comparingLong(AgentBreakdown::count).reversed());

        return new AdminStats(total, paid, pending, collected, rows);
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

    /** Executive monitoring dashboard: all KPIs for the given date window. */
    public DashboardStats dashboardStats(LocalDate from, LocalDate to) {
        ZoneId zone = ZoneId.systemDefault();
        Instant fromInst = from.atStartOfDay(zone).toInstant();
        Instant toInst   = to.plusDays(1).atStartOfDay(zone).toInstant(); // exclusive upper bound
        Instant todayStart = startOfToday();

        List<Subscription> window = subs
                .findByCreatedAtGreaterThanEqualAndCreatedAtLessThanEqualOrderByCreatedAtAsc(fromInst, toInst.minusSeconds(1));

        // — window totals —
        long totalCreated = window.size();
        long totalPaid    = window.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long totalPrinted = window.stream().filter(Subscription::isPrinted).count();
        long totalFailed  = window.stream().filter(s -> s.getPayStatus() == PayStatus.failed).count();
        long awaitingPrint    = window.stream()
                .filter(s -> s.getPayStatus() == PayStatus.paid && !s.isPrinted()).count();
        long awaitingPayment  = window.stream()
                .filter(s -> s.getPayStatus() == PayStatus.pending || s.getPayStatus() == PayStatus.cash).count();

        double convRate    = totalCreated == 0 ? 0 : (totalPaid * 100.0 / totalCreated);
        double printRate   = totalPaid    == 0 ? 0 : (totalPrinted * 100.0 / totalPaid);
        double failureRate = totalCreated == 0 ? 0 : (totalFailed * 100.0 / totalCreated);

        // — today (absolute, not filtered by the window) —
        long todayCreated = subs.countByCreatedAtGreaterThanEqual(todayStart);
        long todayPaid    = subs.countByPayStatusAndCreatedAtGreaterThanEqual(PayStatus.paid, todayStart);
        long todayPrinted = subs.countByPrintedTrueAndPrintedAtGreaterThanEqual(todayStart);
        long todayFailed  = subs.countByPayStatusAndCreatedAtGreaterThanEqual(PayStatus.failed, todayStart);

        // — per-agent KPIs (window) —
        // Index all window subscriptions by agentId for fast per-agent filtering
        java.util.HashMap<String, List<Subscription>> byAgent = new java.util.HashMap<>();
        for (Subscription s : window) {
            String aid = s.getAgentId() != null ? s.getAgentId() : "online";
            byAgent.computeIfAbsent(aid, k -> new ArrayList<>()).add(s);
        }
        List<AppUser> agents = users.findByRole(Role.AGENT);
        List<AgentKpi> perAgent = new ArrayList<>();
        for (AppUser a : agents) {
            List<Subscription> mine = byAgent.getOrDefault(a.getId(), List.of());
            long aPaid    = mine.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
            long aPrinted = mine.stream().filter(Subscription::isPrinted).count();
            long aFailed  = mine.stream().filter(s -> s.getPayStatus() == PayStatus.failed).count();
            long aTotal   = mine.size();
            double aFR = aTotal == 0 ? 0 : (aFailed * 100.0 / aTotal);
            double aCR = aTotal == 0 ? 0 : (aPaid * 100.0 / aTotal);
            double aPR = aPaid  == 0 ? 0 : (aPrinted * 100.0 / aPaid);
            long aTodayTotal = subs.countByAgentIdAndCreatedAtGreaterThanEqual(a.getId(), todayStart);
            long aTodayPaid  = subs.countByAgentIdAndPayStatusAndPaidAtGreaterThanEqual(
                    a.getId(), PayStatus.paid, todayStart);
            perAgent.add(new AgentKpi(a.getId(), a.getName(), a.getAgency(),
                    aTotal, aPaid, aPrinted, aFailed, aTodayTotal, aTodayPaid, aFR, aCR, aPR));
        }
        perAgent.sort(Comparator.comparingLong(AgentKpi::paid).reversed());

        // — daily trend —
        List<DailyBucket> trend = buildDailyTrend(window, from, to, zone);

        return new DashboardStats(
                todayCreated, todayPaid, todayPrinted, todayFailed,
                totalCreated, totalPaid, totalPrinted, totalFailed,
                awaitingPrint, awaitingPayment,
                convRate, printRate, failureRate,
                perAgent, trend);
    }

    private List<DailyBucket> buildDailyTrend(
            List<Subscription> window, LocalDate from, LocalDate to, ZoneId zone) {
        long days = java.time.temporal.ChronoUnit.DAYS.between(from, to) + 1;
        int window_size = (int) Math.min(days, 90);
        LocalDate start = to.minusDays(window_size - 1L);

        Map<LocalDate, long[]> buckets = new TreeMap<>();
        for (int i = 0; i < window_size; i++) buckets.put(start.plusDays(i), new long[4]); // created,paid,printed,failed

        for (Subscription s : window) {
            if (s.getCreatedAt() == null) continue;
            LocalDate day = s.getCreatedAt().atZone(zone).toLocalDate();
            long[] b = buckets.get(day);
            if (b == null) continue;
            b[0]++;
            if (s.getPayStatus() == PayStatus.paid)    b[1]++;
            if (s.isPrinted())                         b[2]++;
            if (s.getPayStatus() == PayStatus.failed)  b[3]++;
        }
        List<DailyBucket> out = new ArrayList<>(window_size);
        for (var e : buckets.entrySet()) {
            long[] b = e.getValue();
            out.add(new DailyBucket(e.getKey().toString(), b[0], b[1], b[2], b[3]));
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
}
