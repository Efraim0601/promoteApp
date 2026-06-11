package com.afriland.promote.web;

import com.afriland.promote.repo.LoginAuditRepository;
import com.afriland.promote.web.dto.Dtos.LoginAuditDto;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Admin-only audit trail of login attempts (enforced in SecurityConfig). */
@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final LoginAuditRepository repo;

    public AuditController(LoginAuditRepository repo) {
        this.repo = repo;
    }

    /** The most recent login attempts (latest first, capped). */
    @GetMapping("/logins")
    public List<LoginAuditDto> logins() {
        return repo.findAllByOrderByAtDesc(PageRequest.of(0, 1000)).stream().map(LoginAuditDto::of).toList();
    }
}
