package com.afriland.promote.bootstrap;

import com.afriland.promote.model.*;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.service.SubscriptionService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Seeds demo accounts, default config and the 8 demo sales (ports app.jsx:seedTx)
 * on first start. Idempotent: skips when data already exists. Demo password = "promote".
 */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final long DAY = 86_400_000L;

    private final AppUserRepository users;
    private final CardConfigRepository configs;
    private final SubscriptionRepository subs;
    private final SubscriptionService service;
    private final PasswordEncoder encoder;

    // Real administrator account — set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in production.
    private final String adminEmail;
    private final String adminPassword;
    private final String adminName;
    private final boolean seedTestAgent;

    // Print point account (PRINT_AGENT) — set PRINT_EMAIL / PRINT_PASSWORD / PRINT_NAME in production.
    private final String printEmail;
    private final String printPassword;
    private final String printName;

    public DataSeeder(AppUserRepository users, CardConfigRepository configs, SubscriptionRepository subs,
                      SubscriptionService service, PasswordEncoder encoder,
                      @Value("${app.admin.email}") String adminEmail,
                      @Value("${app.admin.password}") String adminPassword,
                      @Value("${app.admin.name:Administrateur Promote}") String adminName,
                      @Value("${app.seed.test-agent:true}") boolean seedTestAgent,
                      @Value("${app.print.email}") String printEmail,
                      @Value("${app.print.password}") String printPassword,
                      @Value("${app.print.name:Point d'impression}") String printName) {
        this.users = users;
        this.configs = configs;
        this.subs = subs;
        this.service = service;
        this.encoder = encoder;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminName = adminName;
        this.seedTestAgent = seedTestAgent;
        this.printEmail = printEmail;
        this.printPassword = printPassword;
        this.printName = printName;
    }

    @Override
    public void run(String... args) {
        seedConfig();
        seedUsers();
        seedPrintAgent(); // independent of the first-boot guard, so it appears on existing deployments
        // No demo client-journey data is seeded: subscriptions start empty.
        service.initSequence();
    }

    private void seedConfig() {
        if (configs.findById(1L).isEmpty()) {
            configs.save(CardConfig.builder().id(1L).price(5000).fees(500).transport(1000).build());
        }
    }

    private void seedUsers() {
        if (users.count() > 0) return;
        // Real administrator, created from configuration (ADMIN_EMAIL / ADMIN_PASSWORD).
        users.save(AppUser.builder().id("admin").name(adminName).email(adminEmail)
                .passwordHash(encoder.encode(adminPassword)).role(Role.ADMIN).build());
        // Optional test relationship-officer account for acceptance testing.
        // (The print-point screen is also accessible to ADMIN and AGENT.)
        if (seedTestAgent) {
            users.save(AppUser.builder().id("a1").name("Awa Fall").email("awa.fall@afrilandfirstbank.com")
                    .passwordHash(encoder.encode("promote")).role(Role.AGENT).agency("Agence Akwa").phone("699123456").build());
        }
    }

    /** Ensure a print-point account exists (PRINT_AGENT). Idempotent by email, so it is created
     *  on existing deployments too — completing the three roles: ADMIN, AGENT, PRINT_AGENT. */
    private void seedPrintAgent() {
        if (users.findByEmailIgnoreCase(printEmail).isPresent()) return;
        users.save(AppUser.builder().id("print").name(printName).email(printEmail)
                .passwordHash(encoder.encode(printPassword)).role(Role.PRINT_AGENT).build());
    }

    /** Builds a demo subscription, mirroring app.jsx:seedTx's mk() helper. */
    private Subscription mk(int n, String name, String cni, String pay, String delivery,
                            int amount, PayStatus status, boolean printed, String channel, String agentId) {
        String phone = "+237 6" + String.valueOf(10_000_000L + (long) n * 1_234_567L).substring(0, 8);
        String cniExp = "12/0" + ((n % 8) + 1) + "/203" + (n % 6);
        Instant created = Instant.now().minus((long) ((n * 1.4 + 0.5) * 24 * 60), ChronoUnit.MINUTES);
        String[] parts = name.split(" ", 2);
        return Subscription.builder()
                .ref("PRM-" + (1000 + n))
                .prenom(parts[0]).nom(parts.length > 1 ? parts[1] : "")
                .fullName(name).cni(cni).cniExp(cniExp).phone(phone)
                .pay(pay).delivery(delivery).amount(amount)
                .transport("home".equals(delivery) ? 1000 : 0)
                .channel(channel).agentId(agentId)
                .payStatus(status).printed(printed).selfieVerified(true)
                .createdAt(created)
                .build();
    }

    private void seedSubscriptions() {
        if (subs.count() > 0) return;
        subs.saveAll(List.of(
                mk(1, "Yvan Ngameni", "112233445", "mtn", "promote", 5500, PayStatus.paid, true, "agent", "a1"),
                mk(2, "Sandrine Eto", "556677889", "om", "home", 6500, PayStatus.paid, false, "agent", "a1"),
                mk(3, "Paul Mbarga", "221144668", "cash", "agence", 5500, PayStatus.cash, false, "agent", "a1"),
                mk(4, "Aïcha Mballa", "998877665", "mtn", "promote", 5500, PayStatus.paid, false, "agent", "a2"),
                mk(5, "Brice Talla", "334455667", "om", "promote", 5500, PayStatus.failed, false, "agent", "a2"),
                mk(6, "Fadimatou Aliou", "778899001", "cash", "home", 6500, PayStatus.cash, false, "agent", "a3"),
                mk(7, "Régine Atangana", "445566778", "om", "home", 6500, PayStatus.paid, false, "self", null),
                mk(8, "Cédric Owona", "660022884", "mtn", "promote", 5500, PayStatus.paid, true, "self", null)
        ));
    }
}
