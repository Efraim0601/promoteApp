package com.afriland.promote.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * Short-TTL in-memory cache (Caffeine) in front of the dashboard KPI aggregations. The staff
 * dashboards poll their stats every {@code LIVE_REFRESH_MS} (~15 s); without a cache every poll
 * from every connected user re-runs the same aggregation against the DB. A small time-based cache
 * (expire-after-write) collapses those repeated polls into one DB hit per window, while staying
 * fresh enough for a live dashboard. No manual eviction is needed — entries simply age out.
 *
 * <p>Caches hold immutable DTO/record results only (never managed entities), so sharing a cached
 * instance across requests is safe. The TTL is intentionally short: a counter can lag by at most
 * one window, which is acceptable for a monitoring view that already refreshes on a timer.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /** Cache names — keep in sync with the {@code @Cacheable(...)} annotations on the stat methods. */
    public static final String ADMIN_STATS = "adminStats";
    public static final String PAYMENT_STATS = "paymentStats";
    public static final String HIERARCHY_STATS = "hierarchyStats";
    public static final String MAP_POINTS = "mapPoints";
    public static final String PRINT_SUPERVISION = "printSupervision";
    public static final String CASH_SUPERVISION = "cashSupervision";
    public static final String AGENCY_STATS = "agencyStats";

    @Bean
    public CacheManager cacheManager(
            @Value("${app.cache.stats-ttl-seconds:30}") long ttlSeconds,
            @Value("${app.cache.max-size:1000}") long maxSize) {
        CaffeineCacheManager manager = new CaffeineCacheManager(
                ADMIN_STATS, PAYMENT_STATS, HIERARCHY_STATS, MAP_POINTS,
                PRINT_SUPERVISION, CASH_SUPERVISION, AGENCY_STATS);
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(ttlSeconds, TimeUnit.SECONDS)
                .maximumSize(maxSize));
        // Only the names declared above are cached; an unknown name is a no-op (no accidental caching).
        manager.setAllowNullValues(false);
        return manager;
    }
}
