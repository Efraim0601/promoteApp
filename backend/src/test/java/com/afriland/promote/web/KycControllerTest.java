package com.afriland.promote.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Base64;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Public KYC upload endpoints — image (selfie/CNI) and SARA receipt (with extraction). */
@SpringBootTest
@AutoConfigureMockMvc
class KycControllerTest {

    @Autowired MockMvc mvc;

    private static String dataUrl(String mime, String content) {
        return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(content.getBytes());
    }

    @Test
    void uploadsAnImageAndReturnsAKey() throws Exception {
        mvc.perform(post("/api/kyc/image").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\"" + dataUrl("image/jpeg", "hello") + "\",\"kind\":\"selfie\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").isNotEmpty());
    }

    @Test
    void rejectsAPdfForAnImageKind() throws Exception {
        mvc.perform(post("/api/kyc/image").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\"" + dataUrl("application/pdf", "%PDF-1.4") + "\",\"kind\":\"selfie\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsAnUnknownKind() throws Exception {
        mvc.perform(post("/api/kyc/image").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\"" + dataUrl("image/jpeg", "x") + "\",\"kind\":\"passport\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadsAReceiptAndReturnsKeyPlusExtraction() throws Exception {
        // A SARA receipt whose text layer carries a reference — extracted and returned.
        String receiptText = "Relevé d'opération\nReférence W2026051112422763\nStatut COMPLETED\n";
        mvc.perform(post("/api/kyc/receipt").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\"" + dataUrl("application/pdf", receiptText) + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").isNotEmpty());
    }
}
