package com.afriland.promote.storage;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory image storage for local development and tests (no MinIO required).
 * Activated with {@code app.storage.provider=memory}.
 */
@Component
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "memory")
public class InMemoryImageStorage implements ImageStorage {

    private final ConcurrentHashMap<String, StoredImage> store = new ConcurrentHashMap<>();

    @Override
    public String store(byte[] data, String contentType, String prefix) {
        String key = prefix + "/" + UUID.randomUUID();
        store.put(key, new StoredImage(data, contentType));
        return key;
    }

    @Override
    public StoredImage load(String key) {
        return store.get(key);
    }
}
