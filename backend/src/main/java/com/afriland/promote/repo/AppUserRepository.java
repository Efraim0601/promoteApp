package com.afriland.promote.repo;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, String> {
    Optional<AppUser> findByEmailIgnoreCase(String email);
    Optional<AppUser> findByPhone(String phone);
    /** Dup-tolerant lookup used by phone+PIN login (resolves the matching collecteur in code). */
    List<AppUser> findAllByPhone(String phone);
    List<AppUser> findByRole(Role role);
    /** Direct reports of a node in the org tree (hierarchy scoping). */
    List<AppUser> findByParentUserId(String parentUserId);

    /** Accounts holding {@code role} in ANY slot — the primary {@code role} column OR the multi-role
     *  {@code roles} set. Unlike {@link #findByRole}, this also returns agents for whom AGENT is a
     *  secondary role (e.g. a CHEF_EQUIPE who also sells), so they aren't dropped from the ranking /
     *  referrer resolution. Filtered in code because {@code roles LIKE '%AGENT%'} would also match
     *  PRINT_AGENT. */
    default List<AppUser> findByEffectiveRole(Role role) {
        // Narrow in SQL (primary role column OR the comma-separated roles string contains the name)
        // instead of loading the whole users table, then fine-filter in code so a LIKE '%AGENT%' that
        // also matched PRINT_AGENT is dropped (effectiveRoles() parses exact tokens).
        return findByEffectiveRoleCandidates(role, role.name()).stream()
                .filter(u -> u.effectiveRoles().contains(role)).toList();
    }

    /** SQL pre-filter for {@link #findByEffectiveRole}: rows whose primary {@code role} equals the role
     *  OR whose multi-role {@code roles} string mentions its name. Intentionally broad (PRINT_AGENT also
     *  matches '%AGENT%') — the caller fine-filters in memory. */
    @Query("select u from AppUser u where u.role = :role or u.roles like concat('%', :roleName, '%')")
    List<AppUser> findByEffectiveRoleCandidates(@Param("role") Role role, @Param("roleName") String roleName);
}
