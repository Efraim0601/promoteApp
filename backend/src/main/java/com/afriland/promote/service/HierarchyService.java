package com.afriland.promote.service;

import com.afriland.promote.model.AppUser;
import com.afriland.promote.model.Role;
import com.afriland.promote.repo.AppUserRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Navigates the org tree built from {@link AppUser#getParentUserId()}:
 * Manager → Superviseur → Chef d'équipe → (commerciaux, imprimeur, caissier…).
 *
 * <p>Used to scope statistics and team messaging to a caller's sub-tree. Admin and Manager have a
 * global reach (no scoping) — the controllers decide that; this service only computes sub-trees.
 * Every traversal is guarded against cycles (a corrupt {@code parentUserId} loop can never hang).
 */
@Service
public class HierarchyService {

    private final AppUserRepository users;

    public HierarchyService(AppUserRepository users) {
        this.users = users;
    }

    /** Direct reports of {@code userId} (one level down). */
    public List<AppUser> directReports(String userId) {
        if (userId == null) return List.of();
        return users.findByParentUserId(userId);
    }

    /**
     * All accounts in {@code userId}'s sub-tree (every descendant, any depth), excluding the node
     * itself. Cycle-safe. Returns an empty set for a leaf or an unknown id.
     */
    public Set<AppUser> descendants(String userId) {
        Set<AppUser> out = new LinkedHashSet<>();
        if (userId == null) return out;
        Set<String> visited = new LinkedHashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        stack.push(userId);
        visited.add(userId);
        while (!stack.isEmpty()) {
            String current = stack.pop();
            for (AppUser child : users.findByParentUserId(current)) {
                if (visited.add(child.getId())) {
                    out.add(child);
                    stack.push(child.getId());
                }
            }
        }
        return out;
    }

    /** Ids of every descendant in {@code userId}'s sub-tree (no self). */
    public Set<String> descendantIds(String userId) {
        Set<String> ids = new LinkedHashSet<>();
        for (AppUser u : descendants(userId)) ids.add(u.getId());
        return ids;
    }

    /**
     * A team lead's team: the direct reports that are field staff (not other leads). In practice a
     * chef d'équipe's team is its direct reports — commerciaux, imprimeurs, caissiers… We return the
     * full sub-tree so a chef d'équipe with sub-groups still sees everyone below.
     */
    public Set<AppUser> team(String teamLeadId) {
        return descendants(teamLeadId);
    }

    /** True when {@code targetId} is {@code rootId} itself or anywhere in {@code rootId}'s sub-tree. */
    public boolean isInSubtree(String rootId, String targetId) {
        if (rootId == null || targetId == null) return false;
        if (rootId.equals(targetId)) return true;
        return descendantIds(rootId).contains(targetId);
    }

    /** True if assigning {@code candidateParentId} as the parent of {@code userId} would create a
     *  cycle (i.e. the candidate parent is the user itself or one of its descendants). */
    public boolean wouldCreateCycle(String userId, String candidateParentId) {
        if (userId == null || candidateParentId == null) return false;
        if (userId.equals(candidateParentId)) return true;
        return descendantIds(userId).contains(candidateParentId);
    }

    /** Whether a role sits in the management chain (used to label/structure the tree). */
    public static boolean isManagerial(Role r) {
        return r == Role.ADMIN || r == Role.MANAGER || r == Role.SUPERVISEUR || r == Role.CHEF_EQUIPE;
    }
}
