package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
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

    public UserController(AppUserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    /** List every staff account (all roles). */
    @GetMapping
    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::of).toList();
    }

    /** Create a staff account. Rejects a duplicate email or an unknown role. */
    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserRequest req) {
        Role role;
        try {
            role = Role.valueOf(req.role().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new ErrorResponse("invalid_role"));
        }
        if (users.findByEmailIgnoreCase(req.email().trim()).isPresent()) {
            return ResponseEntity.status(409).body(new ErrorResponse("email_exists"));
        }
        // Phone stored as the local 9-digit Cameroon number (country code stripped) so it always
        // matches what a client types as their referrer's number → auto-attributed to the agent.
        String phone = req.phone() == null ? "" : req.phone().replaceAll("\\D", "");
        if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
        // A commercial (agent) MUST have a valid phone — it links client referrals to their sales stats.
        if (role == Role.AGENT && !phone.matches("6\\d{8}")) {
            return ResponseEntity.badRequest().body(new ErrorResponse("agent_phone_required"));
        }
        AppUser u = AppUser.builder()
                .id("u-" + UUID.randomUUID().toString().substring(0, 8))
                .name(req.name().trim())
                .email(req.email().trim())
                .passwordHash(encoder.encode(req.password()))
                .role(role)
                .agency(req.agency() == null || req.agency().isBlank() ? null : req.agency().trim())
                .phone(phone.isBlank() ? null : phone)
                .build();
        return ResponseEntity.ok(UserDto.of(users.save(u)));
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
                    .build());
            out.add(new ImportRowResult(email, name, role.name(), "created", null, temp));
            created++;
        }
        return new ImportUsersResult(created, updated, skipped, invalid, out);
    }

    private static final Pattern EMAIL = Pattern.compile("^\\S+@\\S+\\.\\S+$");
    // Unambiguous alphabet (no O/0, I/l/1) for readable temporary passwords.
    private static final char[] PW = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RAND = new SecureRandom();

    private static String genPassword() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(PW[RAND.nextInt(PW.length)]);
        return sb.toString();
    }

    record ErrorResponse(String error) {}
}
