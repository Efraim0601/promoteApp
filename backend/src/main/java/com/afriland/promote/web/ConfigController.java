package com.afriland.promote.web;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.RechargeService;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.ConfigDto;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Configuration", description = "Tarification carte Promote (CardConfig)")
@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final SubscriptionService service;
    private final CardConfigRepository repo;
    private final ActionAuditService audit;

    public ConfigController(SubscriptionService service, CardConfigRepository repo,
                            ActionAuditService audit) {
        this.service = service;
        this.repo = repo;
        this.audit = audit;
    }

    /** Effective recharge bounds (config value, or the built-in default when unset). */
    private static int min(CardConfig c) {
        return c.getRechargeMin() != null ? c.getRechargeMin() : RechargeService.MIN_AMOUNT;
    }
    private static int max(CardConfig c) {
        return c.getRechargeMax() != null ? c.getRechargeMax() : RechargeService.MAX_AMOUNT;
    }

    /** Public — the client form (subscription + recharge) needs the current amounts. */
    @GetMapping
    public ConfigDto get() {
        CardConfig c = service.config();
        return new ConfigDto(c.getPrice(), c.getFees(), c.getTransport(), min(c), max(c),
                c.rechargeInitialeOr(), c.passPremiumOr(),
                c.rechargeInitialeBancaireOr(), c.passPremiumBancaireOr());
    }

    /** Admin only (enforced in SecurityConfig). */
    @PutMapping
    public ConfigDto update(@Valid @RequestBody ConfigDto dto, Authentication auth) {
        CardConfig c = service.config();
        c.setPrice(Math.max(0, dto.price()));
        c.setFees(Math.max(0, dto.fees()));
        c.setTransport(Math.max(0, dto.transport()));
        // Recharge bounds: a sane floor of 1, and a max never below the min.
        int rMin = Math.max(1, dto.rechargeMin());
        int rMax = Math.max(rMin, dto.rechargeMax());
        c.setRechargeMin(rMin);
        c.setRechargeMax(rMax);
        // Offre Promote: recharge initiale + pass premium (≥ 0) — carte prépayée puis carte bancaire.
        c.setRechargeInitiale(Math.max(0, dto.rechargeInitiale()));
        c.setPassPremium(Math.max(0, dto.passPremium()));
        c.setRechargeInitialeBancaire(Math.max(0, dto.rechargeInitialeBancaire()));
        c.setPassPremiumBancaire(Math.max(0, dto.passPremiumBancaire()));
        repo.save(c);
        audit.record(auth, "UPDATE_CONFIG", "CONFIG", "global",
                "Prix=" + c.getPrice() + " Frais=" + c.getFees()
                + " Transport=" + c.getTransport()
                + " RechMin=" + min(c) + " RechMax=" + max(c));
        return new ConfigDto(c.getPrice(), c.getFees(), c.getTransport(), min(c), max(c),
                c.rechargeInitialeOr(), c.passPremiumOr(),
                c.rechargeInitialeBancaireOr(), c.passPremiumBancaireOr());
    }
}
