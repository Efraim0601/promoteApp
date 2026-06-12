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
}
