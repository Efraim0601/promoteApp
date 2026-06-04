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
            String referrerPhone) {}     // self path only

    public record SubscriptionDto(
            String ref, String prenom, String nom, String fullName,
            String cni, String cniExp, String phone,
            String pay, String delivery, int amount, int transport,
            String channel, String agentId, String referrerName, String referrerPhone,
            String payStatus, boolean printed, boolean selfieVerified,
            String status, String createdAt) {
        public static SubscriptionDto of(Subscription s) {
            return new SubscriptionDto(
                    s.getRef(), s.getPrenom(), s.getNom(), s.getFullName(),
                    s.getCni(), s.getCniExp(), s.getPhone(),
                    s.getPay(), s.getDelivery(), s.getAmount(), s.getTransport(),
                    s.getChannel(), s.getAgentId(), s.getReferrerName(), s.getReferrerPhone(),
                    s.getPayStatus().name(), s.isPrinted(), s.isSelfieVerified(),
                    s.getStatus(), s.getCreatedAt().toString());
        }
    }

    /** Result of a MoMo simulation. {@code outcome} = "validate" | "fail". */
    public record PayRequest(String outcome) {}

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
