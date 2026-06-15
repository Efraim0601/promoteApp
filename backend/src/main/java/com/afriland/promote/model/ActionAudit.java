package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Append-only audit trail of every significant mutation performed via the application.
 * One row per action (create/update/delete/validate/…). Never updated after creation.
 */
@Entity
@Table(name = "action_audit", indexes = {
        @Index(name = "idx_action_audit_at",    columnList = "at"),
        @Index(name = "idx_action_audit_actor", columnList = "actor_id"),
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActionAudit {

    @Id
    private String id;                       // UUID

    @Column(name = "actor_id")
    private String actorId;                  // user who performed the action

    @Column(name = "actor_name")
    private String actorName;

    @Column(name = "actor_roles")
    private String actorRoles;               // CSV at the moment of the action

    @Column(nullable = false, length = 60)
    private String action;                   // e.g. CREATE_USER, DELETE_COLLECTE

    @Column(name = "entity_type", length = 40)
    private String entityType;               // USER, COLLECTE, SUBSCRIPTION, …

    @Column(name = "entity_ref")
    private String entityRef;               // ID / ref of the affected entity

    @Column(columnDefinition = "text")
    private String details;                  // human-readable summary of the change

    @Column(length = 100)
    private String ip;

    @Column(nullable = false)
    private Instant at;
}
