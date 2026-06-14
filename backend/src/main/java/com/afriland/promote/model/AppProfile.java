package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.Set;

/** A named group of permissions that can be assigned to staff accounts. */
@Entity
@Table(name = "app_profile")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AppProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    /** Built-in profiles shadow the legacy roles; they cannot be deleted, only edited. */
    @Builder.Default
    @Column(nullable = false)
    private boolean builtin = false;

    /** Comma-separated {@link Permission} names. */
    @Column(length = 2000)
    private String permissions;

    public Set<Permission> permissionSet() {
        return Permission.fromCsv(permissions);
    }

    public void setPermissionSet(Set<Permission> perms) {
        this.permissions = Permission.toCsv(perms);
    }
}
