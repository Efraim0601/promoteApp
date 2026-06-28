package com.afriland.promote.web;

import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.NotificationService;
import com.afriland.promote.web.dto.Dtos.NotificationDto;
import com.afriland.promote.web.dto.Dtos.SendNotificationRequest;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "Notifications", description = "Alertes in-app staff")
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService service;
    private final ActionAuditService audit;

    public NotificationController(NotificationService service, ActionAuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    /** Logged-in user — their full notification history (newest first). */
    @GetMapping("/mine")
    public List<NotificationDto> mine(Authentication auth) {
        return service.mine((String) auth.getPrincipal()).stream()
                .map(NotificationDto::of).toList();
    }

    /** Lightweight poll — returns just the unread count (badge). */
    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(Authentication auth) {
        return Map.of("count", service.unreadCount((String) auth.getPrincipal()));
    }

    /** Mark a single notification as read. */
    @PatchMapping("/{id}/read")
    public void markRead(@PathVariable Long id, Authentication auth) {
        service.markRead(id, (String) auth.getPrincipal());
    }

    /** Mark all notifications as read. */
    @PostMapping("/read-all")
    public void markAllRead(Authentication auth) {
        service.markAllRead((String) auth.getPrincipal());
    }

    /** Admin / supervisor — send a notification to one or more users. */
    @PostMapping
    public void send(@RequestBody SendNotificationRequest req, Authentication auth) {
        service.send((String) auth.getPrincipal(), req.title(), req.body(), req.recipientIds(), req.imageData());
        int count = req.recipientIds() == null ? 0 : req.recipientIds().size();
        audit.record(auth, "SEND_NOTIF", "NOTIFICATION", null,
                "Notification envoyée à " + count + " destinataire(s) : \"" + req.title() + "\"");
    }
}
