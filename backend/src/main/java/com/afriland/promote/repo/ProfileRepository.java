package com.afriland.promote.repo;

import com.afriland.promote.model.AppProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProfileRepository extends JpaRepository<AppProfile, Long> {
    Optional<AppProfile> findByName(String name);
    boolean existsByName(String name);
}
