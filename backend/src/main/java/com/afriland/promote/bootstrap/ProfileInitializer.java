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
            Role.MANAGER,     "Manager",
            Role.SUPERVISEUR, "Superviseur",
            Role.CHEF_EQUIPE, "Chef d'équipe",
            Role.AGENT,       "Agent commercial",
            Role.CASHIER,     "Caissier",
            Role.PRINT_AGENT, "Imprimeur",
            Role.COLLECTEUR,  "Collecteur"
    );

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        ensureProfile("Administrateur",   "Accès complet à toutes les fonctionnalités",         EnumSet.allOf(Permission.class));
        ensureProfile("Manager",          "Configuration produits/commissions, utilisateurs, vue commerciale globale", managerPerms());
        ensureProfile("Superviseur",      "Lecture et export globaux, gestion des collecteurs",  superviseurPerms());
        ensureProfile("Chef d'équipe",    "Statistiques et messagerie de sa propre équipe",      chefEquipePerms());
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

    /** Manager — quasi-admin commercial: configure le catalogue, les commissions, crée les
     *  utilisateurs et lit toutes les statistiques. Pas d'accès aux outils purement système (audit,
     *  carte, agences) qui restent réservés à l'Administrateur. */
    private static Set<Permission> managerPerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_EXPORT,
                Permission.RECHARGES_READ, Permission.RECHARGES_EXPORT,
                Permission.COLLECTES_READ, Permission.COLLECTES_EXPORT,
                Permission.UTILISATEURS_READ, Permission.UTILISATEURS_WRITE,
                Permission.CONFIG_READ, Permission.CONFIG_WRITE,
                Permission.PRODUITS_READ, Permission.PRODUITS_WRITE,
                Permission.PROMOTIONS_READ, Permission.PROMOTIONS_WRITE,
                Permission.COMMISSIONS_READ, Permission.COMMISSIONS_WRITE, Permission.COMMISSIONS_EXPORT,
                Permission.STATS_READ,
                Permission.MESSAGES_READ, Permission.MESSAGES_WRITE);
    }

    private static Set<Permission> superviseurPerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.SOUSCRIPTIONS_EXPORT,
                Permission.RECHARGES_READ, Permission.RECHARGES_EXPORT,
                Permission.COLLECTES_READ, Permission.COLLECTES_EXPORT,
                Permission.UTILISATEURS_READ, Permission.CONFIG_READ,
                Permission.STATS_READ, Permission.MESSAGES_READ, Permission.MESSAGES_WRITE);
    }

    /** Chef d'équipe — lecture des statistiques et messagerie limitées à sa propre équipe (le
     *  cloisonnement réel est imposé côté serveur par {@code HierarchyService}). */
    private static Set<Permission> chefEquipePerms() {
        return EnumSet.of(
                Permission.SOUSCRIPTIONS_READ, Permission.COLLECTES_READ,
                Permission.UTILISATEURS_READ, Permission.STATS_READ,
                Permission.MESSAGES_READ, Permission.MESSAGES_WRITE);
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
