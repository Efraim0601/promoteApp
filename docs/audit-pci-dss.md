# Audit PCI-DSS — Portail Afriland Carte Promote

| | |
|---|---|
| **Date de l'audit** | 17 juin 2026 |
| **Périmètre** | Application `promoteApp` — backend Spring Boot + frontend Angular + infrastructure Docker/Caddy |
| **Branche auditée** | `feat/catalogue-hierarchie-commissions` (commit `1055585`) |
| **Référentiel** | PCI-DSS v4.0 (les écarts spécifiques à la v4 vs v3.2.1 sont signalés) |
| **Méthode** | Revue du code source réel (pas seulement la documentation), preuves `fichier:ligne` |
| **Type d'évaluation** | Auto-évaluation technique du code — ne remplace pas une certification QSA/RoC |

> ⚠️ Ce rapport couvre les exigences **vérifiables dans le code** (Req. 2, 3, 4, 6, 7, 8, 10). Les exigences organisationnelles et d'infrastructure physique (Req. 1 pare-feu réseau, 5 anti-malware, 9 accès physique, 11 tests d'intrusion, 12 politique de sécurité) relèvent de processus hors dépôt et ne sont **pas** couvertes ici.

---

## 1. Synthèse exécutive

Le portail présente une **posture de sécurité solide sur le cœur PCI-DSS** : le numéro de carte (PAN) n'est **jamais** collecté, transmis, stocké ni journalisé en entier, et **aucune donnée d'authentification sensible (CVV, piste, PIN carte) n'existe dans le système**. Le périmètre PCI est fortement réduit par conception (flux Mobile Money, PAN tronqué 4+4 dès le frontend).

Les écarts portent surtout sur les exigences d'**authentification forte (Req. 8)** et de **journalisation/rétention (Req. 10)**, ainsi que sur quelques durcissements de configuration.

### Tableau de bord par exigence

| Exigence | Domaine | Niveau | Écart le plus sévère |
|---|---|---|---|
| **Req. 2** | Configuration sécurisée | 🟢 Largement conforme | Défauts faibles atténués par `SecretsGuard` |
| **Req. 3** | Protection du PAN stocké | 🟢 Conforme | Colonne non contrainte (Mineur) |
| **Req. 4** | Chiffrement des transmissions | 🟡 Conforme avec réserve | URL passerelle non forcée en `https` (Majeur) |
| **Req. 6** | Développement sécurisé | 🟢 Largement conforme | Pas de scan de dépendances (Mineur) |
| **Req. 7** | Contrôle d'accès (RBAC) | 🟢 Conforme | Permissions fines non utilisées (Mineur) |
| **Req. 8** | Authentification | 🔴 Non conforme v4 | **Absence de MFA (Critique)** |
| **Req. 10** | Journalisation & surveillance | 🟡 Partiellement conforme | Rétention/intégrité non formalisées (Majeur) |

### Constats prioritaires

- 🔴 **Critique — Absence totale de MFA** (Req. 8.4.2 / 8.5) : le portail admin est protégé par simple email + mot de passe. La v4 exige la MFA pour tout accès administratif.
- 🟠 **Majeur — URL passerelle TrustPayWay non forcée en `https`** : rien n'empêche un `http://` qui exposerait la clé secrète et les MSISDN en clair.
- 🟠 **Majeur — Longueur minimale de mot de passe = 8** (< 12 exigé en v4).
- 🟠 **Majeur — `mustChangePassword` non appliqué côté serveur** : le changement forcé repose uniquement sur le frontend.
- 🟠 **Majeur — Comptes seedés avec mot de passe par défaut connu** (`promote`) ; agent de test non couvert par `SecretsGuard`.
- 🟠 **Majeur — Journalisation/rétention** : accès en lecture aux données carte non tracés, `PaymentController` non audité, aucune politique de rétention/protection d'intégrité des journaux.

---

## 2. Exigence 3 — Protéger les données du titulaire de carte stockées 🟢

**Verdict : Conforme.** Aucun constat Critique ou Majeur.

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 3.1 | PAN masqué (4 premiers + 4 derniers) avant **toute** persistance | `service/SubscriptionService.java:579,581`, `service/RechargeService.java:148,177`, `service/CollecteService.java:69`, `util/PanUtils.java:18-24` | ✅ Conforme | — |
| 3.2 | **Aucun stockage de CVV/CVC/piste/expiration carte** | grep global négatif sur `cvv\|cvc\|track1\|track2\|cryptogram` | ✅ Conforme | — |
| 3.3 | Frontend ne collecte que préfixe/suffixe (8 chiffres centraux jamais saisis) | `frontend/.../recharge.ts:215-221,452`, `print-point.ts:608` | ✅ Conforme | — |
| 3.4 | DTO de réponse re-masquent le PAN (idempotent) | `web/dto/Dtos.java:304,509` | ✅ Conforme | — |
| 3.5 | Recherche par PAN limitée aux 8 chiffres déjà visibles | `repo/SubscriptionRepository.java:81`, `repo/RechargeRepository.java:47` | ✅ Conforme | — |
| 3.6 | Aucun PAN dans les logs ni dans les exports | grep logs/export négatif | ✅ Conforme | — |
| 3.7 | Colonne `pan varchar(255)` sans contrainte ; doc imprécise | `model/Recharge.java:40`, `model/Subscription.java:125`, `docs/db-schema.md:133` | ⚠️ À vérifier | Mineur |

**Recommandations (non bloquantes)** :
1. Documenter explicitement que `pan`/`card_number` ne contiennent **que** la forme masquée (corriger `db-schema.md:133`).
2. Ajouter une garde de défense en profondeur (`@PrePersist`) refusant toute valeur contenant 16 chiffres consécutifs.
3. Réduire la longueur de colonne (`varchar(19)`) au format masqué.

---

## 3. Exigence 4 — Chiffrer les transmissions 🟡

**Verdict : Conforme avec une réserve Majeure.**

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 4.1 | Reverse proxy Caddy 2 + Let's Encrypt automatique (TLS prod) | `docker-compose.le.yml:21-22`, `deploy/Caddyfile.le:11` | ✅ Conforme | — |
| 4.2 | HSTS activé en prod (`max-age=31536000`) | `deploy/Caddyfile.le:20` | ✅ Conforme | — |
| 4.3 | Vérification du certificat passerelle (défaut JDK, non désactivée) | `payment/TrustPayWayGateway.java:62-65` | ✅ Conforme | — |
| 4.4 | **URL passerelle TrustPayWay non forcée en `https://`** | `payment/TrustPayWayProperties.java:20`, `.env.example:44` (vide) | ❌ Non conforme | **Majeur** |
| 4.5 | Version TLS minimale non figée explicitement (Caddy = 1.2 par défaut) | `deploy/Caddyfile.le` (pas de `min_version`) | ⚠️ À vérifier | Mineur |

**Risque 4.4** : si `TRUSTPAYWAY_BASE_URL` est configuré en `http://`, la clé `SECRET_KEY` (Bearer) et les numéros MSISDN transitent en clair.
**Remédiation** : valider au démarrage que `baseUrl` commence par `https://` (lever une exception sinon) ; figer `min_version tls1.2` dans le Caddyfile.

---

## 4. Exigence 7 — Restreindre l'accès selon le besoin d'en connaître 🟢

**Verdict : Conforme.**

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 7.1 | RBAC centralisé par URL (`hasRole`/`hasAnyRole`), 8 rôles + profils | `config/SecurityConfig.java:60-141`, `model/Role.java:4-13` | ✅ Conforme | — |
| 7.2 | Moindre privilège (lecture/écriture séparées, admin-only sur `users`/`profiles`/`audit`/`roles`) | `SecurityConfig.java:67,96,108` | ✅ Conforme | — |
| 7.3 | Scoping par utilisateur via le principal JWT, pas un paramètre client | `web/SubscriptionController.java:52-53`, `service/SubscriptionService.java:361` | ✅ Conforme | — |
| 7.4 | Scoping hiérarchique (sous-arbre) appliqué côté serveur | `SecurityConfig.java:78,100-101`, `service/HierarchyStatsService.java` | ✅ Conforme | — |
| 7.5 | Permissions fines `PERM_*` émises mais non utilisées pour l'autorisation des endpoints | grep : autorisation uniquement par `ROLE_*` | ⚠️ À vérifier | Mineur |

---

## 5. Exigence 8 — Identifier et authentifier les accès 🔴

**Verdict : Non conforme à la v4.0** (absence de MFA + longueur de mot de passe).

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 8.1 | **Aucune MFA / TOTP / OTP** nulle part dans le code | grep `TOTP\|MFA\|2FA\|otp\|authenticator` = 0 résultat | ❌ Non conforme | **Critique** |
| 8.2 | **Longueur min. de mot de passe = 8** (v4 exige ≥ 12) | `security/PasswordPolicy.java:9` | ❌ Non conforme v4 | **Majeur** |
| 8.3 | **`mustChangePassword` non appliqué côté serveur** (login renvoie un JWT pleinement valide) | flag posé `AuthController.java:124`, aucune garde dans `JwtAuthFilter`/`SecurityConfig` | ❌ Non conforme | **Majeur** |
| 8.4 | **Comptes seedés avec mot de passe `promote`** ; agent de test hardcodé non couvert par `SecretsGuard` | `bootstrap/DataSeeder.java:142,147,156,164` | ❌ Non conforme (atténué prod) | **Majeur** |
| 8.5 | Verrouillage en mémoire (`ConcurrentHashMap`) — contournable en multi-réplicas, réinitialisé au redémarrage | `security/LoginRateLimiter.java:32` | ❌ Non conforme (atténué) | Majeur |
| 8.6 | PIN collecteur à 4 chiffres (10 000 combinaisons) | `security/TempPasswordGenerator.java:17` | ❌ Non conforme | Majeur |
| 8.7 | Secret JWT par défaut connu (`change-me…`) | `application.yml:60` | ❌ Non conforme (bloqué en prod par `SecretsGuard.java:68`) | Majeur |
| 8.8 | Durée du token = 12 h (long pour accès admin) | `security/JwtService.java:22` | ⚠️ À vérifier | Mineur |
| 8.9 | **`DataSeeder` s'exécute avant `SecretsGuard`** : un premier démarrage avec un mot de passe par défaut (échec garde) **crée quand même le compte** avec ce mot de passe ; comme le seeder est idempotent par email, corriger ensuite la variable d'env fait passer la garde (qui lit l'**env**, pas la base) **mais le compte conserve le mot de passe par défaut**. *Reproduit au run du 17/06/2026 sur le compte CASHIER (resté `promote`). Renforce 8.4.* | `bootstrap/DataSeeder.java:94-98,161-164`, `SecretsGuard.java:57` (`@ApplicationReadyEvent`) | ❌ Non conforme | **Majeur** |
| **✅** | Hachage **BCrypt** (jamais de stockage en clair) | `SecurityConfig.java:164-166`, `model/AppUser.java:28` | ✅ Conforme | — |
| **✅** | Verrouillage à 6 échecs / 30 min | `LoginRateLimiter.java:25-27` | ✅ Conforme | — |
| **✅** | Révocation immédiate des comptes désactivés (relookup DB par requête) | `security/JwtAuthFilter.java:62-63` | ✅ Conforme | — |
| **✅** | Mot de passe temporaire via `SecureRandom`, ~55 bits d'entropie | `TempPasswordGenerator.java:12,22-31` | ✅ Conforme | — |

**Remédiations prioritaires** :
1. **Implémenter la MFA (TOTP)** pour au moins les rôles ADMIN/CASHIER (Critique).
2. Porter `MIN_LENGTH` à **12** ; appliquer `mustChangePassword` côté serveur via un filtre bloquant.
3. Forcer `SEED_TEST_AGENT=false` en prod et couvrir l'agent de test par `SecretsGuard` ; imposer le changement de mot de passe sur les comptes seedés.
4. Persister le rate-limiter (DB/Redis) pour qu'il survive au redémarrage et soit partagé entre réplicas.
5. Remplacer le PIN 4 chiffres par un secret plus fort, ou ajouter un second facteur.

---

## 6. Exigence 10 — Journaliser et surveiller les accès 🟡

**Verdict : Partiellement conforme.**

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 10.1 | Login succès **et** échec journalisés (IP, User-Agent, horodatage, user) ; aucun mot de passe loggé | `service/LoginAuditService.java`, `model/LoginAudit.java:24-43`, `AuthController.java:45-88` | ✅ Conforme | — |
| 10.2 | Mutations comptes/rôles/config tracées ; pas de mot de passe dans `details` | `web/UserController.java:101,145,174,321`, `ProfileController.java:77`, `ConfigController.java:63` | ✅ Conforme | — |
| 10.3 | Audit consultable **admin-only**, GET uniquement, aucun delete/update applicatif (append-only respecté) | `SecurityConfig.java:108`, `web/AuditController.java:26-37`, `model/ActionAudit.java:10` | ✅ Conforme | — |
| 10.4 | **Accès en lecture aux données carte non journalisés** (Req. 10.2.1.1) | recherche/consultation PAN sans `audit.record` | ❌ Non conforme | **Majeur** |
| 10.5 | **`PaymentController` non audité** (reconcile + webhook modifient le statut financier) | `web/PaymentController.java:51,66` (pas d'`ActionAuditService`) | ❌ Non conforme | **Majeur** |
| 10.6 | **Aucune politique de rétention / job de purge** formalisé | aucun `@Scheduled` de purge sur `login_audit`/`action_audit` | ❌ Non conforme | **Majeur** |
| 10.7 | Intégrité des journaux non garantie techniquement (pas de contrainte DB anti-UPDATE/DELETE, pas de hash chaîné, pas d'export SIEM/WORM) | append-only par discipline de code uniquement | ⚠️ À vérifier | Majeur |
| 10.8 | Échec sur compte connu → `userId` non rattaché (corrélation par email seulement) | `LoginAuditService.java:27-29`, `AuthController.java:51` | ⚠️ À vérifier | Mineur |
| 10.9 | `KycController` (upload pièces d'identité) non audité | `web/KycController.java:45,60` | ⚠️ À vérifier | Mineur |
| 10.10 | Plafond de restitution API (1000/2000), pas de filtre par date | `AuditController.java:28,35` | ⚠️ À vérifier | Mineur |
| 10.11 | MSISDN/PII complet dans les logs paiement et table d'audit | `payment/TrustPayWayGateway.java:87,133` | ⚠️ À vérifier | Mineur |
| 10.12 | Échecs d'écriture d'audit silencieux (`catch (Exception ignored)`), sans alerte | `LoginAuditService.java:38`, `ActionAuditService.java:62` | ❌ Non conforme | Mineur |

**Remédiations prioritaires** :
1. Journaliser les accès **en lecture** aux souscriptions/recharges contenant un PAN.
2. Injecter l'audit dans `PaymentController` (reconcile, webhook).
3. Formaliser une **rétention ≥ 1 an** + job de purge au-delà ; protéger l'intégrité (contrainte DB anti-UPDATE/DELETE, export vers un SIEM/stockage WORM).
4. Émettre une alerte (ne pas avaler silencieusement) en cas d'échec d'écriture d'audit.

---

## 7. Exigences 2 & 6 — Configuration et développement sécurisés 🟢

**Verdict : Largement conforme.**

| # | Constat | Preuve | Statut | Sévérité |
|---|---|---|---|---|
| 2.1 | **Aucun secret de prod committé** ; `.env` gitignoré et jamais suivi | `.gitignore:2`, `git ls-files .env` vide, historique vide | ✅ Conforme | — |
| 2.2 | `SecretsGuard` **refuse le démarrage en prod** si secrets par défaut (`change-me`, `promote`) | `bootstrap/SecretsGuard.java:57-90` | ✅ Conforme | — |
| 2.3 | `DatabaseGuard` refuse H2 in-memory hors dev/test | `bootstrap/DatabaseGuard.java:55-60` | ✅ Conforme | — |
| 2.4 | Surface réseau confinée (DB/MinIO/backend non publiés, front en loopback) | `docker-compose.yml:14,35,102,110`, `.env.example:74` | ✅ Conforme | — |
| 2.5 | Script d'audit de durcissement système (SSH, ufw, sysctl, auditd, perms…) | `scripts/harden-audit.sh` | ✅ Conforme | — |
| 2.6 | Défauts faibles présents dans `application.yml`/compose (atténués par `SecretsGuard`) | `application.yml:8,40,44,48,60` | ⚠️ Atténué | Mineur |
| 2.7 | **`docker-compose.yml` ne câblait pas `CASHIER_*`** → `app.cashier.password` retombait sur `promote`, et `SecretsGuard` **empêchait tout démarrage** d'une stack prod propre (crash-loop). *Découvert au run du 17/06/2026, **corrigé** : ajout `CASHIER_EMAIL/PASSWORD/NAME` dans le bloc `environment` du backend + documentation `.env.example`.* | `docker-compose.yml:68-73`, `application.yml:46-49`, `SecretsGuard.java:77` | ✅ Corrigé | (était Majeur) |
| 6.1 | `GlobalExceptionHandler` ne fuit pas de stack trace au client (générique) | `web/GlobalExceptionHandler.java:40-45` | ✅ Conforme | — |
| 6.2 | **Pas d'injection SQL** : tous les `@Query` en paramètres nommés, concaténation = littéraux statiques | `repo/SubscriptionRepository.java:77-84`, `repo/RechargeRepository.java:45` | ✅ Conforme | — |
| 6.3 | Upload KYC validé : type (regex stricte), taille plafonnée, `kind` whitelisté | `web/KycController.java:29-35,77-89` | ✅ Conforme | — |
| 6.4 | Validation des entrées (`@Valid` + contraintes Bean Validation sur DTO) | `pom.xml:53`, 27 annotations de contrainte | ✅ Conforme | Mineur (couverture partielle) |
| 6.5 | `frameOptions().disable()` global + `/h2-console/**` permitAll inconditionnels | `SecurityConfig.java:147,61` | ⚠️ À vérifier | Mineur |
| 6.6 | Webhook : secret vide par défaut + comparaison `equals()` (non constant-time) | `PaymentController.java:71-73`, `.env.example:48` | ⚠️ À vérifier | Mineur |
| 6.7 | Pas de scan de dépendances (OWASP Dependency-Check / Snyk) ; Spring Boot 3.3.5 (pas le dernier patch) | `pom.xml:10`, `sonar-project.properties` | ⚠️ À vérifier | Mineur |

**Remédiations** : conditionner `frameOptions.disable()` et `/h2-console` au profil dev ; rendre `TRUSTPAYWAY_WEBHOOK_SECRET` obligatoire en prod + comparaison constant-time ; ajouter OWASP Dependency-Check au build ; monter la dernière version patch de Spring Boot.

---

## 8. Plan de remédiation priorisé

### 🔴 Critique (bloquant pour une attestation v4)
1. **Implémenter la MFA** pour les accès administratifs (Req. 8.4.2 / 8.5).

### 🟠 Majeur (à corriger avant mise en production étendue)
2. Forcer/valider `TRUSTPAYWAY_BASE_URL` en `https://` au démarrage (Req. 4).
3. Porter la longueur minimale de mot de passe à 12 et appliquer `mustChangePassword` côté serveur (Req. 8).
4. Désactiver le seed de l'agent de test en prod + imposer le changement de mot de passe des comptes seedés (Req. 8).
5. Persister le rate-limiter (Redis/DB) pour multi-réplicas et redémarrages (Req. 8).
6. Journaliser les accès en lecture aux données carte + auditer `PaymentController` (Req. 10).
7. Formaliser la rétention des journaux (≥ 1 an) + protéger leur intégrité (Req. 10).
8. **Exécuter `SecretsGuard` avant `DataSeeder`** (ou faire mettre à jour les credentials par le seeder) pour qu'un compte par défaut créé lors d'un premier démarrage échoué ne survive pas avec son mot de passe `promote` (Req. 8 — constat 8.9).

### 🟡 Mineur (durcissement / défense en profondeur)
9. Garde `@PrePersist` anti-PAN brut + colonne `varchar(19)` + correction doc (Req. 3).
10. Figer `min_version tls1.2` dans Caddy (Req. 4).
11. Conditionner `frameOptions.disable()`/`h2-console` au profil dev (Req. 6).
12. Webhook secret obligatoire + comparaison constant-time (Req. 6).
13. OWASP Dependency-Check + montée de version Spring Boot (Req. 6).
14. Alerte sur échec d'écriture d'audit ; rattacher `userId` aux échecs de login ; filtre par date sur l'API d'audit (Req. 10).

---

## 9. Points forts confirmés

- **PAN protégé en profondeur** : masqué dès le frontend, re-masqué au backend, re-masqué en sortie DTO — aucune trace de PAN complet en base, logs ou réseau.
- **Aucune donnée d'authentification sensible** (CVV/piste) dans tout le système (flux Mobile Money).
- **BCrypt**, scoping par principal JWT (`mine()`), **révocation immédiate** des comptes désactivés.
- **Verrouillage** 6 échecs / 30 min, session stateless, RBAC centralisé à moindre privilège.
- **`SecretsGuard`** bloque le démarrage en prod avec des secrets par défaut ; aucun secret committé.
- **Pas d'injection SQL**, gestion d'erreur sans fuite, uploads validés.
- **Journaux append-only** réservés en lecture aux administrateurs.

---

*Rapport généré le 17 juin 2026 à partir d'une revue du code source réel (branche `feat/catalogue-hierarchie-commissions`). À réévaluer après chaque modification touchant l'authentification, le traitement du PAN ou la passerelle de paiement.*
