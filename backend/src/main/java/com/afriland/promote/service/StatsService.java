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

        // Failure causes, classified from the aggregator's stored decline reason.
        long insufficient = 0, expired = 0, other = 0;
        for (Subscription s : momo) {
            if (s.getPayStatus() != PayStatus.failed) continue;
            String m = s.getPaymentMessage() == null ? "" : s.getPaymentMessage().toLowerCase();
            if (m.matches(".*(insuffisan|insufficient|solde|provision|fonds|funds).*")) insufficient++;
            else if (m.matches(".*(expir|timeout|time out|délai|delai).*")) expired++;
            else other++;
        }

        // Confirmation latency (PENDING → paid), in seconds, for MoMo payments we have a paidAt for.
        List<Long> secs = momo.stream()
                .filter(s -> s.getPayStatus() == PayStatus.paid && s.getPaidAt() != null && s.getCreatedAt() != null)
                .map(s -> java.time.Duration.between(s.getCreatedAt(), s.getPaidAt()).getSeconds())
                .filter(v -> v >= 0)
                .sorted()
                .toList();
        long avg = secs.isEmpty() ? 0 : Math.round(secs.stream().mapToLong(Long::longValue).average().orElse(0));
        long median = secs.isEmpty() ? 0 : secs.get(secs.size() / 2);

        return new PaymentStats(momo.size(), paid, failed, pending, orange.size(), orangePaid,
                mtn.size(), mtnPaid, insufficient, expired, other, avg, median);
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
