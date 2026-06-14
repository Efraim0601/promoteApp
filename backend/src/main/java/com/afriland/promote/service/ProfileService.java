package com.afriland.promote.service;

import com.afriland.promote.model.AppProfile;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Permission;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.ProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final ProfileRepository profileRepo;
    private final AppUserRepository userRepo;

    public List<AppProfile> findAll() {
        return profileRepo.findAll();
    }

    public AppProfile findById(Long id) {
        return profileRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("profile_not_found"));
    }

    @Transactional
    public AppProfile create(String name, String description, Set<Permission> permissions) {
        if (profileRepo.existsByName(name)) throw new IllegalArgumentException("profile_name_taken");
        AppProfile p = new AppProfile();
        p.setName(name);
        p.setDescription(description);
        p.setBuiltin(false);
        p.setPermissionSet(permissions);
        return profileRepo.save(p);
    }

    @Transactional
    public AppProfile update(Long id, String name, String description, Set<Permission> permissions) {
        AppProfile p = findById(id);
        if (!p.getName().equals(name) && profileRepo.existsByName(name))
            throw new IllegalArgumentException("profile_name_taken");
        p.setName(name);
        p.setDescription(description);
        p.setPermissionSet(permissions);
        return profileRepo.save(p);
    }

    @Transactional
    public void delete(Long id) {
        AppProfile p = findById(id);
        if (p.isBuiltin()) throw new IllegalArgumentException("profile_builtin_cannot_delete");
        for (AppUser u : userRepo.findAll()) {
            if (u.getProfiles().removeIf(pr -> pr.getId().equals(id))) userRepo.save(u);
        }
        profileRepo.delete(p);
    }

    @Transactional
    public AppUser setUserProfiles(String userId, List<Long> profileIds) {
        AppUser u = userRepo.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));
        List<AppProfile> profiles = profileRepo.findAllById(profileIds);
        u.getProfiles().clear();
        u.getProfiles().addAll(profiles);
        return userRepo.save(u);
    }

    public static Set<Permission> parsePermissions(List<String> names) {
        Set<Permission> result = EnumSet.noneOf(Permission.class);
        if (names == null) return result;
        for (String n : names) {
            try { result.add(Permission.valueOf(n)); } catch (IllegalArgumentException ignored) {}
        }
        return result;
    }
}
