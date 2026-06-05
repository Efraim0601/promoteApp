package com.afriland.promote.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.util.List;

/**
 * Selects the active {@link PaymentGateway} from {@code app.payment.provider}.
 *
 * <p>Every gateway is a Spring bean (simulated, trustpayway, …). Spring injects all
 * of them as a {@code List}; we expose the one whose {@link PaymentGateway#provider()}
 * matches the configured value as the {@code @Primary} bean, so the rest of the app
 * (e.g. {@code SubscriptionService}) autowires a single {@code PaymentGateway} and is
 * unaware of which provider is live.
 */
@Configuration
public class PaymentConfig {

    @Bean
    @Primary
    public PaymentGateway activePaymentGateway(List<PaymentGateway> gateways,
                                               @Value("${app.payment.provider:simulated}") String provider) {
        return gateways.stream()
                .filter(g -> g.provider().equalsIgnoreCase(provider))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No PaymentGateway for app.payment.provider='" + provider + "'. Available: "
                                + gateways.stream().map(PaymentGateway::provider).toList()));
    }
}
