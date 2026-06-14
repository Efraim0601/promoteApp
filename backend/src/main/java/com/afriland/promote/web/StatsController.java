package com.afriland.promote.web;

import com.afriland.promote.service.StatsService;
import com.afriland.promote.web.dto.Dtos.AdminStats;
import com.afriland.promote.web.dto.Dtos.AgentStats;
import com.afriland.promote.web.dto.Dtos.CashierStats;
import com.afriland.promote.web.dto.Dtos.DashboardStats;
import com.afriland.promote.web.dto.Dtos.PaymentStats;
import com.afriland.promote.web.dto.Dtos.PrintStats;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsService stats;

    public StatsController(StatsService stats) {
        this.stats = stats;
    }

    @GetMapping("/admin")
    public AdminStats admin() {
        return stats.adminStats();
    }

    @GetMapping("/agent")
    public AgentStats agent(Authentication auth) {
        return stats.agentStats((String) auth.getPrincipal());
    }

    @GetMapping("/print")
    public PrintStats print(Authentication auth) {
        return stats.printStats((String) auth.getPrincipal());
    }

    @GetMapping("/cashier")
    public CashierStats cashier(Authentication auth) {
        return stats.cashierStats((String) auth.getPrincipal());
    }

    /** Admin — Mobile Money payment funnel (acceptance, confirmation latency, failure causes, by network). */
    @GetMapping("/payments")
    public PaymentStats payments() {
        return stats.paymentStats();
    }

    /** Director / sales manager monitoring dashboard (last 30 days by default). */
    @GetMapping("/dashboard")
    public DashboardStats dashboard(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate toDate   = (to   != null && !to.isBlank())   ? LocalDate.parse(to)   : LocalDate.now();
        LocalDate fromDate = (from != null && !from.isBlank()) ? LocalDate.parse(from) : toDate.minusDays(29);
        return stats.dashboardStats(fromDate, toDate);
    }
}
