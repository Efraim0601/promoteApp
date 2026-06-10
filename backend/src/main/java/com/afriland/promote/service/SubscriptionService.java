package com.afriland.promote.service;

import com.afriland.promote.model.*;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.receipt.SaraReceipt;
import com.afriland.promote.receipt.SaraReceiptExtractor;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.SubscriptionRepository;
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

/** Core subscription / KYC business logic, ported from the prototype (app.jsx, kyc.jsx). */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final SubscriptionRepository subs;
    private final CardConfigRepository configs;
    private final AppUserRepository users;
    private final PaymentGateway gateway;
    private final ImageStorage storage;
    private final SaraReceiptExtractor receiptExtractor;

    // PRM-#### sequence (prototype starts at 1008, demo data uses 1000..1008)
    private final AtomicInteger seq = new AtomicInteger(1008);

    public SubscriptionService(SubscriptionRepository subs, CardConfigRepository configs,
                               AppUserRepository users, PaymentGateway gateway,
                               ImageStorage storage, SaraReceiptExtractor receiptExtractor) {
        this.subs = subs;
        this.configs = configs;
        this.users = users;
        this.gateway = gateway;
        this.storage = storage;
        this.receiptExtractor = receiptExtractor;
    }

    /** Initialise the sequence above the highest existing reference (after seeding). */
    public void initSequence() {
        int max = subs.findAll().stream()
                .map(Subscription::getRef)
                .filter(r -> r != null && r.startsWith("PRM-"))
                .map(r -> {
                    try { return Integer.parseInt(r.substring(4)); } catch (Exception e) { return 0; }
                })
                .max(Integer::compareTo).orElse(1008);
        seq.set(Math.max(max, 1008));
    }

    public CardConfig config() {
        return configs.findById(1L).orElseGet(() ->
                configs.save(CardConfig.builder().id(1L).price(5000).fees(500).transport(1000).build()));
    }

    private String newRef() {
        return "PRM-" + seq.incrementAndGet();
    }

    /** total = price + fees + (transport if delivery == home). Ports kyc.jsx:37. */
    private int total(CardConfig cfg, String delivery) {
        int transport = "home".equals(delivery) ? cfg.getTransport() : 0;
        // The client pays the card price only (issuance fee is no longer charged).
        return cfg.getPrice() + transport;
    }

    /** Resolve a referrer (sales agent) by phone — ports app.jsx:findAgentByPhone. */
    public AppUser resolveAgentByPhone(String phone) {
        if (phone == null) return null;
        // Match on the local 9-digit number so a client's "6XXXXXXXX" links to the agent
        // regardless of how the agent's phone was stored (with/without the +237 country code).
        String want = local9(phone);
        if (want.isEmpty()) return null;
        return users.findByRole(Role.AGENT).stream()
                .filter(a -> a.getPhone() != null && local9(a.getPhone()).equals(want))
                .findFirst().orElse(null);
    }

    /** Reduce a phone to its local Cameroon form (the last 9 digits), dropping any country code. */
    private static String local9(String phone) {
        String d = phone.replaceAll("\\D", "");
        return d.length() > 9 ? d.substring(d.length() - 9) : d;
    }

    @Transactional
    public Subscription create(CreateSubscriptionRequest req, String channel, String agentId) {
        CardConfig cfg = config();
        String delivery = (req.delivery() == null || req.delivery().isBlank()) ? "promote" : req.delivery();
        int transport = "home".equals(delivery) ? cfg.getTransport() : 0;
        int amount = total(cfg, delivery);
        boolean isSelf = "self".equals(channel);

        // Resolve the referrer (parrain) by phone for BOTH channels. In the self path the
        // referrer also becomes the owning agent (QR sale attribution); in the assisted path
        // the seller stays the logged-in agent and the referrer is recorded for tracking only.
        AppUser referrer = resolveAgentByPhone(req.referrerPhone());
        boolean cash = "cash".equals(req.pay());
        boolean sara = "sara".equals(req.pay());
        boolean momo = "om".equals(req.pay()) || "mtn".equals(req.pay());
        // SARA money requires the receipt to have been uploaded first (key returned by /api/kyc/image).
        if (sara && (req.saraReceiptKey() == null || req.saraReceiptKey().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sara_receipt_required");
        }
        // MoMo: the payment number may differ from the KYC phone. Require it, fall back to phone.
        // Numbers arrive in E.164 form ("+CC…") carrying their own country code — stored as-is.
        String payRaw = req.payPhone() != null && !req.payPhone().isBlank() ? req.payPhone() : req.phone();
        String payPhone = momo ? payRaw.trim() : null;

        Subscription s = Subscription.builder()
                .ref(newRef())
                .prenom(req.prenom().trim())
                .nom(req.nom().trim())
                .fullName((req.prenom().trim() + " " + req.nom().trim()).trim())
                .sexe(req.sexe())
                .email(req.email() == null ? null : req.email().trim())
                .docType(req.docType() == null || req.docType().isBlank() ? "cni" : req.docType().trim())
                .cni(req.cni())
                .niu(normNiu(req.niu()))
                .cniExp(req.cniExp())
                .phone(req.phone().trim())
                .quartier(req.quartier() == null ? null : req.quartier().trim())
                .region(req.region())
                .ville(req.ville() == null ? null : req.ville().trim())
                .pay(req.pay())
                .payPhone(payPhone)
                .delivery(delivery)
                .amount(amount)
                .transport(transport)
                .channel(channel)
                .agentId(isSelf ? (referrer != null ? referrer.getId() : null) : agentId)
                .referrerName(referrer != null ? referrer.getName() : null)
                .referrerPhone(req.referrerPhone() != null && !req.referrerPhone().isBlank()
                        ? req.referrerPhone().trim() : null)
                .payStatus(cash ? PayStatus.cash : sara ? PayStatus.sara_pending : PayStatus.pending)
                .printed(false)
                .selfieVerified(req.selfie() || req.selfieKey() != null)
                .selfieKey(req.selfieKey())
                .cniRectoKey(req.cniRectoKey())
                .cniVersoKey(req.cniVersoKey())
                .saraReceiptKey(sara ? req.saraReceiptKey() : null)
                .createdAt(Instant.now())
                .build();

        s = subs.save(s);
        // cash and SARA are settled off-platform (in person / external app) — no gateway push.
        if (!cash && !sara) {
            try {
                // Push the USSD prompt via the active gateway (simulated or real aggregator).
                PaymentGateway.PaymentRequest pr = gateway.requestPayment(s, req.pay());
                s.setPaymentTxId(pr.externalRef());          // store the aggregator's transaction id
                s.setPaymentMessage(pr.message());           // reason to surface on failure
                if (!pr.accepted()) s.setPayStatus(PayStatus.failed);
            } catch (RuntimeException ex) {
                // The aggregator was unreachable / login failed (e.g. an invalidated secret):
                // keep the KYC file but mark the payment failed, and LOG why for diagnosis.
                log.warn("Payment initiation failed for {} ({}): {}", s.getRef(), req.pay(), ex.getMessage());
                s.setPayStatus(PayStatus.failed);
                s.setPaymentMessage("Service de paiement indisponible");
            }
            s = subs.save(s);
        } else if (sara) {
            // Parse the uploaded receipt (PDF text / OCR) and prefill the reference, payer phone
            // and amount for the point-of-sale agent to confirm. Best-effort — never blocks.
            applyReceiptExtraction(s);
            // The client may have confirmed/corrected the receipt reference on the form — it wins.
            if (req.saraRef() != null && !req.saraRef().isBlank()) s.setSaraRef(req.saraRef().trim());
            s = subs.save(s);
        }
        return s;
    }

    /** Extract reference / payer / amount from the stored SARA receipt onto the subscription. */
    private void applyReceiptExtraction(Subscription s) {
        if (s.getSaraReceiptKey() == null) return;
        ImageStorage.StoredImage img = storage.load(s.getSaraReceiptKey());
        if (img == null) return;
        SaraReceipt r = receiptExtractor.extract(img.data(), img.contentType());
        s.setSaraRef(r.reference());
        s.setSaraPayerPhone(r.payerPhone());
        s.setSaraAmount(r.amount());
        log.info("SARA receipt parsed for {}: ref={} payer={} amount={}",
                s.getRef(), r.reference(), r.payerPhone(), r.amount());
    }

    public List<Subscription> all() {
        return subs.findAllByOrderByCreatedAtAsc();
    }

    public List<Subscription> mine(String agentId) {
        return subs.findByAgentIdOrderByCreatedAtAsc(agentId);
    }

    public Subscription byRef(String ref) {
        return subs.findByRefIgnoreCase(ref).orElse(null);
    }

    /** Print-point search: match a record by reference, client name, or phone (most recent first). */
    public List<Subscription> search(String q) {
        if (q == null || q.isBlank()) return List.of();
        String needle = q.trim().toLowerCase();
        String digits = q.replaceAll("\\D", "");
        return subs.findAll().stream()
                .filter(s -> {
                    boolean byRef = s.getRef() != null && s.getRef().toLowerCase().contains(needle);
                    boolean byName = s.getFullName() != null && s.getFullName().toLowerCase().contains(needle);
                    boolean byPhone = !digits.isEmpty() && s.getPhone() != null
                            && s.getPhone().replaceAll("\\D", "").contains(digits);
                    return byRef || byName || byPhone;
                })
                .sorted(java.util.Comparator.comparing(Subscription::getCreatedAt).reversed())
                .limit(30)
                .toList();
    }

    @Transactional
    public Subscription applyPayment(String ref, String outcome, String reason) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        boolean ok = "validate".equalsIgnoreCase(outcome);
        s.setPayStatus(ok ? PayStatus.paid : PayStatus.failed);
        // Keep the decline reason (e.g. "Solde insuffisant") so the client UI can explain why; clear it on success.
        s.setPaymentMessage(ok ? null : (reason == null || reason.isBlank() ? null : reason.trim()));
        return subs.save(s);
    }

    /**
     * Apply an aggregator webhook (push). {@code orderId} is the reference we sent
     * ({@code sub.ref}); {@code newStatus} is the resolved {@link PayStatus} (or null
     * if the aggregator status was not terminal). Only moves a transaction that is
     * still {@code pending}, so a late/duplicate webhook can't overturn a final state.
     */
    @Transactional
    public Subscription applyWebhook(String orderId, PayStatus newStatus, String reason) {
        if (orderId == null || newStatus == null) return null;
        Subscription s = subs.findByRefIgnoreCase(orderId).orElse(null);
        if (s == null) return null;
        if (s.getPayStatus() == PayStatus.pending) {
            s.setPayStatus(newStatus);
            // On a decline, keep the aggregator's reason (e.g. "Solde insuffisant") for the client UI.
            if (newStatus == PayStatus.failed && reason != null && !reason.isBlank()) {
                s.setPaymentMessage(reason.trim());
            }
            subs.save(s);
        }
        return s;
    }

    /**
     * Current payment status for the public polling endpoint. If still pending and the
     * active gateway can pull a live status (get-status), use it as a fallback for when
     * the webhook hasn't arrived (e.g. no public URL in dev).
     */
    @Transactional
    public Subscription refreshStatus(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
        if (s == null) return null;
        if (s.getPayStatus() == PayStatus.pending) {
            PayStatus pulled = gateway.queryStatus(s).orElse(null);
            if (pulled != null && pulled != PayStatus.pending) {
                s.setPayStatus(pulled);
                subs.save(s);
            }
        }
        return s;
    }

    @Transactional
    public Subscription markPrinted(String ref, String cardNumber, String pan) {
        // The physical card number is mandatory: it ties the printed card to the subscription.
        if (cardNumber == null || cardNumber.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "card_number_required");
        }
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        // A card may only be activated once the payment is settled: MoMo paid, or cash to be
        // collected at the print point. Never for a failed / pending / SARA-pending transaction.
        if (s.getPayStatus() != PayStatus.paid && s.getPayStatus() != PayStatus.cash) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "payment_not_settled");
        }
        s.setCardNumber(cardNumber.trim());
        // PAN (Primary Account Number) — captured at activation, optional.
        if (pan != null && !pan.isBlank()) s.setPan(pan.trim());
        s.setPrinted(true);
        return subs.save(s);
    }

    /** Replace a captured KYC image (key already uploaded via /api/kyc/image) — used at the print
     *  point to retake a badly-shot photo before printing. */
    @Transactional
    public Subscription updatePhoto(String ref, String kind, String key) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        switch (kind == null ? "" : kind) {
            case "selfie" -> s.setSelfieKey(key);
            case "cni-recto" -> s.setCniRectoKey(key);
            case "cni-verso" -> s.setCniVersoKey(key);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_kind");
        }
        return subs.save(s);
    }

    /**
     * Point-of-sale decision on a SARA money receipt. Idempotent: only acts while the record is
     * still {@code sara_pending}, so a payment can't be validated twice or overturned once final.
     * {@code validate} → {@code paid} (printable); {@code reject} → {@code failed} (+ reason).
     */
    @Transactional
    public Subscription validateSara(String ref, SaraValidateRequest req) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        if (s.getPayStatus() != PayStatus.sara_pending) return s;
        // Persist the agent's confirmed/corrected receipt values (prefilled from extraction).
        if (req.saraRef() != null) s.setSaraRef(blankToNull(req.saraRef()));
        if (req.saraPayerPhone() != null) s.setSaraPayerPhone(blankToNull(req.saraPayerPhone()));
        if (req.saraAmount() != null) s.setSaraAmount(req.saraAmount());
        if ("validate".equalsIgnoreCase(req.outcome())) {
            s.setPayStatus(PayStatus.paid);
            s.setPaymentMessage(null);
        } else {
            s.setPayStatus(PayStatus.failed);
            String reason = req.reason();
            s.setPaymentMessage(reason == null || reason.isBlank() ? "Reçu SARA non conforme" : reason.trim());
        }
        return subs.save(s);
    }

    /**
     * Cashier decision on an in-person cash payment. Idempotent: only acts while the record is
     * still {@code cash}, so a payment can't be validated twice or overturned once final.
     * {@code validate} → {@code paid} (printable), recording who collected the cash and when;
     * {@code reject} → {@code failed} (+ reason, e.g. the client never showed up to pay).
     */
    @Transactional
    public Subscription validateCash(String ref, String outcome, String reason, String cashierId) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        if (s.getPayStatus() != PayStatus.cash) return s;
        if ("validate".equalsIgnoreCase(outcome)) {
            s.setPayStatus(PayStatus.paid);
            s.setPaymentMessage(null);
            // Trace the collection: store the cashier's name (readable) and the timestamp.
            s.setCashCollectedBy(cashierName(cashierId));
            s.setCashCollectedAt(Instant.now());
        } else {
            s.setPayStatus(PayStatus.failed);
            s.setPaymentMessage(reason == null || reason.isBlank() ? "Paiement espèces non perçu" : reason.trim());
        }
        return subs.save(s);
    }

    /** Resolve a staff member's display name from their id; falls back to the raw id. */
    private String cashierName(String id) {
        if (id == null) return null;
        return users.findById(id).map(AppUser::getName).orElse(id);
    }

    private static String blankToNull(String v) {
        return v == null || v.trim().isEmpty() ? null : v.trim();
    }

    /** Agent claims a paid, unattributed QR sale — ports app.jsx:claimQrSale.
     *  {@code niu} is optionally captured at claim time and stored on the matched record. */
    @Transactional
    public ClaimResult claim(String agentId, String phone, String cni, String niu) {
        String ph = phone.replaceAll("\\D", "");
        String last9 = ph.length() > 9 ? ph.substring(ph.length() - 9) : ph;
        String cn = cni.replaceAll("\\D", "");

        Subscription match = subs.findAll().stream()
                .filter(s -> "self".equals(s.getChannel()))
                .filter(s -> {
                    String p = s.getPhone() == null ? "" : s.getPhone().replaceAll("\\D", "");
                    String pl9 = p.length() > 9 ? p.substring(p.length() - 9) : p;
                    return pl9.equals(last9);
                })
                .filter(s -> (s.getCni() == null ? "" : s.getCni().replaceAll("\\D", "")).equals(cn))
                .findFirst().orElse(null);

        if (match == null) return new ClaimResult(false, "notfound", null);
        if (match.getPayStatus() != PayStatus.paid) return new ClaimResult(false, "unpaid", SubscriptionDto.of(match));
        if (match.getAgentId() != null) return new ClaimResult(false, "taken", SubscriptionDto.of(match));

        match.setAgentId(agentId);
        String niuNorm = normNiu(niu);
        if (niuNorm != null) match.setNiu(niuNorm);   // capture/correct the NIU while linking the sale
        subs.save(match);
        return new ClaimResult(true, null, SubscriptionDto.of(match));
    }

    /**
     * Add or correct a client's NIU on an existing subscription (agent/admin). A blank value
     * clears it. Used when the client did not provide the NIU at subscription time.
     */
    @Transactional
    public Subscription updateNiu(String ref, String niu) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        s.setNiu(normNiu(niu));
        return subs.save(s);
    }

    /** Normalise a NIU: trim + uppercase, null when blank. */
    private static String normNiu(String niu) {
        if (niu == null) return null;
        String t = niu.trim().toUpperCase();
        return t.isEmpty() ? null : t;
    }
}
