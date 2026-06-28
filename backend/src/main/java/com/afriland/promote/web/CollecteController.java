package com.afriland.promote.web;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Collecte;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.CollecteService;
import com.afriland.promote.web.dto.Dtos.CollecteDto;
import com.afriland.promote.web.dto.Dtos.CollecteStats;
import com.afriland.promote.web.dto.Dtos.CreateCollecteRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * Collectes (bank-product sales capture). Collecteurs create + manage their own; admins see/manage
 * everything (per-route roles enforced in SecurityConfig; ownership re-checked here for edit/delete).
 */
@Tag(name = "Collectes", description = "Ventes produits bancaires terrain")
@RestController
@RequestMapping("/api/collectes")
public class CollecteController {

    private final CollecteService service;
    private final AppUserRepository users;
    private final ActionAuditService audit;

    public CollecteController(CollecteService service, AppUserRepository users, ActionAuditService audit) {
        this.service = service;
        this.users = users;
        this.audit = audit;
    }

    private static boolean isAdmin(Authentication auth) {
        return auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).anyMatch("ROLE_ADMIN"::equals);
    }

    /** Collecteur / admin — capture a sale, attributed to the logged-in user. */
    @PostMapping
    public CollecteDto create(@Valid @RequestBody CreateCollecteRequest req, Authentication auth) {
        String id = (String) auth.getPrincipal();
        String name = users.findById(id).map(AppUser::getName).orElse(null);
        CollecteDto dto = CollecteDto.of(service.create(req, id, name));
        audit.record(auth, "CREATE_COLLECTE", "COLLECTE", dto.ref(),
                "Collecte " + req.product() + " — client : " + req.clientNom());
        return dto;
    }

    /** Admin — every collecte (most recent first). */
    @GetMapping
    public List<CollecteDto> all() {
        return service.all().stream().map(CollecteDto::of).toList();
    }

    /** Collecteur / admin — my own collectes. */
    @GetMapping("/mine")
    public List<CollecteDto> mine(Authentication auth) {
        return service.mine((String) auth.getPrincipal()).stream().map(CollecteDto::of).toList();
    }

    /** Admin — aggregated counts (by product, by commercial). */
    @GetMapping("/stats")
    public CollecteStats stats() {
        return service.stats();
    }

    /** Update a collecte — admin, or the collecteur who captured it. */
    @PutMapping("/{ref}")
    public CollecteDto update(@PathVariable String ref, @Valid @RequestBody CreateCollecteRequest req, Authentication auth) {
        ownerOrAdmin(ref, auth);
        CollecteDto dto = CollecteDto.of(service.update(ref, req));
        audit.record(auth, "UPDATE_COLLECTE", "COLLECTE", ref,
                "Modification collecte " + ref + " — produit : " + req.product());
        return dto;
    }

    /** Delete a collecte — admin, or the collecteur who captured it. */
    @DeleteMapping("/{ref}")
    public ResponseEntity<Void> delete(@PathVariable String ref, Authentication auth) {
        ownerOrAdmin(ref, auth);
        service.delete(ref);
        audit.record(auth, "DELETE_COLLECTE", "COLLECTE", ref, "Suppression collecte " + ref);
        return ResponseEntity.noContent().build();
    }

    /** Guard: only the owning collecteur or an admin may mutate a given collecte. */
    private void ownerOrAdmin(String ref, Authentication auth) {
        if (isAdmin(auth)) return;
        Collecte c = service.byRef(ref);
        if (c == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "collecte_not_found");
        if (!auth.getPrincipal().equals(c.getCollectedById())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not_owner");
        }
    }
}
