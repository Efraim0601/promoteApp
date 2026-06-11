package com.afriland.promote.repo;

import com.afriland.promote.model.LoginAudit;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoginAuditRepository extends JpaRepository<LoginAudit, String> {
    /** Most recent attempts first (capped by the caller's Pageable). */
    List<LoginAudit> findAllByOrderByAtDesc(Pageable pageable);
}
