package com.afriland.promote.web;

import com.afriland.promote.model.Subscription;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Payment lifecycle as the client UI sees it: success → paid (no reason), decline → failed with a
 * reason surfaced by the status endpoint (so "Solde insuffisant" can be shown clearly), via both the
 * simulation endpoint and the aggregator webhook. Runs on the simulated gateway (test profile).
 */
@SpringBootTest
@AutoConfigureMockMvc
class PaymentFlowTest {

    @Autowired SubscriptionService service;
    @Autowired MockMvc mvc;

    /** Create a MoMo (om) subscription — the simulated gateway accepts the push, so it starts 'pending'. */
    private String createPendingMomo(String cni, String phone) {
        CreateSubscriptionRequest req = new CreateSubscriptionRequest(
                "Pay", "Test", "M", cni, null, "01/01/2031", phone,
                "pay.test@afb.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
        Subscription s = service.create(req, "self", null);
        return s.getRef();
    }

    @Test
    void successfulPaymentIsPaidWithNoReason() throws Exception {
        String ref = createPendingMomo("PAYOK0001", "+237690001111");
        mvc.perform(patch("/api/subscriptions/{ref}/pay", ref).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"outcome\":\"validate\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("paid"));
        mvc.perform(get("/api/subscriptions/{ref}/status", ref))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("paid"))
                .andExpect(jsonPath("$.message").doesNotExist());
    }

    @Test
    void declineViaSimulationKeepsTheReason() throws Exception {
        String ref = createPendingMomo("PAYKO0001", "+237690002222");
        mvc.perform(patch("/api/subscriptions/{ref}/pay", ref).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"outcome\":\"fail\",\"reason\":\"Solde insuffisant\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("failed"));
        mvc.perform(get("/api/subscriptions/{ref}/status", ref))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("failed"))
                .andExpect(jsonPath("$.message").value("Solde insuffisant"));
    }

    @Test
    void webhookFailureCapturesAndSurfacesTheReason() throws Exception {
        String ref = createPendingMomo("PAYWH0001", "+237690003333");
        mvc.perform(post("/api/payment/webhook/trustpayway").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":\"" + ref + "\",\"status\":\"FAILED\",\"confirmationStatus\":\"Solde insuffisant\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/subscriptions/{ref}/status", ref))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("failed"))
                .andExpect(jsonPath("$.message").value("Solde insuffisant"));
    }

    @Test
    void webhookSuccessMarksPaid() throws Exception {
        String ref = createPendingMomo("PAYWH0002", "+237690004444");
        mvc.perform(post("/api/payment/webhook/trustpayway").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":\"" + ref + "\",\"status\":\"COMPLETED\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/subscriptions/{ref}/status", ref))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("paid"));
    }
}
