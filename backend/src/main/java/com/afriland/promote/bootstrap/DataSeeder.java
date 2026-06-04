package com.afriland.promote.bootstrap;

import com.afriland.promote.model.*;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.service.SubscriptionService;
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

    public DataSeeder(AppUserRepository users, CardConfigRepository configs, SubscriptionRepository subs,
                      SubscriptionService service, PasswordEncoder encoder) {
        this.users = users;
        this.configs = configs;
        this.subs = subs;
        this.service = service;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        seedConfig();
        seedUsers();
        seedSubscriptions();
        service.initSequence();
    }

    private void seedConfig() {
        if (configs.findById(1L).isEmpty()) {
            configs.save(CardConfig.builder().id(1L).price(5000).fees(500).transport(1000).build());
        }
    }

    private void seedUsers() {
        if (users.count() > 0) return;
        String pw = encoder.encode("promote");
        users.saveAll(List.of(
                AppUser.builder().id("admin").name("Direction Promote").email("admin@afrilandfirstbank.com")
                        .passwordHash(pw).role(Role.ADMIN).build(),
                AppUser.builder().id("a1").name("Awa Fall").email("awa.fall@afrilandfirstbank.com")
                        .passwordHash(pw).role(Role.AGENT).agency("Agence Akwa").phone("699123456").build(),
                AppUser.builder().id("a2").name("Jean Eyenga").email("jean.eyenga@afrilandfirstbank.com")
                        .passwordHash(pw).role(Role.AGENT).agency("Agence Bonanjo").phone("677889900").build(),
                AppUser.builder().id("a3").name("Mariam Bello").email("mariam.bello@afrilandfirstbank.com")
                        .passwordHash(pw).role(Role.AGENT).agency("Agence Yaoundé Centre").phone("690445566").build(),
                AppUser.builder().id("print1").name("Point d'impression").email("print@afrilandfirstbank.com")
                        .passwordHash(pw).role(Role.PRINT_AGENT).agency("Point Promote").build()
        ));
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
