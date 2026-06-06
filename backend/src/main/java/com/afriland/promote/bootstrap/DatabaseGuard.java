package com.afriland.promote.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Arrays;

/**
 * Boot-time safety guard for the database.
 *
 * <p>Logs the database actually in use, and <b>refuses to start on the in-memory H2 database</b>
 * unless the {@code dev} or {@code test} profile is active. This makes it impossible for a
 * production instance to silently run on H2 (which loses all data on restart): production must
 * persist in PostgreSQL. If H2 is detected without dev/test, startup fails fast with a clear
 * message instead of quietly accepting data that would vanish on the next restart.
 */
@Component
public class DatabaseGuard {

    private static final Logger log = LoggerFactory.getLogger(DatabaseGuard.class);

    private final DataSource dataSource;
    private final Environment env;

    public DatabaseGuard(DataSource dataSource, Environment env) {
        this.dataSource = dataSource;
        this.env = env;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void check() {
        String product, url;
        try (Connection c = dataSource.getConnection()) {
            product = c.getMetaData().getDatabaseProductName();
            url = c.getMetaData().getURL();
        } catch (Exception e) {
            log.warn("DatabaseGuard: could not inspect the datasource: {}", e.getMessage());
            return;
        }

        String[] profiles = env.getActiveProfiles();
        log.info("Database in use: {} [{}] — active profiles: {}",
                product, url, profiles.length == 0 ? "(default)" : Arrays.toString(profiles));

        boolean isH2 = (product != null && product.toLowerCase().contains("h2"))
                || (url != null && url.toLowerCase().startsWith("jdbc:h2"));
        boolean devOrTest = Arrays.stream(profiles).anyMatch(p -> p.equals("dev") || p.equals("test"));

        if (isH2 && !devOrTest) {
            throw new IllegalStateException(
                    "Refusing to start on the in-memory H2 database outside the 'dev'/'test' profile. "
                    + "Production data must persist in PostgreSQL — set SPRING_DATASOURCE_URL "
                    + "(jdbc:postgresql://…) and do not activate the 'dev' profile in production.");
        }
    }
}
