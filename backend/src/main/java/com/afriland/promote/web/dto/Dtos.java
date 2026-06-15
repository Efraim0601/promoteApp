package com.afriland.promote.web.dto;

import com.afriland.promote.model.AppProfile;
import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Permission;
import com.afriland.promote.model.Subscription;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** Request/response payloads exchanged with the Angular frontend. */
public final class Dtos {

    private Dtos() {}

    // ---- auth ----
    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
    /** Simplified collecteur sign-in: phone number + 4-digit PIN (field data-collection flow). */
    public record PhoneLoginRequest(@NotBlank String phone, @NotBlank String pin) {}

    // ---- pickup agencies (lieux de retrait) ----
    /** A pickup point shown to the client when delivery == agence. */
    public record AgencyDto(String id, String name, String city) {
        public static AgencyDto of(com.afriland.promote.model.Agency a) {
            return new AgencyDto(a.getId(), a.getName(), a.getCity());
        }
    }

    /** One agency row to import (name required; city optional). */
    public record ImportAgencyRow(String name, String city) {}

    /** Import payload + duplicate policy. updateExisting=false → existing (name+city) are skipped. */
    public record ImportAgenciesRequest(List<ImportAgencyRow> rows, boolean updateExisting) {}

    /** Per-row outcome: created | updated | skipped | invalid. */
    public record ImportAgencyRowResult(String name, String city, String status, String reason) {}

    /** Import summary: counts + per-row detail (same order as input). */
    public record ImportAgenciesResult(int created, int updated, int skipped, int invalid,
                                       List<ImportAgencyRowResult> rows) {}

    // ---- bulk user import ----
    /** One row to import. Password is generated server-side for new accounts. */
    public record ImportUserRow(String name, String email, String role, String phone, String agency) {}

    /** Import payload + duplicate policy. updateExisting=false → existing emails are skipped. */
    public record ImportUsersRequest(List<ImportUserRow> rows, boolean updateExisting) {}

    /** Per-row outcome. status = created | updated | skipped | invalid.
     *  tempPassword is set only for a freshly created account (to hand to the user). */
    public record ImportRowResult(String email, String name, String role, String status,
                                  String reason, String tempPassword) {}

    /** Import summary: counts + per-row detail (same order as input). */
    public record ImportUsersResult(int created, int updated, int skipped, int invalid,
                                    List<ImportRowResult> rows) {}

    public record UserDto(String id, String name, String email, String role, List<String> roles,
                          String agency, String phone, boolean mustChangePassword, boolean enabled,
                          String createdAt, List<Long> profileIds, List<String> permissions) {
        public static UserDto of(AppUser u) {
            List<String> roles = u.effectiveRoles().stream().map(Enum::name).toList();
            String createdAt = u.getCreatedAt() != null ? u.getCreatedAt().toString() : null;
            List<Long> profileIds = u.getProfiles().stream().map(AppProfile::getId).sorted().toList();
            List<String> permissions = u.effectivePermissions().stream()
                    .map(Permission::name).sorted().toList();
            return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getRole().name(), roles,
                    u.getAgency(), u.getPhone(), u.isMustChangePassword(), u.isEnabled(),
                    createdAt, profileIds, permissions);
        }
    }

    /** A permission profile (group of fine-grained permissions). */
    public record ProfileDto(Long id, String name, String description, boolean builtin,
                             List<String> permissions) {
        public static ProfileDto of(AppProfile p) {
            List<String> perms = p.permissionSet().stream().map(Permission::name).sorted().toList();
            return new ProfileDto(p.getId(), p.getName(), p.getDescription(), p.isBuiltin(), perms);
        }
    }

    /** Create / update a profile. */
    public record ProfileRequest(String name, String description, List<String> permissions) {}

    /** Admin enables/disables a staff account. */
    public record SetEnabledRequest(boolean enabled) {}

    /** Admin sets the full role set of an existing account (at least one role). */
    public record SetRolesRequest(List<String> roles) {}

    /** One audited login attempt (admin view). */
    public record LoginAuditDto(String id, String userId, String name, String email, String roles,
                                boolean success, String reason, String ip, String userAgent, String at) {
        public static LoginAuditDto of(com.afriland.promote.model.LoginAudit a) {
            return new LoginAuditDto(a.getId(), a.getUserId(), a.getName(), a.getEmail(), a.getRoles(),
                    a.isSuccess(), a.getReason(), a.getIp(), a.getUserAgent(),
                    a.getAt() == null ? null : a.getAt().toString());
        }
    }

    public record LoginResponse(String token, UserDto user) {}

    /** A logged-in user changes their own password. */
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    /** Self-service password reset request (unauthenticated). Always returns the same outcome to
     *  avoid leaking whether an email is registered. */
    public record ForgotPasswordRequest(@NotBlank String email) {}

    /** Generic error body: {@code {"error": "code"}}. */
    public record ErrorResponse(String error) {}

    /** Admin creates a staff account. {@code roles} may carry several roles; {@code role} stays
     *  supported as a single-role fallback (older callers / imports). */
    public record CreateUserRequest(
            @NotBlank String name,
            @NotBlank String email,
            String role,                 // single-role fallback (used when roles is empty)
            List<String> roles,          // one or more roles
            String agency,
            String phone) {
        /** Effective requested roles: the list if present, else the single role. */
        public List<String> rolesOrSingle() {
            if (roles != null && !roles.isEmpty()) return roles;
            return role == null || role.isBlank() ? List.of() : List.of(role);
        }
    }

    /** Result of a staff creation: the account + the auto-generated temporary password (emailed to
     *  the user; also returned so the admin can hand it out if mail delivery fails). {@code pin} is
     *  the 4-digit collecteur login PIN, present only when a COLLECTEUR account was created.
     *  {@code reactivated} is true when a previously disabled account was re-provisioned. */
    public record CreateUserResult(UserDto user, String tempPassword, String pin, boolean reactivated) {
        /** Backward-compatible ctor for call sites that omit {@code reactivated}. */
        public CreateUserResult(UserDto user, String tempPassword, String pin) {
            this(user, tempPassword, pin, false);
        }
    }

    /** Admin updates an existing staff account (name, email, phone, agency). */
    public record UpdateUserRequest(
            @NotBlank String name,
            @NotBlank String email,
            String agency,
            String phone) {}

    // ---- config ----
    public record ConfigDto(int price, int fees, int transport, int rechargeMin, int rechargeMax,
                            int rechargeInitiale, int passPremium,
                            int rechargeInitialeBancaire, int passPremiumBancaire) {}

    // ---- subscriptions ----
    /** Create payload — used by both assisted (agent) and self (client) flows. */
    public record CreateSubscriptionRequest(
            @NotBlank String prenom,
            @NotBlank String nom,
            @NotBlank String sexe,       // M | F
            String docType,              // type de pièce : cni | passport | recepisse (défaut cni)
            @NotBlank String cni,
            String niu,                  // NIU (taxpayer id) — optional, may be added later by the agent
            @NotBlank String cniExp,
            @NotBlank String phone,
            @NotBlank String email,
            @NotBlank String quartier,
            String region,               // optional — no longer captured in the form (kept for legacy data)
            @NotBlank String ville,      // city / town
            @NotBlank String pay,        // om | mtn | cash | sara
            String payPhone,             // MoMo number used for payment (om/mtn) — may differ from phone
            String delivery,             // promote | agence | home (defaults to promote)
            boolean selfie,
            String selfieKey,            // object-storage keys returned by /api/kyc/image
            String cniRectoKey,
            String cniVersoKey,
            String saraReceiptKey,       // SARA money: key of the uploaded receipt (required when pay == sara)
            String saraRef,              // SARA money: receipt reference confirmed/corrected by the client
            String referrerPhone,        // self path only
            Double latitude,             // browser GPS captured at subscription time (optional — may be null)
            Double longitude,
            Double geoAccuracy,          // accuracy radius in metres (optional)
            String pickupAgencyId,       // chosen pickup branch id when delivery == agence (optional)
            String cardType) {           // bancaire | prepaid (defaults to bancaire server-side)

        /** Backward-compatible constructor (no geolocation) — keeps existing callers/tests valid. */
        public CreateSubscriptionRequest(String prenom, String nom, String sexe, String docType, String cni,
                String niu, String cniExp, String phone, String email, String quartier, String region,
                String ville, String pay, String payPhone, String delivery, boolean selfie, String selfieKey,
                String cniRectoKey, String cniVersoKey, String saraReceiptKey, String saraRef, String referrerPhone) {
            this(prenom, nom, sexe, docType, cni, niu, cniExp, phone, email, quartier, region, ville, pay,
                    payPhone, delivery, selfie, selfieKey, cniRectoKey, cniVersoKey, saraReceiptKey, saraRef,
                    referrerPhone, null, null, null, null, null);
        }
    }

    public record SubscriptionDto(
            String ref, String prenom, String nom, String fullName, String sexe, String email,
            String docType, String cni, String niu, String cniExp, String phone, String quartier, String region, String ville,
            String pay, String payPhone, String delivery, String pickupAgencyName, int amount, int transport,
            String cardType,
            String channel, String agentId, String referrerName, String referrerPhone,
            String payStatus, boolean printed, boolean selfieVerified,
            boolean hasSelfie, boolean hasCniRecto, boolean hasCniVerso, boolean hasSaraReceipt,
            String saraRef, String saraPayerPhone, Integer saraAmount, String cardNumber, String pan,
            String cashCollectedBy, String cashCollectedAt, String cashPaymentReference,
            String status, String createdAt, String paymentMessage, String failureCategory) {
        public static SubscriptionDto of(Subscription s) {
            // Failure category (for the failure-analysis view) — only meaningful on a failed payment.
            String failCat = s.getPayStatus() == com.afriland.promote.model.PayStatus.failed
                    ? com.afriland.promote.service.PaymentFailures.classify(s).name() : null;
            return new SubscriptionDto(
                    s.getRef(), s.getPrenom(), s.getNom(), s.getFullName(), s.getSexe(), s.getEmail(),
                    s.getDocType(), s.getCni(), s.getNiu(), s.getCniExp(), s.getPhone(), s.getQuartier(), s.getRegion(), s.getVille(),
                    s.getPay(), s.getPayPhone(), s.getDelivery(), s.getPickupAgencyName(), s.getAmount(), s.getTransport(),
                    s.getCardType(),
                    s.getChannel(), s.getAgentId(), s.getReferrerName(), s.getReferrerPhone(),
                    s.getPayStatus().name(), s.isPrinted(), s.isSelfieVerified(),
                    s.getSelfieKey() != null, s.getCniRectoKey() != null, s.getCniVersoKey() != null,
                    s.getSaraReceiptKey() != null,
                    s.getSaraRef(), s.getSaraPayerPhone(), s.getSaraAmount(), s.getCardNumber(), s.getPan(),
                    s.getCashCollectedBy(), s.getCashCollectedAt() == null ? null : s.getCashCollectedAt().toString(),
                    s.getCashPaymentReference(),
                    s.getStatus(), s.getCreatedAt().toString(), s.getPaymentMessage(), failCat);
        }
    }

    /** Print point — physical card number (required) + PAN (optional) entered at activation. */
    public record PrintRequest(String cardNumber, String pan) {}

    /** Print point — replace a captured KYC image (re-uploaded via /api/kyc/image).
     *  kind = selfie | cni-recto | cni-verso; key is the new object-storage key. */
    public record PhotoUpdateRequest(String kind, String key) {}

    /** Result of a MoMo simulation. {@code outcome} = "validate" | "fail". */
    public record PayRequest(String outcome, String reason) {}

    /** Staff decision on a SARA money receipt. {@code outcome} = "validate" | "reject".
     *  The sara* fields carry the agent's confirmed/corrected receipt values (prefilled from extraction). */
    public record SaraValidateRequest(String outcome, String reason,
                                      String saraRef, String saraPayerPhone, Integer saraAmount) {}

    /** Cashier decision on an in-person cash payment. {@code outcome} = "validate" (→ paid) |
     *  "reject" (→ failed, with an optional reason, e.g. the client never paid). */
    public record CashValidateRequest(String outcome, String reason, String paymentReference) {}

    /** Lightweight, public payment status for the client polling the result. */
    public record PaymentStatusDto(String ref, String payStatus, String message) {}

    /** Tells the frontend which gateway is live, so the UI can adapt (e.g. demo buttons). */
    public record PaymentProviderDto(String provider) {}

    /** Result of pulling a live TrustPayWay status for one order (manual reconciliation). */
    public record ReconcilePullResult(
            String ref,
            String statusBefore,
            String statusAfter,
            boolean changed,
            String note) {}

    /** Summary of a manual reconciliation run (admin script / API). */
    public record ReconcileReport(
            int hours,
            int scanned,
            int updated,
            int unchanged,
            int errors,
            java.util.List<ReconcilePullResult> details) {}

    /**
     * Incoming TrustPayWay webhook (see API doc §5). Field names match the JSON sent by
     * the aggregator; {@code orderId} is the reference we passed in process-payment.
     */
    public record TrustPayWayWebhook(
            String status,
            String orderId,
            @com.fasterxml.jackson.annotation.JsonProperty("transaction_id") String transactionId,
            String amount,
            String description,
            String confirmationStatus) {}

    /** KYC image upload — a data URL ("data:image/jpeg;base64,...") or raw base64.
     *  kind = selfie | cni-recto | cni-verso. */
    public record ImageUpload(@NotBlank String image, String kind) {}

    public record ImageKeyResponse(String key) {}

    /** SARA receipt upload — returns the stored key plus what was auto-extracted (reference is the
     *  primary field; the client confirms/corrects it). Any extracted field may be null. */
    public record ReceiptUploadResponse(String key, String reference, String payerPhone, Integer amount) {}

    /** Agent claims a QR (self) sale by phone + CNI; {@code niu} is optionally captured at claim time. */
    public record ClaimRequest(@NotBlank String phone, @NotBlank String cni, String niu) {}

    /** Agent/admin adds or corrects a client's NIU on an existing subscription. */
    public record NiuUpdateRequest(String niu) {}

    public record ClaimResult(boolean ok, String reason, SubscriptionDto record) {}

    // ---- agents / stats ----
    public record AgentDto(String id, String name, String agency, String phone) {
        public static AgentDto of(AppUser u) {
            return new AgentDto(u.getId(), u.getName(), u.getAgency(), u.getPhone());
        }
    }

    public record AgentBreakdown(String id, String name, String agency, String role, long count, long collected) {}

    public record AdminStats(long total, long paid, long pending, long collected, java.util.List<AgentBreakdown> byAgent) {}

    public record AgentStats(long total, long paid, long pending, long collected) {}

    /** Print-point KPIs: cards I printed (all-time + today) and the queue still waiting to be printed
     *  (paid but not yet printed), plus the global printed total. */
    public record PrintStats(long myPrinted, long myPrintedToday, long queue, long totalPrinted) {}

    /** Cashier KPIs: cash payments I validated (count + amount, all-time + today) and the queue of
     *  cash subscriptions still awaiting collection (count + amount). */
    public record CashierStats(long myCount, long myCollected, long myCountToday,
                               long pendingCount, long pendingAmount) {}

    /** Mobile Money payment funnel (admin): volumes & success per network, failure causes, and the
     *  confirmation latency (PENDING → paid). Lets the bank monitor the aggregator's health. */
    /** One failure-category bucket for the failure-analysis breakdown. */
    public record FailureBucket(String category, long count) {}

    /** Daily MoMo volume bucket for the payment-trends chart (date = yyyy-MM-dd, server zone). */
    public record PaymentTrendBucket(String date, long paid, long failed, long pending, long total) {}

    public record PaymentStats(
            long momoTotal, long momoPaid, long momoFailed, long momoPending,
            long orangeTotal, long orangePaid, long mtnTotal, long mtnPaid,
            long insufficientFunds, long expired, long otherFailures,
            long avgConfirmSeconds, long medianConfirmSeconds,
            long orangeFailed, long mtnFailed,
            /** NETWORK + UNKNOWN merged — dashboard « échec technique » count. */
            long networkOrUnknownFailed,
            List<FailureBucket> failuresByCategory,
            List<PaymentTrendBucket> trends) {}

    // ---- monitoring dashboard ----

    /** One day in the executive monitoring trend chart. */
    public record DailyBucket(String date, long created, long paid, long printed, long failed, long amount) {}

    /** Per-agent KPIs for the monitoring dashboard. */
    public record AgentKpi(
            String id, String name, String agency,
            long total, long paid, long printed, long failed,
            long todayTotal, long todayPaid,
            double failureRate, double conversionRate, double printRate) {}

    /** Comprehensive monitoring dashboard for directors and sales managers. */
    public record DashboardStats(
            // — today —
            long todayCreated, long todayPaid, long todayPrinted, long todayFailed,
            // — totals (in the requested window) —
            long totalCreated, long totalPaid, long totalPrinted, long totalFailed,
            long awaitingPrint, long awaitingPayment,
            // — global rates (window) —
            double conversionRate, double printRate, double failureRate,
            // — per-agent breakdown (window) —
            java.util.List<AgentKpi> perAgent,
            // — daily trend (window) —
            java.util.List<DailyBucket> dailyTrend,
            // — payment method breakdown (window) —
            long payByOm, long payByMtn, long payByCash, long payBySara,
            // — channel provenance (window) —
            long channelAgent, long channelSelf,
            // — card lifecycle (window): activated = PAN assigned —
            long totalActivated) {}

    // ---- geolocation ----
    /** Browser-reported position; posted by a logged-in user right after login. */
    public record LocationUpdate(double latitude, double longitude, Double accuracy) {}

    /** One point on the admin map. {@code type} = client | staff. For a client, {@code label} is the
     *  full name, {@code status} the subscription status and {@code ref} its reference. For staff,
     *  {@code label} is the name, {@code role} the role, {@code ref} the user id. {@code date} is the
     *  ISO instant of, respectively, the subscription or the last location report.
     *  {@code accuracy} is the fix's precision radius in metres (null when unknown).
     *  <p>{@code lat}/{@code lng} are null when the record has no GPS fix; in that case
     *  {@code place} carries a coarse locality (client city, staff agency) the frontend
     *  forward-geocodes to an approximate position so every client/agent still shows up. */
    public record MapPointDto(String type, String label, Double lat, Double lng,
                              String role, String status, String ref, String date,
                              Double accuracy, String place) {}

    // ---- recharge (card top-up) ----
    /** Public create payload for a prepaid-card recharge. KYC-light: holder name + PAN + amount +
     *  payment method. {@code amount} is free-entry (bounds enforced server-side). The sara* /
     *  geolocation fields mirror the subscription flow and are optional. */
    public record CreateRechargeRequest(
            @NotBlank String prenom,
            @NotBlank String nom,
            @NotBlank String phone,      // cardholder contact number (may differ from the MoMo payPhone)
            @NotBlank String pan,        // card PAN being topped up (captured, format-checked client-side)
            int amount,                  // XAF (free entry)
            @NotBlank String pay,        // om | mtn | cash | sara
            String payPhone,             // MoMo number (required for om/mtn)
            String saraReceiptKey,       // required when pay == sara
            String saraRef,              // client-confirmed receipt reference (sara)
            Double latitude, Double longitude, Double geoAccuracy) {}

    /** Recharge view returned to the client / staff. */
    public record RechargeDto(
            String ref, String prenom, String nom, String fullName, String phone, String pan, int amount,
            String pay, String payPhone, String payStatus, String status,
            boolean hasSaraReceipt, String saraRef, String saraPayerPhone, Integer saraAmount,
            String cashCollectedBy, String cashCollectedAt,
            boolean fulfilled, String fulfilledBy, String fulfilledAt,
            String createdAt, String paymentMessage) {
        public static RechargeDto of(com.afriland.promote.model.Recharge r) {
            return new RechargeDto(
                    r.getRef(), r.getPrenom(), r.getNom(), r.getFullName(), r.getPhone(), r.getPan(), r.getAmount(),
                    r.getPay(), r.getPayPhone(), r.getPayStatus().name(), r.getStatus(),
                    r.getSaraReceiptKey() != null, r.getSaraRef(), r.getSaraPayerPhone(), r.getSaraAmount(),
                    r.getCashCollectedBy(), r.getCashCollectedAt() == null ? null : r.getCashCollectedAt().toString(),
                    r.isFulfilled(), r.getFulfilledBy(), r.getFulfilledAt() == null ? null : r.getFulfilledAt().toString(),
                    r.getCreatedAt() == null ? null : r.getCreatedAt().toString(), r.getPaymentMessage());
        }
    }

    // ---- collectes (ventes de produits bancaires) ----
    /** Create/update payload. Client fields are conditional on {@code product} (validated in the service). */
    public record CreateCollecteRequest(
            @NotBlank String product,    // compte_ouvert | carte_bancaire | sara_money | e_first
            String clientNom,
            String clientPhone,
            String accountNumber,        // compte_ouvert
            String cardNumber,           // carte_bancaire
            String cardType) {}          // carte_bancaire

    public record CollecteDto(
            String ref, String product, String clientNom, String clientPhone,
            String accountNumber, String cardNumber, String cardType,
            String collectedById, String collectedByName, String createdAt) {
        public static CollecteDto of(com.afriland.promote.model.Collecte c) {
            return new CollecteDto(
                    c.getRef(), c.getProduct(), c.getClientNom(), c.getClientPhone(),
                    c.getAccountNumber(), c.getCardNumber(), c.getCardType(),
                    c.getCollectedById(), c.getCollectedByName(),
                    c.getCreatedAt() == null ? null : c.getCreatedAt().toString());
        }
    }

    /** One {key,label,count} bucket for the collecte stats (by product or by commercial). */
    public record CollecteBucket(String key, String label, long count) {}

    public record CollecteStats(long total, List<CollecteBucket> byProduct, List<CollecteBucket> byCommercial) {}
}
