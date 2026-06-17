package com.afriland.promote.service;

import com.afriland.promote.model.*;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CommissionEntryRepository;
import com.afriland.promote.repo.CommissionRuleRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.Optional;
import java.util.Set;

/**
 * Computes and records sales commissions automatically after each settled sale.
 *
 * <p>A rule is matched by {@link #resolveRule}: among the active rules live today, the one with the
 * highest priority wins — user override beats role ({@code targetType}), product scope beats group
 * scope ({@code scopeType}); ties break on the most recent rule. Recording is idempotent thanks to
 * the unique {@code (saleType, saleRef, beneficiaryId)} constraint on {@link CommissionEntry}.
 */
@Service
@Slf4j
public class CommissionService {

    private final CommissionRuleRepository rules;
    private final CommissionEntryRepository entries;
    private final ProductService products;
    private final AppUserRepository users;

    public CommissionService(CommissionRuleRepository rules, CommissionEntryRepository entries,
                             ProductService products, AppUserRepository users) {
        this.rules = rules;
        this.entries = entries;
        this.products = products;
        this.users = users;
    }

    /** Record the commission for a settled subscription (the Promote card sale). Idempotent. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordForSubscription(Subscription s) {
        if (s == null || s.getPayStatus() != PayStatus.paid) return;
        String beneficiaryId = s.getAgentId();
        if (isBlank(beneficiaryId)) return;   // unattributed self sale → no commission
        record(CommissionEntry.SaleType.SUBSCRIPTION, s.getRef(), ProductService.CARD_CODE,
                beneficiaryId, s.getAmount());
    }

    /** Record the commission for a recorded bank-product collecte. Idempotent. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordForCollecte(Collecte c) {
        if (c == null) return;
        String beneficiaryId = c.getCollectedById();
        if (isBlank(beneficiaryId)) return;
        int base = products.effectivePrice(c.getProduct());
        record(CommissionEntry.SaleType.COLLECTE, c.getRef(), c.getProduct(), beneficiaryId, base);
    }

    private void record(CommissionEntry.SaleType type, String saleRef, String productCode,
                        String beneficiaryId, int base) {
        if (isBlank(saleRef) || isBlank(productCode)) return;
        if (entries.existsBySaleTypeAndSaleRefAndBeneficiaryId(type, saleRef, beneficiaryId)) return;
        AppUser beneficiary = users.findById(beneficiaryId).orElse(null);
        Optional<CommissionRule> rule = resolveRule(productCode, beneficiary);
        int amount = rule.map(r -> r.compute(base)).orElse(0);
        CommissionEntry entry = CommissionEntry.builder()
                .saleType(type).saleRef(saleRef).productCode(productCode)
                .beneficiaryId(beneficiaryId)
                .beneficiaryName(beneficiary != null ? beneficiary.getName() : null)
                .baseAmount(base).amount(amount)
                .ruleId(rule.map(CommissionRule::getId).orElse(null))
                .status(CommissionEntry.Status.PENDING)
                .build();
        try {
            entries.save(entry);
        } catch (DataIntegrityViolationException dup) {
            // Concurrent recording for the same sale+beneficiary — the unique constraint already
            // guarantees a single entry; nothing more to do.
            log.debug("Commission already recorded for {} {} / {}", type, saleRef, beneficiaryId);
        }
    }

    /**
     * Best matching rule for a sale by {@code beneficiary} on {@code productCode}. Returns empty when
     * no active rule applies (commission then 0).
     */
    public Optional<CommissionRule> resolveRule(String productCode, AppUser beneficiary) {
        Product product = products.byCode(productCode);
        String group = product != null ? product.getGroupCode() : null;
        Set<Role> roles = beneficiary != null ? beneficiary.effectiveRoles() : Set.of();
        String beneficiaryId = beneficiary != null ? beneficiary.getId() : null;
        LocalDate today = LocalDate.now();

        return rules.findByActiveTrue().stream()
                .filter(r -> r.isLiveOn(today))
                .filter(r -> matchesScope(r, productCode, group))
                .filter(r -> matchesTarget(r, roles, beneficiaryId))
                .max(Comparator
                        .comparingInt((CommissionRule r) -> priority(r))
                        .thenComparing(r -> r.getCreatedAt(), Comparator.nullsFirst(Comparator.naturalOrder())));
    }

    private static boolean matchesScope(CommissionRule r, String productCode, String group) {
        return r.getScopeType() == CommissionRule.ScopeType.PRODUCT
                ? r.getScopeCode().equalsIgnoreCase(productCode)
                : group != null && r.getScopeCode().equalsIgnoreCase(group);
    }

    private static boolean matchesTarget(CommissionRule r, Set<Role> roles, String beneficiaryId) {
        if (r.getTargetType() == CommissionRule.TargetType.USER) {
            return beneficiaryId != null && r.getTargetValue().equals(beneficiaryId);
        }
        try {
            return roles.contains(Role.valueOf(r.getTargetValue().trim().toUpperCase()));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    // ---- rule CRUD + entry reads (manager console) ----

    public java.util.List<CommissionRule> allRules() { return rules.findAllByOrderByCreatedAtDesc(); }

    @Transactional
    public CommissionRule createRule(CommissionRule req) { return rules.save(req); }

    @Transactional
    public CommissionRule updateRule(Long id, CommissionRule req) {
        CommissionRule r = rules.findById(id).orElseThrow(() ->
                new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "rule_not_found"));
        r.setScopeType(req.getScopeType());
        r.setScopeCode(req.getScopeCode());
        r.setTargetType(req.getTargetType());
        r.setTargetValue(req.getTargetValue());
        r.setRateType(req.getRateType());
        r.setRateValue(Math.max(0, req.getRateValue()));
        r.setStartDate(req.getStartDate());
        r.setEndDate(req.getEndDate());
        r.setActive(req.isActive());
        return rules.save(r);
    }

    @Transactional
    public void deleteRule(Long id) { rules.deleteById(id); }

    public java.util.List<CommissionEntry> allEntries() { return entries.findAllByOrderByCreatedAtDesc(); }

    public java.util.List<CommissionEntry> entriesForBeneficiaries(java.util.List<String> ids) {
        if (ids == null || ids.isEmpty()) return java.util.List.of();
        return entries.findByBeneficiaryIdIn(ids);
    }

    public java.util.List<CommissionEntry> entriesOf(String beneficiaryId) {
        return entries.findByBeneficiaryIdOrderByCreatedAtDesc(beneficiaryId);
    }

    /** Priority: user override (20) beats role (10); product scope (+2) beats group scope (+1). */
    private static int priority(CommissionRule r) {
        int t = r.getTargetType() == CommissionRule.TargetType.USER ? 20 : 10;
        int s = r.getScopeType() == CommissionRule.ScopeType.PRODUCT ? 2 : 1;
        return t + s;
    }

    private static boolean isBlank(String v) { return v == null || v.isBlank(); }
}
