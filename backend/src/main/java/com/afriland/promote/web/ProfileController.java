package com.afriland.promote.web;

import com.afriland.promote.model.AppProfile;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.service.ProfileService;
import com.afriland.promote.web.dto.Dtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/profiles")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;

    @GetMapping
    public List<ProfileDto> list() {
        return profileService.findAll().stream().map(ProfileDto::of).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ProfileRequest req) {
        try {
            AppProfile p = profileService.create(req.name(), req.description(),
                    ProfileService.parsePermissions(req.permissions()));
            return ResponseEntity.ok(ProfileDto.of(p));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody ProfileRequest req) {
        try {
            AppProfile p = profileService.update(id, req.name(), req.description(),
                    ProfileService.parsePermissions(req.permissions()));
            return ResponseEntity.ok(ProfileDto.of(p));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        try {
            profileService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Assign a set of profiles to a user (replaces current assignment). */
    @PutMapping("/users/{userId}")
    public ResponseEntity<?> setUserProfiles(@PathVariable String userId,
                                              @RequestBody List<Long> profileIds) {
        try {
            AppUser u = profileService.setUserProfiles(userId, profileIds);
            return ResponseEntity.ok(UserDto.of(u));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
