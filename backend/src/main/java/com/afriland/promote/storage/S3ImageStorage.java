package com.afriland.promote.storage;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;

import java.net.URI;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * S3-compatible image storage (MinIO on-prem / AWS S3 in cloud). KYC selfies are
 * written to a private bucket; only the object key is persisted in the database and
 * images are streamed back through the backend, so the object store never needs to be
 * publicly reachable.
 */
@Component
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "s3", matchIfMissing = true)
public class S3ImageStorage implements ImageStorage {

    private static final Logger log = LoggerFactory.getLogger(S3ImageStorage.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC);

    private final S3Client s3;
    private final String bucket;

    public S3ImageStorage(
            @Value("${app.storage.s3.endpoint}") String endpoint,
            @Value("${app.storage.s3.region:us-east-1}") String region,
            @Value("${app.storage.s3.access-key}") String accessKey,
            @Value("${app.storage.s3.secret-key}") String secretKey,
            @Value("${app.storage.s3.bucket:kyc-selfies}") String bucket) {
        this.bucket = bucket;
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()) // required by MinIO
                .httpClient(UrlConnectionHttpClient.create())
                .build();
    }

    /** Ensure the bucket exists (retries while MinIO finishes starting up). */
    @PostConstruct
    void ensureBucket() {
        for (int attempt = 1; attempt <= 10; attempt++) {
            try {
                s3.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
                return;
            } catch (NoSuchBucketException e) {
                s3.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
                log.info("Created object-storage bucket '{}'", bucket);
                return;
            } catch (S3Exception e) {
                if (e.statusCode() == 404) {
                    s3.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
                    log.info("Created object-storage bucket '{}'", bucket);
                    return;
                }
                throw e;
            } catch (Exception e) {
                log.warn("Object storage not ready (attempt {}/10): {}", attempt, e.getMessage());
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }
        log.error("Could not reach object storage to ensure bucket '{}'", bucket);
    }

    @Override
    public String store(byte[] data, String contentType, String prefix) {
        String ext = "image/png".equalsIgnoreCase(contentType) ? "png" : "jpg";
        String key = "%s/%s/%s.%s".formatted(prefix, DAY.format(Instant.now()), UUID.randomUUID(), ext);
        s3.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(),
                RequestBody.fromBytes(data));
        return key;
    }

    @Override
    public StoredImage load(String key) {
        try {
            ResponseBytes<GetObjectResponse> obj = s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build());
            return new StoredImage(obj.asByteArray(), obj.response().contentType());
        } catch (NoSuchKeyException e) {
            return null;
        }
    }
}
