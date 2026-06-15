package com.afriland.promote.service;

import com.afriland.promote.model.AppNotification;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class NotificationService {

    private final NotificationRepository repo;
    private final AppUserRepository users;

    public NotificationService(NotificationRepository repo, AppUserRepository users) {
        this.repo  = repo;
        this.users = users;
    }

    public List<AppNotification> mine(String userId) {
        return repo.findByRecipientIdOrderByCreatedAtDesc(userId);
    }

    public long unreadCount(String userId) {
        return repo.countByRecipientIdAndReadAtIsNull(userId);
    }

    @Transactional
    public void send(String senderId, String title, String body, List<String> recipientIds) {
        String senderName = users.findById(senderId).map(u -> u.getName()).orElse("Admin");
        List<AppNotification> notifs = recipientIds.stream()
                .distinct()
                .map(rid -> AppNotification.builder()
                        .senderId(senderId)
                        .senderName(senderName)
                        .title(title)
                        .body(body)
                        .recipientId(rid)
                        .build())
                .toList();
        repo.saveAll(notifs);
    }

    @Transactional
    public void markRead(Long notifId, String userId) {
        repo.findById(notifId).ifPresent(n -> {
            if (n.getRecipientId().equals(userId) && n.getReadAt() == null) {
                n.setReadAt(Instant.now());
                repo.save(n);
            }
        });
    }

    @Transactional
    public void markAllRead(String userId) {
        repo.markAllRead(userId, Instant.now());
    }
}
