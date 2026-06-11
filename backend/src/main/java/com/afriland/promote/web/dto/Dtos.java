package com.afriland.promote.web.dto;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Subscription;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** Request/response payloads exchanged with the Angular frontend. */
public final class Dtos {

    private Dtos() {}

    // ---- auth ----
    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

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

    public record UserDto(String id, String name, String email, String role, String agency, String phone,
                          boolean mustChangePassword, boolean enabled) {
        public static UserDto of(AppUser u) {
            return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getRole().name(), u.getAgency(), u.getPhone(),
                    u.isMustChangePassword(), u.isEnabled());
        }
    }

    /** Admin enables/disables a staff account. */
    public record SetEnabledRequest(boolean enabled) {}

    public record LoginResponse(String token, UserDto user) {}

    /** A logged-in user changes their own password. */
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    /** Generic error body: {@code {"error": "code"}}. */
    public record ErrorResponse(String error) {}

    /** Admin creates a staff account. role = ADMIN | AGENT | PRINT_AGENT | CASHIER. */
    public record CreateUserRequest(
            @NotBlank String name,
            @NotBlank String email,
            @NotBlank String role,
            String agency,
            String phone) {}

    /** Result of a staff creation: the account + the auto-generated temporary password (emailed to
     *  the user; also returned so the admin can hand it out if mail delivery fails). */
    public record CreateUserResult(UserDto user, String tempPassword) {}

    // ---- config ----
    public record ConfigDto(int price, int fees, int transport) {}

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
            String referrerPhone) {}     // self path only

    public record SubscriptionDto(
            String ref, String prenom, String nom, String fullName, String sexe, String email,
            String docType, String cni, String niu, String cniExp, String phone, String quartier, String region, String ville,
            String pay, String payPhone, String delivery, int amount, int transport,
            String channel, String agentId, String referrerName, String referrerPhone,
            String payStatus, boolean printed, boolean selfieVerified,
            boolean hasSelfie, boolean hasCniRecto, boolean hasCniVerso, boolean hasSaraReceipt,
            String saraRef, String saraPayerPhone, Integer saraAmount, String cardNumber, String pan,
            String cashCollectedBy, String cashCollectedAt,
            String status, String createdAt, String paymentMessage) {
        public static SubscriptionDto of(Subscription s) {
            return new SubscriptionDto(
                    s.getRef(), s.getPrenom(), s.getNom(), s.getFullName(), s.getSexe(), s.getEmail(),
                    s.getDocType(), s.getCni(), s.getNiu(), s.getCniExp(), s.getPhone(), s.getQuartier(), s.getRegion(), s.getVille(),
                    s.getPay(), s.getPayPhone(), s.getDelivery(), s.getAmount(), s.getTransport(),
                    s.getChannel(), s.getAgentId(), s.getReferrerName(), s.getReferrerPhone(),
                    s.getPayStatus().name(), s.isPrinted(), s.isSelfieVerified(),
                    s.getSelfieKey() != null, s.getCniRectoKey() != null, s.getCniVersoKey() != null,
                    s.getSaraReceiptKey() != null,
                    s.getSaraRef(), s.getSaraPayerPhone(), s.getSaraAmount(), s.getCardNumber(), s.getPan(),
                    s.getCashCollectedBy(), s.getCashCollectedAt() == null ? null : s.getCashCollectedAt().toString(),
                    s.getStatus(), s.getCreatedAt().toString(), s.getPaymentMessage());
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
    public record CashValidateRequest(String outcome, String reason) {}

    /** Lightweight, public payment status for the client polling the result. */
    public record PaymentStatusDto(String ref, String payStatus, String message) {}

    /** Tells the frontend which gateway is live, so the UI can adapt (e.g. demo buttons). */
    public record PaymentProviderDto(String provider) {}

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
    public record PaymentStats(
            long momoTotal, long momoPaid, long momoFailed, long momoPending,
            long orangeTotal, long orangePaid, long mtnTotal, long mtnPaid,
            long insufficientFunds, long expired, long otherFailures,
            long avgConfirmSeconds, long medianConfirmSeconds) {}
}
