package com.afriland.promote.web;

import com.afriland.promote.model.Subscription;
import com.afriland.promote.service.SubscriptionService;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {

    private final SubscriptionService service;
    private final ImageStorage storage;

    public SubscriptionController(SubscriptionService service, ImageStorage storage) {
        this.service = service;
        this.storage = storage;
    }

    /** Assisted subscription — created by an authenticated relationship officer. */
    @PostMapping
    public SubscriptionDto createAssisted(@Valid @RequestBody CreateSubscriptionRequest req, Authentication auth) {
        return SubscriptionDto.of(service.create(req, "agent", (String) auth.getPrincipal()));
    }

    /** Self subscription — public client path (QR scan at a stand, no account). */
    @PostMapping("/self")
    public SubscriptionDto createSelf(@Valid @RequestBody CreateSubscriptionRequest req) {
        return SubscriptionDto.of(service.create(req, "self", null));
    }

    /** Admin — all subscriptions. */
    @GetMapping
    public List<SubscriptionDto> all() {
        return service.all().stream().map(SubscriptionDto::of).toList();
    }

    /** Agent — own sales. */
    @GetMapping("/mine")
    public List<SubscriptionDto> mine(Authentication auth) {
        return service.mine((String) auth.getPrincipal()).stream().map(SubscriptionDto::of).toList();
    }

    /** Print point — retrieve a KYC file by reference. */
    @GetMapping("/{ref}")
    public ResponseEntity<SubscriptionDto> byRef(@PathVariable String ref) {
        Subscription s = service.byRef(ref);
        return s == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(SubscriptionDto.of(s));
    }

    /** Stream the captured KYC selfie (staff only). Keeps object storage private. */
    @GetMapping("/{ref}/selfie")
    public ResponseEntity<byte[]> selfie(@PathVariable String ref) {
        Subscription s = service.byRef(ref);
        if (s == null || s.getSelfieKey() == null) return ResponseEntity.notFound().build();
        ImageStorage.StoredImage img = storage.load(s.getSelfieKey());
        if (img == null) return ResponseEntity.notFound().build();
        MediaType type = "image/png".equalsIgnoreCase(img.contentType()) ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(type).body(img.data());
    }

    /** MoMo simulation — public (client validates/declines on their phone). */
    @PatchMapping("/{ref}/pay")
    public SubscriptionDto pay(@PathVariable String ref, @RequestBody PayRequest req) {
        return SubscriptionDto.of(service.applyPayment(ref, req.outcome()));
    }

    /** Print point — mark a card printed & handed over. */
    @PatchMapping("/{ref}/print")
    public SubscriptionDto print(@PathVariable String ref) {
        return SubscriptionDto.of(service.markPrinted(ref));
    }

    /** Agent claims a paid, unattributed QR sale. */
    @PostMapping("/claim")
    public ClaimResult claim(@Valid @RequestBody ClaimRequest req, Authentication auth) {
        return service.claim((String) auth.getPrincipal(), req.phone(), req.cni());
    }
}
