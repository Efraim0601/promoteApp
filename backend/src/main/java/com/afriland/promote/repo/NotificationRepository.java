package com.afriland.promote.repo;

import com.afriland.promote.model.AppNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface NotificationRepository extends JpaRepository<AppNotification, Long> {

    List<AppNotification> findByRecipientIdOrderByCreatedAtDesc(String recipientId);

    long countByRecipientIdAndReadAtIsNull(String recipientId);

    List<AppNotification> findByRecipientIdAndReadAtIsNull(String recipientId);

    @Modifying
    @Query("update AppNotification n set n.readAt = :now where n.recipientId = :uid and n.readAt is null")
    int markAllRead(@Param("uid") String recipientId, @Param("now") Instant now);
}
