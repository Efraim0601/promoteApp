package com.afriland.promote.web;

import com.afriland.promote.config.CacheConfig;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.MapPointDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * Admin map data: every client (subscription) and staff member. Each point carries its exact GPS
 * fix when one was captured; otherwise it carries a coarse locality ({@code place} — client city or
 * staff agency) that the frontend forward-geocodes, so every client/agent appears on the map.
 * Admin-only (enforced in {@link com.afriland.promote.config.SecurityConfig}).
 */
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Cartographie", description = "Points GPS staff et clients")
@RestController
@RequestMapping("/api/map")
public class MapController {

    private final SubscriptionRepository subs;
    private final AppUserRepository users;

    public MapController(SubscriptionRepository subs, AppUserRepository users) {
        this.subs = subs;
        this.users = users;
    }

    /** All points to plot: every client (subscription) + every staff member. Cached for a short window
     *  — this loads every client + staff row, and the admin map polls/refreshes; the cache collapses
     *  repeated loads into one DB scan per window. */
    @GetMapping("/points")
    @Cacheable(CacheConfig.MAP_POINTS)
    public List<MapPointDto> points() {
        List<MapPointDto> out = new ArrayList<>();

        subs.findAll().forEach(s -> out.add(new MapPointDto(
                "client", s.getFullName(), s.getLatitude(), s.getLongitude(),
                null, s.getStatus(), s.getRef(),
                s.getCreatedAt() == null ? null : s.getCreatedAt().toString(),
                s.getGeoAccuracy(),
                // coarse locality to geocode when there's no GPS fix
                firstNonBlank(s.getVille(), s.getRegion(), s.getQuartier()))));

        users.findAll().forEach(u -> out.add(new MapPointDto(
                "staff", u.getName(), u.getLastLat(), u.getLastLng(),
                u.getRole().name(), null, u.getId(),
                u.getLastLocatedAt() == null ? null : u.getLastLocatedAt().toString(),
                u.getLastAccuracy(),
                firstNonBlank(u.getAgency()))));

        return out;
    }

    /** First non-null, non-blank value, or null when none. */
    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }
}
