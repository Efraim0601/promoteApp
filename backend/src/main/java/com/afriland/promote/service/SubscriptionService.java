package com.afriland.promote.service;

import com.afriland.promote.model.*;
import com.afriland.promote.payment.PaymentGateway;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CardConfigRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/** Core subscription / KYC business logic, ported from the prototype (app.jsx, kyc.jsx). */
@Service
public class SubscriptionService {

    private final SubscriptionRepository subs;
    private final CardConfigRepository configs;
    private final AppUserRepository users;
    private final PaymentGateway gateway;

    // PRM-#### sequence (prototype starts at 1008, demo data uses 1000..1008)
    private final AtomicInteger seq = new AtomicInteger(1008);

    public SubscriptionService(SubscriptionRepository subs, CardConfigRepository configs,
                               AppUserRepository users, PaymentGateway gateway) {
        this.subs = subs;
        this.configs = configs;
        this.users = users;
        this.gateway = gateway;
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
        return cfg.getPrice() + cfg.getFees() + transport;
    }

    /** Resolve a referrer (sales agent) by phone — ports app.jsx:findAgentByPhone. */
    public AppUser resolveAgentByPhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        return users.findByRole(Role.AGENT).stream()
                .filter(a -> a.getPhone() != null && a.getPhone().replaceAll("\\D", "").equals(digits))
                .findFirst().orElse(null);
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

        Subscription s = Subscription.builder()
                .ref(newRef())
                .prenom(req.prenom().trim())
                .nom(req.nom().trim())
                .fullName((req.prenom().trim() + " " + req.nom().trim()).trim())
                .cni(req.cni())
                .cniExp(req.cniExp())
                .phone("+237 " + req.phone().replaceAll("\\D", ""))
                .pay(req.pay())
                .delivery(delivery)
                .amount(amount)
                .transport(transport)
                .channel(channel)
                .agentId(isSelf ? (referrer != null ? referrer.getId() : null) : agentId)
                .referrerName(referrer != null ? referrer.getName() : null)
                .referrerPhone(req.referrerPhone() != null && !req.referrerPhone().isBlank()
                        ? "+237 " + req.referrerPhone().replaceAll("\\D", "") : null)
                .payStatus(cash ? PayStatus.cash : PayStatus.pending)
                .printed(false)
                .selfieVerified(req.selfie() || req.selfieKey() != null)
                .selfieKey(req.selfieKey())
                .cniRectoKey(req.cniRectoKey())
                .cniVersoKey(req.cniVersoKey())
                .createdAt(Instant.now())
                .build();

        s = subs.save(s);
        if (!cash) {
            try {
                // Push the USSD prompt via the active gateway (simulated or real aggregator).
                PaymentGateway.PaymentRequest pr = gateway.requestPayment(s, req.pay());
                s.setPaymentTxId(pr.externalRef());          // store the aggregator's transaction id
                if (!pr.accepted()) s.setPayStatus(PayStatus.failed);
            } catch (RuntimeException ex) {
                // The aggregator was unreachable / rejected the request: keep the KYC file
                // but mark the payment failed so the client can retry.
                s.setPayStatus(PayStatus.failed);
            }
            s = subs.save(s);
        }
        return s;
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

    @Transactional
    public Subscription applyPayment(String ref, String outcome) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        s.setPayStatus("validate".equalsIgnoreCase(outcome) ? PayStatus.paid : PayStatus.failed);
        return subs.save(s);
    }

    /**
     * Apply an aggregator webhook (push). {@code orderId} is the reference we sent
     * ({@code sub.ref}); {@code newStatus} is the resolved {@link PayStatus} (or null
     * if the aggregator status was not terminal). Only moves a transaction that is
     * still {@code pending}, so a late/duplicate webhook can't overturn a final state.
     */
    @Transactional
    public Subscription applyWebhook(String orderId, PayStatus newStatus) {
        if (orderId == null || newStatus == null) return null;
        Subscription s = subs.findByRefIgnoreCase(orderId).orElse(null);
        if (s == null) return null;
        if (s.getPayStatus() == PayStatus.pending) {
            s.setPayStatus(newStatus);
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
    public PayStatus statusOf(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElse(null);
        if (s == null) return null;
        if (s.getPayStatus() == PayStatus.pending) {
            PayStatus pulled = gateway.queryStatus(s).orElse(null);
            if (pulled != null && pulled != PayStatus.pending) {
                s.setPayStatus(pulled);
                subs.save(s);
            }
        }
        return s.getPayStatus();
    }

    @Transactional
    public Subscription markPrinted(String ref) {
        Subscription s = subs.findByRefIgnoreCase(ref).orElseThrow();
        s.setPrinted(true);
        return subs.save(s);
    }

    /** Agent claims a paid, unattributed QR sale — ports app.jsx:claimQrSale. */
    @Transactional
    public ClaimResult claim(String agentId, String phone, String cni) {
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
        subs.save(match);
        return new ClaimResult(true, null, SubscriptionDto.of(match));
    }
}
