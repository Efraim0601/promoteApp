package com.afriland.promote.web;

import com.afriland.promote.email.EmailService;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.security.JwtService;
import com.afriland.promote.security.LoginRateLimiter;
import com.afriland.promote.security.PasswordPolicy;
import com.afriland.promote.security.TempPasswordGenerator;
import com.afriland.promote.service.LoginAuditService;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Authentification", description = "Connexion staff et collecteur, session JWT")
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final LoginAuditService audit;
    private final EmailService email;
    private final LoginRateLimiter rateLimiter;

    public AuthController(AppUserRepository users, PasswordEncoder encoder, JwtService jwt,
                          LoginAuditService audit, EmailService email, LoginRateLimiter rateLimiter) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.audit = audit;
        this.email = email;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req, HttpServletRequest request) {
        String key = req.email().toLowerCase().trim();
        if (rateLimiter.isLocked(key)) {
            audit.record(req.email(), null, false, "account_locked", request);
            return ResponseEntity.status(429).body(new ErrorResponse("account_locked"));
        }
        AppUser u = users.findByEmailIgnoreCase(req.email()).orElse(null);
        if (u == null || !encoder.matches(req.password(), u.getPasswordHash())) {
            rateLimiter.recordFailure(key);
            audit.record(req.email(), null, false, "invalid_credentials", request);
            return ResponseEntity.status(401).body(new ErrorResponse("invalid_credentials"));
        }
        if (!u.isEnabled()) {
            audit.record(req.email(), u, false, "account_disabled", request);
            return ResponseEntity.status(403).body(new ErrorResponse("account_disabled"));
        }
        rateLimiter.recordSuccess(key);
        audit.record(req.email(), u, true, "ok", request);
        return ResponseEntity.ok(new LoginResponse(jwt.generate(u), UserDto.of(u)));
    }

    /** Simplified collecteur sign-in: phone number + 4-digit PIN. Resolves the enabled COLLECTEUR
     *  account holding that phone and matching PIN. Kept deliberately light — the collecteur's only
     *  job is field data collection. */
    @PostMapping("/login-phone")
    public ResponseEntity<?> loginPhone(@Valid @RequestBody PhoneLoginRequest req, HttpServletRequest request) {
        String phone = req.phone().replaceAll("\\D", "");
        if (phone.length() > 9) phone = phone.substring(phone.length() - 9);
        String key = "phone:" + phone;
        if (rateLimiter.isLocked(key)) {
            audit.record(phone, null, false, "account_locked", request);
            return ResponseEntity.status(429).body(new ErrorResponse("account_locked"));
        }
        AppUser u = users.findAllByPhone(phone).stream()
                .filter(x -> x.effectiveRoles().contains(com.afriland.promote.model.Role.COLLECTEUR))
                .findFirst().orElse(null);
        if (u == null || u.getLoginPin() == null || !encoder.matches(req.pin(), u.getLoginPin())) {
            rateLimiter.recordFailure(key);
            audit.record(phone, u, false, "invalid_credentials", request);
            return ResponseEntity.status(401).body(new ErrorResponse("invalid_credentials"));
        }
        if (!u.isEnabled()) {
            audit.record(phone, u, false, "account_disabled", request);
            return ResponseEntity.status(403).body(new ErrorResponse("account_disabled"));
        }
        rateLimiter.recordSuccess(key);
        audit.record(phone, u, true, "ok", request);
        return ResponseEntity.ok(new LoginResponse(jwt.generate(u), UserDto.of(u)));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        AppUser u = users.findById((String) auth.getPrincipal()).orElse(null);
        return u == null ? ResponseEntity.status(401).build() : ResponseEntity.ok(UserDto.of(u));
    }

    /** Report the logged-in user's current position (browser GPS), stored as their last known
     *  location for the admin map. Best-effort: the frontend calls this right after login when the
     *  geolocation permission is granted; failure here never affects the session. */
    @PostMapping("/location")
    public ResponseEntity<Void> location(@RequestBody LocationUpdate req, Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        AppUser u = users.findById(auth.getName()).orElse(null);
        if (u == null) return ResponseEntity.status(401).build();
        u.setLastLat(req.latitude());
        u.setLastLng(req.longitude());
        u.setLastAccuracy(req.accuracy());
        u.setLastLocatedAt(java.time.Instant.now());
        users.save(u);
        return ResponseEntity.noContent().build();
    }

    /** Self-service password reset: generates a temporary password and emails it. Always 204 so
     *  callers cannot probe whether an email is registered. Skips disabled accounts and
     *  collecteur-only accounts (they sign in with phone + PIN, not email + password). */
    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        AppUser u = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        if (u != null && u.isEnabled() && usesEmailPassword(u)) {
            String temp = TempPasswordGenerator.password();
            u.setPasswordHash(encoder.encode(temp));
            u.setMustChangePassword(true);
            users.save(u);
            email.sendPasswordReset(u.getEmail(), u.getName(), temp);
        }
        return ResponseEntity.noContent().build();
    }

    /** True when the account may sign in with email + password (not collecteur-only). */
    private static boolean usesEmailPassword(AppUser u) {
        var roles = u.effectiveRoles();
        return !(roles.size() == 1 && roles.contains(Role.COLLECTEUR));
    }

    /** Any logged-in user changes their own password. Clears the forced-change flag on success. */
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest req, Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        // getName() = the JWT subject (user id) in production, and stays safe under test principals.
        AppUser u = users.findById(auth.getName()).orElse(null);
        if (u == null) return ResponseEntity.status(401).build();
        if (!encoder.matches(req.currentPassword(), u.getPasswordHash())) {
            return ResponseEntity.badRequest().body(new ErrorResponse("wrong_current_password"));
        }
        String err = PasswordPolicy.validate(req.newPassword());
        if (err != null) return ResponseEntity.badRequest().body(new ErrorResponse(err));
        if (encoder.matches(req.newPassword(), u.getPasswordHash())) {
            return ResponseEntity.badRequest().body(new ErrorResponse("password_unchanged"));
        }
        u.setPasswordHash(encoder.encode(req.newPassword()));
        u.setMustChangePassword(false);
        users.save(u);
        return ResponseEntity.ok(UserDto.of(u));
    }
}
