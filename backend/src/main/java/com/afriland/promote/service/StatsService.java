package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Role;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.AppUserRepository;
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
    private final AppUserRepository users;

    public StatsService(SubscriptionService subscriptions, AppUserRepository users) {
        this.subscriptions = subscriptions;
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
        List<Subscription> all = subscriptions.all();
        long paid = all.stream().filter(s -> s.getPayStatus() == PayStatus.paid).count();
        long pending = all.stream().filter(this::isPending).count();

        List<AgentBreakdown> rows = new ArrayList<>();
        for (AppUser a : users.findByRole(Role.AGENT)) {
            List<Subscription> txs = all.stream().filter(s -> a.getId().equals(s.getAgentId())).toList();
            rows.add(new AgentBreakdown(a.getId(), a.getName(), a.getAgency(), "agent", txs.size(), collected(txs)));
        }
        List<Subscription> online = all.stream().filter(s -> s.getAgentId() == null).toList();
        rows.add(new AgentBreakdown("online", "online", null, "online", online.size(), collected(online)));
        rows.sort(Comparator.comparingLong(AgentBreakdown::count).reversed());

        return new AdminStats(all.size(), paid, pending, collected(all), rows);
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

    /** Print-point statistics for a given staff member. */
    public PrintStats printStats(String printerId) {
        List<Subscription> all = subscriptions.all();
        Instant today = startOfToday();
        long myPrinted = all.stream().filter(s -> printerId.equals(s.getPrintedById())).count();
        long myToday = all.stream()
                .filter(s -> printerId.equals(s.getPrintedById()) && s.getPrintedAt() != null && !s.getPrintedAt().isBefore(today))
                .count();
        // Queue = settled payments still waiting for a card (paid, not yet printed).
        long queue = all.stream().filter(s -> !s.isPrinted() && s.getPayStatus() == PayStatus.paid).count();
        long totalPrinted = all.stream().filter(Subscription::isPrinted).count();
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

    /** Cashier statistics for a given staff member. */
    public CashierStats cashierStats(String cashierId) {
        List<Subscription> all = subscriptions.all();
        Instant today = startOfToday();
        List<Subscription> mine = all.stream().filter(s -> cashierId.equals(s.getCashCollectedById())).toList();
        long myCount = mine.size();
        long myCollected = mine.stream().mapToLong(Subscription::getAmount).sum();
        long myToday = mine.stream()
                .filter(s -> s.getCashCollectedAt() != null && !s.getCashCollectedAt().isBefore(today))
                .count();
        // Queue = cash subscriptions still awaiting collection.
        List<Subscription> pending = all.stream().filter(s -> s.getPayStatus() == PayStatus.cash).toList();
        long pendingAmount = pending.stream().mapToLong(Subscription::getAmount).sum();
        return new CashierStats(myCount, myCollected, myToday, pending.size(), pendingAmount);
    }
}
