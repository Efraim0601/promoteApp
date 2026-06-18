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
                .requestMatchers("/api/auth/login-phone").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/forgot-password").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/config").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/agencies").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/agents/resolve").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/subscriptions/self").permitAll()
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/pay").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*/status").permitAll()
                // ---- public: card recharge (open path) ----
                .requestMatchers(HttpMethod.POST, "/api/recharges").permitAll()
                .requestMatchers(HttpMethod.PATCH, "/api/recharges/*/pay").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/recharges/*/status").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/kyc/image").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/kyc/receipt").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/kyc/cni-ocr").permitAll()
                // ---- payment aggregator: webhook (push) + which provider is live ----
                .requestMatchers(HttpMethod.POST, "/api/payment/webhook/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/payment/provider").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/payment/reconcile").hasRole("ADMIN")
                .requestMatchers("/actuator/health", "/h2-console/**").permitAll()
                // Validation errors on public endpoints re-dispatch to /error — permit it so the real
                // 4xx status reaches the client instead of being masked as 403 for anonymous callers.
                .requestMatchers("/error").permitAll()

                // ---- profile / habilitation management (admin only) ----
                .requestMatchers("/api/profiles/**").hasRole("ADMIN")

                // ---- catalog: read = any authenticated staff; write = manager/admin ----
                .requestMatchers(HttpMethod.GET, "/api/products/**").authenticated()
                .requestMatchers("/api/products/**").hasAnyRole("ADMIN", "MANAGER")

                // ---- commissions: own ledger = any staff; rules + global ledger = manager/admin ----
                .requestMatchers(HttpMethod.GET, "/api/commissions/mine").authenticated()
                .requestMatchers("/api/commissions/**").hasAnyRole("ADMIN", "MANAGER")

                // ---- team roster + messaging: the management chain (server scopes to the sub-tree) ----
                .requestMatchers("/api/team/**").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR", "CHEF_EQUIPE")

                // ---- admin (+ manager: quasi-admin commercial) ----
                .requestMatchers(HttpMethod.PUT, "/api/config").hasAnyRole("ADMIN", "MANAGER")
                .requestMatchers(HttpMethod.GET, "/api/subscriptions").hasAnyRole("ADMIN", "MANAGER")
                .requestMatchers(HttpMethod.GET, "/api/agents").hasRole("ADMIN")
                .requestMatchers("/api/agencies/**").hasRole("ADMIN")
                // User management: role changes + import are ADMIN-only; listing, creation, update and
                // enable/disable are also open to the MANAGER (full scope) and the SUPERVISEUR
                // (restricted to collecteurs in the controller).
                .requestMatchers(HttpMethod.PUT, "/api/users/*/roles").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/users/*").hasAnyRole("ADMIN", "MANAGER")
                .requestMatchers(HttpMethod.POST, "/api/users/import").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/users").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                .requestMatchers(HttpMethod.POST, "/api/users").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                .requestMatchers(HttpMethod.POST, "/api/users/*/recreate").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                .requestMatchers(HttpMethod.POST, "/api/users/*/reset-credentials").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                .requestMatchers(HttpMethod.PATCH, "/api/users/*/enabled").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                .requestMatchers("/api/users/**").hasRole("ADMIN")
                .requestMatchers("/api/stats/admin").hasAnyRole("ADMIN", "MANAGER")
                .requestMatchers("/api/stats/payments").hasRole("ADMIN")
                .requestMatchers("/api/stats/dashboard").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                // Hierarchy-scoped stats: the service bounds the data to the caller's sub-tree.
                .requestMatchers("/api/stats/hierarchy").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR", "CHEF_EQUIPE")
                // Supervisor daily reconciliation across ALL print agents / cashiers. Declared BEFORE the
                // per-user "/api/stats/print/**" matcher below so it isn't captured by it.
                .requestMatchers("/api/stats/print/supervision", "/api/stats/cashier/supervision")
                        .hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                // Notifications: send = admin/manager/supervisor/team-lead; read/mark = any authenticated user
                .requestMatchers(HttpMethod.POST, "/api/notifications").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR", "CHEF_EQUIPE")
                .requestMatchers("/api/map/**").hasRole("ADMIN")
                // Cashier validates the effective recharge, so it needs to list recharges + the queue.
                .requestMatchers(HttpMethod.GET, "/api/recharges").hasAnyRole("CASHIER", "ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/recharges/pending-fulfillment").hasAnyRole("CASHIER", "ADMIN")
                .requestMatchers("/api/audit/**").hasRole("ADMIN")
                // Per-row collecte list: admin/manager AND the collecte supervisor (for the detail
                // export on the stats page — same global scope as the stats they already see).
                .requestMatchers(HttpMethod.GET, "/api/collectes").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")
                // Collecte stats: admin/manager AND the dedicated collecte supervisor (separate stats view).
                .requestMatchers(HttpMethod.GET, "/api/collectes/stats").hasAnyRole("ADMIN", "MANAGER", "SUPERVISEUR")

                // ---- collecteur — capture + manage own bank-product sales (admin: everything) ----
                .requestMatchers(HttpMethod.GET, "/api/collectes/mine").hasAnyRole("COLLECTEUR", "ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/collectes").hasAnyRole("COLLECTEUR", "ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/collectes/*").hasAnyRole("COLLECTEUR", "ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/collectes/*").hasAnyRole("COLLECTEUR", "ADMIN")

                // ---- relationship officer (+ cashier, who may also create subscriptions) ----
                .requestMatchers(HttpMethod.POST, "/api/subscriptions").hasAnyRole("AGENT", "CASHIER")
                .requestMatchers("/api/subscriptions/mine").hasRole("AGENT")
                .requestMatchers("/api/subscriptions/claim").hasRole("AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/niu").hasAnyRole("AGENT", "ADMIN")
                .requestMatchers("/api/stats/agent").hasRole("AGENT")
                .requestMatchers("/api/stats/print", "/api/stats/print/**").hasAnyRole("PRINT_AGENT", "ADMIN")
                .requestMatchers("/api/stats/cashier").hasAnyRole("CASHIER", "ADMIN")

                // ---- print point + cashier (also reachable by admin/agent) ----
                // The cashier looks a record up (search/fetch + selfie) to verify identity before taking cash.
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*/image/*").hasAnyRole("PRINT_AGENT", "CASHIER", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.GET, "/api/subscriptions/*").hasAnyRole("PRINT_AGENT", "CASHIER", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/print").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/photo").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/sara-validate").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                // ---- cashier — validate an in-person cash payment (cash → paid) ----
                .requestMatchers(HttpMethod.PATCH, "/api/subscriptions/*/cash-validate").hasAnyRole("CASHIER", "ADMIN")
                // ---- recharge staff validation (mirror the subscription roles) ----
                .requestMatchers(HttpMethod.GET, "/api/recharges/*/image/*").hasAnyRole("PRINT_AGENT", "CASHIER", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/recharges/*/sara-validate").hasAnyRole("PRINT_AGENT", "ADMIN", "AGENT")
                .requestMatchers(HttpMethod.PATCH, "/api/recharges/*/cash-validate").hasAnyRole("CASHIER", "ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/recharges/*/fulfill").hasAnyRole("CASHIER", "ADMIN")

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
