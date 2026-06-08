package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

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

    record ErrorResponse(String error) {}
}
