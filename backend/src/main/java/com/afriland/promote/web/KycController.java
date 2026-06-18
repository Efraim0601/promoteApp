package com.afriland.promote.web;

import com.afriland.promote.kyc.CniData;
import com.afriland.promote.kyc.CniExtractor;
import com.afriland.promote.kyc.CniMatch;
import com.afriland.promote.kyc.CniMatcher;
import com.afriland.promote.receipt.SaraReceipt;
import com.afriland.promote.receipt.SaraReceiptExtractor;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.CniOcrRequest;
import com.afriland.promote.web.dto.Dtos.CniOcrResponse;
import com.afriland.promote.web.dto.Dtos.ImageKeyResponse;
import com.afriland.promote.web.dto.Dtos.ImageUpload;
import com.afriland.promote.web.dto.Dtos.ReceiptUploadResponse;
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

    private static final long MAX_IMAGE_BYTES = 6 * 1024 * 1024;    // 6 MB for KYC images
    private static final long MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB for SARA receipts (PDFs are heavier)
    private static final Set<String> KINDS = Set.of("selfie", "cni-recto", "cni-verso", "sara-receipt", "recharge-evidence");
    private static final String RECEIPT_KIND = "sara-receipt";
    // SARA receipts may be a PDF; KYC images stay image-only.
    private static final Pattern DATA_URL =
            Pattern.compile("^data:(image/(?:jpeg|png)|application/pdf);base64,(.+)$", Pattern.DOTALL);

    private final ImageStorage storage;
    private final SaraReceiptExtractor receiptExtractor;
    private final CniExtractor cniExtractor;
    private final CniMatcher cniMatcher;

    public KycController(ImageStorage storage, SaraReceiptExtractor receiptExtractor,
                         CniExtractor cniExtractor, CniMatcher cniMatcher) {
        this.storage = storage;
        this.receiptExtractor = receiptExtractor;
        this.cniExtractor = cniExtractor;
        this.cniMatcher = cniMatcher;
    }

    @PostMapping("/image")
    public ResponseEntity<ImageKeyResponse> uploadImage(@Valid @RequestBody ImageUpload req) {
        String kind = (req.kind() == null || req.kind().isBlank()) ? "selfie" : req.kind();
        if (!KINDS.contains(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_kind");
        }
        Decoded d = decode(req.image(), RECEIPT_KIND.equals(kind));
        String key = storage.store(d.data, d.contentType, kind);
        return ResponseEntity.ok(new ImageKeyResponse(key));
    }

    /**
     * Upload a SARA money receipt and immediately return what was auto-extracted — the receipt
     * reference is the primary field. The client confirms/corrects it before submitting.
     */
    @PostMapping("/receipt")
    public ResponseEntity<ReceiptUploadResponse> uploadReceipt(@Valid @RequestBody ImageUpload req) {
        Decoded d = decode(req.image(), true);
        String key = storage.store(d.data, d.contentType, RECEIPT_KIND);
        SaraReceipt r = receiptExtractor.extract(d.data, d.contentType);
        return ResponseEntity.ok(new ReceiptUploadResponse(key, r.reference(), r.payerPhone(), r.amount()));
    }

    /**
     * OCR the captured CNI front image and cross-check it against the data the client typed.
     * Advisory only: returns per-field match flags so the UI can warn on a contradiction. When OCR
     * is disabled or reads nothing, {@code available} is false and the UI shows nothing.
     */
    @PostMapping("/cni-ocr")
    public ResponseEntity<CniOcrResponse> cniOcr(@Valid @RequestBody CniOcrRequest req) {
        Decoded d = decode(req.image(), false);   // CNI is image-only (no PDF)
        CniData ocr = cniExtractor.extract(d.data);
        boolean available = cniExtractor.isEnabled() && !ocr.isEmpty();
        if (!available) {
            return ResponseEntity.ok(new CniOcrResponse(false, null, null, null, null, null, 1.0));
        }
        CniMatch m = cniMatcher.match(ocr, req.prenom(), req.nom(), req.cni());
        return ResponseEntity.ok(new CniOcrResponse(true, m.nameMatch(), m.numberMatch(),
                m.extractedNom(), m.extractedPrenom(), m.extractedNumero(), m.confidence()));
    }

    /** Decode + validate a data URL / base64 payload. PDF is allowed only for receipts. */
    private Decoded decode(String image, boolean isReceipt) {
        String contentType = "image/jpeg";
        String b64 = image;
        Matcher m = DATA_URL.matcher(image.trim());
        if (m.matches()) {
            contentType = m.group(1);
            b64 = m.group(2);
        }
        if ("application/pdf".equals(contentType) && !isReceipt) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pdf_not_allowed");
        }
        byte[] data;
        try {
            data = Base64.getDecoder().decode(b64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_image");
        }
        long max = isReceipt ? MAX_RECEIPT_BYTES : MAX_IMAGE_BYTES;
        if (data.length == 0 || data.length > max) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "image_too_large");
        }
        return new Decoded(data, contentType);
    }

    private record Decoded(byte[] data, String contentType) {}
}
