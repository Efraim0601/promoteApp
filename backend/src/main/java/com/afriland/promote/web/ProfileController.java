package com.afriland.promote.web;

import com.afriland.promote.model.AppProfile;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.ProfileService;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/profiles")
public class ProfileController {

    private final ProfileService profileService;
    private final ActionAuditService audit;

    public ProfileController(ProfileService profileService, ActionAuditService audit) {
        this.profileService = profileService;
        this.audit = audit;
    }

    @GetMapping
    public List<ProfileDto> list() {
        return profileService.findAll().stream().map(ProfileDto::of).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ProfileRequest req, Authentication auth) {
        try {
            AppProfile p = profileService.create(req.name(), req.description(),
                    ProfileService.parsePermissions(req.permissions()));
            audit.record(auth, "CREATE_PROFILE", "PROFILE", String.valueOf(p.getId()),
                    "Création du profil \"" + p.getName() + "\"");
            return ResponseEntity.ok(ProfileDto.of(p));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody ProfileRequest req,
                                    Authentication auth) {
        try {
            AppProfile p = profileService.update(id, req.name(), req.description(),
                    ProfileService.parsePermissions(req.permissions()));
            audit.record(auth, "UPDATE_PROFILE", "PROFILE", String.valueOf(id),
                    "Modification du profil \"" + p.getName() + "\"");
            return ResponseEntity.ok(ProfileDto.of(p));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, Authentication auth) {
        try {
            profileService.delete(id);
            audit.record(auth, "DELETE_PROFILE", "PROFILE", String.valueOf(id),
                    "Suppression du profil #" + id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Assign a set of profiles to a user (replaces current assignment). */
    @PutMapping("/users/{userId}")
    public ResponseEntity<?> setUserProfiles(@PathVariable String userId,
                                             @RequestBody List<Long> profileIds,
                                             Authentication auth) {
        try {
            AppUser u = profileService.setUserProfiles(userId, profileIds);
            audit.record(auth, "ASSIGN_PROFILES", "USER", userId,
                    "Profils de " + u.getEmail() + " → " + profileIds);
            return ResponseEntity.ok(UserDto.of(u));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
