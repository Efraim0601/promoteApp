package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

/**
 * Single configurable row (id = 1) holding runtime overrides for external integrations:
 * the SMTP/email server and the TrustPayWay payment aggregator. Every field is nullable —
 * a {@code null}/blank value means "fall back to the environment/application.yml default",
 * so the platform behaves exactly as before until an admin sets an override from the UI.
 */
@Entity
@Table(name = "integration_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IntegrationSettings {

    @Id
    private Long id;            // always 1 (singleton)

    // ---- SMTP / email ------------------------------------------------------
    private Boolean mailEnabled;
    private String mailHost;
    private Integer mailPort;
    private String mailUsername;
    @Column(length = 2048)
    private String mailPassword;   // sensitive — never returned to the client
    private String mailFrom;
    private String mailFromName;
    @Column(length = 1024)
    private String publicUrl;      // base URL used to build the login link in emails

    // ---- TrustPayWay payment aggregator ------------------------------------
    @Column(length = 1024)
    private String tpwBaseUrl;
    @Column(length = 2048)
    private String tpwSecretKey;   // sensitive
    private String tpwApplicationId;
    @Column(length = 1024)
    private String tpwNotifUrl;
    @Column(length = 2048)
    private String tpwWebhookSecret; // sensitive
    private Integer tpwConnectTimeoutMs;
    private Integer tpwReadTimeoutMs;
    private Integer tpwStatusReadTimeoutMs;
}
