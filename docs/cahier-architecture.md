# Cahier d'Architecture — Portail Afriland Carte Promote

| Champ | Valeur |
|---|---|
| Projet | Portail Carte Promote — Afriland First Bank |
| Version | 1.0 |
| Date | Juin 2026 |
| Statut | En production |

---

## Table des matières

1. [Présentation et contexte](#1-présentation-et-contexte)
2. [Objectifs et contraintes architecturales](#2-objectifs-et-contraintes-architecturales)
3. [Vue d'ensemble](#3-vue-densemble)
4. [Stack technique](#4-stack-technique)
5. [Architecture applicative](#5-architecture-applicative)
   - 5.1 [Frontend Angular](#51-frontend-angular)
   - 5.2 [Backend Spring Boot](#52-backend-spring-boot)
   - 5.3 [Persistance et stockage](#53-persistance-et-stockage)
6. [Modèle de données](#6-modèle-de-données)
7. [API REST](#7-api-rest)
8. [Architecture de sécurité](#8-architecture-de-sécurité)
9. [Architecture de paiement](#9-architecture-de-paiement)
10. [Gestion des documents KYC](#10-gestion-des-documents-kyc)
11. [Architecture de déploiement](#11-architecture-de-déploiement)
12. [Flux applicatifs principaux](#12-flux-applicatifs-principaux)
13. [Décisions architecturales](#13-décisions-architecturales)

---

## 1. Présentation et contexte

Le portail **Carte Promote** est l'application web de gestion du programme de carte prépayée Afriland First Bank. Il couvre l'intégralité du cycle de vie d'une carte, du premier contact client jusqu'à la remise physique de la carte imprimée :

- **Souscription** publique (QR code) ou assistée (agent commercial)
- **Paiement** via Mobile Money (Orange Money, MTN MoMo), espèces ou virement SARA
- **Vérification KYC** : capture et archivage des documents d'identité et du selfie client
- **Impression et remise** de la carte en point d'impression
- **Recharge** de la carte prépayée
- **Collecte de données** sur la vente de produits bancaires (collecte terrain)
- **Tableaux de bord** et statistiques multi-rôles (admin, agent, caissier, superviseur)

L'application remplace un processus en partie manuel et des outils tiers (KoboToolbox, fichiers Excel) par une plateforme unifiée, auditée et sécurisée.

---

## 2. Objectifs et contraintes architecturales

### Objectifs

| Objectif | Décision architecturale |
|---|---|
| Expérience mobile fluide (clients non bancarisés) | SPA Angular responsive, Progressive Web App |
| Conformité PCI DSS sur les données carte | Masquage PAN côté frontend et backend ; aucun chiffre central stocké |
| Traçabilité complète des actions | Audit log systématique (`ActionAudit`, `LoginAudit`) |
| Scalabilité du backend sur charge de paiement | Thread pool dédié `paymentExecutor` (256 threads max), backend stateless |
| Déploiement autonome sur serveur dédié | Stack entièrement Docker Compose, zéro dépendance cloud obligatoire |
| Tolérance aux coupures réseau opérateur | Réconciliation périodique et manuelle des paiements MoMo en attente |

### Contraintes

- Hébergement on-premise (serveur dédié Afriland), pas de cloud public imposé
- Réseau USSD Mobile Money via agrégateur tiers (TrustPayWay)
- Base de clients principalement sur mobile (Android, réseau 3G/4G)
- Documents KYC confidentiels, non exposés publiquement
- Multi-rôles : agents terrain, caissiers, points d'impression, administrateurs, superviseurs collecte

---

## 3. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Internet / LAN                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (443)
                    ┌──────────▼──────────┐
                    │   Caddy (TLS/HTTPS) │  ← Let's Encrypt automatique
                    └──────────┬──────────┘
                               │ HTTP
              ┌────────────────┴────────────────┐
              │                                 │
   ┌──────────▼──────────┐           ┌─────────▼──────────┐
   │  Frontend (Nginx)   │           │                    │
   │  Angular 21 SPA     │  /api/*   │  Backend           │
   │  Port 8973 (interne)│ ────────► │  Spring Boot 3.3   │
   └─────────────────────┘           │  Port 8390 (interne)│
                                     └──────────┬──────────┘
                                                │
                          ┌─────────────────────┼──────────────────┐
                          │                     │                  │
               ┌──────────▼──────┐   ┌──────────▼──────┐  ┌───────▼──────┐
               │  PostgreSQL 16  │   │  MinIO (S3)     │  │  TrustPayWay │
               │  pgdata volume  │   │  minio_data vol │  │  (externe)   │
               └─────────────────┘   └─────────────────┘  └──────────────┘
```

**Principes clés :**
- **API-first** : le frontend ne communique avec le backend que via l'API REST JSON
- **Stateless** : le backend ne conserve aucun état de session ; toute l'authentification est portée par le JWT dans chaque requête
- **Séparation des préoccupations** : paiement asynchrone découplé du cycle de vie HTTP via un event bus interne
- **Defense in depth** : validation côté client + côté serveur, masquage PAN aux deux niveaux, audit log de toutes les mutations

---

## 4. Stack technique

### Frontend

| Élément | Technologie | Version |
|---|---|---|
| Framework | Angular (Standalone Components) | 21.2.0 |
| Langage | TypeScript | 5.9.2 |
| Build | @angular/build | 21.2.6 |
| Reactivité | Signals Angular (`signal`, `computed`) | — |
| HTTP | RxJS HttpClient | 7.8.0 |
| Téléphonie | libphonenumber-js | 1.13.6 |
| QR Code | qrcode | 1.5.4 |
| Cartographie | Leaflet | 1.9.4 |
| Export Excel | XLSX (SheetJS) | 0.18.5 |
| Tests | Vitest + jsdom | 4.1.8 |
| Serveur web | Nginx (conteneur) | alpine |

### Backend

| Élément | Technologie | Version |
|---|---|---|
| Framework | Spring Boot | 3.3.5 |
| Langage | Java | 17 (LTS) |
| ORM | Spring Data JPA / Hibernate | — |
| Sécurité | Spring Security 6 + JWT (JJWT) | 0.12.6 |
| Base de données | PostgreSQL (prod) / H2 (dev) | 16 |
| Stockage objets | AWS SDK S3-compatible (MinIO) | 2.28.16 |
| OCR reçus SARA | Tesseract / Tess4J | 5.11.0 |
| Extraction PDF | Apache PDFBox | 2.0.31 |
| Messagerie | Spring Mail (SMTP Office 365) | — |
| Code coverage | JaCoCo / SonarQube | 0.8.12 |
| Boilerplate | Lombok | — |

### Infrastructure

| Service | Image Docker | Rôle |
|---|---|---|
| Reverse proxy TLS | Caddy 2-alpine | Terminaison HTTPS, Let's Encrypt |
| Frontend | Nginx alpine | Servir la SPA Angular, proxy `/api` |
| Backend | eclipse-temurin:17-jre | API REST Spring Boot |
| Base de données | postgres:16-alpine | Persistance relationnelle |
| Stockage objet | minio/minio:latest | Documents KYC (S3-compatible) |

---

## 5. Architecture applicative

### 5.1 Frontend Angular

```
frontend/src/app/
├── pages/          ← Composants de page (un par écran)
├── core/           ← Services globaux injectables
├── shared/         ← Composants réutilisables
└── app.config.ts   ← Configuration Angular (routes, providers)
```

#### Pages

| Composant | Accès | Rôle |
|---|---|---|
| `subscribe.ts` | Public | Assistant multi-étapes de souscription (5 étapes) |
| `recharge.ts` | Public | Formulaire de recharge carte |
| `qr.ts` | Public | Page d'atterrissage QR code |
| `services.ts` | Public | Hub de services (souscription, recharge) |
| `login.ts` | Public | Authentification staff (email+mdp ou téléphone+PIN) |
| `change-password.ts` | Auth | Changement de mot de passe (obligatoire au 1er login) |
| `admin.ts` | ADMIN | Tableau de bord global, gestion utilisateurs/config, liste complète |
| `admin-map.ts` | ADMIN | Carte de géolocalisation des agents connectés |
| `agent-home.ts` | AGENT | Dashboard agent (ventes propres, QR réclamés) |
| `print-point.ts` | PRINT_AGENT | Recherche, revue KYC, impression, photo validation |
| `cashier.ts` | CASHIER | Validation espèces, fulfillment recharges |
| `collecte.ts` | COLLECTEUR | Saisie ventes de produits bancaires |
| `collecte-stats.ts` | SUPERVISEUR | Statistiques collecte terrain |

#### Services core

| Service | Rôle |
|---|---|
| `api.ts` | Client HTTP centralisé, intercepteurs |
| `auth.ts` | Gestion token JWT, profil utilisateur, navigation post-login |
| `config-store.ts` | Cache de `CardConfig` (montants, frais) |
| `geo.ts` | Géolocalisation GPS navigateur |
| `i18n.ts` | Internationalisation (français par défaut) |
| `guards.ts` | Guards de routes (auth, rôle) |
| `token-interceptor.ts` | Injection automatique du JWT dans chaque requête |

#### Masquage PAN (conformité PCI)

Le PAN (numéro de carte 16 chiffres) n'est **jamais saisi en entier** dans les formulaires. L'interface propose deux champs séparés :

```
[ 5078 ]  **** ****  [ 5678 ]
```

Les 8 chiffres centraux ne transitent jamais dans le navigateur. Le payload envoyé au backend est directement `"5078 **** **** 5678"`. Le backend stocke uniquement cette forme masquée.

---

### 5.2 Backend Spring Boot

```
backend/src/main/java/com/afriland/promote/
├── config/         ← SecurityConfig, AsyncConfig
├── model/          ← Entités JPA (@Entity)
├── repo/           ← Repositories Spring Data
├── service/        ← Logique métier
├── web/            ← Controllers REST
│   └── dto/        ← DTOs (records Java)
├── payment/        ← Abstraction passerelle de paiement
├── security/       ← JWT, filtres, politique mots de passe
├── storage/        ← Abstraction stockage objets
├── receipt/        ← Extraction OCR des reçus SARA
├── email/          ← Service mail SMTP
├── bootstrap/      ← Données initiales (seeder)
└── util/           ← Utilitaires (PanUtils, …)
```

#### Packages principaux

**`service/`** — Logique métier

| Service | Responsabilité principale |
|---|---|
| `SubscriptionService` | Création, recherche, paiement, impression, réclamation de référent |
| `RechargeService` | Création, paiement, fulfillment, validation |
| `CollecteService` | Saisie terrain, statistiques collecte |
| `StatsService` | Agrégation KPI (admin, agent, caissier, point d'impression) |
| `PaymentReconciliationService` | Réconciliation manuelle avec l'agrégateur |
| `PaymentReconciliationJob` | Réconciliation périodique planifiée |
| `ActionAuditService` | Log systématique de toutes les mutations |
| `LoginAuditService` | Log des tentatives d'authentification |
| `NotificationService` | Notifications in-app |
| `EmailService` | SMTP (réinitialisation mot de passe) |

**`payment/`** — Passerelle de paiement

```
PaymentGateway (interface)
  ├── SimulatedPaymentGateway   ← DEV/TEST (bouton manuel)
  └── TrustPayWayGateway        ← PROD (Orange Money / MTN MoMo)

PaymentDispatcher               ← Listener async (@TransactionalEventListener)
PaymentConfig                   ← Sélection de l'implémentation active
MomoDebitGuard                  ← Protection anti-double débit
```

**`storage/`** — Stockage objet

```
ImageStorage (interface)
  ├── S3ImageStorage       ← PROD (MinIO/AWS S3)
  └── InMemoryImageStorage ← DEV (HashMap)
```

**`receipt/`** — Extraction reçus SARA

```
SaraReceiptExtractor  ← PDF/image → texte (PDFBox + Tesseract OCR)
SaraReceiptParser     ← Texte → SaraReceipt (regex)
SaraReceipt           ← record(reference, payerPhone, amount, status, date)
```

---

### 5.3 Persistance et stockage

#### PostgreSQL

- **Usage** : données relationnelles (souscriptions, recharges, utilisateurs, audits)
- **Volume Docker** : `pgdata` (persistant entre redémarrages)
- **Pool de connexions** : HikariCP (géré par Spring Boot)
- **Migrations** : Hibernate `ddl-auto=update` (évolution du schéma par Hibernate)
- **Backup** : à planifier via `pg_dump` hors Docker

#### MinIO (S3-compatible)

- **Usage** : documents KYC (selfie, CNI recto/verso, reçus SARA)
- **Bucket** : `kyc-selfies` (créé automatiquement au démarrage si absent)
- **Accès** : uniquement via le backend (jamais exposé publiquement)
- **Clé de stockage** : `{prefix}/{année}/{mois}/{jour}/{uuid}` (organisation temporelle)
- **Volume Docker** : `minio_data` (persistant)
- **Interface admin** : port 9001 (interne uniquement, non exposé par défaut)

---

## 6. Modèle de données

### Entités principales

#### `Subscription` (table `subscription`)

| Champ | Type | Description |
|---|---|---|
| `ref` | PK (String) | Référence unique (ex. `PRM-1009`) |
| `prenom`, `nom`, `fullName` | String | Identité client |
| `sexe`, `docType`, `cni`, `cniNorm` | String | Pièce d'identité (cniNorm indexé) |
| `niu`, `cniExp` | String | NIU et date expiration CNI |
| `phone`, `email` | String | Contacts |
| `quartier`, `region`, `ville` | String | Adresse |
| `latitude`, `longitude`, `geoAccuracy` | Double | Géolocalisation au moment de la saisie |
| `pay` | String | Moyen de paiement (`om` / `mtn` / `cash` / `sara`) |
| `payPhone` | String | Numéro Mobile Money |
| `delivery` | String | Mode de remise (`promote` / `agence` / `home`) |
| `cardType` | String | Type de carte (`prepaid` / `bancaire`) |
| `pickupAgencyId`, `pickupAgencyName` | String | Agence de retrait (si `delivery=agence`) |
| `amount`, `transport` | int | Montant souscription et frais de livraison |
| `channel` | String | Canal (`agent` / `self`) |
| `agentId` | String | ID de l'agent (si canal agent) |
| `referrerName`, `referrerPhone`, `referrerPhone9` | String | Référent commercial (referrerPhone9 indexé) |
| `payStatus` | Enum | `pending` / `paid` / `cash` / `sara_pending` / `failed` |
| `gatewayRef`, `paymentTxId` | String | Références agrégateur |
| `paidAt`, `failedAt` | Instant | Horodatages paiement |
| `paymentMessage` | String | Message d'erreur passerelle |
| `printed` | boolean | Carte remise physiquement |
| `cardNumber`, `pan` | String | N° carte physique et PAN (masqués : `XXXX **** **** XXXX`) |
| `printedById`, `printedAt` | String / Instant | Traçabilité impression |
| `selfieVerified` | boolean | Selfie validé par le point d'impression |
| `selfieKey`, `cniRectoKey`, `cniVersoKey`, `saraReceiptKey` | String | Clés MinIO des documents |
| `saraRef`, `saraPayerPhone`, `saraAmount` | String / int | Données reçu SARA |
| `cashCollectedBy`, `cashCollectedById`, `cashCollectedAt`, `cashPaymentReference` | divers | Traçabilité encaissement espèces |
| `createdAt` | Instant | Date de création |

#### `Recharge` (table `recharge`)

| Champ | Type | Description |
|---|---|---|
| `ref` | PK | `RC000123` |
| `prenom`, `nom`, `fullName`, `phone` | String | Identité détenteur |
| `pan` | String | PAN masqué (`XXXX **** **** XXXX`) |
| `amount` | int | Montant de recharge en XAF |
| `pay`, `payPhone`, `payStatus` | String / Enum | Paiement (identique à Subscription) |
| `saraReceiptKey`, `saraRef`, `saraPayerPhone`, `saraAmount` | divers | Reçu SARA |
| `fulfilled`, `fulfilledBy`, `fulfilledById`, `fulfilledAt` | divers | Crédit effectif de la carte |
| `latitude`, `longitude`, `geoAccuracy` | Double | Géolocalisation |
| `createdAt` | Instant | Date de création |

#### `AppUser` (table `app_user`)

| Champ | Type | Description |
|---|---|---|
| `id` | String (UUID) | Identifiant unique |
| `email`, `name`, `phone` | String | Identité staff |
| `passwordHash` | String | Bcrypt |
| `loginPin` | String | PIN 4 chiffres (connexion mobile) |
| `role` | Enum `Role` | Rôle principal |
| `roles` | String (CSV) | Multi-rôles (héritage) |
| `agency` | String | Agence d'appartenance |
| `enabled` | boolean | Compte actif |
| `lastLat`, `lastLng`, `lastAccuracy`, `lastLocatedAt` | divers | Dernière position connue |

#### `Collecte` (table `collecte`)

Enregistrement d'une vente de produit bancaire terrain.

| Champ | Type | Description |
|---|---|---|
| `ref` | PK | `COL-000123` |
| `product` | String | `compte_ouvert` / `carte_bancaire` / `sara_money` / `e_first` |
| `clientNom`, `clientPhone` | String | Client contacté |
| `accountNumber` | String | N° compte (si `compte_ouvert`) |
| `cardNumber` | String | N° carte masqué (si `carte_bancaire`) |
| `cardType` | String | Type de carte |
| `collectedById`, `collectedByName` | String | Collecteur terrain |

#### Autres entités

| Entité | Rôle |
|---|---|
| `CardConfig` | Singleton (id=1) : tarifs, bornes de recharge, frais |
| `Agency` | Liste des agences Afriland (nom, ville, actif) |
| `AppProfile` | Groupe de permissions nommé (RBAC fin) |
| `ActionAudit` | Log immuable de toutes les mutations métier |
| `LoginAudit` | Log des tentatives de connexion (succès et échecs) |
| `AppNotification` | Notifications in-app inter-utilisateurs |

### Énumérations

```java
enum PayStatus { pending, paid, cash, sara_pending, failed }

enum Role { ADMIN, AGENT, PRINT_AGENT, CASHIER, COLLECTEUR, SUPERVISEUR }

enum Permission {
  SOUSCRIPTIONS_READ, SOUSCRIPTIONS_WRITE, SOUSCRIPTIONS_VALIDATE,
  SOUSCRIPTIONS_PRINT, SOUSCRIPTIONS_EXPORT,
  RECHARGES_READ, RECHARGES_VALIDATE, RECHARGES_EXPORT,
  COLLECTES_READ, COLLECTES_WRITE, COLLECTES_EXPORT,
  UTILISATEURS_READ, UTILISATEURS_WRITE,
  CONFIG_READ, CONFIG_WRITE
}
```

---

## 7. API REST

Base URL : `/api`

### Authentification (`/api/auth`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/login` | Public | Connexion email + mot de passe |
| POST | `/login-phone` | Public | Connexion téléphone + PIN |
| GET | `/me` | Auth | Profil de l'utilisateur connecté |
| POST | `/location` | Auth | Mise à jour de la position GPS |
| POST | `/forgot-password` | Public | Réinitialisation de mot de passe par email |
| POST | `/change-password` | Auth | Changement de mot de passe |

### Souscriptions (`/api/subscriptions`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/self` | Public | Autosouscription (QR code) |
| POST | `/` | AGENT, CASHIER | Souscription assistée par agent |
| GET | `/` | ADMIN | Liste complète (filtrée + paginée) |
| GET | `/mine` | AGENT | Ventes propres de l'agent |
| GET | `/search` | Auth | Recherche full-text (ref, nom, téléphone, CNI, PAN) |
| GET | `/{ref}` | Auth | Détail d'une souscription |
| GET | `/{ref}/image/{kind}` | Auth | Document KYC (selfie, cni-recto, cni-verso, sara-receipt) |
| GET | `/{ref}/status` | Public | Statut de paiement (polling client) |
| PATCH | `/{ref}/pay` | Public | Simuler un paiement (mode démo) |
| PATCH | `/{ref}/print` | PRINT_AGENT | Marquer imprimé + saisir n° carte |
| PATCH | `/{ref}/photo` | PRINT_AGENT | Remplacer une photo KYC |
| PATCH | `/{ref}/sara-validate` | AGENT, CASHIER | Valider/rejeter un reçu SARA |
| PATCH | `/{ref}/cash-validate` | CASHIER | Valider/rejeter un paiement espèces |
| PATCH | `/{ref}/niu` | AGENT, ADMIN | Mettre à jour le NIU |
| GET | `/claim` | AGENT | Récupérer une souscription par QR |

### Recharges (`/api/recharges`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/` | Public | Créer une recharge |
| GET | `/` | CASHIER, ADMIN | Liste des recharges |
| GET | `/search` | CASHIER, ADMIN | Recherche |
| GET | `/pending-fulfillment` | CASHIER, ADMIN | Recharges payées non créditées |
| GET | `/{ref}` | CASHIER, ADMIN | Détail |
| GET | `/{ref}/status` | Public | Polling statut |
| PATCH | `/{ref}/sara-validate` | CASHIER, ADMIN | Valider reçu SARA |
| PATCH | `/{ref}/cash-validate` | CASHIER, ADMIN | Valider espèces |
| PATCH | `/{ref}/fulfill` | CASHIER, ADMIN | Confirmer le crédit effectif de la carte |

### Autres endpoints

| Groupe | Routes | Accès |
|---|---|---|
| KYC (`/api/kyc`) | `POST /image`, `POST /receipt` | Public |
| Paiement (`/api/payment`) | `GET /provider`, `POST /webhook/trustpayway`, `POST /reconcile` | Public / ADMIN |
| Configuration (`/api/config`) | `GET /`, `PUT /` | Public / ADMIN |
| Utilisateurs (`/api/users`) | CRUD complet + import + reset credentials | ADMIN, SUPERVISEUR |
| Collectes (`/api/collectes`) | CRUD + stats | COLLECTEUR, ADMIN, SUPERVISEUR |
| Agences (`/api/agencies`) | `GET /`, `POST /import` | Public / ADMIN |
| Agents (`/api/agents`) | `GET /`, `GET /resolve` | ADMIN / Public |
| Statistiques (`/api/stats`) | `/admin`, `/agent`, `/print`, `/cashier`, `/payments`, `/agencies` | Auth (rôle) |
| Audit (`/api/audit`) | Lecture logs | ADMIN |
| Profils (`/api/profiles`) | CRUD | ADMIN |
| Notifications (`/api/notifications`) | CRUD | Auth |
| Carte (`/api/map`) | Positions staff | ADMIN |

### Format des réponses

- Toutes les réponses sont en **JSON**
- Les erreurs fonctionnelles retournent `4xx` avec un message en texte (`response_status_exception`)
- Les dates sont en **ISO 8601 UTC** (Instant Java → String JSON)
- Les montants sont en **centimes XAF entiers** (int Java)

---

## 8. Architecture de sécurité

### Authentification

**JWT (JSON Web Token) stateless :**

```
Client → POST /api/auth/login (email + password)
Backend ← { token: "eyJ..." }  (JWT signé HMAC-SHA256, secret ≥ 32 octets)

Requêtes suivantes :
Client → Authorization: Bearer eyJ...
Backend → JwtAuthFilter → extrait claims → Spring SecurityContext
```

- Durée de vie du token : configurable (défaut 24h)
- Secret JWT : variable d'environnement `JWT_SECRET` (obligatoire en production)
- Aucune session serveur (`SessionCreationPolicy.STATELESS`)

**Connexion PIN mobile :**
- `POST /api/auth/login-phone` → téléphone + PIN 4 chiffres
- Utile pour les agents terrain sur mobile

### Contrôle d'accès (RBAC)

```
Rôle          Périmètre principal
─────────────────────────────────────────────────────
ADMIN         Tout lire, tout configurer, tous les tableaux de bord
AGENT         Souscriptions propres, réclamation QR, stats personnelles
PRINT_AGENT   Consulter le dossier KYC, imprimer, valider photo
CASHIER       Valider paiements espèces, fulfillment recharges
COLLECTEUR    Saisie et consultation de ses propres collectes
SUPERVISEUR   Statistiques collecte (lecture seule, pas d'écriture)
```

Un utilisateur peut cumuler plusieurs rôles (champ `roles` CSV). La méthode `effectiveRoles()` fait l'union du champ `role` principal et de la liste `roles`.

### Conformité PCI DSS — PAN

| Couche | Mesure |
|---|---|
| Frontend | Saisie en deux champs séparés (4 premiers + 4 derniers) ; les 8 chiffres centraux ne sont jamais capturés |
| Transit HTTP | Payload envoyé directement au format masqué `XXXX **** **** XXXX` |
| Backend | `PanUtils.isMasked()` + `PanUtils.mask()` garantissent le stockage masqué |
| Base de données | Seul le format masqué `XXXX **** **** XXXX` est stocké |
| Affichage | `formatPan()` (frontend) retourne le PAN masqué tel quel |

### Audit

Toute mutation métier est enregistrée dans `action_audit` :
- Acteur (id, nom, rôles au moment de l'action)
- Action (create, update, validate, print, …)
- Entité et référence (`subscription/PRM-1009`)
- Adresse IP
- Horodatage UTC

Les tentatives de connexion (succès et échecs) sont enregistrées dans `login_audit`.

### CORS et CSRF

- **CORS** : origines autorisées configurées via `APP_CORS_ALLOWED_ORIGINS` (défaut : `http://localhost:4200`)
- **CSRF** : désactivé (architecture stateless JWT, pas de cookie de session)

---

## 9. Architecture de paiement

### Interface `PaymentGateway`

```java
interface PaymentGateway {
    String provider();
    PaymentResult requestPayment(Payable order, String operator);
    Optional<PayStatus> queryStatus(Payable order);
}
```

Les entités `Subscription` et `Recharge` implémentent toutes deux l'interface `Payable`, ce qui permet à la même infrastructure de traiter les deux types de flux.

### Implémentations

#### Mode simulé (`SimulatedPaymentGateway`)

Actif quand `APP_PAYMENT_PROVIDER=simulated`. Utilisé en développement et démonstration :
1. Génère une référence factice (`SIM-{uuid}`)
2. L'agent (ou le client) déclenche manuellement le résultat via `PATCH /{ref}/pay`
3. Pas de réseau opérateur impliqué

#### Mode production (`TrustPayWayGateway`)

Actif quand `APP_PAYMENT_PROVIDER=trustpayway` :

```
1. Authentification
   Backend → POST {base_url}/api/login (SECRET_KEY) → access_token (mis en cache)

2. Déclenchement du paiement
   Backend → POST {base_url}/api/{om|mtn}/process-payment
   ← { txId, orderId, accepted: true/false }
   → Client reçoit une invite USSD sur son téléphone

3a. Confirmation via webhook (chemin nominal)
   TrustPayWay → POST /api/payment/webhook/trustpayway { orderId, status, … }
   Backend → met à jour pay_status → paid ou failed

3b. Polling de statut (fallback)
   Backend (réconciliation) → GET {base_url}/api/{method}/get-status/{txId}
   ← { status }
```

**Protection anti-double débit (`MomoDebitGuard`) :**
- Fenêtre de garde configurable (défaut 5 minutes)
- Si une souscription/recharge identique (même téléphone, même montant, même opérateur) est dans la fenêtre, la seconde tentative réutilise la première au lieu de débiter à nouveau

### Flux asynchrone

```
HTTP Request (POST /api/subscriptions)
  │
  ├── SubscriptionService.create()      ← transaction DB (commit)
  │     └── applicationEventPublisher.publishEvent(PaymentInitiationEvent)
  │
  └── Réponse HTTP 200 (subscription créée)

  [après commit DB]
  │
  PaymentDispatcher.onPaymentInitiation()   ← @TransactionalEventListener(AFTER_COMMIT)
    └── s'exécute sur paymentExecutor (thread pool 256 max)
          └── gateway.requestPayment(order)
                └── met à jour gatewayRef, paymentTxId, gatewayPushAccepted en DB
```

L'événement n'est publié **qu'après commit** : garantit que la souscription est lisible par le dispatcher, même si le thread HTTP s'est terminé.

### Réconciliation

| Type | Déclenchement | Comportement |
|---|---|---|
| **Automatique** | Planifié (`PAYMENT_RECONCILE=true`, défaut 300s) | Parcourt les `pending` < 1h, pull statut, expire après 15 min |
| **Manuel** | `POST /api/payment/reconcile?hours=N` (ADMIN) | Fenêtre configurable jusqu'à 168h |

Les deux modes sont mutuellement exclusifs via un mutex pour éviter les conflits.

---

## 10. Gestion des documents KYC

### Upload (côté client)

```
Navigateur → capture photo (getUserMedia / input file)
           → compression JPEG côté client
           → POST /api/kyc/image (multipart, max 6 Mo)
Backend    → ImageStorage.store() → clé MinIO
           ← { key: "selfie/2026/06/16/{uuid}" }
```

La clé est stockée dans le champ correspondant de la `Subscription` (`selfieKey`, `cniRectoKey`, `cniVersoKey`).

### Consultation (côté staff)

```
Frontend → GET /api/subscriptions/{ref}/image/selfie
Backend  → ImageStorage.load(selfieKey) → contenu binaire
         ← Content-Type: image/jpeg + bytes
```

**MinIO n'est jamais accessible directement depuis le navigateur.** Toutes les images transitent par le backend, qui applique le contrôle d'accès.

### Extraction de reçu SARA

```
Client → POST /api/kyc/receipt (image JPEG / PDF)
Backend ↓
  SaraReceiptExtractor :
    PDF avec texte  → PDFBox text extraction
    PDF sans texte  → Rendu image → Tesseract OCR
    Image JPEG/PNG  → Tesseract OCR directement
  ↓
  SaraReceiptParser : regex → SaraReceipt(ref, phone, amount, status, date)
  ↓
  ← { key, reference, payerPhone, amount }
```

Les champs extraits sont pré-remplis dans le formulaire pour validation par l'agent avant soumission.

---

## 11. Architecture de déploiement

### Docker Compose

Le déploiement repose sur Docker Compose avec superposition d'overlays selon l'environnement.

```
docker-compose.yml          ← Définition de base (tous les services)
docker-compose.le.yml       ← Overlay Let's Encrypt (Caddy + ports 80/443)
docker-compose.tls.yml      ← Overlay TLS interne (test sans domaine public)
```

**Commande de déploiement production :**
```bash
./deploy.sh --le   # git pull → docker compose build → docker compose up -d
```

### Réseau interne

```
promote (bridge)
  ├── db:5432              (PostgreSQL, non publié)
  ├── minio:9000           (S3 API, non publiée)
  ├── minio:9001           (Console MinIO, non publiée)
  ├── backend:8390         (API REST, non publiée)
  └── frontend:80          (Nginx, non publiée hors overlay)
```

Caddy (overlay LE) publie les ports 80/443 et reverse-proxie vers `frontend:80`.

### Nginx (frontend)

```nginx
location /api/ {
    proxy_pass http://backend:8390/api/;
}
location / {
    try_files $uri $uri/ /index.html;  # SPA fallback
}
```

### Scalabilité du backend

Le backend est **stateless** (JWT) et peut être scalé horizontalement. Si plusieurs réplicas sont actifs, la réconciliation automatique (`PAYMENT_RECONCILE`) doit être activée sur **un seul** réplica (via variable d'environnement) pour éviter les conflits.

### Variables d'environnement clés

| Variable | Valeur type | Impact |
|---|---|---|
| `JWT_SECRET` | Chaîne ≥ 32 car. | Sécurité tokens (obligatoire) |
| `POSTGRES_*` | user/pass/db | Connexion BDD |
| `MINIO_ROOT_USER/PASSWORD` | Identifiants | Accès stockage objet |
| `APP_PAYMENT_PROVIDER` | `simulated` / `trustpayway` | Bascule DEV/PROD |
| `APP_PAYMENT_ASYNC` | `true` / `false` | Paiement asynchrone |
| `PAYMENT_RECONCILE` | `true` / `false` | Réconciliation planifiée |
| `TRUSTPAYWAY_SECRET_KEY` | Clé agrégateur | Connexion MoMo |
| `APP_CORS_ALLOWED_ORIGINS` | URL frontend | CORS |
| `ADMIN_EMAIL/PASSWORD` | Identifiants | Compte admin initial |

---

## 12. Flux applicatifs principaux

### A. Souscription publique (QR Code)

```
Client (mobile)
  1. Scanne QR → atterrit sur /qr → redirigé vers /subscribe
  2. Étape 1 – Identité : prenom, nom, CNI, téléphone, …
  3. Étape 2 – Documents : capture CNI recto/verso → upload → clés reçues
  4. Étape 3 – Selfie : capture selfie → upload → clé reçue
  5. Étape 4 – Paiement : choix méthode, livraison, type de carte
  6. Étape 5 – Récap → POST /api/subscriptions/self
  7. Polling GET /api/subscriptions/{ref}/status → attente confirmation USSD
  8. Confirmation → affichage référence + reçu
```

### B. Souscription assistée (Agent)

Identique au flux public, mais via `POST /api/subscriptions` (auth AGENT). L'agentId est automatiquement rattaché. Le référent commercial éventuel est déduit du numéro de téléphone.

### C. Recharge de carte

```
1. Client arrive sur /recharge
2. Saisit : nom, PAN (4+4 chiffres), montant, méthode de paiement
3. POST /api/recharges
4. Polling statut → confirmation USSD
5. Caissier (cashier.ts) : valide le crédit effectif → PATCH /{ref}/fulfill
```

### D. Point d'impression

```
Print Agent (print-point.ts)
  1. Recherche souscription (ref, nom, téléphone)
  2. Récupère dossier KYC (selfie, CNI) → vérification visuelle
  3. Imprime la carte physiquement
  4. Saisit le numéro de carte (4 premiers + 4 derniers)
  5. PATCH /api/subscriptions/{ref}/print → marked printed
  6. Remet la carte au client
```

### E. Validation paiement espèces / SARA

```
Client → choisit "espèces" ou "SARA" lors de la souscription/recharge
Caissier (cashier.ts) :
  - Espèces : PATCH /{ref}/cash-validate { outcome: "validate", ref }
  - SARA : PATCH /{ref}/sara-validate { outcome: "validate", … }
Résultat → pay_status = paid
```

### F. Réconciliation de paiement

```
Automatique (toutes les 5 min si PAYMENT_RECONCILE=true) :
  → Parcourt pending < 1h
  → Pull statut TrustPayWay pour chaque order
  → Applique paid / failed

Manuel (admin) :
  → POST /api/payment/reconcile?hours=1
  → Retourne { scanned, updated, unchanged }
```

---

## 13. Décisions architecturales

### D1 — SPA Angular au lieu de rendu serveur

**Contexte :** Application de backoffice + formulaire public.  
**Décision :** Angular 21 SPA compilée statiquement, servie par Nginx.  
**Raison :** Expérience fluide sans rechargement de page, facilité de développement offline, déploiement simple (fichiers statiques).  
**Compromis :** SEO non critique (application de backoffice et formulaire interne).

### D2 — API stateless JWT

**Contexte :** Backend multi-rôles, scalabilité souhaitée.  
**Décision :** JWT HMAC-SHA256 signé côté serveur, pas de session HTTP.  
**Raison :** Scaling horizontal sans partage d'état de session, simplicité d'infrastructure.  
**Compromis :** Révocation de token non immédiate (durée de vie fixe).

### D3 — Paiement asynchrone via événement transactionnel

**Contexte :** Push USSD peut être lent (opérateur) ou échouer.  
**Décision :** `@TransactionalEventListener(AFTER_COMMIT)` + thread pool dédié.  
**Raison :** Découplage entre création de la commande (HTTP rapide) et appel réseau opérateur (lent). La commande est persistée avant l'appel gateway.  
**Compromis :** Le client reçoit `pending` immédiatement ; la confirmation vient par polling ou webhook.

### D4 — MinIO comme stockage objet on-premise

**Contexte :** Documents KYC confidentiels, hébergement on-premise exigé.  
**Décision :** MinIO (S3-compatible) dans le réseau Docker interne.  
**Raison :** API S3 standard (migration cloud possible sans changement de code), zéro exposition publique, conforme aux exigences de localisation des données.  
**Compromis :** Nécessite un backup MinIO en plus de PostgreSQL.

### D5 — Masquage PAN à la saisie (non stockage des 8 chiffres centraux)

**Contexte :** Exigences PCI DSS sur les données de carte.  
**Décision :** Deux champs de saisie séparés (4+4) ; les 8 chiffres centraux ne transitent jamais.  
**Raison :** Conformité PCI DSS niveau 3 — minimisation des données sensibles traitées.  
**Compromis :** La recherche par PAN complet n'est plus possible (acceptable : la recherche par les 4 premiers ou 4 derniers suffit).

### D6 — Réconciliation multi-niveaux (webhook + polling planifié + manuel)

**Contexte :** Le réseau opérateur peut rater un webhook, ou le serveur peut être indisponible au moment de la confirmation.  
**Décision :** 3 niveaux : webhook temps réel, sweeper planifié toutes les 5 min, réconciliation manuelle admin.  
**Raison :** Tolérance aux pannes réseau et opérateur sans perte de paiement.  
**Compromis :** Complexité accrue du service de réconciliation.

### D7 — Audit log systématique

**Contexte :** Traçabilité réglementaire et contrôle interne.  
**Décision :** `ActionAuditService` appelé dans chaque mutation de service, `LoginAuditService` sur chaque tentative d'authentification.  
**Raison :** Conformité réglementaire, détection d'abus, investigations post-incident.  
**Compromis :** Volume de données d'audit à prévoir dans la capacité PostgreSQL.

---

*Document généré le 16 juin 2026 — version 1.0*
