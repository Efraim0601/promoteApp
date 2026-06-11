package com.afriland.promote.web;

import com.afriland.promote.email.EmailService;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
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

    public UserController(AppUserRepository users, PasswordEncoder encoder, EmailService email) {
        this.users = users;
        this.encoder = encoder;
        this.email = email;
    }

    /** List every staff account (all roles). */
    @GetMapping
    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::of).toList();
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
        if (!req.enabled()) {
            if (id.equals(auth.getName())) {
                return ResponseEntity.badRequest().body(new ErrorResponse("cannot_disable_self"));
            }
            if (u.effectiveRoles().contains(Role.ADMIN) && lastActiveAdmin(u.getId())) {
                return ResponseEntity.badRequest().body(new ErrorResponse("last_admin"));
            }
        }
        u.setEnabled(req.enabled());
        return ResponseEntity.ok(UserDto.of(users.save(u)));
    }

    /** Admin sets the full role set of an existing account (multi-role). At least one valid role;
     *  removing ADMIN from the last remaining admin is refused. */
    @PutMapping("/{id}/roles")
    public ResponseEntity<?> setRoles(@PathVariable String id, @RequestBody SetRolesRequest req) {
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
        return ResponseEntity.ok(UserDto.of(users.save(u)));
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

    /** Create a staff account. Rejects a duplicate email or an unknown role. */
    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserRequest req) {
        List<Role> roles;
        try {
            roles = parseRoles(req.rolesOrSingle());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        }
        if (roles.isEmpty()) return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        Role role = roles.get(0);   // primary
        if (users.findByEmailIgnoreCase(req.email().trim()).isPresent()) {
            return ResponseEntity.status(409).body(new ErrorResponse("email_exists"));
        }
        // The admin no longer sets the password: a temporary one is generated and emailed to the
        // user, who must change it on first login.
        String temp = genPassword();
        // Phone stored as the local 9-digit Cameroon number (country code stripped) so it always
        // matches what a client types as their referrer's number → auto-attributed to the agent.
        String phone = req.phone() == null ? "" : req.phone().replaceAll("\\D", "");
        if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
        // A commercial (agent) MUST have a valid phone — it links client referrals to their sales stats.
        if (roles.contains(Role.AGENT) && !phone.matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("agent_phone_required"));
        }
        AppUser u = AppUser.builder()
                .id("u-" + UUID.randomUUID().toString().substring(0, 8))
                .name(req.name().trim())
                .email(req.email().trim())
                .passwordHash(encoder.encode(temp))
                .role(role)
                .agency(req.agency() == null || req.agency().isBlank() ? null : req.agency().trim())
                .phone(phone.isBlank() ? null : phone)
                .mustChangePassword(true)   // forced change on first login (all new accounts)
                .build();
        u.assignRoles(roles);
        AppUser saved = users.save(u);
        // Welcome email: login link + identifier + the generated temporary password (best-effort —
        // an SMTP failure never breaks creation; the password is also returned below as a fallback).
        email.sendAccountCreated(saved.getEmail(), saved.getName(), temp);
        return ResponseEntity.ok(new CreateUserResult(UserDto.of(saved), temp));
    }

    /**
     * Bulk-import staff accounts. Each row is validated independently; duplicates (by email,
     * case-insensitive) are skipped or updated per {@code updateExisting}. New accounts get a
     * generated temporary password, returned in the row result so the admin can hand it out.
     * Always 200 — the per-row {@code status} carries the outcome (created/updated/skipped/invalid).
     */
    @PostMapping("/import")
    @Transactional
    public ImportUsersResult importUsers(@RequestBody ImportUsersRequest req) {
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
            Role role;
            try {
                role = Role.valueOf(roleRaw.toUpperCase());
            } catch (IllegalArgumentException e) {
                out.add(new ImportRowResult(email, name, roleRaw, "invalid", "invalid_role", null));
                invalid++; continue;
            }
            String phone = row.phone() == null ? "" : row.phone().replaceAll("\\D", "");
            if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
            if (role == Role.AGENT && !phone.matches("6\\d{8}")) {
                out.add(new ImportRowResult(email, name, role.name(), "invalid", "agent_phone_required", null));
                invalid++; continue;
            }
            String agency = row.agency() == null || row.agency().isBlank() ? null : row.agency().trim();

            // The same email twice in one file: keep the first, skip the rest.
            if (!seenInFile.add(email.toLowerCase())) {
                out.add(new ImportRowResult(email, name, role.name(), "skipped", "duplicate_in_file", null));
                skipped++; continue;
            }

            AppUser existing = users.findByEmailIgnoreCase(email).orElse(null);
            if (existing != null) {
                if (!update) {
                    out.add(new ImportRowResult(email, name, role.name(), "skipped", "email_exists", null));
                    skipped++; continue;
                }
                existing.setName(name);
                existing.setRole(role);
                existing.setAgency(agency);
                existing.setPhone(phone.isBlank() ? null : phone);
                users.save(existing);
                out.add(new ImportRowResult(email, name, role.name(), "updated", null, null));
                updated++; continue;
            }

            String temp = genPassword();
            users.save(AppUser.builder()
                    .id("u-" + UUID.randomUUID().toString().substring(0, 8))
                    .name(name).email(email)
                    .passwordHash(encoder.encode(temp))
                    .role(role).agency(agency)
                    .phone(phone.isBlank() ? null : phone)
                    .mustChangePassword(true)   // forced change on first login
                    .build());
            // Email the new user their login link + temporary password (best-effort; the temp
            // password is also returned below as a fallback for the admin).
            this.email.sendAccountCreated(email, name, temp);
            out.add(new ImportRowResult(email, name, role.name(), "created", null, temp));
            created++;
        }
        return new ImportUsersResult(created, updated, skipped, invalid, out);
    }

    private static final Pattern EMAIL = Pattern.compile("^\\S+@\\S+\\.\\S+$");
    // Unambiguous alphabet (no O/0, I/l/1) for readable temporary passwords.
    private static final char[] PW = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RAND = new SecureRandom();

    // Guarantees the policy (>= 1 letter and >= 1 digit) on a 10-char password.
    private static final char[] LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private static final char[] DIGITS = "23456789".toCharArray();

    private static String genPassword() {
        char[] out = new char[10];
        out[0] = LETTERS[RAND.nextInt(LETTERS.length)];   // at least one letter
        out[1] = DIGITS[RAND.nextInt(DIGITS.length)];     // at least one digit
        for (int i = 2; i < out.length; i++) out[i] = PW[RAND.nextInt(PW.length)];
        // Shuffle so the guaranteed letter/digit aren't always first (Fisher–Yates).
        for (int i = out.length - 1; i > 0; i--) {
            int j = RAND.nextInt(i + 1);
            char t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return new String(out);
    }
}
