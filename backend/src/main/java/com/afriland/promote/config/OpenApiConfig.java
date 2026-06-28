package com.afriland.promote.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

/** OpenAPI 3 specification + Swagger UI for the Promote REST API. */
@Configuration
public class OpenApiConfig {

    private static final String BEARER = "bearerAuth";

    @Bean
    public OpenAPI promoteOpenApi(@Value("${app.public-url:http://localhost:8973}") String publicUrl) {
        String local = "http://localhost:8973";
        List<Server> servers = new ArrayList<>();
        if (publicUrl != null && !publicUrl.isBlank() && !publicUrl.equals(local)) {
            servers.add(new Server().url(publicUrl.trim()).description("Production"));
        }
        servers.add(new Server().url(local).description("Local (Docker)"));

        return new OpenAPI()
                .info(new Info()
                        .title("Afriland Promote — API REST")
                        .description("""
                                Portail de souscription carte prépayée / bancaire Afriland First Bank.

                                **Authentification staff** : `POST /api/auth/login` avec email + mot de passe, \
                                puis bouton **Authorize** ci-dessus avec `Bearer <token_jwt>`.

                                **Collecteur** : `POST /api/auth/login-phone` (téléphone 9 chiffres + PIN 4 chiffres).

                                Les endpoints marqués publics (config, catalogue lecture, parcours client) \
                                fonctionnent sans token.""")
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Afriland First Bank — Promote")
                                .email("admin.promote@afrilandfirstbank.com"))
                        .license(new License().name("Usage interne Afriland")))
                .servers(servers)
                .components(new Components().addSecuritySchemes(BEARER,
                        new SecurityScheme()
                                .name(BEARER)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT obtenu via POST /api/auth/login ou /api/auth/login-phone")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER));
    }
}
