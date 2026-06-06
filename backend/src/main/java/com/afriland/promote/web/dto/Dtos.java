package com.afriland.promote.web.dto;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Subscription;
import jakarta.validation.constraints.NotBlank;

/** Request/response payloads exchanged with the Angular frontend. */
public final class Dtos {

    private Dtos() {}

    // ---- auth ----
    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record UserDto(String id, String name, String email, String role, String agency, String phone) {
        public static UserDto of(AppUser u) {
            return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getRole().name(), u.getAgency(), u.getPhone());
        }
    }

    public record LoginResponse(String token, UserDto user) {}

    /** Admin creates a staff account. role = ADMIN | AGENT | PRINT_AGENT. */
    public record CreateUserRequest(
            @NotBlank String name,
            @NotBlank String email,
            @NotBlank String role,
            @NotBlank String password,
            String agency,
            String phone) {}

    // ---- config ----
    public record ConfigDto(int price, int fees, int transport) {}

    // ---- subscriptions ----
    /** Create payload — used by both assisted (agent) and self (client) flows. */
    public record CreateSubscriptionRequest(
            @NotBlank String prenom,
            @NotBlank String nom,
            @NotBlank String sexe,       // M | F
            @NotBlank String cni,
            String niu,                  // NIU (taxpayer id) — optional, may be added later by the agent
            @NotBlank String cniExp,
            @NotBlank String phone,
            @NotBlank String email,
            @NotBlank String quartier,
            @NotBlank String region,
            @NotBlank String pay,        // om | mtn | cash | sara
            String payPhone,             // MoMo number used for payment (om/mtn) — may differ from phone
            String delivery,             // promote | agence | home (defaults to promote)
            boolean selfie,
            String selfieKey,            // object-storage keys returned by /api/kyc/image
            String cniRectoKey,
            String cniVersoKey,
            String saraReceiptKey,       // SARA money: key of the uploaded receipt (required when pay == sara)
            String referrerPhone) {}     // self path only

    public record SubscriptionDto(
            String ref, String prenom, String nom, String fullName, String sexe, String email,
            String cni, String niu, String cniExp, String phone, String quartier, String region,
            String pay, String payPhone, String delivery, int amount, int transport,
            String channel, String agentId, String referrerName, String referrerPhone,
            String payStatus, boolean printed, boolean selfieVerified,
            boolean hasSelfie, boolean hasCniRecto, boolean hasCniVerso, boolean hasSaraReceipt,
            String saraRef, String saraPayerPhone, Integer saraAmount, String cardNumber,
            String status, String createdAt, String paymentMessage) {
        public static SubscriptionDto of(Subscription s) {
            return new SubscriptionDto(
                    s.getRef(), s.getPrenom(), s.getNom(), s.getFullName(), s.getSexe(), s.getEmail(),
                    s.getCni(), s.getNiu(), s.getCniExp(), s.getPhone(), s.getQuartier(), s.getRegion(),
                    s.getPay(), s.getPayPhone(), s.getDelivery(), s.getAmount(), s.getTransport(),
                    s.getChannel(), s.getAgentId(), s.getReferrerName(), s.getReferrerPhone(),
                    s.getPayStatus().name(), s.isPrinted(), s.isSelfieVerified(),
                    s.getSelfieKey() != null, s.getCniRectoKey() != null, s.getCniVersoKey() != null,
                    s.getSaraReceiptKey() != null,
                    s.getSaraRef(), s.getSaraPayerPhone(), s.getSaraAmount(), s.getCardNumber(),
                    s.getStatus(), s.getCreatedAt().toString(), s.getPaymentMessage());
        }
    }

    /** Print point — physical card number entered before printing (required). */
    public record PrintRequest(String cardNumber) {}

    /** Print point — replace a captured KYC image (re-uploaded via /api/kyc/image).
     *  kind = selfie | cni-recto | cni-verso; key is the new object-storage key. */
    public record PhotoUpdateRequest(String kind, String key) {}

    /** Result of a MoMo simulation. {@code outcome} = "validate" | "fail". */
    public record PayRequest(String outcome) {}

    /** Staff decision on a SARA money receipt. {@code outcome} = "validate" | "reject".
     *  The sara* fields carry the agent's confirmed/corrected receipt values (prefilled from extraction). */
    public record SaraValidateRequest(String outcome, String reason,
                                      String saraRef, String saraPayerPhone, Integer saraAmount) {}

    /** Lightweight, public payment status for the client polling the result. */
    public record PaymentStatusDto(String ref, String payStatus) {}

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
}
