package com.afriland.promote.service;

import com.afriland.promote.model.IntegrationSettings;
import com.afriland.promote.payment.TrustPayWayProperties;
import com.afriland.promote.repo.IntegrationSettingsRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Single source of truth for runtime-editable integration settings (SMTP + TrustPayWay).
 *
 * <p>Each setting is resolved as: the value stored in the {@code integration_settings} row if an
 * admin set one, otherwise the environment/application.yml default. This keeps the platform's
 * behaviour identical to before until an override is saved from the admin UI, while letting the
 * SMTP server and the payment aggregator be reconfigured at runtime (no restart needed).
 */
@Service
public class IntegrationSettingsService {

    private final IntegrationSettingsRepository repo;
    private final TrustPayWayProperties tpwDefaults;

    // ---- SMTP / email defaults (application.yml) ----
    private final String defMailHost;
    private final int defMailPort;
    private final String defMailUsername;
    private final String defMailPassword;
    private final boolean defMailEnabled;
    private final String defMailFrom;
    private final String defMailFromName;
    private final String defPublicUrl;

    public IntegrationSettingsService(
            IntegrationSettingsRepository repo,
            TrustPayWayProperties tpwDefaults,
            @Value("${spring.mail.host:}") String defMailHost,
            @Value("${spring.mail.port:587}") int defMailPort,
            @Value("${spring.mail.username:}") String defMailUsername,
            @Value("${spring.mail.password:}") String defMailPassword,
            @Value("${app.mail.enabled:true}") boolean defMailEnabled,
            @Value("${app.mail.from:}") String defMailFrom,
            @Value("${app.mail.from-name:Afriland Carte Promote}") String defMailFromName,
            @Value("${app.public-url:}") String defPublicUrl) {
        this.repo = repo;
        this.tpwDefaults = tpwDefaults;
        this.defMailHost = defMailHost;
        this.defMailPort = defMailPort;
        this.defMailUsername = defMailUsername;
        this.defMailPassword = defMailPassword;
        this.defMailEnabled = defMailEnabled;
        this.defMailFrom = defMailFrom;
        this.defMailFromName = defMailFromName;
        this.defPublicUrl = defPublicUrl;
    }

    /** Load the singleton row (id = 1), creating an empty one (all overrides null) on first use. */
    @Transactional
    public IntegrationSettings settings() {
        return repo.findById(1L).orElseGet(() -> repo.save(
                IntegrationSettings.builder().id(1L).build()));
    }

    @Transactional
    public IntegrationSettings save(IntegrationSettings s) {
        s.setId(1L);
        return repo.save(s);
    }

    private static String pick(String override, String def) {
        return override != null && !override.isBlank() ? override.trim() : def;
    }

    // ---- effective SMTP / email -------------------------------------------
    public boolean mailEnabled() { IntegrationSettings s = settings(); return s.getMailEnabled() != null ? s.getMailEnabled() : defMailEnabled; }
    public String mailHost()     { return pick(settings().getMailHost(), defMailHost); }
    public int mailPort()        { Integer p = settings().getMailPort(); return p != null && p > 0 ? p : defMailPort; }
    public String mailUsername() { return pick(settings().getMailUsername(), defMailUsername); }
    public String mailPassword() { return pick(settings().getMailPassword(), defMailPassword); }
    public String mailFromName() { return pick(settings().getMailFromName(), defMailFromName); }
    public String publicUrl()    { return pick(settings().getPublicUrl(), defPublicUrl); }
    /** From address: explicit override → yaml default → fall back to the SMTP username. */
    public String mailFrom() {
        String f = pick(settings().getMailFrom(), defMailFrom);
        return f != null && !f.isBlank() ? f : mailUsername();
    }

    // ---- effective TrustPayWay --------------------------------------------
    public String tpwBaseUrl()       { return pick(settings().getTpwBaseUrl(), tpwDefaults.getBaseUrl()); }
    public String tpwSecretKey()     { return pick(settings().getTpwSecretKey(), tpwDefaults.getSecretKey()); }
    public String tpwApplicationId() { return pick(settings().getTpwApplicationId(), tpwDefaults.getApplicationId()); }
    public String tpwNotifUrl()      { return pick(settings().getTpwNotifUrl(), tpwDefaults.getNotifUrl()); }
    public String tpwWebhookSecret() { return pick(settings().getTpwWebhookSecret(), tpwDefaults.getWebhookSecret()); }
    public int tpwConnectTimeoutMs() { Integer v = settings().getTpwConnectTimeoutMs(); return v != null && v > 0 ? v : tpwDefaults.getConnectTimeoutMs(); }
    public int tpwReadTimeoutMs()    { Integer v = settings().getTpwReadTimeoutMs(); return v != null && v > 0 ? v : tpwDefaults.getReadTimeoutMs(); }
    public int tpwStatusReadTimeoutMs() { Integer v = settings().getTpwStatusReadTimeoutMs(); return v != null && v > 0 ? v : tpwDefaults.getStatusReadTimeoutMs(); }
}
