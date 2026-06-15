package com.afriland.promote.service;

import com.afriland.promote.model.ActionAudit;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.repo.ActionAuditRepository;
import com.afriland.promote.repo.AppUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.UUID;

/**
 * Records every significant mutation in the application for the admin audit trail.
 * Append-only; write failures are swallowed so that auditing never blocks operations.
 */
@Service
public class ActionAuditService {

    private final ActionAuditRepository repo;
    private final AppUserRepository users;

    public ActionAuditService(ActionAuditRepository repo, AppUserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    /**
     * Record one auditable action. {@code auth} may be null for system-triggered events.
     * {@code entityRef} is the ID / reference of the affected record (may be null).
     * {@code details} is a short human-readable summary of what changed.
     */
    public void record(Authentication auth, String action,
                       String entityType, String entityRef, String details) {
        try {
            String actorId = null, actorName = null, actorRoles = null;
            if (auth != null) {
                actorId = auth.getName();
                AppUser u = users.findById(actorId).orElse(null);
                if (u != null) {
                    actorName = u.getName();
                    actorRoles = String.join(",",
                            u.effectiveRoles().stream().map(Enum::name).toList());
                }
            }
            ActionAudit a = ActionAudit.builder()
                    .id(UUID.randomUUID().toString())
                    .actorId(actorId)
                    .actorName(actorName)
                    .actorRoles(actorRoles)
                    .action(action)
                    .entityType(entityType)
                    .entityRef(entityRef)
                    .details(details)
                    .ip(currentIp())
                    .at(Instant.now())
                    .build();
            repo.save(a);
        } catch (Exception ignored) {
            // Auditing must never block the main operation — write failures are swallowed.
        }
    }

    private static String currentIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest req = attrs.getRequest();
            String xff = req.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
            return req.getRemoteAddr();
        } catch (Exception e) {
            return null;
        }
    }
}
