package com.afriland.promote.service;

import com.afriland.promote.model.Collecte;
import com.afriland.promote.repo.CollecteRepository;
import com.afriland.promote.util.PanUtils;
import com.afriland.promote.web.dto.Dtos.CollecteBucket;
import com.afriland.promote.web.dto.Dtos.CollecteStats;
import com.afriland.promote.web.dto.Dtos.CreateCollecteRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Business logic for collectes (bank-product sales capture). */
@Service
public class CollecteService {

    /** Valid product codes (mirror the frontend + the original Kobo questionnaire). */
    public static final Set<String> PRODUCTS = Set.of("compte_ouvert", "carte_bancaire", "sara_money", "e_first");

    /** Human labels for the stats buckets (kept server-side so exports/stats read well). */
    private static final Map<String, String> PRODUCT_LABELS = Map.of(
            "compte_ouvert", "Compte Ouvert",
            "carte_bancaire", "Carte Bancaire",
            "sara_money", "Sara Money",
            "e_first", "E-First");

    private final CollecteRepository repo;
    private final AtomicInteger seq = new AtomicInteger(0);

    public CollecteService(CollecteRepository repo) {
        this.repo = repo;
    }

    /** Initialise the sequence above the highest existing COL-#### reference. */
    public void initSequence() {
        int max = repo.findAll().stream()
                .map(Collecte::getRef)
                .filter(r -> r != null && r.startsWith("COL-"))
                .map(r -> { try { return Integer.parseInt(r.substring(4)); } catch (Exception e) { return 0; } })
                .max(Integer::compareTo).orElse(0);
        seq.set(max);
    }

    private String newRef() {
        return String.format("COL-%06d", seq.incrementAndGet());
    }

    /** Normalise + validate a payload onto a (new or existing) collecte. */
    private void apply(Collecte c, CreateCollecteRequest req) {
        String product = req.product() == null ? "" : req.product().trim();
        if (!PRODUCTS.contains(product)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_product");
        }
        c.setProduct(product);
        c.setClientNom(trim(req.clientNom()));
        c.setClientPhone(trim(req.clientPhone()));
        // Keep only the fields relevant to the chosen product.
        c.setAccountNumber("compte_ouvert".equals(product) ? trim(req.accountNumber()) : null);
        boolean isCard = "carte_bancaire".equals(product);
        c.setCardNumber(isCard ? PanUtils.mask(trim(req.cardNumber())) : null);
        c.setCardType(isCard ? trim(req.cardType()) : null);
    }

    private static String trim(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    @Transactional
    public Collecte create(CreateCollecteRequest req, String userId, String userName) {
        Collecte c = Collecte.builder()
                .ref(newRef())
                .collectedById(userId)
                .collectedByName(userName)
                .createdAt(Instant.now())
                .build();
        apply(c, req);
        return repo.save(c);
    }

    @Transactional
    public Collecte update(String ref, CreateCollecteRequest req) {
        Collecte c = repo.findById(ref).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "collecte_not_found"));
        apply(c, req);
        return repo.save(c);
    }

    @Transactional
    public void delete(String ref) {
        if (!repo.existsById(ref)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "collecte_not_found");
        repo.deleteById(ref);
    }

    public Collecte byRef(String ref) { return repo.findById(ref).orElse(null); }

    public List<Collecte> all() { return repo.findAllByOrderByCreatedAtDesc(); }

    public List<Collecte> mine(String userId) { return repo.findByCollectedByIdOrderByCreatedAtDesc(userId); }

    /** Counts by product and by commercial (most → least), for the admin dashboard. */
    public CollecteStats stats() {
        List<Collecte> all = repo.findAll();
        Map<String, Long> perProduct = new LinkedHashMap<>();
        for (String p : List.of("compte_ouvert", "carte_bancaire", "sara_money", "e_first")) perProduct.put(p, 0L);
        Map<String, long[]> perCommercial = new HashMap<>();      // id -> [count]
        Map<String, String> commercialName = new HashMap<>();
        for (Collecte c : all) {
            perProduct.merge(c.getProduct(), 1L, Long::sum);
            String id = c.getCollectedById() == null ? "—" : c.getCollectedById();
            perCommercial.computeIfAbsent(id, k -> new long[1])[0]++;
            commercialName.putIfAbsent(id, c.getCollectedByName() == null ? "—" : c.getCollectedByName());
        }
        List<CollecteBucket> byProduct = perProduct.entrySet().stream()
                .map(e -> new CollecteBucket(e.getKey(), PRODUCT_LABELS.getOrDefault(e.getKey(), e.getKey()), e.getValue()))
                .toList();
        List<CollecteBucket> byCommercial = perCommercial.entrySet().stream()
                .map(e -> new CollecteBucket(e.getKey(), commercialName.get(e.getKey()), e.getValue()[0]))
                .sorted(Comparator.comparingLong(CollecteBucket::count).reversed())
                .toList();
        return new CollecteStats(all.size(), byProduct, byCommercial);
    }
}
