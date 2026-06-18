package com.afriland.promote.service;

import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.CashierStats;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import com.afriland.promote.web.dto.Dtos.PrintStats;
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
}
