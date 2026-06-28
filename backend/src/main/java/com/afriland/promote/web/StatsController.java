package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.service.HierarchyStatsService;
import com.afriland.promote.service.StatsService;
import com.afriland.promote.web.dto.Dtos.AdminStats;
import com.afriland.promote.web.dto.Dtos.AgencyPickupStats;
import com.afriland.promote.web.dto.Dtos.AgentStats;
import com.afriland.promote.web.dto.Dtos.CashierStats;
import com.afriland.promote.web.dto.Dtos.CashSupervisionStats;
import com.afriland.promote.web.dto.Dtos.HierarchyStatsDto;
import com.afriland.promote.web.dto.Dtos.PaymentStats;
import com.afriland.promote.web.dto.Dtos.PrintReconciliation;
import com.afriland.promote.web.dto.Dtos.PrintStats;
import com.afriland.promote.web.dto.Dtos.PrintSupervisionStats;
import org.springframework.security.core.Authentication;

import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Statistiques", description = "Tableaux de bord par rôle")
@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsService stats;
    private final HierarchyStatsService hierStats;
    private final AppUserRepository users;

    public StatsController(StatsService stats, HierarchyStatsService hierStats, AppUserRepository users) {
        this.stats = stats;
        this.hierStats = hierStats;
        this.users = users;
    }

    /**
     * Sales statistics scoped to the caller's place in the org tree (admin/manager: global;
     * superviseur/chef d'équipe: own sub-tree). Optional {@code productCode} filter.
     */
    @GetMapping("/hierarchy")
    public HierarchyStatsDto hierarchy(@RequestParam(required = false) String productCode, Authentication auth) {
        String id = (String) auth.getPrincipal();
        AppUser caller = users.findById(id).orElse(null);
        Set<Role> roles = caller != null ? caller.effectiveRoles() : Set.of();
        return hierStats.scopedStats(id, roles, productCode);
    }

    @GetMapping("/admin")
    public AdminStats admin(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate fromDate = (from != null && !from.isBlank()) ? LocalDate.parse(from) : null;
        LocalDate toDate   = (to   != null && !to.isBlank())   ? LocalDate.parse(to)   : null;
        return stats.adminStats(fromDate, toDate);
    }

    @GetMapping("/agent")
    public AgentStats agent(Authentication auth) {
        return stats.agentStats((String) auth.getPrincipal());
    }

    @GetMapping("/print")
    public PrintStats print(Authentication auth) {
        return stats.printStats((String) auth.getPrincipal());
    }

    /** Print agent — reconciliation of the cards they remitted (printed) vs activated, for checking
     *  against the physical cards received. */
    @GetMapping("/print/cards")
    public PrintReconciliation printCards(Authentication auth) {
        return stats.printReconciliation((String) auth.getPrincipal());
    }

    @GetMapping("/cashier")
    public CashierStats cashier(Authentication auth) {
        return stats.cashierStats((String) auth.getPrincipal());
    }

    /** Supervisor — daily print reconciliation across ALL print agents (day = yyyy-MM-dd, default today). */
    @GetMapping("/print/supervision")
    public PrintSupervisionStats printSupervision(@RequestParam(required = false) String day) {
        LocalDate d = (day != null && !day.isBlank()) ? LocalDate.parse(day) : null;
        return stats.printSupervision(d);
    }

    /** Supervisor — daily cash reconciliation across ALL cashiers (day = yyyy-MM-dd, default today). */
    @GetMapping("/cashier/supervision")
    public CashSupervisionStats cashSupervision(@RequestParam(required = false) String day) {
        LocalDate d = (day != null && !day.isBlank()) ? LocalDate.parse(day) : null;
        return stats.cashSupervision(d);
    }

    /** Admin — Mobile Money payment funnel (acceptance, confirmation latency, failure causes, by network). */
    @GetMapping("/payments")
    public PaymentStats payments(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate fromDate = (from != null && !from.isBlank()) ? LocalDate.parse(from) : null;
        LocalDate toDate   = (to   != null && !to.isBlank())   ? LocalDate.parse(to)   : null;
        return stats.paymentStats(fromDate, toDate);
    }

    /** Admin — pickup-agency stats: delivery breakdown + branch ranking, with optional date window. */
    @GetMapping("/agencies")
    public AgencyPickupStats agencies(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate fromDate = (from != null && !from.isBlank()) ? LocalDate.parse(from) : null;
        LocalDate toDate   = (to   != null && !to.isBlank())   ? LocalDate.parse(to)   : null;
        return stats.agencyStats(fromDate, toDate);
    }

}
