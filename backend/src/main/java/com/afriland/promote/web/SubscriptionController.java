package com.afriland.promote.web;

import com.afriland.promote.model.PayStatus;
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

    /** Print point — search records by reference, client name, or phone. */
    @GetMapping("/search")
    public List<SubscriptionDto> search(@RequestParam String q) {
        return service.search(q).stream().map(SubscriptionDto::of).toList();
    }

    /** Print point — retrieve a KYC file by reference. */
    @GetMapping("/{ref}")
    public ResponseEntity<SubscriptionDto> byRef(@PathVariable String ref) {
        Subscription s = service.byRef(ref);
        return s == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(SubscriptionDto.of(s));
    }

    /** Stream a captured document (staff only); kind = selfie | cni-recto | cni-verso | sara-receipt.
     *  Keeps object storage private — files are proxied through the backend. The SARA receipt may
     *  be a PDF, so the response content-type is taken from what was stored. */
    @GetMapping("/{ref}/image/{kind}")
    public ResponseEntity<byte[]> image(@PathVariable String ref, @PathVariable String kind) {
        Subscription s = service.byRef(ref);
        if (s == null) return ResponseEntity.notFound().build();
        String key = s.imageKey(kind);
        if (key == null) return ResponseEntity.notFound().build();
        ImageStorage.StoredImage img = storage.load(key);
        if (img == null) return ResponseEntity.notFound().build();
        MediaType type;
        try {
            type = MediaType.parseMediaType(img.contentType() == null ? "image/jpeg" : img.contentType());
        } catch (RuntimeException ex) {
            type = MediaType.IMAGE_JPEG;
        }
        return ResponseEntity.ok().contentType(type).body(img.data());
    }

    /** MoMo simulation — public (client validates/declines on their phone). */
    @PatchMapping("/{ref}/pay")
    public SubscriptionDto pay(@PathVariable String ref, @RequestBody PayRequest req) {
        return SubscriptionDto.of(service.applyPayment(ref, req.outcome()));
    }

    /** Public, lightweight payment status — polled by the client while awaiting confirmation.
     *  Exposes only the status (no KYC data), and pulls a live status as a fallback. */
    @GetMapping("/{ref}/status")
    public ResponseEntity<PaymentStatusDto> status(@PathVariable String ref) {
        PayStatus st = service.statusOf(ref);
        return st == null ? ResponseEntity.notFound().build()
                : ResponseEntity.ok(new PaymentStatusDto(ref, st.name()));
    }

    /** Print point — mark a card printed & handed over. */
    @PatchMapping("/{ref}/print")
    public SubscriptionDto print(@PathVariable String ref) {
        return SubscriptionDto.of(service.markPrinted(ref));
    }

    /** Point of sale (staff) — validate or reject a SARA money receipt.
     *  outcome = validate (→ paid) | reject (→ failed, with an optional reason). */
    @PatchMapping("/{ref}/sara-validate")
    public SubscriptionDto saraValidate(@PathVariable String ref, @RequestBody SaraValidateRequest req) {
        return SubscriptionDto.of(service.validateSara(ref, req));
    }

    /** Agent claims a paid, unattributed QR sale (optionally capturing the client's NIU). */
    @PostMapping("/claim")
    public ClaimResult claim(@Valid @RequestBody ClaimRequest req, Authentication auth) {
        return service.claim((String) auth.getPrincipal(), req.phone(), req.cni(), req.niu());
    }

    /** Agent/admin — add or correct a client's NIU on an existing subscription. */
    @PatchMapping("/{ref}/niu")
    public SubscriptionDto updateNiu(@PathVariable String ref, @RequestBody NiuUpdateRequest req) {
        return SubscriptionDto.of(service.updateNiu(ref, req.niu()));
    }
}
