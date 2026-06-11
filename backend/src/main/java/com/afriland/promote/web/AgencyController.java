package com.afriland.promote.web;

import com.afriland.promote.model.Agency;
import com.afriland.promote.repo.AgencyRepository;
import com.afriland.promote.web.dto.Dtos.AgencyDto;
import com.afriland.promote.web.dto.Dtos.ImportAgenciesRequest;
import com.afriland.promote.web.dto.Dtos.ImportAgenciesResult;
import com.afriland.promote.web.dto.Dtos.ImportAgencyRow;
import com.afriland.promote.web.dto.Dtos.ImportAgencyRowResult;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * Pickup points ("lieux de retrait") the client picks when delivery == agence. The list is public
 * (the subscription form needs it) but only the admin can import/manage it (enforced in SecurityConfig).
 */
@RestController
@RequestMapping("/api/agencies")
public class AgencyController {

    private final AgencyRepository repo;

    public AgencyController(AgencyRepository repo) {
        this.repo = repo;
    }

    /** Public — active pickup points shown on the client form (alphabetical). */
    @GetMapping
    public List<AgencyDto> list() {
        return repo.findByActiveTrueOrderByNameAsc().stream().map(AgencyDto::of).toList();
    }

    /**
     * Admin only — bulk import pickup agencies. Each row is validated independently; duplicates
     * (same name + city, case-insensitive) are skipped or updated per {@code updateExisting}.
     * Always 200 — the per-row {@code status} carries the outcome (created/updated/skipped/invalid).
     */
    @PostMapping("/import")
    @Transactional
    public ImportAgenciesResult importAgencies(@RequestBody ImportAgenciesRequest req) {
        List<ImportAgencyRow> rows = req == null || req.rows() == null ? List.of() : req.rows();
        boolean update = req != null && req.updateExisting();
        List<ImportAgencyRowResult> out = new ArrayList<>();
        int created = 0, updated = 0, skipped = 0, invalid = 0;

        // Index existing agencies by a normalized (name|city) key for null-safe dedup + update.
        Map<String, Agency> existing = new HashMap<>();
        for (Agency a : repo.findAll()) existing.put(key(a.getName(), a.getCity()), a);
        Set<String> seenInFile = new HashSet<>();

        for (ImportAgencyRow row : rows) {
            String name = row.name() == null ? "" : row.name().trim();
            String city = row.city() == null || row.city().isBlank() ? null : row.city().trim();

            if (name.isBlank()) {
                out.add(new ImportAgencyRowResult(name, city, "invalid", "name_required"));
                invalid++; continue;
            }
            String k = key(name, city);
            // The same agency twice in one file: keep the first, skip the rest.
            if (!seenInFile.add(k)) {
                out.add(new ImportAgencyRowResult(name, city, "skipped", "duplicate_in_file"));
                skipped++; continue;
            }

            Agency match = existing.get(k);
            if (match != null) {
                if (!update) {
                    out.add(new ImportAgencyRowResult(name, city, "skipped", "already_exists"));
                    skipped++; continue;
                }
                match.setName(name);
                match.setCity(city);
                match.setActive(true);   // re-importing re-activates a previously hidden branch
                repo.save(match);
                out.add(new ImportAgencyRowResult(name, city, "updated", null));
                updated++; continue;
            }

            repo.save(Agency.builder()
                    .id("ag-" + UUID.randomUUID().toString().substring(0, 8))
                    .name(name).city(city).active(true)
                    .createdAt(Instant.now())
                    .build());
            out.add(new ImportAgencyRowResult(name, city, "created", null));
            created++;
        }
        return new ImportAgenciesResult(created, updated, skipped, invalid, out);
    }

    /** Normalized dedup key — name + city, case/space-insensitive, null-safe. */
    private static String key(String name, String city) {
        String n = name == null ? "" : name.trim().toLowerCase();
        String c = city == null ? "" : city.trim().toLowerCase();
        return n + "|" + c;
    }
}
