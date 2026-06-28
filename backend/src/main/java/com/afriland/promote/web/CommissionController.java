package com.afriland.promote.web;

import com.afriland.promote.model.CommissionRule;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.CommissionService;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Commission configuration + accounting. Rule CRUD and the global entries view are
 * MANAGER/ADMIN-only (gated in {@link com.afriland.promote.config.SecurityConfig}); the {@code /mine}
 * endpoint lets any authenticated seller read their own commissions.
 */
@Tag(name = "Commissions", description = "Règles et ledger des commissions")
@RestController
@RequestMapping("/api/commissions")
public class CommissionController {

    private final CommissionService service;
    private final ActionAuditService audit;

    public CommissionController(CommissionService service, ActionAuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    // ---- rules ----

    @GetMapping("/rules")
    public List<CommissionRuleDto> rules() {
        return service.allRules().stream().map(CommissionRuleDto::of).toList();
    }

    @PostMapping("/rules")
    public CommissionRuleDto createRule(@RequestBody CommissionRuleRequest req, Authentication auth) {
        CommissionRule saved = service.createRule(fromRequest(req));
        audit.record(auth, "CREATE_COMMISSION_RULE", "COMMISSION_RULE", String.valueOf(saved.getId()),
                req.scopeType() + ":" + req.scopeCode() + " → " + req.targetType() + ":" + req.targetValue());
        return CommissionRuleDto.of(saved);
    }

    @PutMapping("/rules/{id}")
    public CommissionRuleDto updateRule(@PathVariable Long id, @RequestBody CommissionRuleRequest req, Authentication auth) {
        CommissionRule saved = service.updateRule(id, fromRequest(req));
        audit.record(auth, "UPDATE_COMMISSION_RULE", "COMMISSION_RULE", String.valueOf(id), "Modification règle");
        return CommissionRuleDto.of(saved);
    }

    @DeleteMapping("/rules/{id}")
    public void deleteRule(@PathVariable Long id, Authentication auth) {
        service.deleteRule(id);
        audit.record(auth, "DELETE_COMMISSION_RULE", "COMMISSION_RULE", String.valueOf(id), "Suppression règle");
    }

    // ---- entries ----

    /** Global commission ledger (manager/admin). */
    @GetMapping("/entries")
    public List<CommissionEntryDto> entries() {
        return service.allEntries().stream().map(CommissionEntryDto::of).toList();
    }

    /** A seller's own commissions. */
    @GetMapping("/mine")
    public List<CommissionEntryDto> mine(Authentication auth) {
        return service.entriesOf((String) auth.getPrincipal()).stream().map(CommissionEntryDto::of).toList();
    }

    // ---- mapping ----

    private static CommissionRule fromRequest(CommissionRuleRequest req) {
        return CommissionRule.builder()
                .scopeType(CommissionRule.ScopeType.valueOf(req.scopeType().trim().toUpperCase()))
                .scopeCode(req.scopeCode() == null ? "" : req.scopeCode().trim())
                .targetType(CommissionRule.TargetType.valueOf(req.targetType().trim().toUpperCase()))
                .targetValue(req.targetValue() == null ? "" : req.targetValue().trim())
                .rateType(CommissionRule.RateType.valueOf(req.rateType().trim().toUpperCase()))
                .rateValue(Math.max(0, req.rateValue()))
                .startDate(parseDate(req.startDate()))
                .endDate(parseDate(req.endDate()))
                .active(req.active())
                .build();
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }
}
