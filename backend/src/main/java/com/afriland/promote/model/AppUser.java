package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    private String agency;        // null for admin

    private String phone;         // used to resolve a referrer ("recommandé par")

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

    /** Last known geolocation (browser GPS), reported by the frontend right after login. Null until
     *  the user logs in from a browser that grants the geolocation permission. */
    private Double lastLat;
    private Double lastLng;
    private Double lastAccuracy;   // precision radius in metres of the last fix
    private java.time.Instant lastLocatedAt;
}
