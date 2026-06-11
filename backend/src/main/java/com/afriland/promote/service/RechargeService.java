package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.receipt.SaraReceipt;
import com.afriland.promote.receipt.SaraReceiptExtractor;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.web.dto.Dtos.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Card top-up (recharge) business logic. Deliberately mirrors the payment lifecycle of
 * {@link SubscriptionService} (create → gateway push → webhook/polling, plus cash + SARA staff
 * validation) but on the separate {@link Recharge} entity, so subscriptions are never affected.
 */
@Service
public class RechargeService {

    private static final Logger log = LoggerFactory.getLogger(RechargeService.class);

    /** Free-entry amount bounds (XAF). */
    public static final int MIN_AMOUNT = 500;
    public static final int MAX_AMOUNT = 1_000_000;

    private final RechargeRepository recharges;
    private final AppUserRepository users;
    private final PaymentGateway gateway;
    private final ImageStorage storage;
    private final SaraReceiptExtractor receiptExtractor;

    /** RC###### sequence (hyphen-free, 8-char ref). */
    private final AtomicInteger seq = new AtomicInteger(0);
    private final java.security.SecureRandom rnd = new java.security.SecureRandom();

    public RechargeService(RechargeRepository recharges, AppUserRepository users, PaymentGateway gateway,
                           ImageStorage storage, SaraReceiptExtractor receiptExtractor) {
        this.recharges = recharges;
        this.users = users;
        this.gateway = gateway;
        this.storage = storage;
        this.receiptExtractor = receiptExtractor;
    }

    /** Initialise the sequence above the highest existing recharge reference (after seeding). */
    public void initSequence() {
        int max = recharges.findAll().stream()
                .map(Recharge::getRef)
                .filter(r -> r != null && r.startsWith("RC"))
                .map(r -> { try { return Integer.parseInt(r.substring(2)); } catch (Exception e) { return 0; } })
                .max(Integer::compareTo).orElse(0);
        seq.set(max);
    }

    /** Distinct, hyphen-free 8-char reference, e.g. "RC000123". */
    private String newRef() {
        return String.format("RC%06d", seq.incrementAndGet());
    }

    /** Globally-unique aggregator order id (epoch+random base36) — never collides after a DB reset. */
    private String newGatewayRef(String ref) {
        String suffix = Long.toString(Instant.now().toEpochMilli(), 36)
                + Integer.toString(rnd.nextInt(0x1000), 36);
        return (ref + suffix).toUpperCase();
    }

    @Transactional
    public Recharge create(CreateRechargeRequest req) {
        int amount = req.amount();
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount_out_of_range");
        }
        boolean cash = "cash".equals(req.pay());
        boolean sara = "sara".equals(req.pay());
        boolean momo = "om".equals(req.pay()) || "mtn".equals(req.pay());
        if (!cash && !sara && !momo) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_pay_method");
        }
        if (sara && (req.saraReceiptKey() == null || req.saraReceiptKey().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sara_receipt_required");
        }
        String payPhone = null;
        if (momo) {
            if (req.payPhone() == null || req.payPhone().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pay_phone_required");
            }
            payPhone = req.payPhone().trim();
        }

        Recharge r = Recharge.builder()
                .ref(newRef())
                .prenom(req.prenom().trim())
                .nom(req.nom().trim())
                .fullName((req.prenom().trim() + " " + req.nom().trim()).trim())
                .pan(req.pan().trim())
                .amount(amount)
                .latitude(req.latitude())
                .longitude(req.longitude())
                .geoAccuracy(req.geoAccuracy())
                .pay(req.pay())
                .payPhone(payPhone)
                .payStatus(cash ? PayStatus.cash : sara ? PayStatus.sara_pending : PayStatus.pending)
                .saraReceiptKey(sara ? req.saraReceiptKey() : null)
                .createdAt(Instant.now())
                .build();

        r = recharges.save(r);
        if (momo) {
            try {
                r.setGatewayRef(newGatewayRef(r.getRef()));
                PaymentGateway.PaymentRequest pr = gateway.requestPayment(r, req.pay());
                r.setPaymentTxId(pr.externalRef());
                r.setPaymentMessage(pr.message());
                if (!pr.accepted()) r.setPayStatus(PayStatus.failed);
            } catch (RuntimeException ex) {
                log.warn("Recharge payment initiation failed for {} ({}): {}", r.getRef(), req.pay(), ex.getMessage());
                r.setPayStatus(PayStatus.failed);
                r.setPaymentMessage("Service de paiement indisponible");
            }
            r = recharges.save(r);
        } else if (sara) {
            applyReceiptExtraction(r);
            if (req.saraRef() != null && !req.saraRef().isBlank()) r.setSaraRef(req.saraRef().trim());
            r = recharges.save(r);
        }
        return r;
    }

    /** Extract reference / payer / amount from the stored SARA receipt onto the recharge. */
    private void applyReceiptExtraction(Recharge r) {
        if (r.getSaraReceiptKey() == null) return;
        ImageStorage.StoredImage img = storage.load(r.getSaraReceiptKey());
        if (img == null) return;
        SaraReceipt rc = receiptExtractor.extract(img.data(), img.contentType());
        r.setSaraRef(rc.reference());
        r.setSaraPayerPhone(rc.payerPhone());
        r.setSaraAmount(rc.amount());
        log.info("SARA receipt parsed for recharge {}: ref={} payer={} amount={}",
                r.getRef(), rc.reference(), rc.payerPhone(), rc.amount());
    }

    public List<Recharge> all() {
        return recharges.findAllByOrderByCreatedAtAsc();
    }

    public Recharge byRef(String ref) {
        return recharges.findByRefIgnoreCase(ref).orElse(null);
    }

    /** Staff search: match a recharge by reference, holder name, or PAN (most recent first). */
    public List<Recharge> search(String q) {
        if (q == null || q.isBlank()) return List.of();
        String needle = q.trim().toLowerCase();
        String digits = q.replaceAll("\\D", "");
        return recharges.findAll().stream()
                .filter(r -> {
                    boolean byRef = r.getRef() != null && r.getRef().toLowerCase().contains(needle);
                    boolean byName = r.getFullName() != null && r.getFullName().toLowerCase().contains(needle);
                    boolean byPan = !digits.isEmpty() && r.getPan() != null
                            && r.getPan().replaceAll("\\D", "").contains(digits);
                    return byRef || byName || byPan;
                })
                .sorted(java.util.Comparator.comparing(Recharge::getCreatedAt).reversed())
                .limit(30)
                .toList();
    }

    public Recharge findByOrderId(String orderId) {
        if (orderId == null) return null;
        return recharges.findByGatewayRef(orderId).or(() -> recharges.findByRefIgnoreCase(orderId)).orElse(null);
    }

    /** Apply an aggregator webhook (push) — only moves a still-{@code pending} recharge. */
    @Transactional
    public Recharge applyWebhook(String orderId, PayStatus newStatus, String reason) {
        if (orderId == null || newStatus == null) return null;
        Recharge r = findByOrderId(orderId);
        if (r == null) return null;
        if (r.getPayStatus() == PayStatus.pending) {
            r.setPayStatus(newStatus);
            if (newStatus == PayStatus.paid) r.setPaidAt(Instant.now());
            if (newStatus == PayStatus.failed && reason != null && !reason.isBlank()) {
                r.setPaymentMessage(reason.trim());
            }
            recharges.save(r);
        }
        return r;
    }

    /** Public polling: refresh from the gateway's get-status while still pending. */
    @Transactional
    public Recharge refreshStatus(String ref) {
        return pullLiveStatus(recharges.findByRefIgnoreCase(ref).orElse(null));
    }

    @Transactional
    public Recharge pullLiveStatus(Recharge r) {
        if (r != null && r.getPayStatus() == PayStatus.pending) {
            PayStatus pulled = gateway.queryStatus(r).orElse(null);
            if (pulled != null && pulled != PayStatus.pending) {
                r.setPayStatus(pulled);
                if (pulled == PayStatus.paid) r.setPaidAt(Instant.now());
                recharges.save(r);
            }
        }
        return r;
    }

    /** MoMo simulation (validate / fail), mirrors SubscriptionService.applyPayment. */
    @Transactional
    public Recharge applyPayment(String ref, String outcome, String reason) {
        Recharge r = recharges.findByRefIgnoreCase(ref).orElseThrow();
        boolean ok = "validate".equalsIgnoreCase(outcome);
        r.setPayStatus(ok ? PayStatus.paid : PayStatus.failed);
        if (ok) r.setPaidAt(Instant.now());
        r.setPaymentMessage(ok ? null : (reason == null || reason.isBlank() ? null : reason.trim()));
        return recharges.save(r);
    }

    /** Point-of-sale decision on a SARA receipt — idempotent while still {@code sara_pending}. */
    @Transactional
    public Recharge validateSara(String ref, SaraValidateRequest req) {
        Recharge r = recharges.findByRefIgnoreCase(ref).orElseThrow();
        if (r.getPayStatus() != PayStatus.sara_pending) return r;
        if (req.saraRef() != null) r.setSaraRef(blankToNull(req.saraRef()));
        if (req.saraPayerPhone() != null) r.setSaraPayerPhone(blankToNull(req.saraPayerPhone()));
        if (req.saraAmount() != null) r.setSaraAmount(req.saraAmount());
        if ("validate".equalsIgnoreCase(req.outcome())) {
            r.setPayStatus(PayStatus.paid);
            r.setPaidAt(Instant.now());
            r.setPaymentMessage(null);
        } else {
            r.setPayStatus(PayStatus.failed);
            String reason = req.reason();
            r.setPaymentMessage(reason == null || reason.isBlank() ? "Reçu SARA non conforme" : reason.trim());
        }
        return recharges.save(r);
    }

    /** Cashier decision on an in-person cash payment — idempotent while still {@code cash}. */
    @Transactional
    public Recharge validateCash(String ref, String outcome, String reason, String cashierId) {
        Recharge r = recharges.findByRefIgnoreCase(ref).orElseThrow();
        if (r.getPayStatus() != PayStatus.cash) return r;
        if ("validate".equalsIgnoreCase(outcome)) {
            r.setPayStatus(PayStatus.paid);
            r.setPaidAt(Instant.now());
            r.setPaymentMessage(null);
            r.setCashCollectedBy(cashierName(cashierId));
            r.setCashCollectedById(cashierId);
            r.setCashCollectedAt(Instant.now());
        } else {
            r.setPayStatus(PayStatus.failed);
            r.setPaymentMessage(reason == null || reason.isBlank() ? "Paiement espèces non perçu" : reason.trim());
        }
        return recharges.save(r);
    }

    private String cashierName(String id) {
        if (id == null) return null;
        return users.findById(id).map(AppUser::getName).orElse(id);
    }

    private static String blankToNull(String v) {
        return v == null || v.trim().isEmpty() ? null : v.trim();
    }
}
