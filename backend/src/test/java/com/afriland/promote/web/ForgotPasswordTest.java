package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Self-service password reset: temp password emailed, forced change on next login. */
@SpringBootTest
@AutoConfigureMockMvc
class ForgotPasswordTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    private static final String EMAIL = "reset.me@test.cm";

    @BeforeEach
    void seed() {
        users.deleteAll();
        AppUser u = new AppUser();
        u.setId("u-reset");
        u.setName("Reset User");
        u.setEmail(EMAIL);
        u.setPasswordHash(encoder.encode("OldPass1"));
        u.setRole(Role.AGENT);
        u.setMustChangePassword(false);
        users.save(u);
    }

    @Test
    void resetsPasswordForKnownEmail() throws Exception {
        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\"}"))
                .andExpect(status().isNoContent());

        AppUser after = users.findByEmailIgnoreCase(EMAIL).orElseThrow();
        assertTrue(after.isMustChangePassword());
        assertFalse(encoder.matches("OldPass1", after.getPasswordHash()));
    }

    @Test
    void unknownEmailStillReturnsNoContent() throws Exception {
        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@test.cm\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void collecteurOnlyAccountIsNotReset() throws Exception {
        users.deleteAll();
        AppUser c = AppUser.builder()
                .id("u-col")
                .name("Collecteur")
                .email("col@test.cm")
                .passwordHash(encoder.encode("unused"))
                .role(Role.COLLECTEUR)
                .phone("699111111")
                .loginPin(encoder.encode("1234"))
                .build();
        users.save(c);

        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"col@test.cm\"}"))
                .andExpect(status().isNoContent());

        assertTrue(encoder.matches("unused", users.findById("u-col").orElseThrow().getPasswordHash()));
    }
}
