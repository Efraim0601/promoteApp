package com.afriland.promote.web;

import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.HierarchyService;
import com.afriland.promote.service.NotificationService;
import com.afriland.promote.web.dto.Dtos.TeamMemberDto;
import com.afriland.promote.web.dto.Dtos.TeamMessageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * A team lead's view of their own team: the roster (their sub-tree) and a message they can push to
 * one/several/all teammates. The recipient set is bounded server-side to the caller's sub-tree, so a
 * chef d'équipe can never message outside their team. Gated to the management chain in
 * {@link com.afriland.promote.config.SecurityConfig}.
 */
@Tag(name = "Équipes", description = "Organigramme et messagerie interne")
@RestController
@RequestMapping("/api/team")
public class TeamController {

    private final HierarchyService hierarchy;
    private final NotificationService notifications;
    private final ActionAuditService audit;

    public TeamController(HierarchyService hierarchy, NotificationService notifications, ActionAuditService audit) {
        this.hierarchy = hierarchy;
        this.notifications = notifications;
        this.audit = audit;
    }

    /** Roster: every member of the caller's sub-tree (their team and any sub-teams below). */
    @GetMapping
    public List<TeamMemberDto> roster(Authentication auth) {
        return hierarchy.descendants((String) auth.getPrincipal()).stream()
                .map(TeamMemberDto::of)
                .sorted(Comparator.comparing(TeamMemberDto::name, Comparator.nullsLast(String::compareToIgnoreCase)))
                .toList();
    }

    /** Send a message to teammates. Empty {@code recipientIds} → the whole team; ids outside the
     *  caller's sub-tree are dropped. */
    @PostMapping("/message")
    public ResponseEntity<?> message(@RequestBody TeamMessageRequest req, Authentication auth) {
        String me = (String) auth.getPrincipal();
        Set<String> team = hierarchy.descendantIds(me);
        if (team.isEmpty()) return ResponseEntity.ok(java.util.Map.of("sent", 0));

        List<String> targets = (req.recipientIds() == null || req.recipientIds().isEmpty())
                ? team.stream().toList()
                : req.recipientIds().stream().filter(team::contains).toList();
        if (targets.isEmpty()) return ResponseEntity.ok(java.util.Map.of("sent", 0));

        String title = req.title() == null || req.title().isBlank() ? "Message de votre chef d'équipe" : req.title().trim();
        notifications.send(me, title, req.body(), targets, null);
        audit.record(auth, "TEAM_MESSAGE", "NOTIFICATION", null,
                "Message d'équipe envoyé à " + targets.size() + " membre(s) : \"" + title + "\"");
        return ResponseEntity.ok(java.util.Map.of("sent", targets.size()));
    }
}
