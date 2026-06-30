package com.afriland.promote.email;

import com.afriland.promote.service.IntegrationSettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

import java.util.Properties;

/**
 * Sends transactional emails (account creation with a temporary password). Best-effort: a missing
 * mail configuration or an SMTP failure never breaks the calling flow — it is logged, and the
 * temporary password is also returned in the API response as a fallback for the admin.
 *
 * <p>SMTP connection settings are read fresh from {@link IntegrationSettingsService} on every send
 * (admin overrides in the DB, otherwise the application.yml/env defaults), so the mail server can be
 * reconfigured at runtime from the admin UI without a restart.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final IntegrationSettingsService settings;

    public EmailService(IntegrationSettingsService settings) {
        this.settings = settings;
    }

    /** Build a mail sender from the current effective SMTP settings (STARTTLS, auth on). */
    private JavaMailSenderImpl buildSender() {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(settings.mailHost());
        sender.setPort(settings.mailPort());
        sender.setUsername(settings.mailUsername());
        sender.setPassword(settings.mailPassword());
        sender.setDefaultEncoding("UTF-8");
        Properties p = sender.getJavaMailProperties();
        p.put("mail.transport.protocol", "smtp");
        p.put("mail.smtp.auth", "true");
        p.put("mail.smtp.starttls.enable", "true");
        p.put("mail.smtp.starttls.required", "true");
        return sender;
    }

    /**
     * Send a one-off test message with the current SMTP settings. Unlike the transactional sends,
     * this propagates the failure (returns the error message) so the admin sees why a test failed.
     * @return null on success, or a human-readable error message on failure.
     */
    public String sendTest(String to) {
        if (settings.mailHost() == null || settings.mailHost().isBlank()) {
            return "Aucun serveur SMTP configuré (host vide).";
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            String fromAddr = settings.mailFrom();
            if (fromAddr != null && !fromAddr.isBlank()) msg.setFrom(fromAddr);
            msg.setTo(to);
            msg.setSubject("Test SMTP — Afriland Carte Promote");
            msg.setText("""
                    Ceci est un email de test envoyé depuis l'interface d'administration
                    Afriland — Carte Promote. Si vous recevez ce message, la configuration
                    SMTP est fonctionnelle.

                    — Afriland First Bank
                    """);
            buildSender().send(msg);
            log.info("Email de test envoyé à {}", to);
            return null;
        } catch (Exception e) {
            log.warn("Échec de l'email de test à {} : {}", to, e.getMessage());
            return e.getMessage();
        }
    }

    /**
     * Admin-initiated credential reset for an existing active account. {@code tempPassword} and/or
     * {@code pin} may be set depending on the user's roles (collecteur-only accounts get phone + PIN).
     */
    public void sendCredentialsReset(String to, String name, String tempPassword, String pin, String phone) {
        boolean hasPw = tempPassword != null && !tempPassword.isBlank();
        boolean hasPin = pin != null && !pin.isBlank();
        if (hasPin && !hasPw) {
            String subject = "Réinitialisation de vos identifiants — Afriland Carte Promote";
            String body = """
                    Bonjour %s,

                    Un administrateur a réinitialisé vos identifiants de connexion sur la plateforme Afriland — Carte Promote.

                    Lien de connexion : %s
                    Identifiant (téléphone) : %s
                    Code PIN temporaire     : %s

                    Utilisez votre numéro de téléphone et ce code PIN pour vous connecter.

                    Si vous n'êtes pas à l'origine de cette demande, contactez un administrateur.

                    — Afriland First Bank
                    """.formatted(name == null ? "" : name, loginUrl(), phone == null ? "" : phone, pin);
            send(to, subject, body);
            return;
        }
        if (hasPw && hasPin) {
            String subject = "Réinitialisation de vos identifiants — Afriland Carte Promote";
            String body = """
                    Bonjour %s,

                    Un administrateur a réinitialisé vos identifiants de connexion sur la plateforme Afriland — Carte Promote.

                    Lien de connexion : %s
                    Identifiant (email) : %s
                    Mot de passe temporaire : %s
                    Code PIN collecteur     : %s

                    Pour votre sécurité, vous devrez définir un nouveau mot de passe lors de votre prochaine connexion par email.
                    Le code PIN sert à la connexion collecteur avec votre numéro de téléphone.

                    Si vous n'êtes pas à l'origine de cette demande, contactez un administrateur.

                    — Afriland First Bank
                    """.formatted(name == null ? "" : name, loginUrl(), to, tempPassword, pin);
            send(to, subject, body);
            return;
        }
        if (hasPw) {
            String subject = "Réinitialisation de vos identifiants — Afriland Carte Promote";
            String body = """
                    Bonjour %s,

                    Un administrateur a réinitialisé vos identifiants de connexion sur la plateforme Afriland — Carte Promote.

                    Lien de connexion : %s
                    Identifiant       : %s
                    Mot de passe temporaire : %s

                    Pour votre sécurité, vous devrez définir un nouveau mot de passe lors de votre prochaine connexion.

                    Si vous n'êtes pas à l'origine de cette demande, contactez un administrateur.

                    — Afriland First Bank
                    """.formatted(name == null ? "" : name, loginUrl(), to, tempPassword);
            send(to, subject, body);
        }
    }

    /** Password reset: new temporary password (the user must change it on next login). */
    public void sendPasswordReset(String to, String name, String tempPassword) {
        String subject = "Réinitialisation de mot de passe — Afriland Carte Promote";
        String body = """
                Bonjour %s,

                Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme Afriland — Carte Promote.

                Lien de connexion : %s
                Identifiant       : %s
                Mot de passe temporaire : %s

                Pour votre sécurité, vous devrez définir un nouveau mot de passe lors de votre prochaine connexion.

                Si vous n'êtes pas à l'origine de cette demande, contactez un administrateur.

                — Afriland First Bank
                """.formatted(name == null ? "" : name, loginUrl(), to, tempPassword);
        send(to, subject, body);
    }

    /** Welcome email: login link + identifier + temporary password (the user must change it on first login). */
    public void sendAccountCreated(String to, String name, String tempPassword) {
        String subject = "Votre compte — Afriland Carte Promote";
        String body = """
                Bonjour %s,

                Un compte vient d'être créé pour vous sur la plateforme Afriland — Carte Promote.

                Lien de connexion : %s
                Identifiant       : %s
                Mot de passe temporaire : %s

                Pour votre sécurité, vous devrez définir un nouveau mot de passe lors de votre première connexion.

                — Afriland First Bank
                """.formatted(name == null ? "" : name, loginUrl(), to, tempPassword);
        send(to, subject, body);
    }

    /**
     * Login link for the welcome email. Built from the app base URL so the new user lands directly
     * on the sign-in page (not the public /client subscription form). Tolerant of how
     * {@code app.public-url} is configured: a trailing slash or a trailing {@code /client} segment is
     * stripped before appending {@code /login}.
     */
    String loginUrl() {
        String pub = settings.publicUrl();
        String base = pub == null ? "" : pub.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/client")) base = base.substring(0, base.length() - "/client".length());
        return base + "/login";
    }

    private void send(String to, String subject, String body) {
        boolean enabled = settings.mailEnabled();
        String host = settings.mailHost();
        if (!enabled || host == null || host.isBlank()) {
            log.info("Email non envoyé (enabled={}, host={}) à {}", enabled, host, to);
            return;
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            String from = settings.mailFrom();
            if (from != null && !from.isBlank()) msg.setFrom(from);
            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(body);
            buildSender().send(msg);
            log.info("Email envoyé à {}", to);
        } catch (Exception e) {
            // Never fail the caller (e.g. the bulk import) because mail is down.
            log.warn("Échec d'envoi d'email à {} : {}", to, e.getMessage());
        }
    }
}
