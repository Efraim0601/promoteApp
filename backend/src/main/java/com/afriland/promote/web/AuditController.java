package com.afriland.promote.web;

import com.afriland.promote.model.ActionAudit;
import com.afriland.promote.repo.ActionAuditRepository;
import com.afriland.promote.repo.LoginAuditRepository;
import com.afriland.promote.web.dto.Dtos.ActionAuditDto;
import com.afriland.promote.web.dto.Dtos.LoginAuditDto;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Admin-only audit trail of login attempts and application actions (enforced in SecurityConfig). */
@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final LoginAuditRepository loginRepo;
    private final ActionAuditRepository actionRepo;

    public AuditController(LoginAuditRepository loginRepo, ActionAuditRepository actionRepo) {
        this.loginRepo = loginRepo;
        this.actionRepo = actionRepo;
    }

    /** The most recent login attempts (latest first, capped at 1000). */
    @GetMapping("/logins")
    public List<LoginAuditDto> logins() {
        return loginRepo.findAllByOrderByAtDesc(PageRequest.of(0, 1000))
                .stream().map(LoginAuditDto::of).toList();
    }

    /**
     * Application mutations, latest first (capped at 2000). With {@code q}, searches the WHOLE
     * history (actor / action / entity ref / details) instead of only the most-recent page — this
     * is what lets a supervisor find who validated an older reference (e.g. an old PRM-xxxx print).
     */
    @GetMapping("/actions")
    public List<ActionAuditDto> actions(@RequestParam(required = false) String q) {
        PageRequest page = PageRequest.of(0, 2000);
        String term = q == null ? "" : q.trim();
        List<ActionAudit> rows = term.isEmpty()
                ? actionRepo.findAllByOrderByAtDesc(page)
                : actionRepo.search("%" + term.toLowerCase() + "%", page);
        return rows.stream().map(ActionAuditDto::of).toList();
    }
}
