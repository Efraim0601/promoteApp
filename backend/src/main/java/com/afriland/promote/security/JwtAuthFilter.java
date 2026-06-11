package com.afriland.promote.security;

import com.afriland.promote.repo.AppUserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Reads the Bearer token, validates it and populates the SecurityContext. */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final AppUserRepository users;

    public JwtAuthFilter(JwtService jwtService, AppUserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                Claims claims = jwtService.parse(header.substring(7));
                // Grant one authority per role the account holds. New tokens carry "roles" (the full
                // set); older tokens only have "role" — fall back to it for a seamless migration.
                String rolesClaim = claims.get("roles", String.class);
                String roleClaim = claims.get("role", String.class);
                String csv = (rolesClaim != null && !rolesClaim.isBlank()) ? rolesClaim : roleClaim;
                List<SimpleGrantedAuthority> authorities = csv == null ? List.of()
                        : java.util.Arrays.stream(csv.split(","))
                            .map(String::trim).filter(s -> !s.isEmpty())
                            .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                            .toList();
                // Reject a token whose account has since been disabled (or deleted): the
                // authentication is simply not set, so protected endpoints answer 401/403.
                boolean active = users.findById(claims.getSubject()).map(u -> u.isEnabled()).orElse(false);
                if (active && !authorities.isEmpty()) {
                    var auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(), null, authorities);
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (Exception ignored) {
                // invalid/expired token → stays anonymous, protected endpoints will 401/403
            }
        }
        chain.doFilter(request, response);
    }
}
