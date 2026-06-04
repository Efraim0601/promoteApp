package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.security.JwtService;
import com.afriland.promote.web.dto.Dtos.*;
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

    public AuthController(AppUserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        return users.findByEmailIgnoreCase(req.email())
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(new LoginResponse(jwt.generate(u), UserDto.of(u))))
                .orElseGet(() -> ResponseEntity.status(401).body("invalid_credentials"));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        AppUser u = users.findById((String) auth.getPrincipal()).orElse(null);
        return u == null ? ResponseEntity.status(401).build() : ResponseEntity.ok(UserDto.of(u));
    }
}
