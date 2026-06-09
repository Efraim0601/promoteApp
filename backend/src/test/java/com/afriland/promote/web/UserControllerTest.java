package com.afriland.promote.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Staff account creation — a commercial's phone is mandatory, valid and stored normalized. */
@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = {"ADMIN"})
class UserControllerTest {

    @Autowired MockMvc mvc;

    private static String user(String name, String email, String role, String phone) {
        String p = phone == null ? "" : ",\"phone\":\"" + phone + "\"";
        return "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"role\":\"" + role
                + "\",\"password\":\"promote\"" + p + "}";
    }

    @Test
    void rejectsAnAgentWithoutAPhone() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("No Phone", "nophone@test.cm", "AGENT", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("agent_phone_required"));
    }

    @Test
    void rejectsAnAgentWithAnInvalidPhone() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Bad Phone", "badphone@test.cm", "AGENT", "12345")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("agent_phone_required"));
    }

    @Test
    void createsAnAgentAndNormalizesThePhoneToLocalNineDigits() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Francklin Youmbi", "francklin@test.cm", "AGENT", "+237 690 12 34 56")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("AGENT"))
                .andExpect(jsonPath("$.phone").value("690123456"));
    }

    @Test
    void allowsANonAgentWithoutAPhone() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Some Admin", "admin2@test.cm", "ADMIN", null)))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsADuplicateEmail() throws Exception {
        String dup = user("Dup One", "dup@test.cm", "AGENT", "690000001");
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON).content(dup))
                .andExpect(status().isOk());
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON).content(dup))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("email_exists"));
    }

    @Test
    void rejectsAnUnknownRole() throws Exception {
        mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content(user("Weird", "weird@test.cm", "WIZARD", "690000002")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_role"));
    }
}
