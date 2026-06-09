package com.afriland.promote.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Bulk user import: temp passwords for new accounts + duplicate handling (skip / update / in-file). */
@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = {"ADMIN"})
class UserImportTest {

    @Autowired MockMvc mvc;

    private ResultActions imp(String body) throws Exception {
        return mvc.perform(post("/api/users/import").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void createsNewAccountsWithGeneratedTempPasswords() throws Exception {
        String body = """
            {"updateExisting":false,"rows":[
              {"name":"Imp One","email":"imp.one@test.cm","role":"AGENT","phone":"690112233","agency":"Akwa"},
              {"name":"Imp Two","email":"imp.two@test.cm","role":"PRINT_AGENT"}
            ]}""";
        imp(body).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.rows[0].status").value("created"))
                .andExpect(jsonPath("$.rows[0].tempPassword").isNotEmpty())
                .andExpect(jsonPath("$.rows[1].status").value("created"));
    }

    @Test
    void skipsAnExistingEmailByDefault() throws Exception {
        // Seed our own row first (don't touch shared seeded accounts), then re-import it.
        imp("""
            {"updateExisting":false,"rows":[
              {"name":"Skip Target","email":"skip.target@test.cm","role":"PRINT_AGENT"}
            ]}""").andExpect(status().isOk());
        imp("""
            {"updateExisting":false,"rows":[
              {"name":"Skip Target","email":"skip.target@test.cm","role":"PRINT_AGENT"}
            ]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.rows[0].status").value("skipped"))
                .andExpect(jsonPath("$.rows[0].reason").value("email_exists"));
    }

    @Test
    void updatesAnExistingEmailWhenAsked() throws Exception {
        imp("""
            {"updateExisting":false,"rows":[
              {"name":"Upd Before","email":"update.target@test.cm","role":"AGENT","phone":"690000111"}
            ]}""").andExpect(status().isOk());
        imp("""
            {"updateExisting":true,"rows":[
              {"name":"Upd After","email":"update.target@test.cm","role":"AGENT","phone":"690000111"}
            ]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(1))
                .andExpect(jsonPath("$.rows[0].status").value("updated"));
    }

    @Test
    void flagsInvalidRows() throws Exception {
        String body = """
            {"updateExisting":false,"rows":[
              {"name":"","email":"not-an-email","role":"AGENT"},
              {"name":"Bad Role","email":"bad.role@test.cm","role":"WIZARD"},
              {"name":"No Phone","email":"no.phone@test.cm","role":"AGENT"}
            ]}""";
        imp(body).andExpect(status().isOk())
                .andExpect(jsonPath("$.invalid").value(3))
                .andExpect(jsonPath("$.rows[0].reason").value("invalid_name_or_email"))
                .andExpect(jsonPath("$.rows[1].reason").value("invalid_role"))
                .andExpect(jsonPath("$.rows[2].reason").value("agent_phone_required"));
    }

    @Test
    void skipsDuplicateRowsWithinTheSameFile() throws Exception {
        String body = """
            {"updateExisting":false,"rows":[
              {"name":"Dup A","email":"dup.infile@test.cm","role":"PRINT_AGENT"},
              {"name":"Dup B","email":"dup.infile@test.cm","role":"PRINT_AGENT"}
            ]}""";
        imp(body).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.rows[1].reason").value("duplicate_in_file"));
    }
}
