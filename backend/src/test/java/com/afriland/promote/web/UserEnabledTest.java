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

/** Admin enables/disables a staff account; a disabled account can no longer log in. */
@SpringBootTest
@AutoConfigureMockMvc
class UserEnabledTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void seedUser() {
        AppUser u = users.findById("disme").orElseGet(() -> AppUser.builder().id("disme").build());
        u.setName("Dis Able");
        u.setEmail("disme@test.cm");
        u.setRole(Role.AGENT);
        u.setPasswordHash(encoder.encode("Promote1"));
        u.setEnabled(true);
        users.save(u);

        // Ensure the "admin" principal the @WithMockUser tests act as actually exists — the suite shares
        // one H2 instance, and a sibling test may have removed the seeded admin, which would turn the
        // self-disable check into a 404 instead of "cannot_disable_self".
        AppUser admin = users.findById("admin").orElseGet(() -> AppUser.builder().id("admin").build());
        admin.setName("Administrateur");
        admin.setEmail("admin@test.cm");
        admin.setRole(Role.ADMIN);
        admin.setPasswordHash(encoder.encode("Promote1"));
        admin.setEnabled(true);
        users.save(admin);
    }

    private String enabled(boolean b) { return "{\"enabled\":" + b + "}"; }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void adminDisablesAndReEnablesAnAccount() throws Exception {
        mvc.perform(patch("/api/users/disme/enabled").contentType(MediaType.APPLICATION_JSON).content(enabled(false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));
        assertFalse(users.findById("disme").orElseThrow().isEnabled());

        mvc.perform(patch("/api/users/disme/enabled").contentType(MediaType.APPLICATION_JSON).content(enabled(true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));
        assertTrue(users.findById("disme").orElseThrow().isEnabled());
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void cannotDisableYourself() throws Exception {
        mvc.perform(patch("/api/users/admin/enabled").contentType(MediaType.APPLICATION_JSON).content(enabled(false)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("cannot_disable_self"));
    }

    @Test
    void aDisabledAccountCannotLogIn() throws Exception {
        AppUser u = users.findById("disme").orElseThrow();
        u.setEnabled(false);
        users.save(u);
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"disme@test.cm\",\"password\":\"Promote1\"}"))
                .andExpect(status().isForbidden());
    }
}
