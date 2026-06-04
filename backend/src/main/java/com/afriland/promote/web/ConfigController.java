package com.afriland.promote.web;

import com.afriland.promote.model.CardConfig;
import com.afriland.promote.repo.CardConfigRepository;
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

    /** Public — the client form needs the current amounts. */
    @GetMapping
    public ConfigDto get() {
        CardConfig c = service.config();
        return new ConfigDto(c.getPrice(), c.getFees(), c.getTransport());
    }

    /** Admin only (enforced in SecurityConfig). */
    @PutMapping
    public ConfigDto update(@Valid @RequestBody ConfigDto dto) {
        CardConfig c = service.config();
        c.setPrice(Math.max(0, dto.price()));
        c.setFees(Math.max(0, dto.fees()));
        c.setTransport(Math.max(0, dto.transport()));
        repo.save(c);
        return new ConfigDto(c.getPrice(), c.getFees(), c.getTransport());
    }
}
