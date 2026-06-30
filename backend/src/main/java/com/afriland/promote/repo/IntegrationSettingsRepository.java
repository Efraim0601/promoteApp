package com.afriland.promote.repo;

import com.afriland.promote.model.IntegrationSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IntegrationSettingsRepository extends JpaRepository<IntegrationSettings, Long> {
}
