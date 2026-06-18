package com.afriland.promote.repo;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import org.springframework.data.jpa.repository.JpaRepository;

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
        return findAll().stream().filter(u -> u.effectiveRoles().contains(role)).toList();
    }
}
