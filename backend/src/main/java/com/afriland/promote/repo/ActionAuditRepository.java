package com.afriland.promote.repo;

import com.afriland.promote.model.ActionAudit;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ActionAuditRepository extends JpaRepository<ActionAudit, String> {
    List<ActionAudit> findAllByOrderByAtDesc(Pageable pageable);
}
