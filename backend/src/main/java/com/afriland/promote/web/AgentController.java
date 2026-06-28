package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.AgentDto;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Agents", description = "Résolution parrain et liste agents")
@RestController
@RequestMapping("/api/agents")
public class AgentController {

    private final AppUserRepository users;
    private final SubscriptionService service;

    public AgentController(AppUserRepository users, SubscriptionService service) {
        this.users = users;
        this.service = service;
    }

    /** Admin — list of relationship officers. */
    @GetMapping
    public List<AgentDto> list() {
        return users.findByEffectiveRole(Role.AGENT).stream().map(AgentDto::of).toList();
    }

    /** Public — resolve a referrer by phone for the client form ("recommandé par"). */
    @GetMapping("/resolve")
    public AgentDto resolve(@RequestParam String phone) {
        AppUser a = service.resolveAgentByPhone(phone);
        return a == null ? null : AgentDto.of(a);
    }
}
