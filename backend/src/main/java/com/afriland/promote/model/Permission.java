package com.afriland.promote.model;

import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/** Fine-grained permissions that group into profiles. */
public enum Permission {
    SOUSCRIPTIONS_READ,
    SOUSCRIPTIONS_WRITE,
    SOUSCRIPTIONS_VALIDATE,
    SOUSCRIPTIONS_PRINT,
    SOUSCRIPTIONS_EXPORT,
    RECHARGES_READ,
    RECHARGES_VALIDATE,
    RECHARGES_EXPORT,
    COLLECTES_READ,
    COLLECTES_WRITE,
    COLLECTES_EXPORT,
    UTILISATEURS_READ,
    UTILISATEURS_WRITE,
    CONFIG_READ,
    CONFIG_WRITE,
    PRODUITS_READ,
    PRODUITS_WRITE,
    PROMOTIONS_READ,
    PROMOTIONS_WRITE,
    COMMISSIONS_READ,
    COMMISSIONS_WRITE,
    COMMISSIONS_EXPORT,
    STATS_READ,
    MESSAGES_READ,
    MESSAGES_WRITE;

    public static Set<Permission> fromCsv(String csv) {
        if (csv == null || csv.isBlank()) return EnumSet.noneOf(Permission.class);
        Set<Permission> result = EnumSet.noneOf(Permission.class);
        for (String s : csv.split(",")) {
            String t = s.trim();
            if (!t.isEmpty()) {
                try { result.add(Permission.valueOf(t)); } catch (IllegalArgumentException ignored) {}
            }
        }
        return result;
    }

    public static String toCsv(Set<Permission> perms) {
        if (perms == null || perms.isEmpty()) return "";
        return perms.stream().map(Permission::name).sorted().collect(Collectors.joining(","));
    }
}
