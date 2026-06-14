package com.afriland.promote.bootstrap;

import com.afriland.promote.model.AppProfile;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Permission;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.ProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Creates the six built-in profiles (one per legacy Role) on first boot and migrates
 * existing users: if a user has no profiles yet, their current role(s) are mapped to the
 * matching built-in profile(s). Runs after DataSeeder (@Order(20)).
 */
@Component
@Order(20)
@RequiredArgsConstructor
@Slf4j
public class ProfileInitializer implements ApplicationRunner {

    private final ProfileRepository profileRepo;
    private final AppUserRepository userRepo;

    private static final Map<Role, String> ROLE_TO_PROFILE = Map.of(
            Role.ADMIN,       "Administrateur",
            Role.SUPERVISEUR, "Superviseur",
            Role.AGENT,       "Agent commercial",
            Role.CASHIER,     "Caissier",
            Role.PRINT_AGENT, "Imprimeur",
            Role.COLLECTEUR,  "Collecteur"
    );

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        ensureProfile("Administrateur",   "Accès complet à toutes les fonctionnalités",         EnumSet.allOf(Permission.class));
        ensureProfile("Superviseur",      "Lecture et export globaux, gestion des collecteurs",  superviseurPerms());
        ensureProfile("Agent commercial", "Création et suivi des souscriptions",                 agentPerms());
        ensureProfile("Caissier",         "Validation des paiements espèces et GAB",             cashierPerms());
        ensureProfile("Imprimeur",        "Consultation et impression des cartes",               printerPerms());
        ensureProfile("Collecteur",       "Saisie et suivi des collectes terrain",               collecteurPerms());
        migrateUsers();
    }

    private void ensureProfile(String name, String description, Set<Permission> perms) {
        AppProfile p = profileRepo.findByName(name).orElseGet(AppProfile::new);
        p.setName(name);
        p.setDescription(description);
        p.setBuiltin(true);
        p.setPermissionSet(perms);
        profileRepo.save(p);
    }

    private void migrateUsers() {
        for (AppUser u : userRepo.findAll()) {
            if (!u.getProfiles().isEmpty()) continue;
            for (Role r : u.effectiveRoles()) {
                String profileName = ROLE_TO_PROFILE.get(r);
                if (profileName != null) {
                    profileRepo.findByName(profileName).ifPresent(p -> u.getProfiles().add(p));
                }
            }
            if (!u.getProfiles().isEmpty()) {
                userRepo.save(u);
                log.info("Migrated user {} → {}", u.getId(),
                        u.getProfiles().stream().map(AppProfile::getName).toList());
            }
        }
    }

    private static Set<Permission> superviseurPerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_EXPORT,
                Permission.RECHARGES_READ, Permission.RECHARGES_EXPORT,
                Permission.COLLECTES_READ, Permission.COLLECTES_EXPORT,
                Permission.UTILISATEURS_READ, Permission.CONFIG_READ);
    }

    private static Set<Permission> agentPerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_WRITE, Permission.SOUSCRIPTIONS_EXPORT,
                Permission.RECHARGES_READ);
    }

    private static Set<Permission> cashierPerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_VALIDATE,
                Permission.RECHARGES_READ, Permission.RECHARGES_VALIDATE, Permission.RECHARGES_EXPORT);
    }

    private static Set<Permission> printerPerms() {
        return EnumSet.of(Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_PRINT);
    }

    private static Set<Permission> collecteurPerms() {
        return EnumSet.of(Permission.COLLECTES_READ, Permission.COLLECTES_WRITE, Permission.COLLECTES_EXPORT);
    }
}
