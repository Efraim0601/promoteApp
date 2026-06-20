package com.afriland.promote.web;

import com.afriland.promote.service.ActionAuditService;
import com.afriland.promote.service.PaymentReconciliationService;
import com.afriland.promote.web.dto.Dtos.VerifyResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Merchant-facing payment reconciliation: {@code GET /api/verify/{orderId}} re-checks the live
 * gateway status for a single order and realigns the local record. It is the supported way to
 * regularise a "client débité mais statut expiré/échoué chez nous" claim (OM confirms the payment
 * late or our local timeout fired first). Authenticated staff only (falls under the global
 * {@code anyRequest().authenticated()} rule in SecurityConfig).
 */
@RestController
@RequestMapping("/api/verify")
public class VerifyController {

    private static final Logger log = LoggerFactory.getLogger(VerifyController.class);

    private final PaymentReconciliationService reconciliation;
    private final ActionAuditService audit;

    public VerifyController(PaymentReconciliationService reconciliation, ActionAuditService audit) {
        this.reconciliation = reconciliation;
        this.audit = audit;
    }

    @GetMapping("/{orderId}")
    public VerifyResult verify(@PathVariable String orderId, Authentication auth) {
        VerifyResult result = reconciliation.verifyOrder(orderId);
        // Trace only an actual regularisation (a state change) — it's a financial action.
        if (result.changed()) {
            log.info("Verify reconciled {} {} -> {} (orderId={})",
                    result.kind(), result.ref(), result.status(), result.orderId());
            audit.record(auth, "VERIFY_PAYMENT", result.kind().toUpperCase(), result.ref(),
                    "Réconciliation manuelle " + result.ref() + " → " + result.status());
        }
        return result;
    }
}
