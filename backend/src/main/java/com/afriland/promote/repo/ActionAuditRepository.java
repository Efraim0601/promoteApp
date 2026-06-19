package com.afriland.promote.repo;

import com.afriland.promote.model.ActionAudit;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ActionAuditRepository extends JpaRepository<ActionAudit, String> {
    List<ActionAudit> findAllByOrderByAtDesc(Pageable pageable);

    /**
     * Full-history search (latest first) across actor, action, entity ref and details — so a
     * supervisor can find e.g. who printed PRM-4078 even when that action is far older than the
     * most-recent page. {@code q} must already be a lower-cased {@code %term%} LIKE pattern.
     */
    @Query("""
            SELECT a FROM ActionAudit a
            WHERE lower(a.entityRef) LIKE :q OR lower(a.actorName) LIKE :q
               OR lower(a.actorId) LIKE :q OR lower(a.action) LIKE :q
               OR lower(a.details) LIKE :q
            ORDER BY a.at DESC
            """)
    List<ActionAudit> search(@Param("q") String q, Pageable pageable);
}
