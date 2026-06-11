package com.afriland.promote.web;

import com.afriland.promote.model.Recharge;
import com.afriland.promote.service.RechargeService;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.*;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Prepaid-card recharge (top-up) endpoints — public create + staff validation. */
@RestController
@RequestMapping("/api/recharges")
public class RechargeController {

    private final RechargeService service;
    private final ImageStorage storage;

    public RechargeController(RechargeService service, ImageStorage storage) {
        this.service = service;
        this.storage = storage;
    }

    /** Public — create a recharge (QR / open path, no account). */
    @PostMapping
    public RechargeDto create(@Valid @RequestBody CreateRechargeRequest req) {
        return RechargeDto.of(service.create(req));
    }

    /** Admin — all recharges. */
    @GetMapping
    public List<RechargeDto> all() {
        return service.all().stream().map(RechargeDto::of).toList();
    }

    /** Staff — search a recharge by reference, holder name, or PAN. */
    @GetMapping("/search")
    public List<RechargeDto> search(@RequestParam String q) {
        return service.search(q).stream().map(RechargeDto::of).toList();
    }

    /** Staff — fetch a single recharge. */
    @GetMapping("/{ref}")
    public ResponseEntity<RechargeDto> byRef(@PathVariable String ref) {
        Recharge r = service.byRef(ref);
        return r == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(RechargeDto.of(r));
    }

    /** Staff — stream the SARA receipt for a recharge (the only stored document). */
    @GetMapping("/{ref}/image/{kind}")
    public ResponseEntity<byte[]> image(@PathVariable String ref, @PathVariable String kind) {
        Recharge r = service.byRef(ref);
        if (r == null) return ResponseEntity.notFound().build();
        String key = r.imageKey(kind);
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
    public RechargeDto pay(@PathVariable String ref, @RequestBody PayRequest req) {
        return RechargeDto.of(service.applyPayment(ref, req.outcome(), req.reason()));
    }

    /** Public, lightweight payment status — polled by the client while awaiting confirmation. */
    @GetMapping("/{ref}/status")
    public ResponseEntity<PaymentStatusDto> status(@PathVariable String ref) {
        Recharge r = service.refreshStatus(ref);
        return r == null ? ResponseEntity.notFound().build()
                : ResponseEntity.ok(new PaymentStatusDto(r.getRef(), r.getPayStatus().name(), r.getPaymentMessage()));
    }

    /** Point of sale (staff) — validate or reject a SARA money receipt for a recharge. */
    @PatchMapping("/{ref}/sara-validate")
    public RechargeDto saraValidate(@PathVariable String ref, @RequestBody SaraValidateRequest req) {
        return RechargeDto.of(service.validateSara(ref, req));
    }

    /** Cashier — validate or reject an in-person cash recharge. */
    @PatchMapping("/{ref}/cash-validate")
    public RechargeDto cashValidate(@PathVariable String ref, @RequestBody CashValidateRequest req,
                                    Authentication auth) {
        return RechargeDto.of(service.validateCash(ref, req.outcome(), req.reason(), (String) auth.getPrincipal()));
    }
}
