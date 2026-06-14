package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

/** A staff account (admin, relationship officer, or print-point operator). */
@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AppUser {

    @Id
    private String id;            // e.g. "a1", "admin", "print1"

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    /** Primary role — drives the landing page and is kept for backward compatibility. Always part
     *  of {@link #effectiveRoles()}. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    /** Additional roles a single account may hold, stored as a comma-separated list (e.g.
     *  "AGENT,COLLECTEUR"). Null/empty on legacy accounts → the account simply has its primary role.
     *  A plain string column (not a join table) keeps the migration trivial and avoids a second DB
     *  enum check constraint to maintain. */
    @Column(length = 200)
    private String roles;

    private String agency;        // null for admin

    /** Full set of roles the account holds: the primary {@code role} plus any extra {@code roles}. */
    @Transient
    public java.util.Set<Role> effectiveRoles() {
        java.util.LinkedHashSet<Role> set = new java.util.LinkedHashSet<>();
        if (role != null) set.add(role);
        if (roles != null && !roles.isBlank()) {
            for (String r : roles.split(",")) {
                try { set.add(Role.valueOf(r.trim().toUpperCase())); } catch (IllegalArgumentException ignored) {}
            }
        }
        return set;
    }

    /** Replace the account's roles: the first becomes the primary, all are stored in {@code roles}. */
    public void assignRoles(java.util.List<Role> list) {
        if (list == null || list.isEmpty()) return;
        java.util.LinkedHashSet<Role> set = new java.util.LinkedHashSet<>(list);
        this.role = set.iterator().next();
        this.roles = String.join(",", set.stream().map(Role::name).toList());
    }

    private String phone;         // used to resolve a referrer ("recommandé par")

    /** Hashed 4-digit login PIN for collecteurs who sign in by phone number (simple field-collection
     *  flow). Null for accounts that authenticate by email + password. */
    private String loginPin;

    /** True until the user has set their own password (forced change on first login). */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean mustChangePassword = false;

    /** Whether the account may log in. An admin can disable an account without deleting it;
     *  a disabled user can neither sign in nor use an existing token. */
    @Builder.Default
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean enabled = true;

    /** When the account was created. Populated automatically on insert. */
    @CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;

    /** Profiles (groups of permissions) assigned to this account. Loaded eagerly so that
     *  {@link #effectivePermissions()} is available without an open Hibernate session. */
    @ManyToMany(fetch = jakarta.persistence.FetchType.EAGER)
    @JoinTable(name = "user_profile",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "profile_id"))
    @Builder.Default
    private java.util.Set<AppProfile> profiles = new java.util.HashSet<>();

    /** Union of all permissions granted by assigned profiles. */
    public java.util.Set<Permission> effectivePermissions() {
        java.util.Set<Permission> result = java.util.EnumSet.noneOf(Permission.class);
        for (AppProfile p : profiles) result.addAll(p.permissionSet());
        return result;
    }

    /** Last known geolocation (browser GPS), reported by the frontend right after login. Null until
     *  the user logs in from a browser that grants the geolocation permission. */
    private Double lastLat;
    private Double lastLng;
    private Double lastAccuracy;   // precision radius in metres of the last fix
    private java.time.Instant lastLocatedAt;
}
