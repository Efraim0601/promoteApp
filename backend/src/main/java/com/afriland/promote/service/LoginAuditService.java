package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.LoginAudit;
import com.afriland.promote.repo.LoginAuditRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/** Records every authentication attempt (success or failure) for the admin audit trail. */
@Service
public class LoginAuditService {

    private final LoginAuditRepository repo;

    public LoginAuditService(LoginAuditRepository repo) {
        this.repo = repo;
    }

    /** Append an audit row. {@code user} is null on a failed/unknown-email attempt. */
    public void record(String email, AppUser user, boolean success, String reason, HttpServletRequest request) {
        LoginAudit a = LoginAudit.builder()
                .id(UUID.randomUUID().toString())
                .userId(user == null ? null : user.getId())
                .name(user == null ? null : user.getName())
                .email(email)
                .roles(user == null ? null : String.join(",", user.effectiveRoles().stream().map(Enum::name).toList()))
                .success(success)
                .reason(reason)
                .ip(clientIp(request))
                .userAgent(truncate(request == null ? null : request.getHeader("User-Agent"), 300))
                .at(Instant.now())
                .build();
        try {
            repo.save(a);
        } catch (Exception ignored) {
            // Auditing must never block a login — a write failure is swallowed.
        }
    }

    /** Best client IP: first hop of X-Forwarded-For (set by the HTTPS reverse proxy), else remote address. */
    private static String clientIp(HttpServletRequest request) {
        if (request == null) return null;
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    private static String truncate(String s, int max) {
        return s == null ? null : s.length() <= max ? s : s.substring(0, max);
    }
}
