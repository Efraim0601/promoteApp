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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Self-service password change: validates the current password + the policy, clears the forced flag. */
@SpringBootTest
@AutoConfigureMockMvc
class ChangePasswordTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void seedUser() {
        AppUser u = users.findById("cptest").orElseGet(() -> AppUser.builder().id("cptest").build());
        u.setName("CP Test");
        u.setEmail("cptest@test.cm");
        u.setRole(Role.ADMIN);
        u.setPasswordHash(encoder.encode("Promote1"));
        u.setMustChangePassword(true);
        users.save(u);
    }

    private String body(String current, String next) {
        return "{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}";
    }

    @Test
    @WithMockUser(username = "cptest")
    void rejectsWrongCurrentPassword() throws Exception {
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON).content(body("nope", "Afriland2026")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("wrong_current_password"));
    }

    @Test
    @WithMockUser(username = "cptest")
    void rejectsAWeakNewPassword() throws Exception {
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON).content(body("Promote1", "short")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("password_too_short"));
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON).content(body("Promote1", "onlyletters")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("password_needs_letter_and_digit"));
    }

    @Test
    @WithMockUser(username = "cptest")
    void changesPasswordAndClearsForcedFlag() throws Exception {
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON).content(body("Promote1", "Afriland2026")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false));
        AppUser after = users.findById("cptest").orElseThrow();
        assertFalse(after.isMustChangePassword());
        assertTrue(encoder.matches("Afriland2026", after.getPasswordHash()));
    }
}
