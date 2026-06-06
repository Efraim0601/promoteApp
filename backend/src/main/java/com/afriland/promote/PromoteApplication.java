package com.afriland.promote;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

// Security is fully custom (JWT + DB-backed login in AuthController), so there is no
// UserDetailsService / AuthenticationManager bean. Without this exclusion Spring Boot would
// auto-create a throwaway in-memory user with a random password and log a misleading
// "Using generated security password" warning on every startup — that user is never used.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class PromoteApplication {
    public static void main(String[] args) {
        SpringApplication.run(PromoteApplication.class, args);
    }
}
