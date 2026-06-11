package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Audit trail of authentication attempts — one row per login (successful or failed). Lets an admin
 * review who connected, when, and from where. Append-only; never updated.
 */
@Entity
@Table(name = "login_audit", indexes = {
        @Index(name = "idx_audit_at", columnList = "at"),
        @Index(name = "idx_audit_user_id", columnList = "user_id"),
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginAudit {

    @Id
    private String id;            // UUID

    private String userId;        // null when the email matched no account
    private String name;          // account name (or null)
    private String email;         // email entered at login
    private String roles;         // effective roles at login time (CSV) — null on failure

    @Column(nullable = false)
    private boolean success;

    private String reason;        // "ok" | "invalid_credentials" | "account_disabled"

    private String ip;            // client IP (X-Forwarded-For first hop, or remote address)

    @Column(length = 300)
    private String userAgent;

    @Column(nullable = false)
    private Instant at;
}
