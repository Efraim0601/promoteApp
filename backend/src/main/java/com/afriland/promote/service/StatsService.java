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
