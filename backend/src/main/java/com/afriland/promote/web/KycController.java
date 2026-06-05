package com.afriland.promote.web;

import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.ImageKeyResponse;
import com.afriland.promote.web.dto.Dtos.ImageUpload;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Base64;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Public KYC image upload (client self-subscription path, before the subscription
 * exists). Accepts the client photo and the ID-card front/back; stores each in
 * object storage and returns its key.
 */
@RestController
@RequestMapping("/api/kyc")
public class KycController {

    private static final long MAX_BYTES = 6 * 1024 * 1024; // 6 MB
    private static final Set<String> KINDS = Set.of("selfie", "cni-recto", "cni-verso");
    private static final Pattern DATA_URL = Pattern.compile("^data:(image/(?:jpeg|png));base64,(.+)$", Pattern.DOTALL);

    private final ImageStorage storage;

    public KycController(ImageStorage storage) {
        this.storage = storage;
    }

    @PostMapping("/image")
    public ResponseEntity<ImageKeyResponse> uploadImage(@Valid @RequestBody ImageUpload req) {
        String kind = (req.kind() == null || req.kind().isBlank()) ? "selfie" : req.kind();
        if (!KINDS.contains(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_kind");
        }
        String contentType = "image/jpeg";
        String b64 = req.image();
        Matcher m = DATA_URL.matcher(req.image().trim());
        if (m.matches()) {
            contentType = m.group(1);
            b64 = m.group(2);
        }
        byte[] data;
        try {
            data = Base64.getDecoder().decode(b64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_image");
        }
        if (data.length == 0 || data.length > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "image_too_large");
        }
        String key = storage.store(data, contentType, kind);
        return ResponseEntity.ok(new ImageKeyResponse(key));
    }
}
