package com.afriland.promote.web;

import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.web.dto.Dtos.CreateSubscriptionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** A card may only be activated once the payment is settled — never on a failed/pending transaction. */
@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "printer", roles = {"PRINT_AGENT"})
class PrintGuardTest {

    @Autowired SubscriptionService service;
    @Autowired MockMvc mvc;

    private String createMomo(String cni, String phone) {
        CreateSubscriptionRequest req = new CreateSubscriptionRequest(
                "Print", "Guard", "M", "cni", cni, null, "01/01/2031", phone,
                "pg@afb.cm", "Bonamoussadi", "Littoral", "Douala",
                "om", phone, "promote", false, null, null, null, null, null, null);
        return service.create(req, "self", null).getRef();
    }

    @Test
    void cannotActivateAFailedPayment() throws Exception {
        String ref = createMomo("PG000001", "+237690007777");
        // The client declined on their phone → webhook marks it failed.
        mvc.perform(post("/api/payment/webhook/trustpayway").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":\"" + ref + "\",\"status\":\"FAILED\"}"))
                .andExpect(status().isOk());
        // Attempting to activate a card must be refused (409) and leave it un-printed.
        mvc.perform(patch("/api/subscriptions/{ref}/print", ref).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cardNumber\":\"CARD-FAIL\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void canActivateAPaidPayment() throws Exception {
        String ref = createMomo("PG000002", "+237690008888");
        mvc.perform(patch("/api/subscriptions/{ref}/pay", ref).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"outcome\":\"validate\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/subscriptions/{ref}/print", ref).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cardNumber\":\"CARD-OK\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.printed").value(true))
                .andExpect(jsonPath("$.cardNumber").value("CARD-OK"));
    }
}
