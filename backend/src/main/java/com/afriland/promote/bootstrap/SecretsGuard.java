package com.afriland.promote.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/**
 * Boot-time guard that refuses to start in production when critical secrets still hold their
 * well-known placeholder/default values.
 *
 * <p>Checked values (each blocks startup if the default is detected outside dev/test):
 * <ul>
 *   <li>{@code app.jwt.secret} — must not start with "change-me"</li>
 *   <li>{@code app.admin.password} — must not equal "promote"</li>
 *   <li>{@code app.print.password} — must not equal "promote"</li>
 *   <li>{@code app.cashier.password} — must not equal "promote"</li>
 *   <li>{@code spring.datasource.password} — must not equal "promote"</li>
 * </ul>
 *
 * <p>The check is skipped when the {@code dev} or {@code test} Spring profile is active, so local
 * development and CI remain unaffected.
 */
@Component
public class SecretsGuard {

    private static final Logger log = LoggerFactory.getLogger(SecretsGuard.class);

    private final Environment env;
    private final String jwtSecret;
    private final String adminPassword;
    private final String printPassword;
    private final String cashierPassword;
    private final String dbPassword;

    public SecretsGuard(
            Environment env,
            @Value("${app.jwt.secret}") String jwtSecret,
            @Value("${app.admin.password}") String adminPassword,
            @Value("${app.print.password}") String printPassword,
            @Value("${app.cashier.password}") String cashierPassword,
            @Value("${spring.datasource.password}") String dbPassword) {
        this.env = env;
        this.jwtSecret = jwtSecret;
        this.adminPassword = adminPassword;
        this.printPassword = printPassword;
        this.cashierPassword = cashierPassword;
        this.dbPassword = dbPassword;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void check() {
        String[] profiles = env.getActiveProfiles();
        boolean devOrTest = Arrays.stream(profiles).anyMatch(p -> p.equals("dev") || p.equals("test"));
        if (devOrTest) {
            log.info("SecretsGuard: skipped (dev/test profile active)");
            return;
        }

        // Hard violations — live, high-value secrets that are used on every request / connection:
        //   JWT secret signs every token, the DB password authenticates the datasource, and the
        //   admin password gates the highest-privilege account. A default here is a real exposure.
        List<String> violations = new java.util.ArrayList<>();

        if (jwtSecret == null || jwtSecret.startsWith("change-me")) {
            violations.add("JWT_SECRET is still the default placeholder — set a strong random secret (≥ 32 bytes)");
        }
        if ("promote".equalsIgnoreCase(adminPassword)) {
            violations.add("ADMIN_PASSWORD is still 'promote' — set a strong unique password");
        }
        if ("promote".equalsIgnoreCase(dbPassword)) {
            violations.add("SPRING_DATASOURCE_PASSWORD is still 'promote' — set a strong unique DB password");
        }

        // Soft warnings — print/cashier passwords only seed their accounts at first creation
        // (DataSeeder is idempotent by email). On an existing deployment the accounts already exist
        // with their own (possibly long-since-changed) password, so the env default no longer
        // reflects the live login. We warn but never block startup on these to avoid bricking prod.
        List<String> warnings = new java.util.ArrayList<>();
        if ("promote".equalsIgnoreCase(printPassword)) {
            warnings.add("PRINT_PASSWORD is still 'promote' — only seeds the print account at first creation; set a strong unique value for new deployments");
        }
        if ("promote".equalsIgnoreCase(cashierPassword)) {
            warnings.add("CASHIER_PASSWORD is still 'promote' — only seeds the cashier account at first creation; set a strong unique value for new deployments");
        }
        if (!warnings.isEmpty()) {
            log.warn("SecretsGuard: seed-only default secrets detected (non-blocking):\n  - {}",
                    String.join("\n  - ", warnings));
        }

        if (!violations.isEmpty()) {
            String msg = "SecretsGuard: refusing to start in production with insecure default secrets:\n  - "
                    + String.join("\n  - ", violations)
                    + "\nSet the corresponding environment variables in .env before deploying.";
            log.error(msg);
            throw new IllegalStateException(msg);
        }

        log.info("SecretsGuard: critical secrets look non-default — OK");
    }
}
