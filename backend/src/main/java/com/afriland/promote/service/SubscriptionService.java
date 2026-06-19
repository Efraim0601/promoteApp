package com.afriland.promote.service;

import com.afriland.promote.model.*;
import com.afriland.promote.util.PanUtils;
import com.afriland.promote.payment.GatewayClientMessages;
import com.afriland.promote.payment.MomoDebitGuard;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.payment.PaymentInitiationEvent;
import com.afriland.promote.receipt.SaraReceipt;
import com.afriland.promote.receipt.SaraReceiptExtractor;
import com.afriland.promote.storage.ImageStorage;
import com.afriland.promote.repo.AgencyRepository;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.kyc.CniMatcher;
import com.afriland.promote.payment.LiveStatusThrottle;
import com.afriland.promote.web.dto.Dtos.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Core subscription / KYC business logic, ported from the prototype (app.jsx, kyc.jsx). */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final SubscriptionRepository subs;
    private final CardConfigRepository configs;
    private final AppUserRepository users;
    private final AgencyRepository agencies;
    private final PaymentGateway gateway;
    private final ImageStorage storage;
    private final SaraReceiptExtractor receiptExtractor;
    private final ReferenceSequence refs;     // PRM-#### sequence (subscriptions only)
    private final ApplicationEventPublisher events;
    private final CommissionService commissions;

    /** When true, the gateway push runs off the request thread (PaymentDispatcher); see application.yml. */
    @Value("${app.payment.async:false}")
    private boolean asyncPayments;
    @Value("${app.payment.debit-guard-seconds:300}")
    private long debitGuardSeconds;

    private final java.security.SecureRandom rnd = new java.security.SecureRandom();

    private final TransactionTemplate tx;
    private final LiveStatusThrottle statusThrottle;

    public SubscriptionService(SubscriptionRepository subs, CardConfigRepository configs,
                               AppUserRepository users, AgencyRepository agencies, PaymentGateway gateway,
                               ImageStorage storage, SaraReceiptExtractor receiptExtractor,
                               ReferenceSequence refs, ApplicationEventPublisher events,
                               CommissionService commissions, PlatformTransactionManager txManager,
                               LiveStatusThrottle statusThrottle) {
        this.subs = subs;
        this.configs = configs;
        this.users = users;
        this.agencies = agencies;
        this.gateway = gateway;
        this.storage = storage;
        this.receiptExtractor = receiptExtractor;
        this.refs = refs;
        this.events = events;
        this.commissions = commissions;
        this.tx = new TransactionTemplate(txManager);
        this.statusThrottle = statusThrottle;
    }

    /** Award the sales commission for a settled subscription. Idempotent — safe to call from every
     *  paid-transition path (MoMo webhook, reconciliation, live pull, cash, SARA). */
    private void awardCommission(Subscription s) {
        try {
            commissions.recordForSubscription(s);
        } catch (RuntimeException e) {
            // Commission accounting must never break the payment flow.
            log.warn("Commission recording failed for {}: {}", s.getRef(), e.getMessage());
        }
    }

    /** Initialise the shared sequence above the highest existing reference (after seeding). */
    public void initSequence() {
        refs.init();
    }

    public CardConfig config() {
        return configs.findById(1L).orElseGet(() ->
                configs.save(CardConfig.builder().id(1L).price(10000).fees(500).transport(1000).build()));
    }

    private String newRef() {
        return refs.next();
    }

    /** Globally-unique order id for the aggregator: the human ref plus an epoch+random suffix, so it
     *  never collides with an order id already known to TrustPayWay after a DB reset / re-deploy. */
    private String newGatewayRef(String ref) {
        String suffix = Long.toString(Instant.now().toEpochMilli(), 36)
                + Integer.toString(rnd.nextInt(0x1000), 36);
        return (ref + "-" + suffix).toUpperCase();
    }

    /** Find a recent MoMo attempt for the same phone/amount/method to resume instead of creating a
     *  duplicate subscription or sending a second TrustPayWay debit. */
    private Subscription findResumableMomo(String payPhone, int amount, String pay) {
        String want = MomoDebitGuard.payPhone9(payPhone);
        if (want.isEmpty()) return null;
        Instant cutoff = Instant.now().minusSeconds(debitGuardSeconds);
        return subs.findRecentMomoAttempts(pay, amount, cutoff).stream()
                .filter(s -> want.equals(MomoDebitGuard.payPhone9(s.getPayPhone())))
                .filter(s -> MomoDebitGuard.shouldResumeSubscription(s, debitGuardSeconds))
                .findFirst()
                .orElse(null);
    }

    /** Another recent order already triggered (or completed) a TrustPayWay debit for this line. */
    private boolean hasConflictingMomoDebit(String payPhone, int amount, String pay, String excludeRef) {
        String want = MomoDebitGuard.payPhone9(payPhone);
        if (want.isEmpty()) return false;
        Instant cutoff = Instant.now().minusSeconds(debitGuardSeconds);
        return subs.findRecentMomoAttempts(pay, amount, cutoff).stream()
                .filter(s -> excludeRef == null || !excludeRef.equals(s.getRef()))
                .filter(s -> want.equals(MomoDebitGuard.payPhone9(s.getPayPhone())))
                .anyMatch(s -> MomoDebitGuard.blocksDuplicatePush(s, debitGuardSeconds));
    }

    /** Offre Promote : la carte est gratuite — le client règle la recharge initiale + le Pass
     *  Premium (+ transport si livraison à domicile, option non proposée actuellement). */
    private int total(CardConfig cfg, String delivery, String cardType) {
        int transport = "home".equals(delivery) ? cfg.getTransport() : 0;
        // Carte bancaire (défaut) et carte prépayée ont chacune leur couple de montants configurables.
        int passPremium = "prepaid".equals(cardType) ? cfg.passPremiumOr() : cfg.passPremiumBancaireOr();
        return rechargePortion(cfg, cardType) + passPremium + transport;
    }

    /** Part « recharge initiale » du total selon le type de carte (le reste = vente de la carte) ;
     *  figée sur la souscription pour que la caisse puisse dissocier recharge et vente. */
    private int rechargePortion(CardConfig cfg, String cardType) {
        return "prepaid".equals(cardType) ? cfg.rechargeInitialeOr() : cfg.rechargeInitialeBancaireOr();
    }

    /** Resolve a referrer (sales agent) by phone — ports app.jsx:findAgentByPhone. */
    public AppUser resolveAgentByPhone(String phone) {
        if (phone == null) return null;
        // Match on the local 9-digit number so a client's "6XXXXXXXX" links to the agent
        // regardless of how the agent's phone was stored (with/without the +237 country code).
        String want = local9(phone);
        if (want.isEmpty()) return null;
        return users.findByEffectiveRole(Role.AGENT).stream()
                .filter(a -> a.getPhone() != null && local9(a.getPhone()).equals(want))
                .findFirst().orElse(null);
    }

    /** Reduce a phone to its local Cameroon form (the last 9 digits), dropping any country code.
     *  Null-safe: a missing number yields an empty string (never matches). */
    public static String local9(String phone) {
        if (phone == null) return "";
        String d = phone.replaceAll("\\D", "");
        return d.length() > 9 ? d.substring(d.length() - 9) : d;
    }

    @Transactional
    public Subscription create(CreateSubscriptionRequest req, String channel, String agentId) {
        CardConfig cfg = config();
        String delivery = (req.delivery() == null || req.delivery().isBlank()) ? "promote" : req.delivery();
        // Type de carte : bancaire (défaut) ou prepaid — détermine les montants et le motif de paiement.
        String cardType = "prepaid".equals(req.cardType()) ? "prepaid" : "bancaire";
        int transport = "home".equals(delivery) ? cfg.getTransport() : 0;
        int amount = total(cfg, delivery, cardType);
        int rechargeAmount = rechargePortion(cfg, cardType);
        boolean isSelf = "self".equals(channel);

        // Pickup branch: only meaningful when delivery == agence. Snapshot the name so it survives
        // the agency being renamed/removed; ignore a stale/unknown id rather than failing the sale.
        String pickupAgencyId = null, pickupAgencyName = null;
        if ("agence".equals(delivery) && req.pickupAgencyId() != null && !req.pickupAgencyId().isBlank()) {
            Agency a = agencies.findById(req.pickupAgencyId().trim()).orElse(null);
            if (a != null) { pickupAgencyId = a.getId(); pickupAgencyName = a.getName(); }
        }

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

        // Idempotence: if the SAME number is already mid-payment for the SAME amount/method (a pending
        // transaction created in the last few minutes), resume it instead of creating a duplicate
        // subscription + a second gateway push. This is what users' rapid "Payer" re-taps produced.
        if (momo) {
            Subscription resumable = findResumableMomo(payPhone, amount, req.pay());
            if (resumable != null) {
                if (resumable.getPayStatus() == PayStatus.failed) {
                    resumable.setPayStatus(PayStatus.pending);
                    resumable.setPaymentMessage(null);
                    resumable.setFailedAt(null);
                    subs.save(resumable);
                }
                log.info("Reprise du paiement {} (tel={} {} {} XAF, status={}) — pas de second débit",
                        resumable.getRef(), payPhone, req.pay(), amount, resumable.getPayStatus());
                return resumable;
            }
        }

        // Two Promote cards per IDENTITY max: block a third subscription when an earlier non-failed one
        // shares the SAME CNI number AND birth date AND name. The name is matched on both the typed value
        // and the value OCR read off the CNI, with a 20% edit-distance tolerance (OCR rarely reads a long
        // name perfectly). A failed attempt may be retried. (pending / paid / cash / SARA count as active.)
        if (isCniDocument(req.docType()) && !isValidCniFormat(req.cni())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cni_invalid");
        }
        LocalDate birthDate = parseBirthDate(req.naissance());
        if (isCniDocument(req.docType()) && !normCniMatch(req.cni()).isEmpty()) {
            long sameIdentity = subs.findByCniNormAndPayStatusNot(normCniMatch(req.cni()), PayStatus.failed)
                    .stream().filter(s -> isSameIdentity(s, birthDate, req)).count();
            if (sameIdentity >= 2) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "cni_exists");
            }
        }

        String cniNorm = isCniDocument(req.docType()) ? normCniMatch(req.cni()) : null;

        Subscription s = Subscription.builder()
                .ref(newRef())
                .prenom(req.prenom().trim())
                .nom(req.nom().trim())
                .fullName((req.prenom().trim() + " " + req.nom().trim()).trim())
                .sexe(req.sexe())
                .email(req.email() == null ? null : req.email().trim())
                .docType(req.docType() == null || req.docType().isBlank() ? "cni" : req.docType().trim())
                .cni(req.cni())
                .cniNorm(cniNorm)
                .niu(normNiu(req.niu()))
                .cniExp(req.cniExp())
                .birthDate(birthDate)
                .cniOcrNom(blankToNull(req.cniOcrNom()))
                .cniOcrPrenom(blankToNull(req.cniOcrPrenom()))
                .phone(req.phone().trim())
                .quartier(req.quartier() == null ? null : req.quartier().trim())
                .region(req.region())
                .ville(req.ville() == null ? null : req.ville().trim())
                .latitude(req.latitude())
                .longitude(req.longitude())
                .geoAccuracy(req.geoAccuracy())
                .pay(req.pay())
                .payPhone(payPhone)
                .delivery(delivery)
                .cardType(cardType)
                .pickupAgencyId(pickupAgencyId)
                .pickupAgencyName(pickupAgencyName)
                .amount(amount)
                .transport(transport)
                .rechargeAmount(rechargeAmount)
                .channel(channel)
                .agentId(isSelf ? (referrer != null ? referrer.getId() : null) : agentId)
                .referrerName(referrer != null ? referrer.getName() : null)
                .referrerPhone(req.referrerPhone() != null && !req.referrerPhone().isBlank()
                        ? req.referrerPhone().trim() : null)
                // Denormalised last-9 of the referrer phone for the indexed portfolio query (mine).
                .referrerPhone9(blankToNull(local9(req.referrerPhone())))
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
            // Globally-unique order id for the aggregator (survives DB resets — see Subscription.gatewayRef).
            s.setGatewayRef(newGatewayRef(s.getRef()));
            s = subs.save(s);
            if (asyncPayments) {
                // Persist as `pending`; the USSD push happens OFF the request thread once this
                // transaction commits (PaymentDispatcher). The client polls /status; the webhook
                // and the reconciliation sweep settle the final outcome.
                events.publishEvent(new PaymentInitiationEvent(PaymentInitiationEvent.Kind.SUBSCRIPTION, s.getRef()));
            } else {
                // Legacy synchronous push — the request waits for the aggregator's response.
                applyGatewayPush(s);
                s = subs.save(s);
            }
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

    /** Push the USSD prompt to the active gateway and fold the outcome onto the order. Shared by the
     *  synchronous create path and the async dispatcher. Never throws: a gateway error (unreachable /
     *  login failed / declined push) marks the payment failed with a client-facing reason. */
    private void applyGatewayPush(Subscription s) {
        if (hasConflictingMomoDebit(s.getPayPhone(), s.getAmount(), s.getPay(), s.getRef())) {
            log.info("MoMo push ignoré pour {} — même tel/montant déjà débité ou en cours (< {} s)",
                    s.getRef(), debitGuardSeconds);
            return;
        }
        try {
            PaymentGateway.PaymentRequest pr = gateway.requestPayment(s, s.getPay());
            s.setPaymentTxId(pr.externalRef());          // store the aggregator's transaction id
            s.setPaymentMessage(pr.message());           // reason to surface on failure
            if (pr.accepted()) s.setGatewayPushAccepted(true);
            if (!pr.accepted()) s.markFailed();
        } catch (RuntimeException ex) {
            log.warn("Payment initiation failed for {} ({}): {}", s.getRef(), s.getPay(), ex.getMessage());
            s.setPaymentMessage(GatewayClientMessages.from(ex));
            // Timeouts / 502: the operator may still have initiated the USSD — stay pending for webhook.
            if (!GatewayClientMessages.isTransient(ex)) s.markFailed();
        }
    }

    /** Async entry point invoked by {@code PaymentDispatcher} after the create transaction commits.
     *  Runs the gateway push in its own short transaction; idempotent — only acts while still pending,
     *  so a duplicate event (e.g. a retried dispatch) never sends a second prompt. */
    @Transactional
    public void pushGateway(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
        if (s == null || s.getPayStatus() != PayStatus.pending) return;
        applyGatewayPush(s);
        subs.save(s);
    }

    /** Reconciliation: force a long-stuck pending order to failed (the webhook never arrived and the
     *  USSD window has elapsed). Idempotent — only acts while still pending. */
    @Transactional
    public void expirePending(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
        if (s == null || s.getPayStatus() != PayStatus.pending) return;
        s.markFailed();
        if (s.getPaymentMessage() == null || s.getPaymentMessage().isBlank()) {
            s.setPaymentMessage("Délai de paiement dépassé");
        }
        subs.save(s);
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

    /** An agent's portfolio: sales they OWN (agentId) PLUS every sale that names their phone as
     *  the referrer ("parrain"), even when another agent created it or it came in via QR. This is
     *  what feeds both the "my sales" list and the agent KPIs, so a referred client is credited to
     *  the commercial who recommended them. Matched on the local 9-digit phone (country-code-safe). */
    public List<Subscription> mine(String agentId) {
        AppUser me = users.findById(agentId).orElse(null);
        String myPhone9 = me != null ? local9(me.getPhone()) : "";
        // Indexed lookup: sales the agent owns (agent_id) UNION sales referring the agent's phone
        // (referrer_phone9). When the agent has no phone on file, only the ownership half applies.
        return myPhone9.isEmpty()
                ? subs.findByAgentIdOrderByCreatedAtAsc(agentId)
                : subs.findByAgentIdOrReferrerPhone9OrderByCreatedAtAsc(agentId, myPhone9);
    }

    /** One-time backfill of {@code referrerPhone9} for rows created before the column existed, so the
     *  indexed {@link #mine} query also returns legacy referred sales. Batched to bound memory; each
     *  processed row gets a non-null value (9 digits or "") so it drops out of the next page and the
     *  loop terminates. Invoked once at startup by {@code ReferrerPhoneBackfill}. */
    @Transactional
    public int backfillReferrerPhone9() {
        var page = org.springframework.data.domain.PageRequest.of(0, 500);
        int total = 0;
        List<Subscription> batch;
        while (!(batch = subs.findByReferrerPhone9IsNullAndReferrerPhoneIsNotNull(page)).isEmpty()) {
            for (Subscription s : batch) s.setReferrerPhone9(local9(s.getReferrerPhone()));
            subs.saveAll(batch);
            total += batch.size();
        }
        if (total > 0) log.info("Backfilled referrerPhone9 on {} legacy subscription(s)", total);
        return total;
    }

    /** One-time backfill of {@code cniNorm} so the one-card-per-CNI rule applies to legacy rows. */
    @Transactional
    public int backfillCniNorm() {
        int total = 0;
        while (true) {
            var batch = subs.findCniNormBackfillBatch(org.springframework.data.domain.PageRequest.of(0, 200));
            if (batch.isEmpty()) break;
            for (Subscription s : batch) {
                s.setCniNorm(normCniMatch(s.getCni()));
                subs.save(s);
            }
            total += batch.size();
        }
        if (total > 0) log.info("Backfilled cniNorm on {} legacy subscription(s)", total);
        return total;
    }

    /** Legacy rows: a non-null gatewayRef means TrustPayWay was already called. */
    @Transactional
    public int backfillGatewayPushAccepted() {
        int n = 0;
        for (Subscription s : subs.findAll()) {
            if (!s.isGatewayPushAccepted() && s.getGatewayRef() != null && !s.getGatewayRef().isBlank()
                    && ("om".equalsIgnoreCase(s.getPay()) || "mtn".equalsIgnoreCase(s.getPay()))) {
                s.setGatewayPushAccepted(true);
                subs.save(s);
                n++;
            }
        }
        if (n > 0) log.info("Backfilled gatewayPushAccepted on {} legacy subscription(s)", n);
        return n;
    }

    public Subscription byRef(String ref) {
        return subs.findByRefIgnoreCase(ref).orElse(null);
    }

    /** Print-point search: match a record by reference, client name, or phone (most recent first). */
    public List<Subscription> search(String q) {
        if (q == null || q.isBlank()) return List.of();
        String needle = q.trim().toLowerCase();
        String digits = q.replaceAll("\\D", "");
        // Use repository native query to perform SQL-side search over several columns efficiently.
        return subs.searchByAny(needle, digits == null ? "" : digits);
    }

    @Transactional
    public Subscription applyPayment(String ref, String outcome, String reason) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        boolean ok = "validate".equalsIgnoreCase(outcome);
        if (ok) { s.setPayStatus(PayStatus.paid); s.setPaidAt(Instant.now()); } else s.markFailed();
        // Keep the decline reason (e.g. "Solde insuffisant") so the client UI can explain why; clear it on success.
        s.setPaymentMessage(ok ? null : (reason == null || reason.isBlank() ? null : reason.trim()));
        Subscription saved = subs.save(s);
        if (ok) awardCommission(saved);
        return saved;
    }

    /** Resolve the subscription a webhook refers to: by the unique gateway order id we sent, falling
     *  back to the bare ref (older records / simulated). Public so the controller can pick the log level. */
    public Subscription findByOrderId(String orderId) {
        if (orderId == null) return null;
        return subs.findByGatewayRef(orderId).or(() -> subs.findByRefIgnoreCase(orderId)).orElse(null);
    }

    /**
     * Apply an aggregator webhook (push). {@code orderId} is the unique gateway order id we sent
     * ({@code sub.gatewayRef}, fallback {@code sub.ref}); {@code newStatus} is the resolved
     * {@link PayStatus} (or null if not terminal). Moves {@code pending} rows to a terminal state;
     * also recovers {@code failed} → {@code paid} when a late COMPLETED arrives after a false
     * technical failure (timeout / duplicate / 502).
     */
    @Transactional
    public Subscription applyWebhook(String orderId, PayStatus newStatus, String reason) {
        if (orderId == null || newStatus == null) return null;
        Subscription s = findByOrderId(orderId);
        if (s == null) return null;
        PayStatus cur = s.getPayStatus();
        if (newStatus == PayStatus.paid) {
            if (cur != PayStatus.paid) {
                if (cur == PayStatus.failed) {
                    log.info("TrustPayWay webhook recovered {} orderId={} from failed to paid", s.getRef(), orderId);
                }
                s.setPayStatus(PayStatus.paid);
                s.setPaidAt(Instant.now());
                s.setPaymentMessage(null);
                subs.save(s);
                awardCommission(s);
            }
            return s;
        }
        if (newStatus == PayStatus.failed && cur == PayStatus.pending) {
            s.markFailed();
            if (reason != null && !reason.isBlank()) s.setPaymentMessage(reason.trim());
            subs.save(s);
        }
        return s;
    }

    /**
     * Pull a live aggregator status and persist it when terminal. Used by manual reconciliation;
     * also recovers {@code failed} → {@code paid} when TrustPayWay confirms success.
     */
    @Transactional
    public ReconcilePullResult reconcileFromGateway(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
        if (s == null) {
            return new ReconcilePullResult(ref, null, null, false, "not_found");
        }
        PayStatus before = s.getPayStatus();
        if (before != PayStatus.pending && before != PayStatus.failed) {
            return new ReconcilePullResult(ref, before.name(), before.name(), false, null);
        }
        if (blank(s.getGatewayRef()) && blank(s.getPaymentTxId())) {
            return new ReconcilePullResult(ref, before.name(), before.name(), false, "no_gateway_id");
        }
        PaymentGateway.GatewayStatus detail;
        try {
            detail = gateway.queryDetailedStatus(s).orElse(null);
        } catch (RuntimeException ex) {
            return new ReconcilePullResult(ref, before.name(), before.name(), false, ex.getMessage());
        }
        PayStatus pulled = detail == null ? null : detail.status();
        String reason = detail == null ? null : trimToNull(detail.message());
        if (pulled == null || pulled == PayStatus.pending) {
            return new ReconcilePullResult(ref, before.name(), before.name(), false, null);
        }
        if (pulled == PayStatus.paid) {
            if (before == PayStatus.failed) {
                log.info("Manual reconciliation recovered subscription {} from failed to paid", ref);
            }
            s.setPayStatus(PayStatus.paid);
            s.setPaidAt(Instant.now());
            s.setPaymentMessage(null);
            subs.save(s);
            awardCommission(s);
            return new ReconcilePullResult(ref, before.name(), PayStatus.paid.name(), true, null);
        }
        if (pulled == PayStatus.failed && before == PayStatus.pending) {
            s.markFailed();
            if (reason != null) s.setPaymentMessage(reason);
            subs.save(s);
            return new ReconcilePullResult(ref, before.name(), PayStatus.failed.name(), true, null, reason);
        }
        // Still failed on both sides: the aggregator's reason can change over time — refresh it.
        if (pulled == PayStatus.failed && before == PayStatus.failed
                && reason != null && !reason.equals(trimToNull(s.getPaymentMessage()))) {
            s.setPaymentMessage(reason);
            subs.save(s);
            log.info("Manual reconciliation updated failure reason for subscription {}: {}", ref, reason);
            return new ReconcilePullResult(ref, before.name(), before.name(), true, "reason_updated", reason);
        }
        return new ReconcilePullResult(ref, before.name(), before.name(), false, null);
    }

    private static String trimToNull(String v) {
        if (v == null) return null;
        String t = v.trim();
        return t.isEmpty() ? null : t;
    }

    private static boolean blank(String v) {
        return v == null || v.isBlank();
    }

    /**
     * Current payment status for the public polling endpoint. If still pending and the
     * active gateway can pull a live status (get-status), use it as a fallback for when
     * the webhook hasn't arrived (e.g. no public URL in dev).
     */
    /** Polling-endpoint status read. NOT @Transactional on purpose: the slow gateway get-status call
     *  must run WITHOUT holding a pooled DB connection (holding one under heavy /status polling
     *  exhausted the pool). Reads the row in a short tx, pulls the gateway outside any tx, and persists
     *  a terminal outcome in its own short tx. The pull is rate-limited per order (see throttle). */
    public Subscription refreshStatus(String ref) {
        return refreshStatus(ref, true);
    }

    /**
     * @param throttled true for the high-volume public polling endpoint (rate-limit the live pull);
     *                  false for the off-thread reconciliation sweep, which must always pull.
     */
    public Subscription refreshStatus(String ref, boolean throttled) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);   // short read tx — connection released
        if (s == null || s.getPayStatus() != PayStatus.pending) return s;
        if (throttled && !statusThrottle.allow(s.getRef(), s.getCreatedAt())) return s;
        PayStatus pulled = gateway.queryStatus(s).orElse(null);        // gateway I/O — NO DB connection held
        if (pulled == null || pulled == PayStatus.pending) return s;
        Subscription updated = persistPulledStatus(ref, pulled);
        return updated != null ? updated : s;
    }

    /** Persist a terminal status pulled from the gateway, in its own short transaction. Re-checks the
     *  row is still pending (the webhook may have settled it meanwhile) so we never double-apply. */
    private Subscription persistPulledStatus(String ref, PayStatus pulled) {
        Subscription updated = tx.execute(st -> {
            Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
            if (s == null || s.getPayStatus() != PayStatus.pending) return s;
            if (pulled == PayStatus.failed) s.markFailed(); else s.setPayStatus(pulled);
            if (pulled == PayStatus.paid) s.setPaidAt(Instant.now());
            Subscription saved = subs.save(s);
            if (pulled == PayStatus.paid) awardCommission(saved);
            return saved;
        });
        statusThrottle.clear(ref);   // terminal → drop throttle bookkeeping
        return updated;
    }

    /**
     * If the payment is still {@code pending}, ask the active gateway for a live status
     * (get-status) and persist it when terminal. This is the fallback for when the webhook
     * never arrived (e.g. no public callback URL). No-op for the simulated gateway, which
     * returns no status. Returns the (possibly updated) subscription.
     */
    @Transactional
    public Subscription pullLiveStatus(Subscription s) {
        if (s != null && s.getPayStatus() == PayStatus.pending) {
            PayStatus pulled = gateway.queryStatus(s).orElse(null);
            if (pulled != null && pulled != PayStatus.pending) {
                if (pulled == PayStatus.failed) s.markFailed(); else s.setPayStatus(pulled);
                if (pulled == PayStatus.paid) s.setPaidAt(Instant.now());
                subs.save(s);
                if (pulled == PayStatus.paid) awardCommission(s);
            }
        }
        return s;
    }

    @Transactional
    public Subscription markPrinted(String ref, String cardNumber, String pan, String printerId) {
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
        s.setCardNumber(PanUtils.mask(cardNumber.trim()));
        // PAN (Primary Account Number) — captured at activation, optional.
        if (pan != null && !pan.isBlank()) s.setPan(PanUtils.mask(pan.trim()));
        s.setPrinted(true);
        // Trace who printed and when, for the print-point statistics.
        s.setPrintedById(printerId);
        s.setPrintedAt(Instant.now());
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
        boolean validated = "validate".equalsIgnoreCase(req.outcome());
        if (validated) {
            s.setPayStatus(PayStatus.paid);
            s.setPaidAt(Instant.now());
            s.setPaymentMessage(null);
        } else {
            s.markFailed();
            String reason = req.reason();
            s.setPaymentMessage(reason == null || reason.isBlank() ? "Reçu SARA non conforme" : reason.trim());
        }
        Subscription saved = subs.save(s);
        if (validated) awardCommission(saved);
        return saved;
    }

    /**
     * Cashier decision on an in-person cash payment. Idempotent: only acts while the record is
     * still {@code cash}, so a payment can't be validated twice or overturned once final.
     * {@code validate} → {@code paid} (printable), recording who collected the cash and when;
     * {@code reject} → {@code failed} (+ reason, e.g. the client never showed up to pay).
     */
    @Transactional
    public Subscription validateCash(String ref, String outcome, String reason, String cashierId, String paymentReference) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        if (s.getPayStatus() != PayStatus.cash) return s;
        boolean validated = "validate".equalsIgnoreCase(outcome);
        if (validated) {
            s.setPayStatus(PayStatus.paid);
            s.setPaidAt(Instant.now());
            s.setPaymentMessage(null);
            // Trace the collection: cashier name (readable, for screens), id (stats), and timestamp.
            s.setCashCollectedBy(cashierName(cashierId));
            s.setCashCollectedById(cashierId);
            s.setCashCollectedAt(Instant.now());
            s.setCashPaymentReference(blankToNull(paymentReference));
        } else {
            s.markFailed();
            s.setPaymentMessage(reason == null || reason.isBlank() ? "Paiement espèces non perçu" : reason.trim());
        }
        Subscription saved = subs.save(s);
        if (validated) awardCommission(saved);
        return saved;
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
        String wantPhone = local9(phone);
        String wantCni = normCniMatch(cni);

        Subscription match = subs.findAll().stream()
                .filter(s -> "self".equals(s.getChannel()))
                // Look the client up by ANY of their numbers: contact, Mobile Money payer, or SARA payer
                // (the agent often only knows the number the client paid with, not the contact number).
                .filter(s -> phoneMatches(s, wantPhone))
                // ID number compared alphanumerically (a CNI is hexadecimal; a passport/récépissé carries
                // other letters too) — never digits-only, which would drop the letters and mismatch.
                .filter(s -> wantCni.isEmpty() || wantCni.equals(normCniMatch(s.getCni())))
                .findFirst().orElse(null);

        if (match == null) return new ClaimResult(false, "notfound", null);
        // The QR payment may already be settled at the aggregator but not yet reflected locally
        // (missed webhook). Pull a live status before refusing the sale as "unpaid".
        pullLiveStatus(match);
        if (match.getPayStatus() != PayStatus.paid) return new ClaimResult(false, "unpaid", SubscriptionDto.of(match));
        if (match.getAgentId() != null) return new ClaimResult(false, "taken", SubscriptionDto.of(match));

        match.setAgentId(agentId);
        String niuNorm = normNiu(niu);
        if (niuNorm != null) match.setNiu(niuNorm);   // capture/correct the NIU while linking the sale
        subs.save(match);
        return new ClaimResult(true, null, SubscriptionDto.of(match));
    }

    /** A subscription matches the looked-up number if it equals (last 9 digits) the contact phone,
     *  the Mobile Money payer number, or the SARA payer number. */
    private static boolean phoneMatches(Subscription s, String want) {
        if (want.isEmpty()) return false;
        return want.equals(local9(s.getPhone()))
                || want.equals(local9(s.getPayPhone()))
                || want.equals(local9(s.getSaraPayerPhone()));
    }

    /** Normalise an ID-document number for matching: keep only alphanumerics, upper-cased. */
    private static String normCniMatch(String cni) {
        return cni == null ? "" : cni.replaceAll("[^0-9A-Za-z]", "").toUpperCase();
    }

    /** Names are considered the same person at/above this similarity (≤ 20 % difference — OCR margin). */
    private static final double NAME_DUP_THRESHOLD = 0.80;

    /** Accepted birth-date input formats: dd/MM/yyyy (form) and yyyy-MM-dd (HTML date input). */
    private static final DateTimeFormatter[] BIRTH_FORMATS = {
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ISO_LOCAL_DATE,
    };

    /** Parse a birth date leniently; returns null on blank/unparseable input (never throws). */
    private static LocalDate parseBirthDate(String s) {
        if (s == null || s.isBlank()) return null;
        String v = s.trim();
        for (DateTimeFormatter f : BIRTH_FORMATS) {
            try { return LocalDate.parse(v, f); } catch (DateTimeParseException ignored) { /* try next */ }
        }
        return null;
    }

    /** Same person as an existing same-CNI subscription: identical birth date (null == null for legacy
     *  rows) AND a matching name. The CNI number already matches (the candidate set is filtered by it). */
    private boolean isSameIdentity(Subscription existing, LocalDate birthDate, CreateSubscriptionRequest req) {
        if (!Objects.equals(existing.getBirthDate(), birthDate)) return false;
        return namesMatch(existing, req);
    }

    /** True when any pairing of the available names (typed and CNI-read/OCR, on each side) is at/above
     *  the OCR-tolerant threshold. Taking BOTH the typed and the OCR name guards against a client who
     *  retypes a slightly different name than the one printed on the card. */
    private boolean namesMatch(Subscription existing, CreateSubscriptionRequest req) {
        List<String> incoming = nameVariants(req.nom(), req.prenom(), req.cniOcrNom(), req.cniOcrPrenom());
        List<String> stored = nameVariants(existing.getNom(), existing.getPrenom(),
                existing.getCniOcrNom(), existing.getCniOcrPrenom());
        for (String a : incoming) {
            for (String b : stored) {
                if (CniMatcher.nameSimilarity(a, b) >= NAME_DUP_THRESHOLD) return true;
            }
        }
        return false;
    }

    /** The distinct full-name variants available for one party: the typed name and, when present, the
     *  name OCR read off the CNI. */
    private static List<String> nameVariants(String nom, String prenom, String ocrNom, String ocrPrenom) {
        List<String> out = new ArrayList<>(2);
        String typed = ((nom == null ? "" : nom) + " " + (prenom == null ? "" : prenom)).trim();
        if (!typed.isBlank()) out.add(typed);
        String ocr = ((ocrNom == null ? "" : ocrNom) + " " + (ocrPrenom == null ? "" : ocrPrenom)).trim();
        if (!ocr.isBlank()) out.add(ocr);
        return out;
    }

    /** CNI = alphanumeric, min 6 chars (after stripping separators). */
    private static boolean isValidCniFormat(String cni) {
        String n = normCniMatch(cni);
        return n.length() >= 6 && n.matches("[0-9A-Z]+");
    }

    private static boolean isCniDocument(String docType) {
        return docType == null || docType.isBlank() || "cni".equalsIgnoreCase(docType.trim());
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
