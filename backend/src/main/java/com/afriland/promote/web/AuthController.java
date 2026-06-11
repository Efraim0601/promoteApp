package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.security.JwtService;
import com.afriland.promote.security.PasswordPolicy;
import com.afriland.promote.service.LoginAuditService;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final LoginAuditService audit;

    public AuthController(AppUserRepository users, PasswordEncoder encoder, JwtService jwt, LoginAuditService audit) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.audit = audit;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req, HttpServletRequest request) {
        AppUser u = users.findByEmailIgnoreCase(req.email()).orElse(null);
        if (u == null || !encoder.matches(req.password(), u.getPasswordHash())) {
            audit.record(req.email(), null, false, "invalid_credentials", request);
            return ResponseEntity.status(401).body("invalid_credentials");
        }
        if (!u.isEnabled()) {
            audit.record(req.email(), u, false, "account_disabled", request);
            return ResponseEntity.status(403).body("account_disabled");
        }
        audit.record(req.email(), u, true, "ok", request);
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
