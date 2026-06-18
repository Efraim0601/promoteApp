package com.afriland.promote.service;

import com.afriland.promote.model.PayStatus;
import com.afriland.promote.model.Recharge;
import com.afriland.promote.repo.RechargeRepository;
import com.afriland.promote.repo.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A recharge can only be fulfilled with a mandatory evidence screenshot. */
class RechargeFulfillEvidenceTest {

    private final RechargeRepository recharges = mock(RechargeRepository.class);
    private final AppUserRepository users = mock(AppUserRepository.class);
    private final RechargeService service =
            new RechargeService(recharges, users, null, null, null, null, null, null);

    private Recharge paid() {
        Recharge r = new Recharge();
        r.setRef("RC000123");
        r.setPayStatus(PayStatus.paid);
        r.setCreatedAt(Instant.now());
        when(recharges.findByRefIgnoreCase("RC000123")).thenReturn(Optional.of(r));
        when(users.findById(any())).thenReturn(Optional.empty());
        when(recharges.save(any())).thenAnswer(inv -> inv.getArgument(0));
        return r;
    }

    @Test
    void rejectsFulfillWithoutEvidence() {
        paid();
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.fulfill("RC000123", "  ", "cashier-1"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("evidence_required"));
        verify(recharges, never()).save(any());
    }

    @Test
    void fulfillsWithEvidence() {
        Recharge r = paid();
        Recharge out = service.fulfill("RC000123", "evidence/abc.jpg", "cashier-1");
        assertTrue(out.isFulfilled());
        assertEquals("evidence/abc.jpg", out.getEvidenceImageKey());
        verify(recharges).save(r);
    }

    @Test
    void noOpWhenNotPaid() {
        Recharge r = new Recharge();
        r.setRef("RC000999");
        r.setPayStatus(PayStatus.pending);
        when(recharges.findByRefIgnoreCase("RC000999")).thenReturn(Optional.of(r));
        Recharge out = service.fulfill("RC000999", null, "cashier-1");
        assertFalse(out.isFulfilled());
        verify(recharges, never()).save(any());
    }
}
