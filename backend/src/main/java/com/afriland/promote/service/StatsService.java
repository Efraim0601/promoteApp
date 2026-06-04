package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Role;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.stereotype.Service;

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
}
