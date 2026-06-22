package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.AgencyPickupStats;
import com.afriland.promote.web.dto.Dtos.CashierStats;
import com.afriland.promote.web.dto.Dtos.CashSupervisionStats;
import com.afriland.promote.web.dto.Dtos.CashierDayRow;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import com.afriland.promote.web.dto.Dtos.PrintStats;
import com.afriland.promote.web.dto.Dtos.PrinterDayRow;
import com.afriland.promote.web.dto.Dtos.PrintSupervisionStats;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies the SQL-aggregated KPI queries (admin breakdown, print, cashier) match the data.
 * Scoped to unique agent / printer / cashier ids and distinctive payment numbers, so it is
 * immune to data left by other tests sharing the in-memory database, and to the idempotent
 * "resume pending payment" path (which would otherwise merge a duplicate create).
 */
@SpringBootTest
class StatsServiceTest {

    @Autowired SubscriptionService service;
    @Autowired StatsService stats;
    @Autowired SubscriptionRepository repo;
    @Autowired AppUserRepository users;

    private CreateSubscriptionRequest req(String pay, String phone, String cni) {
        return new CreateSubscriptionRequest(
                "Stat", "Test", "M", "cni", cni, null, "01/01/2031", phone,
                "stat@test.cm", "Bonamoussadi", "Littoral", "Douala",
                pay, phone, "promote", false, null, null, null, null, null, null);
    }

    @Test
    void aggregationMethodsMatchAttributedData() {
        String agent = "stat-agent", printer = "stat-printer", cashier = "stat-cashier";

        // a) cash — pending collection; b) MoMo paid + printed; c) MoMo paid, not printed (print queue).
        Subscription cash = service.create(req("cash", "655010101", "AAAA1111"), "agent", agent);
        Subscription printed = service.create(req("om", "655020202", "BBBB2222"), "agent", agent);
        service.applyPayment(printed.getRef(), "validate", null);
        service.markPrinted(printed.getRef(), "CARD-1", null, printer);
        Subscription queued = service.create(req("om", "655030303", "CCCC3333"), "agent", agent);
        service.applyPayment(queued.getRef(), "validate", null);

        // Per-agent aggregation (feeds the admin breakdown). 3 distinct subs → also proves no
        // idempotent resume merged any of the creates.
        assertEquals(3, repo.countByAgentId(agent), "3 subscriptions attributed to the test agent");
        assertEquals(printed.getAmount() + queued.getAmount(), repo.collectedPaidByAgentId(agent),
                "collected = sum of the two paid subscriptions");

        // Print KPIs — unique printer id isolates these from any other data.
        PrintStats p = stats.printStats(printer);
        assertEquals(1, p.myPrinted());
        assertEquals(1, p.myPrintedToday());
        assertTrue(p.queue() >= 1, "the paid-not-printed subscription is in the queue");
        assertTrue(p.totalPrinted() >= 1);

        // Cashier validates the cash payment → cashier KPIs reflect it.
        service.validateCash(cash.getRef(), "validate", null, cashier, null);
        CashierStats c = stats.cashierStats(cashier);
        assertEquals(1, c.myCount());
        assertEquals(cash.getAmount(), c.myCollected());
        assertEquals(1, c.myCountToday());
    }

    /** The performance ranking (which drives the primes) must count ONLY settled sales: a cash sale
     *  registered but never collected must not inflate the count. Regression for the reported cheat
     *  ("enregistrer une vente en espèces augmente les performances"). */
    @Test
    void rankingCountsOnlySettledSales() {
        String agent = "rank-agent";
        // a) cash — registered but NOT collected (stays `cash`); b) MoMo validated paid.
        Subscription cash = service.create(req("cash", "655110011", "RANK1111"), "agent", agent);
        Subscription paid = service.create(req("om", "655220022", "RANK2222"), "agent", agent);
        service.applyPayment(paid.getRef(), "validate", null);

        // Owned attribution only (test agent has no phone on file → phone9 = "").
        assertEquals(2, repo.countByAgentId(agent), "2 sales attributed (all statuses)");
        assertEquals(1, repo.countPaidOwnedOrReferred(agent, ""),
                "ranking counts only the settled (paid) sale — uncollected cash is excluded");

        // Once the cashier collects the cash it becomes paid and now legitimately counts.
        service.validateCash(cash.getRef(), "validate", null, "rank-cashier", null);
        assertEquals(2, repo.countPaidOwnedOrReferred(agent, ""),
                "collected cash becomes paid and now counts toward the ranking");
    }

    /** Agency stats must work for the "all time" view (no date window). The query passed {@code null}
     *  bounds, which PostgreSQL rejected with "could not determine data type of parameter" — the service
     *  now substitutes wide sentinel bounds. Also checks a far-past window excludes today's sales. */
    @Test
    void agencyStatsAllTimeAndBoundedWindow() {
        // A fresh PAID "promote"-delivery sale; created now (@CreationTimestamp), so it falls in any
        // window that includes today and outside any window that ends before today. Only paid sales are
        // counted, so it must be validated first.
        Subscription paid = service.create(req("om", "655990099", "AGEN9999"), "agent", "agency-stat-agent");
        service.applyPayment(paid.getRef(), "validate", null);

        // An unpaid (pending) promote sale must NOT inflate the breakdown — settled sales only.
        service.create(req("om", "655990088", "AGEN9998"), "agent", "agency-stat-agent");

        // All-time view (the path that crashed on PostgreSQL): must return without error and count the
        // paid sale only.
        AgencyPickupStats allTime = stats.agencyStats(null, null);
        assertTrue(allTime.totalPromote() >= 1, "the paid promote sale is counted in the all-time view");

        // A window entirely in the past must exclude a sale created today.
        AgencyPickupStats past = stats.agencyStats(LocalDate.of(2020, 1, 1), LocalDate.of(2020, 1, 2));
        assertEquals(0, past.totalPromote(), "a 2020 window excludes a sale created today");
    }

    /** Supervisor daily reconciliation: print remittance and cash collection are attributed to the right
     *  staff member AND bounded to the day the action happened (not the day before). */
    @Test
    void supervisionScopesByStaffAndDay() {
        AppUser printer = users.findById("sup-printer").orElseGet(() -> AppUser.builder().id("sup-printer").build());
        printer.setName("Imprimeur Test"); printer.setEmail("sup-printer@test.cm");
        printer.setRole(Role.PRINT_AGENT); printer.setAgency("Agence Sup"); printer.setEnabled(true);
        printer.setPasswordHash("x");
        users.save(printer);
        AppUser cashier = users.findById("sup-cashier").orElseGet(() -> AppUser.builder().id("sup-cashier").build());
        cashier.setName("Caissier Test"); cashier.setEmail("sup-cashier@test.cm");
        cashier.setRole(Role.CASHIER); cashier.setAgency("Agence Sup"); cashier.setEnabled(true);
        cashier.setPasswordHash("x");
        users.save(cashier);

        // A card printed today by our printer; a cash payment collected today by our cashier.
        Subscription toPrint = service.create(req("om", "655330303", "SUP11111"), "agent", "sup-agent");
        service.applyPayment(toPrint.getRef(), "validate", null);
        service.markPrinted(toPrint.getRef(), "CARD-SUP", null, "sup-printer");
        Subscription cash = service.create(req("cash", "655440404", "SUP22222"), "agent", "sup-agent");
        service.validateCash(cash.getRef(), "validate", null, "sup-cashier", null);

        LocalDate today = LocalDate.now();
        PrinterDayRow pr = stats.printSupervision(today).byPrinter().stream()
                .filter(r -> r.id().equals("sup-printer")).findFirst().orElseThrow();
        assertEquals(1, pr.printed(), "the printer's card counts on the day it was printed");
        assertEquals(1, pr.pendingActivation(), "no PAN captured yet → pending activation");

        CashierDayRow cr = stats.cashSupervision(today).byCashier().stream()
                .filter(r -> r.id().equals("sup-cashier")).findFirst().orElseThrow();
        assertEquals(1, cr.count(), "the cashier's collection counts on the day it was collected");
        assertEquals(cash.getAmount(), cr.collected());

        // The day before must show none of today's activity (every staff member is still listed).
        PrinterDayRow prY = stats.printSupervision(today.minusDays(1)).byPrinter().stream()
                .filter(r -> r.id().equals("sup-printer")).findFirst().orElseThrow();
        assertEquals(0, prY.printed(), "yesterday shows none of today's prints");
        CashierDayRow crY = stats.cashSupervision(today.minusDays(1)).byCashier().stream()
                .filter(r -> r.id().equals("sup-cashier")).findFirst().orElseThrow();
        assertEquals(0, crY.count(), "yesterday shows none of today's collections");
    }
}
