package com.afriland.promote.storage;

/**
 * Abstraction for storing KYC selfie images. The default implementation targets
 * an S3-compatible object store (MinIO on the VPS, or AWS S3 in the cloud) so that
 * images never bloat the database and can be backed up / scaled independently.
 * Swapping to another backend only requires another implementation of this interface.
 */
public interface ImageStorage {

    /** Stored object metadata. */
    record StoredImage(byte[] data, String contentType) {}

    /**
     * Persist an image and return its opaque storage key.
     *
     * @param data        raw bytes
     * @param contentType MIME type (image/jpeg, image/png)
     * @param prefix      logical folder/prefix (e.g. "selfies")
     */
    String store(byte[] data, String contentType, String prefix);

    /** Load a previously stored image, or {@code null} if the key is unknown. */
    StoredImage load(String key);
}
