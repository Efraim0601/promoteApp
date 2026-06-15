package com.afriland.promote.web;

import com.afriland.promote.email.EmailService;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.security.TempPasswordGenerator;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Admin-only staff account management (create + list). Enforced ADMIN in SecurityConfig. */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final EmailService email;
    private final ActionAuditService audit;

    public UserController(AppUserRepository users, PasswordEncoder encoder,
                          EmailService email, ActionAuditService audit) {
        this.users = users;
        this.encoder = encoder;
        this.email = email;
        this.audit = audit;
    }

    /** List staff accounts. Admin sees everyone; a supervisor sees only collecteurs + supervisors. */
    @GetMapping
    public List<UserDto> list(Authentication auth) {
        boolean supOnly = isSupervisorOnly(auth);
        return users.findAll().stream()
                .filter(u -> !supOnly
                        || u.effectiveRoles().contains(Role.COLLECTEUR)
                        || u.effectiveRoles().contains(Role.SUPERVISEUR))
                .map(UserDto::of).toList();
    }

    /** True when the caller holds SUPERVISEUR but not ADMIN (restricted scope: collecteurs only). */
    private boolean isSupervisorOnly(Authentication auth) {
        if (auth == null) return false;
        AppUser caller = users.findById(auth.getName()).orElse(null);
        if (caller == null) return false;
        Set<Role> r = caller.effectiveRoles();
        return r.contains(Role.SUPERVISEUR) && !r.contains(Role.ADMIN);
    }

    /**
     * Enable or disable a staff account (ADMIN only — enforced in SecurityConfig). A disabled
     * account can no longer log in nor use an existing token. An admin cannot disable their own
     * account (would lock themselves out), and the last active admin cannot be disabled.
     */
    @PatchMapping("/{id}/enabled")
    public ResponseEntity<?> setEnabled(@PathVariable String id,
                                        @RequestBody SetEnabledRequest req,
                                        Authentication auth) {
        AppUser u = users.findById(id).orElse(null);
        if (u == null) return ResponseEntity.notFound().build();
        // A supervisor may only enable/disable COLLECTEUR accounts (never admins/supervisors/others).
        if (isSupervisorOnly(auth)) {
            Set<Role> tr = u.effectiveRoles();
            if (!tr.contains(Role.COLLECTEUR) || tr.contains(Role.ADMIN) || tr.contains(Role.SUPERVISEUR)) {
                return ResponseEntity.status(403).body(new ErrorResponse("forbidden_target"));
            }
        }
        if (!req.enabled()) {
            if (id.equals(auth.getName())) {
                return ResponseEntity.badRequest().body(new ErrorResponse("cannot_disable_self"));
            }
            if (u.effectiveRoles().contains(Role.ADMIN) && lastActiveAdmin(u.getId())) {
                return ResponseEntity.badRequest().body(new ErrorResponse("last_admin"));
            }
        }
        u.setEnabled(req.enabled());
        UserDto saved = UserDto.of(users.save(u));
        audit.record(auth, "TOGGLE_USER", "USER", id,
                (req.enabled() ? "Activation" : "Désactivation") + " du compte " + u.getEmail());
        return ResponseEntity.ok(saved);
    }

    /** Admin updates an existing account's profile (name, email, phone, agency). Roles and password
     *  are unchanged — use {@code PUT /{id}/roles} and the password-reset flow respectively. */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @Valid @RequestBody UpdateUserRequest req,
                                    Authentication auth) {
        AppUser u = users.findById(id).orElse(null);
        if (u == null) return ResponseEntity.notFound().build();

        String name = req.name() == null ? "" : req.name().trim();
        String email = req.email() == null ? "" : req.email().trim();
        if (name.isBlank() || !EMAIL.matcher(email).matches()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("invalid_name_or_email"));
        }
        AppUser emailOwner = users.findByEmailIgnoreCase(email).orElse(null);
        if (emailOwner != null && !emailOwner.getId().equals(id) && emailOwner.isEnabled()) {
            return ResponseEntity.status(409).body(new ErrorResponse("email_exists"));
        }

        String phone = normalizePhone(req.phone());
        if (!phone.matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("phone_required"));
        }
        if (users.findAllByPhone(phone).stream().anyMatch(other -> !other.getId().equals(id) && other.isEnabled())) {
            return ResponseEntity.status(409).body(new ErrorResponse("phone_exists"));
        }
        if (u.effectiveRoles().contains(Role.AGENT) && !phone.matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("agent_phone_required"));
        }

        u.setName(name);
        u.setEmail(email);
        u.setAgency(req.agency() == null || req.agency().isBlank() ? null : req.agency().trim());
        u.setPhone(phone);
        UserDto saved = UserDto.of(users.save(u));
        audit.record(auth, "UPDATE_USER", "USER", id,
                "Modification du compte " + email + " (" + name + ")");
        return ResponseEntity.ok(saved);
    }

    /** Admin sets the full role set of an existing account (multi-role). At least one valid role;
     *  removing ADMIN from the last remaining admin is refused. */
    @PutMapping("/{id}/roles")
    public ResponseEntity<?> setRoles(@PathVariable String id, @RequestBody SetRolesRequest req,
                                      Authentication auth) {
        AppUser u = users.findById(id).orElse(null);
        if (u == null) return ResponseEntity.notFound().build();
        List<Role> roles;
        try {
            roles = parseRoles(req.roles());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        }
        if (roles.isEmpty()) return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        // Don't let the last enabled admin lose the ADMIN role (would lock everyone out).
        if (u.getRole() == Role.ADMIN && !roles.contains(Role.ADMIN) && lastActiveAdmin(u.getId())) {
            return ResponseEntity.badRequest().body(new ErrorResponse("last_admin"));
        }
        // An account that holds AGENT must keep a valid commercial phone (referral attribution).
        if (roles.contains(Role.AGENT) && (u.getPhone() == null || !u.getPhone().matches("6\\d{8}"))) {
            return ResponseEntity.badRequest().body(new ErrorResponse("agent_phone_required"));
        }
        u.assignRoles(roles);
        UserDto saved = UserDto.of(users.save(u));
        audit.record(auth, "SET_ROLES", "USER", id,
                "Rôles de " + u.getEmail() + " → " + String.join(",", roles.stream().map(Role::name).toList()));
        return ResponseEntity.ok(saved);
    }

    /** Split a role cell into individual role tokens (separators: | / or +). */
    private static List<String> splitRoles(String cell) {
        if (cell == null || cell.isBlank()) return List.of();
        return java.util.Arrays.stream(cell.split("[|/+]")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    /** Parse + validate a list of role names (case-insensitive, de-duplicated, order preserved). */
    private static List<Role> parseRoles(List<String> names) {
        List<Role> out = new ArrayList<>();
        for (String n : names == null ? List.<String>of() : names) {
            if (n == null || n.isBlank()) continue;
            Role r = Role.valueOf(n.trim().toUpperCase());   // throws IllegalArgumentException on unknown
            if (!out.contains(r)) out.add(r);
        }
        return out;
    }

    /** True if {@code candidateId} is the only enabled ADMIN left. */
    private boolean lastActiveAdmin(String candidateId) {
        return users.findAll().stream()
                .filter(a -> a.effectiveRoles().contains(Role.ADMIN) && a.isEnabled() && !a.getId().equals(candidateId))
                .findAny().isEmpty();
    }

    /** Re-provision a disabled account: new temporary password (and collecteur PIN if applicable),
     *  re-enable login, optionally refresh profile fields. Used by {@link #create} when the email
     *  belongs to a disabled account, and by {@link #recreate} for a one-click admin action. */
    @PostMapping("/{id}/recreate")
    public ResponseEntity<?> recreate(@PathVariable String id, Authentication auth) {
        AppUser u = users.findById(id).orElse(null);
        if (u == null) return ResponseEntity.notFound().build();
        if (u.isEnabled()) {
            return ResponseEntity.status(409).body(new ErrorResponse("account_active"));
        }
        if (isSupervisorOnly(auth)) {
            Set<Role> tr = u.effectiveRoles();
            if (tr.size() != 1 || tr.iterator().next() != Role.COLLECTEUR) {
                return ResponseEntity.status(403).body(new ErrorResponse("forbidden_target"));
            }
        }
        if (u.getPhone() == null || !u.getPhone().matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("phone_required"));
        }
        ResponseEntity<?> resp = provisionAccount(u, u.getName(), u.getEmail(), u.getAgency(),
                u.getPhone(), new ArrayList<>(u.effectiveRoles()), true);
        if (resp.getStatusCode().is2xxSuccessful()) {
            audit.record(auth, "RECREATE_USER", "USER", id,
                    "Recréation du compte " + u.getEmail());
        }
        return resp;
    }

    /** Reset login credentials for an active account: new temporary password (and collecteur PIN if
     *  applicable). The account stays enabled; the user keeps their data and can sign in again. */
    @PostMapping("/{id}/reset-credentials")
    public ResponseEntity<?> resetCredentials(@PathVariable String id, Authentication auth) {
        AppUser u = users.findById(id).orElse(null);
        if (u == null) return ResponseEntity.notFound().build();
        if (!u.isEnabled()) {
            return ResponseEntity.status(409).body(new ErrorResponse("account_disabled"));
        }
        if (isSupervisorOnly(auth)) {
            Set<Role> tr = u.effectiveRoles();
            if (tr.size() != 1 || tr.iterator().next() != Role.COLLECTEUR) {
                return ResponseEntity.status(403).body(new ErrorResponse("forbidden_target"));
            }
        }
        Set<Role> roles = u.effectiveRoles();
        boolean hasCollecteur = roles.contains(Role.COLLECTEUR);
        if (hasCollecteur && (u.getPhone() == null || !u.getPhone().matches("6\\d{8}"))) {
            return ResponseEntity.badRequest().body(new ErrorResponse("phone_required"));
        }
        boolean collecteurOnly = roles.size() == 1 && roles.contains(Role.COLLECTEUR);
        String temp = TempPasswordGenerator.password();
        String pin = hasCollecteur ? TempPasswordGenerator.pin() : null;
        u.setPasswordHash(encoder.encode(temp));
        u.setLoginPin(pin == null ? null : encoder.encode(pin));
        u.setMustChangePassword(!collecteurOnly);
        AppUser saved = users.save(u);
        this.email.sendCredentialsReset(saved.getEmail(), saved.getName(), collecteurOnly ? null : temp, pin,
                saved.getPhone());
        audit.record(auth, "RESET_CREDS", "USER", id,
                "Réinitialisation des identifiants de " + saved.getEmail());
        return ResponseEntity.ok(new CreateUserResult(UserDto.of(saved), collecteurOnly ? "" : temp, pin));
    }

    /** Create a staff account. Rejects a duplicate email or an unknown role. A supervisor may only
     *  create COLLECTEUR accounts. A disabled account with the same email is re-provisioned instead
     *  of rejected (new password, profile refreshed, account re-enabled). */
    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserRequest req, Authentication auth) {
        List<Role> roles;
        try {
            roles = parseRoles(req.rolesOrSingle());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        }
        if (roles.isEmpty()) return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        // A supervisor may only create COLLECTEUR accounts (single role).
        if (isSupervisorOnly(auth) && (roles.size() != 1 || roles.get(0) != Role.COLLECTEUR)) {
            return ResponseEntity.status(403).body(new ErrorResponse("forbidden_role"));
        }
        String email = req.email().trim();
        String phone = normalizePhone(req.phone());
        if (!phone.matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("phone_required"));
        }
        AppUser byEmail = users.findByEmailIgnoreCase(email).orElse(null);
        if (byEmail != null) {
            if (byEmail.isEnabled()) {
                return ResponseEntity.status(409).body(new ErrorResponse("email_exists"));
            }
            // Re-provision the disabled account with the data entered in the create form.
            if (users.findAllByPhone(phone).stream().anyMatch(o -> !o.getId().equals(byEmail.getId()))) {
                return ResponseEntity.status(409).body(new ErrorResponse("phone_exists"));
            }
            String agency = req.agency() == null || req.agency().isBlank() ? null : req.agency().trim();
            return provisionAccount(byEmail, req.name().trim(), email, agency, phone, roles, true);
        }
        if (users.findAllByPhone(phone).stream().anyMatch(AppUser::isEnabled)) {
            return ResponseEntity.status(409).body(new ErrorResponse("phone_exists"));
        }
        Role role = roles.get(0);   // primary
        String temp = TempPasswordGenerator.password();
        String pin = roles.contains(Role.COLLECTEUR) ? TempPasswordGenerator.pin() : null;
        boolean collecteurOnly = roles.size() == 1 && roles.get(0) == Role.COLLECTEUR;
        AppUser u = AppUser.builder()
                .id("u-" + UUID.randomUUID().toString().substring(0, 8))
                .name(req.name().trim())
                .email(email)
                .passwordHash(encoder.encode(temp))
                .role(role)
                .agency(req.agency() == null || req.agency().isBlank() ? null : req.agency().trim())
                .phone(phone)
                .loginPin(pin == null ? null : encoder.encode(pin))
                .mustChangePassword(!collecteurOnly)
                .build();
        u.assignRoles(roles);
        AppUser saved = users.save(u);
        this.email.sendAccountCreated(saved.getEmail(), saved.getName(), temp);
        audit.record(auth, "CREATE_USER", "USER", saved.getId(),
                "Création du compte " + email + " (" + req.name().trim() + ")"
                + " — rôles : " + String.join(",", roles.stream().map(Role::name).toList()));
        return ResponseEntity.ok(new CreateUserResult(UserDto.of(saved), temp, pin));
    }

    /** Shared path for creating a fresh account or re-provisioning a disabled one. */
    private ResponseEntity<?> provisionAccount(AppUser u, String name, String emailAddress, String agency,
                                               String phone, List<Role> roles, boolean reactivated) {
        String temp = TempPasswordGenerator.password();
        String pin = roles.contains(Role.COLLECTEUR) ? TempPasswordGenerator.pin() : null;
        boolean collecteurOnly = roles.size() == 1 && roles.get(0) == Role.COLLECTEUR;
        u.setName(name);
        u.setEmail(emailAddress);
        u.setAgency(agency);
        u.setPhone(phone);
        u.setPasswordHash(encoder.encode(temp));
        u.setLoginPin(pin == null ? null : encoder.encode(pin));
        u.setMustChangePassword(!collecteurOnly);
        u.setEnabled(true);
        u.assignRoles(roles);
        AppUser saved = users.save(u);
        this.email.sendAccountCreated(saved.getEmail(), saved.getName(), temp);
        return ResponseEntity.ok(new CreateUserResult(UserDto.of(saved), temp, pin, reactivated));
    }

    /**
     * Bulk-import staff accounts. Each row is validated independently; duplicates (by email,
     * case-insensitive) are skipped or updated per {@code updateExisting}. New accounts get a
     * generated temporary password, returned in the row result so the admin can hand it out.
     * Always 200 — the per-row {@code status} carries the outcome (created/updated/skipped/invalid).
     */
    @PostMapping("/import")
    @Transactional
    public ImportUsersResult importUsers(@RequestBody ImportUsersRequest req, Authentication auth) {
        List<ImportUserRow> rows = req == null || req.rows() == null ? List.of() : req.rows();
        boolean update = req != null && req.updateExisting();
        List<ImportRowResult> out = new ArrayList<>();
        Set<String> seenInFile = new HashSet<>();   // de-dup within the uploaded file itself
        int created = 0, updated = 0, skipped = 0, invalid = 0;

        for (ImportUserRow row : rows) {
            String name = row.name() == null ? "" : row.name().trim();
            String email = row.email() == null ? "" : row.email().trim();
            String roleRaw = row.role() == null ? "" : row.role().trim();

            if (name.isBlank() || !EMAIL.matcher(email).matches()) {
                out.add(new ImportRowResult(email, name, roleRaw, "invalid", "invalid_name_or_email", null));
                invalid++; continue;
            }
            // The role cell may carry several roles separated by | / or + (e.g. "AGENT|COLLECTEUR").
            List<Role> roles;
            try {
                roles = parseRoles(splitRoles(roleRaw));
            } catch (IllegalArgumentException e) {
                out.add(new ImportRowResult(email, name, roleRaw, "invalid", "invalid_role", null));
                invalid++; continue;
            }
            if (roles.isEmpty()) {
                out.add(new ImportRowResult(email, name, roleRaw, "invalid", "invalid_role", null));
                invalid++; continue;
            }
            String rolesLabel = String.join(",", roles.stream().map(Role::name).toList());
            String phone = row.phone() == null ? "" : row.phone().replaceAll("\\D", "");
            if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
            if (roles.contains(Role.AGENT) && !phone.matches("6\\d{8}")) {
                out.add(new ImportRowResult(email, name, rolesLabel, "invalid", "agent_phone_required", null));
                invalid++; continue;
            }
            String agency = row.agency() == null || row.agency().isBlank() ? null : row.agency().trim();

            // The same email twice in one file: keep the first, skip the rest.
            if (!seenInFile.add(email.toLowerCase())) {
                out.add(new ImportRowResult(email, name, rolesLabel, "skipped", "duplicate_in_file", null));
                skipped++; continue;
            }

            AppUser existing = users.findByEmailIgnoreCase(email).orElse(null);
            if (existing != null) {
                if (existing.isEnabled() && !update) {
                    out.add(new ImportRowResult(email, name, rolesLabel, "skipped", "email_exists", null));
                    skipped++; continue;
                }
                if (!existing.isEnabled() || update) {
                    if (!phone.isBlank() && users.findAllByPhone(phone).stream()
                            .anyMatch(o -> o.isEnabled() && !o.getId().equals(existing.getId()))) {
                        out.add(new ImportRowResult(email, name, rolesLabel, "invalid", "phone_exists", null));
                        invalid++; continue;
                    }
                    boolean wasDisabled = !existing.isEnabled();
                    String temp = wasDisabled ? TempPasswordGenerator.password() : null;
                    existing.setName(name);
                    existing.assignRoles(roles);
                    existing.setAgency(agency);
                    existing.setPhone(phone.isBlank() ? null : phone);
                    if (wasDisabled) {
                        existing.setPasswordHash(encoder.encode(temp));
                        existing.setMustChangePassword(true);
                        existing.setEnabled(true);
                        this.email.sendAccountCreated(email, name, temp);
                    }
                    users.save(existing);
                    if (wasDisabled) {
                        out.add(new ImportRowResult(email, name, rolesLabel, "created", null, temp));
                        created++;
                    } else {
                        out.add(new ImportRowResult(email, name, rolesLabel, "updated", null, null));
                        updated++;
                    }
                    continue;
                }
            }

            if (!phone.isBlank() && users.findAllByPhone(phone).stream().anyMatch(AppUser::isEnabled)) {
                out.add(new ImportRowResult(email, name, rolesLabel, "invalid", "phone_exists", null));
                invalid++; continue;
            }

            String temp = TempPasswordGenerator.password();
            AppUser u = AppUser.builder()
                    .id("u-" + UUID.randomUUID().toString().substring(0, 8))
                    .name(name).email(email)
                    .passwordHash(encoder.encode(temp))
                    .role(roles.get(0)).agency(agency)
                    .phone(phone.isBlank() ? null : phone)
                    .mustChangePassword(true)   // forced change on first login
                    .build();
            u.assignRoles(roles);
            users.save(u);
            // Email the new user their login link + temporary password (best-effort; the temp
            // password is also returned below as a fallback for the admin).
            this.email.sendAccountCreated(email, name, temp);
            out.add(new ImportRowResult(email, name, rolesLabel, "created", null, temp));
            created++;
        }
        ImportUsersResult result = new ImportUsersResult(created, updated, skipped, invalid, out);
        if (created + updated > 0) {
            audit.record(auth, "IMPORT_USERS", "USER", null,
                    "Import utilisateurs : " + created + " créés, " + updated + " mis à jour, "
                    + skipped + " ignorés, " + invalid + " invalides");
        }
        return result;
    }

    private static final Pattern EMAIL = Pattern.compile("^\\S+@\\S+\\.\\S+$");

    /** Local 9-digit Cameroon mobile (country code stripped). */
    private static String normalizePhone(String raw) {
        String phone = raw == null ? "" : raw.replaceAll("\\D", "");
        if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
        return phone;
    }
}
