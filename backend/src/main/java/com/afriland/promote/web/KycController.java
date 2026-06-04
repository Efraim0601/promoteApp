package com.afriland.promote.web;

import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.SelfieKeyResponse;
import com.afriland.promote.web.dto.Dtos.SelfieUpload;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Public KYC selfie upload (used by the client self-subscription path before the
 * subscription is created). Stores the image in object storage and returns its key.
 */
@RestController
@RequestMapping("/api/kyc")
public class KycController {

    private static final long MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    private static final Pattern DATA_URL = Pattern.compile("^data:(image/(?:jpeg|png));base64,(.+)$", Pattern.DOTALL);

    private final ImageStorage storage;

    public KycController(ImageStorage storage) {
        this.storage = storage;
    }

    @PostMapping("/selfie")
    public ResponseEntity<SelfieKeyResponse> uploadSelfie(@Valid @RequestBody SelfieUpload req) {
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
        String key = storage.store(data, contentType, "selfies");
        return ResponseEntity.ok(new SelfieKeyResponse(key));
    }
}
