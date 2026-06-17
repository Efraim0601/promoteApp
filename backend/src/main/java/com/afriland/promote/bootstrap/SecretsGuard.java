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

        List<String> violations = new java.util.ArrayList<>();

        if (jwtSecret == null || jwtSecret.startsWith("change-me")) {
            violations.add("JWT_SECRET is still the default placeholder — set a strong random secret (≥ 32 bytes)");
        }
        if ("promote".equalsIgnoreCase(adminPassword)) {
            violations.add("ADMIN_PASSWORD is still 'promote' — set a strong unique password");
        }
        if ("promote".equalsIgnoreCase(printPassword)) {
            violations.add("PRINT_PASSWORD is still 'promote' — set a strong unique password");
        }
        if ("promote".equalsIgnoreCase(cashierPassword)) {
            violations.add("CASHIER_PASSWORD is still 'promote' — set a strong unique password");
        }
        if ("promote".equalsIgnoreCase(dbPassword)) {
            violations.add("SPRING_DATASOURCE_PASSWORD is still 'promote' — set a strong unique DB password");
        }

        if (!violations.isEmpty()) {
            String msg = "SecretsGuard: refusing to start in production with insecure default secrets:\n  - "
                    + String.join("\n  - ", violations)
                    + "\nSet the corresponding environment variables in .env before deploying.";
            log.error(msg);
            throw new IllegalStateException(msg);
        }

        log.info("SecretsGuard: all secrets look non-default — OK");
    }
}
