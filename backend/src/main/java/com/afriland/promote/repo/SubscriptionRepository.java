package com.afriland.promote.repo;

import com.afriland.promote.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    List<Subscription> findAllByOrderByCreatedAtAsc();
    List<Subscription> findByAgentIdOrderByCreatedAtAsc(String agentId);
    Optional<Subscription> findByRefIgnoreCase(String ref);
    Optional<Subscription> findByGatewayRef(String gatewayRef);
}
