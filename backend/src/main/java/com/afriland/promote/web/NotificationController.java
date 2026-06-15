package com.afriland.promote.web;

import com.afriland.promote.service.NotificationService;
import com.afriland.promote.web.dto.Dtos.NotificationDto;
import com.afriland.promote.web.dto.Dtos.SendNotificationRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
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
        service.send((String) auth.getPrincipal(), req.title(), req.body(), req.recipientIds());
    }
}
