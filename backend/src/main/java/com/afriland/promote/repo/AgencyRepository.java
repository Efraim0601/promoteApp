package com.afriland.promote.repo;

import com.afriland.promote.model.Agency;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgencyRepository extends JpaRepository<Agency, String> {
    List<Agency> findByActiveTrueOrderByNameAsc();
    List<Agency> findAllByOrderByNameAsc();
}
