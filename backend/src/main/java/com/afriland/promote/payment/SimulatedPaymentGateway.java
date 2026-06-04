package com.afriland.promote.payment;

import com.afriland.promote.model.Subscription;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Default gateway: simulates the MoMo USSD push. The actual confirmation
 * (paid / failed) is driven by the client through PATCH /api/subscriptions/{ref}/pay,
 * exactly like the prototype's "Simuler la validation / Le client a refusé" buttons.
 */
@Component
@Primary
public class SimulatedPaymentGateway implements PaymentGateway {

    @Override
    public String provider() {
        return "simulated";
    }

    @Override
    public PaymentRequest requestPayment(Subscription sub, String operator) {
        // In a real gateway this would call the aggregator API and return its reference.
        return new PaymentRequest("SIM-" + UUID.randomUUID(), operator, true);
    }
}
