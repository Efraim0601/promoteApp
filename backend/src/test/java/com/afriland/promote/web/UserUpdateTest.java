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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = {"ADMIN"})
class UserUpdateTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;

    private String userId;

    @BeforeEach
    void seed() {
        users.deleteAll();
        AppUser u = AppUser.builder()
                .id("u-edit")
                .name("Old Name")
                .email("old@test.cm")
                .passwordHash(encoder.encode("Promote1"))
                .role(Role.AGENT)
                .agency("Agence Akwa")
                .phone("690111111")
                .build();
        users.save(u);
        userId = u.getId();
    }

    @Test
    void updatesProfileFields() throws Exception {
        mvc.perform(put("/api/users/{id}", userId).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"New Name","email":"new@test.cm","agency":"Agence Bastos","phone":"690222222"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New Name"))
                .andExpect(jsonPath("$.email").value("new@test.cm"))
                .andExpect(jsonPath("$.agency").value("Agence Bastos"))
                .andExpect(jsonPath("$.phone").value("690222222"));

        AppUser saved = users.findById(userId).orElseThrow();
        assertEquals("New Name", saved.getName());
        assertEquals("new@test.cm", saved.getEmail());
    }

    @Test
    void rejectsDuplicateEmail() throws Exception {
        users.save(AppUser.builder()
                .id("u-other")
                .name("Other")
                .email("taken@test.cm")
                .passwordHash(encoder.encode("Promote1"))
                .role(Role.CASHIER)
                .phone("690333333")
                .build());

        mvc.perform(put("/api/users/{id}", userId).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"X","email":"taken@test.cm","phone":"690111111"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("email_exists"));
    }
}
