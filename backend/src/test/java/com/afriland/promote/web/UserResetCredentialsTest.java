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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Admin reset of login credentials on an active staff account. */
@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = {"ADMIN"})
class UserResetCredentialsTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void seedActiveAgent() {
        AppUser u = users.findById("u-reset-active").orElseGet(() -> AppUser.builder()
                .id("u-reset-active").build());
        u.setName("Active Agent");
        u.setEmail("reset-active@test.cm");
        u.setRole(Role.AGENT);
        u.setPhone("690000011");
        u.setPasswordHash(encoder.encode("OldPass1"));
        u.setMustChangePassword(false);
        u.setEnabled(true);
        users.save(u);
    }

    @Test
    void resetCredentialsOnActiveAccount() throws Exception {
        mvc.perform(post("/api/users/u-reset-active/reset-credentials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.enabled").value(true))
                .andExpect(jsonPath("$.tempPassword").isNotEmpty());

        AppUser u = users.findById("u-reset-active").orElseThrow();
        assertTrue(u.isEnabled());
        assertTrue(u.isMustChangePassword());
        assertFalse(encoder.matches("OldPass1", u.getPasswordHash()));
    }

    @Test
    void rejectsResetWhenAccountIsDisabled() throws Exception {
        mvc.perform(patch("/api/users/u-reset-active/enabled").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/users/u-reset-active/reset-credentials"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("account_disabled"));
    }

    @Test
    void resetCollecteurOnlyReturnsPin() throws Exception {
        AppUser c = users.findById("u-reset-col").orElseGet(() -> AppUser.builder()
                .id("u-reset-col").build());
        c.setName("Collecteur");
        c.setEmail("reset-col@test.cm");
        c.setRole(Role.COLLECTEUR);
        c.setPhone("690000022");
        c.setPasswordHash(encoder.encode("OldPass1"));
        c.setLoginPin(encoder.encode("1234"));
        c.setMustChangePassword(false);
        c.setEnabled(true);
        users.save(c);

        mvc.perform(post("/api/users/u-reset-col/reset-credentials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pin").isNotEmpty())
                .andExpect(jsonPath("$.tempPassword").value(""));

        AppUser saved = users.findById("u-reset-col").orElseThrow();
        assertFalse(saved.isMustChangePassword());
        assertFalse(encoder.matches("1234", saved.getLoginPin()));
    }
}
