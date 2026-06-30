package com.afriland.promote.web;

import com.afriland.promote.email.EmailService;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.IntegrationSettings;
import com.afriland.promote.payment.TrustPayWayGateway;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.IntegrationSettingsService;
import com.afriland.promote.web.dto.Dtos.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Admin-only runtime configuration of the external integrations: the SMTP/email server and the
 * TrustPayWay payment aggregator. All endpoints require ADMIN (enforced in SecurityConfig).
 * Secrets (SMTP password, TrustPayWay secret key & webhook secret) are write-only: never returned,
 * and a blank value on update keeps the stored one.
 */
@Tag(name = "Paramètres", description = "Configuration SMTP et TrustPayWay (runtime)")
@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final IntegrationSettingsService settings;
    private final EmailService email;
    private final TrustPayWayGateway trustPayWay;
    private final AppUserRepository users;
    private final ActionAuditService audit;

    public SettingsController(IntegrationSettingsService settings, EmailService email,
                             TrustPayWayGateway trustPayWay, AppUserRepository users,
                             ActionAuditService audit) {
        this.settings = settings;
        this.email = email;
        this.trustPayWay = trustPayWay;
        this.users = users;
        this.audit = audit;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    // ---- SMTP --------------------------------------------------------------

    @GetMapping("/smtp")
    public SmtpSettingsDto getSmtp() {
        String pwd = settings.mailPassword();
        return new SmtpSettingsDto(settings.mailEnabled(), settings.mailHost(), settings.mailPort(),
                settings.mailUsername(), settings.mailFrom(), settings.mailFromName(),
                settings.publicUrl(), pwd != null && !pwd.isBlank());
    }

    @PutMapping("/smtp")
    public SmtpSettingsDto updateSmtp(@RequestBody SmtpSettingsUpdate req, Authentication auth) {
        IntegrationSettings s = settings.settings();
        s.setMailEnabled(req.enabled());
        s.setMailHost(blankToNull(req.host()));
        s.setMailPort(req.port() != null && req.port() > 0 ? req.port() : null);
        s.setMailUsername(blankToNull(req.username()));
        s.setMailFrom(blankToNull(req.from()));
        s.setMailFromName(blankToNull(req.fromName()));
        s.setPublicUrl(blankToNull(req.publicUrl()));
        // A blank password keeps the stored one (write-only field).
        String pwd = blankToNull(req.password());
        if (pwd != null) s.setMailPassword(pwd);
        settings.save(s);
        audit.record(auth, "UPDATE_SETTINGS", "SETTINGS", "smtp",
                "Mise à jour SMTP : host=" + settings.mailHost() + " port=" + settings.mailPort()
                + " from=" + settings.mailFrom() + " enabled=" + settings.mailEnabled());
        return getSmtp();
    }

    @PostMapping("/smtp/test")
    public TestResult testSmtp(@RequestBody(required = false) TestEmailRequest req, Authentication auth) {
        String to = req == null ? null : blankToNull(req.to());
        if (to == null) {
            AppUser caller = auth == null ? null : users.findById(auth.getName()).orElse(null);
            to = caller == null ? null : caller.getEmail();
        }
        if (to == null) return new TestResult(false, "Aucune adresse destinataire.");
        String err = email.sendTest(to);
        return err == null
                ? new TestResult(true, "Email de test envoyé à " + to)
                : new TestResult(false, err);
    }

    // ---- TrustPayWay -------------------------------------------------------

    @GetMapping("/trustpayway")
    public TrustPayWaySettingsDto getTrustPayWay() {
        String secret = settings.tpwSecretKey();
        String webhook = settings.tpwWebhookSecret();
        return new TrustPayWaySettingsDto(settings.tpwBaseUrl(), settings.tpwApplicationId(),
                settings.tpwNotifUrl(), settings.tpwConnectTimeoutMs(), settings.tpwReadTimeoutMs(),
                settings.tpwStatusReadTimeoutMs(),
                secret != null && !secret.isBlank(), webhook != null && !webhook.isBlank());
    }

    @PutMapping("/trustpayway")
    public TrustPayWaySettingsDto updateTrustPayWay(@RequestBody TrustPayWaySettingsUpdate req,
                                                    Authentication auth) {
        IntegrationSettings s = settings.settings();
        s.setTpwBaseUrl(blankToNull(req.baseUrl()));
        s.setTpwApplicationId(blankToNull(req.applicationId()));
        s.setTpwNotifUrl(blankToNull(req.notifUrl()));
        s.setTpwConnectTimeoutMs(req.connectTimeoutMs() != null && req.connectTimeoutMs() > 0 ? req.connectTimeoutMs() : null);
        s.setTpwReadTimeoutMs(req.readTimeoutMs() != null && req.readTimeoutMs() > 0 ? req.readTimeoutMs() : null);
        s.setTpwStatusReadTimeoutMs(req.statusReadTimeoutMs() != null && req.statusReadTimeoutMs() > 0 ? req.statusReadTimeoutMs() : null);
        // Blank secrets keep the stored ones (write-only).
        String secret = blankToNull(req.secretKey());
        if (secret != null) s.setTpwSecretKey(secret);
        String webhook = blankToNull(req.webhookSecret());
        if (webhook != null) s.setTpwWebhookSecret(webhook);
        settings.save(s);
        audit.record(auth, "UPDATE_SETTINGS", "SETTINGS", "trustpayway",
                "Mise à jour TrustPayWay : baseUrl=" + settings.tpwBaseUrl()
                + " applicationId=" + settings.tpwApplicationId() + " notifUrl=" + settings.tpwNotifUrl());
        return getTrustPayWay();
    }

    @PostMapping("/trustpayway/test")
    public TestResult testTrustPayWay() {
        String err = trustPayWay.testConnection();
        return err == null
                ? new TestResult(true, "Connexion TrustPayWay réussie (login OK).")
                : new TestResult(false, err);
    }
}
