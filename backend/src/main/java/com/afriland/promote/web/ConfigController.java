package com.afriland.promote.web;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.service.RechargeService;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.ConfigDto;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final SubscriptionService service;
    private final CardConfigRepository repo;

    public ConfigController(SubscriptionService service, CardConfigRepository repo) {
        this.service = service;
        this.repo = repo;
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
                c.rechargeInitialeOr(), c.passPremiumOr());
    }

    /** Admin only (enforced in SecurityConfig). */
    @PutMapping
    public ConfigDto update(@Valid @RequestBody ConfigDto dto) {
        CardConfig c = service.config();
        c.setPrice(Math.max(0, dto.price()));
        c.setFees(Math.max(0, dto.fees()));
        c.setTransport(Math.max(0, dto.transport()));
        // Recharge bounds: a sane floor of 1, and a max never below the min.
        int rMin = Math.max(1, dto.rechargeMin());
        int rMax = Math.max(rMin, dto.rechargeMax());
        c.setRechargeMin(rMin);
        c.setRechargeMax(rMax);
        // Offre Promote: recharge initiale + pass premium (≥ 0).
        c.setRechargeInitiale(Math.max(0, dto.rechargeInitiale()));
        c.setPassPremium(Math.max(0, dto.passPremium()));
        repo.save(c);
        return new ConfigDto(c.getPrice(), c.getFees(), c.getTransport(), min(c), max(c),
                c.rechargeInitialeOr(), c.passPremiumOr());
    }
}
