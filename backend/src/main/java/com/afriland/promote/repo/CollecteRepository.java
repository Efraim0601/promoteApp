package com.afriland.promote.repo;

import com.afriland.promote.model.Collecte;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CollecteRepository extends JpaRepository<Collecte, String> {
    List<Collecte> findAllByOrderByCreatedAtDesc();
    List<Collecte> findByCollectedByIdOrderByCreatedAtDesc(String collectedById);
}
