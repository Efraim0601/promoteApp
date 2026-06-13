package com.afriland.promote.payment;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TrustPayWayGatewayTest {

    @Test
    void detectsDuplicateOrderBody() {
        String body = "{\"details\":\"Duplicate transaction detected: Your order ID 'PRM-1-ABC' already exists.\",\"error\":\"Bad Request\"}";
        assertTrue(TrustPayWayGateway.isDuplicateOrder(body));
        assertFalse(TrustPayWayGateway.isDuplicateOrder("{\"error\":\"Bad Request\"}"));
    }
}
