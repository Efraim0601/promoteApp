package com.afriland.promote.service;

import com.afriland.promote.model.*;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CommissionEntryRepository;
import com.afriland.promote.repo.CommissionRuleRepository;
import com.afriland.promote.repo.ProductRepository;
import com.afriland.promote.web.dto.Dtos.CreateCollecteRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Commission engine: automatic recording on a collecte, idempotency (no double-credit) and the
 * deterministic rule resolution (user override &gt; role; product scope &gt; group scope).
 * Uses unique ids/codes so it is immune to data left by other tests sharing the in-memory DB.
 */
@SpringBootTest
class CommissionServiceTest {

    @Autowired CommissionService commissions;
    @Autowired CollecteService collectes;
    @Autowired ProductService products;
    @Autowired ProductRepository productRepo;
    @Autowired AppUserRepository users;
    @Autowired CommissionRuleRepository ruleRepo;
    @Autowired CommissionEntryRepository entryRepo;

    @Test
    void recordsCommissionOnceAndResolvesBestRule() {
        // Beneficiary: a collecteur.
        String sellerId = "comm-seller-1";
        users.save(AppUser.builder().id(sellerId).name("Comm Seller").email("comm.seller@test.cm")
                .passwordHash("x").role(Role.COLLECTEUR).phone("655999111").build());

        // Price the bank product carte_bancaire (group "bancaire") at 10 000 XAF.
        Product card = products.byCode("carte_bancaire");
        assertNotNull(card, "seeded bank product present");
        card.setBasePrice(10_000);
        productRepo.save(card);

        // Role rule: 10% for every COLLECTEUR on the "bancaire" group.
        ruleRepo.save(CommissionRule.builder()
                .scopeType(CommissionRule.ScopeType.GROUP).scopeCode("bancaire")
                .targetType(CommissionRule.TargetType.ROLE).targetValue("COLLECTEUR")
                .rateType(CommissionRule.RateType.PERCENT).rateValue(10).active(true).build());

        // Creating a collecte awards the commission automatically: 10% of 10 000 = 1 000.
        var c1 = collectes.create(bankReq(), sellerId, "Comm Seller");
        var awarded = entryRepo.findByBeneficiaryIdOrderByCreatedAtDesc(sellerId);
        assertEquals(1, awarded.size(), "one commission entry created");
        assertEquals(1_000, awarded.get(0).getAmount(), "10% of 10 000");

        // Idempotent: replaying the recording for the same sale does not create a second entry.
        commissions.recordForCollecte(c1);
        assertEquals(1, entryRepo.findByBeneficiaryIdOrderByCreatedAtDesc(sellerId).size(),
                "no double-credit on replay");

        // Add a user override (FIXED 5 000 on the product itself) — it must win over the role rule.
        ruleRepo.save(CommissionRule.builder()
                .scopeType(CommissionRule.ScopeType.PRODUCT).scopeCode("carte_bancaire")
                .targetType(CommissionRule.TargetType.USER).targetValue(sellerId)
                .rateType(CommissionRule.RateType.FIXED).rateValue(5_000).active(true).build());

        AppUser seller = users.findById(sellerId).orElseThrow();
        Optional<CommissionRule> best = commissions.resolveRule("carte_bancaire", seller);
        assertTrue(best.isPresent(), "a rule resolves");
        assertEquals(CommissionRule.TargetType.USER, best.get().getTargetType(), "user override wins");
        assertEquals(5_000, best.get().compute(10_000), "fixed override amount");
    }

    private CreateCollecteRequest bankReq() {
        return new CreateCollecteRequest("carte_bancaire", "Client Test", "699000111",
                null, "1234567890123456", "visa");
    }
}
