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
            @NotBlank String cni,
            @NotBlank String cniExp,
            @NotBlank String phone,
            @NotBlank String pay,        // om | mtn | cash
            String delivery,             // promote | agence | home (defaults to promote)
            boolean selfie,
            String selfieKey,            // object-storage keys returned by /api/kyc/image
            String cniRectoKey,
            String cniVersoKey,
            String referrerPhone) {}     // self path only

    public record SubscriptionDto(
            String ref, String prenom, String nom, String fullName,
            String cni, String cniExp, String phone,
            String pay, String delivery, int amount, int transport,
            String channel, String agentId, String referrerName, String referrerPhone,
            String payStatus, boolean printed, boolean selfieVerified,
            boolean hasSelfie, boolean hasCniRecto, boolean hasCniVerso,
            String status, String createdAt, String paymentMessage) {
        public static SubscriptionDto of(Subscription s) {
            return new SubscriptionDto(
                    s.getRef(), s.getPrenom(), s.getNom(), s.getFullName(),
                    s.getCni(), s.getCniExp(), s.getPhone(),
                    s.getPay(), s.getDelivery(), s.getAmount(), s.getTransport(),
                    s.getChannel(), s.getAgentId(), s.getReferrerName(), s.getReferrerPhone(),
                    s.getPayStatus().name(), s.isPrinted(), s.isSelfieVerified(),
                    s.getSelfieKey() != null, s.getCniRectoKey() != null, s.getCniVersoKey() != null,
                    s.getStatus(), s.getCreatedAt().toString(), s.getPaymentMessage());
        }
    }

    /** Result of a MoMo simulation. {@code outcome} = "validate" | "fail". */
    public record PayRequest(String outcome) {}

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

    /** Agent claims a QR (self) sale by phone + CNI. */
    public record ClaimRequest(@NotBlank String phone, @NotBlank String cni) {}

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
