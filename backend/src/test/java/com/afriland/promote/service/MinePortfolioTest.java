package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Subscription;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Guards the indexed agent-portfolio query ({@code mine}) after replacing the full-table scan + in-memory
 * phone match with {@code findByAgentIdOrReferrerPhone9} + the denormalised {@code referrerPhone9} column.
 * Seeded agent a1 = "Awa Fall", phone 699123456.
 */
@SpringBootTest
class MinePortfolioTest {

    @Autowired SubscriptionService service;
    @Autowired SubscriptionRepository subs;

    private CreateSubscriptionRequest req(String referrerPhone) {
        return new CreateSubscriptionRequest(
                "Jean", "Kamga", "M", "cni", "1234ABCD", null, "12/04/2030", "677001122",
                "jean@example.com", "Bonamoussadi", "Littoral", "Douala",
                "cash", null, "promote", false, null, null, null, null, null, referrerPhone);
    }

    @Test
    void mineUnionsOwnedAndReferredButExcludesUnrelated() {
        // Owned by a1 (a1 is the selling agent, no referrer).
        Subscription owned = service.create(req(null), "agent", "a1");
        // Referred to a1 but SOLD by another agent — a1 is only the parrain (agentId != a1). This is the
        // case the in-memory union used to cover and the new referrer_phone9 index must still catch.
        Subscription referred = service.create(req("+237 699 123 456"), "agent", "a2");
        // Unrelated to a1 entirely.
        Subscription other = service.create(req(null), "agent", "a2");

        List<String> mine = service.mine("a1").stream().map(Subscription::getRef).toList();
        assertTrue(mine.contains(owned.getRef()), "owned sale appears");
        assertTrue(mine.contains(referred.getRef()),
                "sale referring a1's phone appears even though a2 sold it (union via referrer_phone9)");
        assertFalse(mine.contains(other.getRef()), "unrelated sale is excluded");
        assertEquals("699123456", referred.getReferrerPhone9(), "country code stripped to the local 9 digits");
    }

    @Test
    void backfillFillsLegacyRowsSoMineFindsThem() {
        // Simulate a row created before the column existed: referrerPhone set, referrerPhone9 null.
        Subscription legacy = subs.save(Subscription.builder()
                .ref("LEGACY-1").prenom("Old").nom("Row").fullName("Old Row").sexe("M")
                .cni("0000LEGA").cniExp("01/01/2030").phone("670000000").email("old@x.cm")
                .quartier("Akwa").ville("Douala").pay("cash").delivery("promote").amount(5000)
                .channel("agent").agentId("a2")
                .referrerName("Awa Fall").referrerPhone("699 123 456").referrerPhone9(null)
                .payStatus(PayStatus.cash).createdAt(Instant.now()).build());
        assertNull(legacy.getReferrerPhone9(), "precondition: legacy row has no phone9");
        assertFalse(service.mine("a1").stream().anyMatch(s -> "LEGACY-1".equals(s.getRef())),
                "before backfill the indexed query cannot see the legacy referred sale");

        int n = service.backfillReferrerPhone9();
        assertTrue(n >= 1);
        assertEquals("699123456", subs.findByRefIgnoreCase("LEGACY-1").orElseThrow().getReferrerPhone9());
        assertTrue(service.mine("a1").stream().anyMatch(s -> "LEGACY-1".equals(s.getRef())),
                "after backfill the legacy referred sale shows in a1's portfolio");
    }
}
