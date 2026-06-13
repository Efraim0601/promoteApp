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

/** Re-provisioning a disabled staff account (create form or explicit recreate endpoint). */
@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = {"ADMIN"})
class UserRecreateTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void seedDisabledAgent() {
        AppUser u = users.findByEmailIgnoreCase("gone@test.cm").orElseGet(() -> AppUser.builder()
                .id("u-gone").build());
        u.setName("Gone Agent");
        u.setEmail("gone@test.cm");
        u.setRole(Role.AGENT);
        u.setPhone("690000099");
        u.setPasswordHash(encoder.encode("OldPass1"));
        u.setEnabled(false);
        users.save(u);
    }

    private static String user(String name, String email, String role, String phone) {
        return "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"role\":\"" + role + "\",\"phone\":\"" + phone + "\"}";
    }

    @Test
    void createFormReactivatesADisabledAccountWithTheSameEmail() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Back Again", "gone@test.cm", "AGENT", "690000099")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reactivated").value(true))
                .andExpect(jsonPath("$.user.enabled").value(true))
                .andExpect(jsonPath("$.tempPassword").isNotEmpty());

        AppUser u = users.findByEmailIgnoreCase("gone@test.cm").orElseThrow();
        assertTrue(u.isEnabled());
        assertEquals("Back Again", u.getName());
    }

    @Test
    void recreateEndpointReactivatesADisabledAccount() throws Exception {
        mvc.perform(post("/api/users/u-gone/recreate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reactivated").value(true))
                .andExpect(jsonPath("$.user.enabled").value(true))
                .andExpect(jsonPath("$.tempPassword").isNotEmpty());
        assertTrue(users.findById("u-gone").orElseThrow().isEnabled());
    }

    @Test
    void rejectsRecreateWhenAccountIsStillActive() throws Exception {
        mvc.perform(patch("/api/users/u-gone/enabled").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/users/u-gone/recreate"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("account_active"));
    }

    @Test
    void stillRejectsDuplicateEmailForAnEnabledAccount() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Active", "active@test.cm", "AGENT", "690000088")))
                .andExpect(status().isOk());
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Dup", "active@test.cm", "AGENT", "690000087")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("email_exists"));
    }
}
