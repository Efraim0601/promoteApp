package com.afriland.promote.config;

import com.afriland.promote.security.JwtAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // ---- public: client (QR / self) path, no account ----
                .requestMatchers("/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/config").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/agents/resolve").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/subscriptions/self").permitAll()
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/pay").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*/status").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/kyc/image").permitAll()
                // ---- payment aggregator: webhook (push) + which provider is live ----
                .requestMatchers(HttpMethod.POST, "/api/payment/webhook/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/payment/provider").permitAll()
                .requestMatchers("/actuator/health", "/h2-console/**").permitAll()

                // ---- admin only ----
                .requestMatchers(HttpMethod.PUT, "/api/config").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/subscriptions").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/agents").hasRole("ADMIN")
                .requestMatchers("/api/users/**").hasRole("ADMIN")
                .requestMatchers("/api/stats/admin").hasRole("ADMIN")

                // ---- relationship officer ----
                .requestMatchers(HttpMethod.POST, "/api/subscriptions").hasRole("AGENT")
                .requestMatchers("/api/subscriptions/mine").hasRole("AGENT")
                .requestMatchers("/api/subscriptions/claim").hasRole("AGENT")
                .requestMatchers("/api/stats/agent").hasRole("AGENT")

                // ---- print point (also reachable by admin/agent) ----
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*/image/*").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/print").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")

                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        // allow H2 console frames in dev
        http.headers(h -> h.frameOptions(frame -> frame.disable()));
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsSource() {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::trim).toList());
        c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        c.setAllowedHeaders(List.of("*"));
        c.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", c);
        return src;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
