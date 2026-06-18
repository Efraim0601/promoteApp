package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Collecte;
import com.afriland.promote.model.CommissionEntry;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import com.afriland.promote.repo.CollecteRepository;
import com.afriland.promote.repo.CommissionEntryRepository;
import com.afriland.promote.repo.SubscriptionRepository;
import com.afriland.promote.web.dto.Dtos.HierarchyStatsDto;
import com.afriland.promote.web.dto.Dtos.MemberStatsDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Sales statistics scoped to the caller's place in the org tree. Admin and Manager see the whole
 * commercial organisation; a Superviseur or Chef d'équipe sees only their sub-tree
 * ({@link HierarchyService#descendants}). The scoping is enforced here (server-side), not merely
 * hidden in the UI, so no one can read above or beside their perimeter.
 */
@Service
public class HierarchyStatsService {

    private final AppUserRepository users;
    private final SubscriptionRepository subs;
    private final CollecteRepository collectes;
    private final CommissionEntryRepository commissionEntries;
    private final HierarchyService hierarchy;

    public HierarchyStatsService(AppUserRepository users, SubscriptionRepository subs,
                                 CollecteRepository collectes, CommissionEntryRepository commissionEntries,
                                 HierarchyService hierarchy) {
        this.users = users;
        this.subs = subs;
        this.collectes = collectes;
        this.commissionEntries = commissionEntries;
        this.hierarchy = hierarchy;
    }

    /**
     * Per-member sales stats for the caller's scope, optionally filtered to a single product code.
     * Members with no activity are omitted so the list stays meaningful.
     */
    public HierarchyStatsDto scopedStats(String callerId, Set<Role> callerRoles, String productCode) {
        boolean global = callerRoles.contains(Role.ADMIN) || callerRoles.contains(Role.MANAGER);
        Collection<AppUser> members = global ? users.findAll() : hierarchy.descendants(callerId);

        boolean filterByProduct = productCode != null && !productCode.isBlank();
        boolean includeCard = !filterByProduct || ProductService.CARD_CODE.equalsIgnoreCase(productCode);
        boolean includeBank = !filterByProduct || !ProductService.CARD_CODE.equalsIgnoreCase(productCode);

        List<MemberStatsDto> rows = new ArrayList<>();
        long tSubs = 0, tAmount = 0, tCollectes = 0, tCommissions = 0;

        for (AppUser m : members) {
            String id = m.getId();

            // Same attribution as the member's own dashboard (owned ∪ referred sales). Count ONLY settled
            // (paid) sales — like the admin ranking — so a cash sale registered but never collected can't
            // inflate a member's performance / primes. Count and amount share the same `paid` filter.
            String phone9 = SubscriptionService.local9(m.getPhone());
            long subsCount = includeCard ? subs.countPaidOwnedOrReferred(id, phone9) : 0;
            long subsAmount = includeCard ? subs.collectedPaidOwnedOrReferred(id, phone9) : 0;

            long collectesCount = 0;
            if (includeBank) {
                collectesCount = filterByProduct
                        ? collectes.findByCollectedByIdOrderByCreatedAtDesc(id).stream()
                            .filter(c -> productCode.equalsIgnoreCase(c.getProduct())).count()
                        : collectes.countByCollectedById(id);
            }

            long commission = commissionEntries.findByBeneficiaryIdOrderByCreatedAtDesc(id).stream()
                    .filter(e -> !filterByProduct || productCode.equalsIgnoreCase(e.getProductCode()))
                    .mapToLong(CommissionEntry::getAmount).sum();

            if (subsCount == 0 && collectesCount == 0 && commission == 0) continue;

            rows.add(new MemberStatsDto(id, m.getName(), primaryRole(m), subsCount, subsAmount,
                    collectesCount, commission));
            tSubs += subsCount;
            tAmount += subsAmount;
            tCollectes += collectesCount;
            tCommissions += commission;
        }

        rows.sort(Comparator.comparingLong((MemberStatsDto r) -> r.subscriptions() + r.collectes()).reversed());
        String scope = global ? "GLOBAL" : "SUBTREE";
        return new HierarchyStatsDto(scope, tSubs, tAmount, tCollectes, tCommissions, rows);
    }

    private static String primaryRole(AppUser u) {
        return u.getRole() != null ? u.getRole().name() : "";
    }

    /** Collectes captured by the caller's sub-tree (used for a chef d'équipe / superviseur drill-down). */
    public List<Collecte> subtreeCollectes(String callerId) {
        List<String> ids = new ArrayList<>(hierarchy.descendantIds(callerId));
        if (ids.isEmpty()) return List.of();
        return collectes.findByCollectedByIdIn(ids);
    }
}
