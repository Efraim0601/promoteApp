package com.afriland.promote.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends transactional emails (account creation with a temporary password). Best-effort: a missing
 * mail configuration or an SMTP failure never breaks the calling flow — it is logged, and the
 * temporary password is also returned in the API response as a fallback for the admin.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final ObjectProvider<JavaMailSender> mailSender;   // absent if spring.mail is not configured
    private final boolean enabled;
    private final String from;
    private final String publicUrl;

    public EmailService(ObjectProvider<JavaMailSender> mailSender,
                        @Value("${app.mail.enabled:true}") boolean enabled,
                        @Value("${app.mail.from:}") String from,
                        @Value("${app.public-url:}") String publicUrl) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.from = from;
        this.publicUrl = publicUrl;
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
        String base = publicUrl == null ? "" : publicUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/client")) base = base.substring(0, base.length() - "/client".length());
        return base + "/login";
    }

    private void send(String to, String subject, String body) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (!enabled || sender == null) {
            log.info("Email non envoyé (enabled={}, sender={}) à {}", enabled, sender != null, to);
            return;
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            if (from != null && !from.isBlank()) msg.setFrom(from);
            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(body);
            sender.send(msg);
            log.info("Email envoyé à {}", to);
        } catch (Exception e) {
            // Never fail the caller (e.g. the bulk import) because mail is down.
            log.warn("Échec d'envoi d'email à {} : {}", to, e.getMessage());
        }
    }
}
