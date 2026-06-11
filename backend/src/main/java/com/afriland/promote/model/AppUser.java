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
}
