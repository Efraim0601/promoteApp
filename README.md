# Portail Souscription — Carte Promote (Afriland First Bank)

Souscription en ligne de la **carte prépayée Promote** avec paiement Mobile Money
(MTN MoMo / Orange Money), parcours KYC, point d'impression et tableaux de bord — réimplémentation
réelle du prototype validé, en **Angular + Spring Boot**, conteneurisée pour un **VPS**, avec
**authentification & autorisation par rôles (RBAC)**.

## Architecture

```
promoteApp/
├── backend/          Spring Boot 3 (Java 17) — API REST, JPA/PostgreSQL, sécurité JWT
├── frontend/         Angular 21 (standalone) — web app responsive mobile-first, servie par nginx (proxy /api)
├── docker-compose.yml  postgres + minio + backend + frontend
└── .env.example
```

- **Frontend** (nginx) sert l'app et **proxifie `/api`** vers le backend.
- **Backend** expose l'API en interne sur `:8390`, persiste dans **PostgreSQL**.
- **MinIO** (stockage objet S3) conserve les **images selfie KYC** ; seule la référence est en base.
- **Auth** : JWT stateless. Rôles : `ADMIN`, `AGENT` (chargé de clientèle), `PRINT_AGENT`
  (point d'impression). Le **parcours client (QR)** est public (sans compte).

### Schéma de ports (anti-conflit, configurable via `.env`)

| Service | Port hôte | Visibilité |
|---------|-----------|------------|
| **Frontend (web)** | `${WEB_PORT:-8973}` | **seul port publié** — à mettre derrière un reverse-proxy TLS (80/443) |
| Backend API | *(non publié)* `:8390` | réseau Docker interne uniquement |
| PostgreSQL | *(non publié)* `:5432` | réseau Docker interne (admin via `docker compose exec db psql`) |
| MinIO S3 + console | *(non publié)* `:9000` / `:9001` | réseau Docker interne uniquement |

**Un seul port hôte est utilisé** (`WEB_PORT`, défaut 8973) — choisissez-en un libre, aucun besoin
d'arrêter vos autres applications. Les mappings DB / console MinIO sont commentés dans
`docker-compose.yml` (à dé-commenter ponctuellement pour de l'admin, en `127.0.0.1` uniquement).

## Rôles & parcours

| Rôle / acteur        | Accès |
|----------------------|-------|
| **ADMIN**            | KPIs globaux, ventes par chargé de clientèle, **configuration des montants**, toutes les souscriptions |
| **AGENT**            | Souscription assistée, ses ventes & KPIs, **attribution d'une vente QR** |
| **PRINT_AGENT**      | Récupération d'un dossier KYC par référence, impression/remise de la carte |
| **Client (QR)**      | Public : scanne → remplit le KYC → paie (MoMo/espèces) → reçoit une référence |

## Démarrage rapide (Docker — recommandé pour le VPS)

Prérequis : Docker + Docker Compose.

```bash
cp .env.example .env
# éditez .env : POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_SECRET (>= 32 octets : openssl rand -base64 48)

docker compose up -d --build
docker compose ps          # vérifier que 'db' et 'minio' sont healthy
```

Ouvrez **http://localhost:8973** (ou `http://IP_DU_VPS:8973`).

### Comptes créés au premier démarrage

Aucune donnée de souscription de démonstration n'est pré-chargée (le parcours client démarre vide).

- **Administrateur réel** — créé depuis `.env` : `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
  Définissez un **mot de passe fort** avant de déployer (jamais en clair dans le code).
- **Agent de test** (recette) — `awa.fall@afrilandfirstbank.com` / `promote` (tél. 699123456),
  créé seulement si `SEED_TEST_AGENT=true`. Mettez `SEED_TEST_AGENT=false` en production.

> Le **point d'impression** est accessible avec le compte admin et le compte agent
> (rôles ADMIN et AGENT autorisés).
>
> ⚠️ **Production** : renseignez `ADMIN_PASSWORD` et `JWT_SECRET` forts, et `SEED_TEST_AGENT=false`.
> Le seeder ne crée ces comptes que sur une **base vide** (idempotent) ; pour changer ensuite,
> gérez les comptes en base.

## Développement local (sans Docker)

**Backend** (profil `dev` = base H2 en mémoire + stockage images en mémoire, ni PostgreSQL ni MinIO requis) :
```bash
cd backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
# API sur http://localhost:8390 — ex: curl http://localhost:8390/api/config
```

**Frontend** :
```bash
cd frontend
npm ci
npx ng serve        # http://localhost:4200 (proxifiez /api vers :8080 ou lancez via Docker)
```

Pour le dev, soit lancer le frontend derrière nginx (Docker), soit ajouter un proxy Angular
(`proxy.conf.json` → `/api` vers `http://localhost:8080`).

## API (extrait)

| Méthode & route | Accès | Rôle |
|---|---|---|
| `POST /api/auth/login` | public | — |
| `GET /api/auth/me` | authentifié | tous |
| `GET /api/config` | public | — |
| `PUT /api/config` | protégé | ADMIN |
| `POST /api/subscriptions` | protégé | AGENT |
| `POST /api/subscriptions/self` | public | client QR |
| `POST /api/kyc/selfie` | public | upload selfie KYC → clé objet |
| `GET /api/subscriptions/{ref}/selfie` | protégé | PRINT_AGENT/ADMIN/AGENT (image) |
| `GET /api/subscriptions` | protégé | ADMIN |
| `GET /api/subscriptions/mine` | protégé | AGENT |
| `GET /api/subscriptions/{ref}` | protégé | PRINT_AGENT/ADMIN/AGENT |
| `PATCH /api/subscriptions/{ref}/pay` | public | simulation MoMo |
| `PATCH /api/subscriptions/{ref}/print` | protégé | PRINT_AGENT/ADMIN/AGENT |
| `POST /api/subscriptions/claim` | protégé | AGENT |
| `GET /api/agents/resolve?phone=` | public | résolution recommandeur |
| `GET /api/agents` | protégé | ADMIN |
| `GET /api/stats/admin` · `GET /api/stats/agent` | protégé | ADMIN · AGENT |

## Images KYC (selfies)

Le selfie est capturé via la **caméra du navigateur** (`getUserMedia`), envoyé au backend
(`POST /api/kyc/selfie`) qui le stocke dans **MinIO** (bucket `kyc-selfies`, créé automatiquement) ;
seule la **clé objet** est conservée en base sur la souscription. Le point d'impression récupère
l'image via `GET /api/subscriptions/{ref}/selfie` (image **streamée par le backend**, donc MinIO
reste privé). Stratégie d'abstraction `ImageStorage` → impl. `S3ImageStorage` (MinIO/AWS S3,
défaut) ou `InMemoryImageStorage` (dev/test) via `APP_STORAGE_PROVIDER`. Migration vers AWS S3 :
changez seulement `S3_ENDPOINT` / clés / région.

> ⚠️ La capture caméra exige un **contexte sécurisé** : HTTPS en production (ou `http://localhost`
> en local). Sans caméra / autorisation refusée, l'app bascule sur un placeholder pour ne pas bloquer
> le parcours. Console d'admin MinIO : `http://127.0.0.1:9011` (identifiants `MINIO_ROOT_USER/PASSWORD`).

## Paiement Mobile Money

Le paiement est **simulé** (push USSD reproduit comme dans le prototype : valider / refuser).
L'intégration d'un agrégateur réel (**MAVIANCE** ou **Trustpayway**) se branche en implémentant
`com.afriland.promote.payment.PaymentGateway` et en sélectionnant le provider via
`APP_PAYMENT_PROVIDER` — sans modifier le reste de l'application. Les clés API seront fournies
au moment de l'intégration.

## Déploiement sur VPS

1. Installez Docker + Compose sur le VPS, clonez le projet.
2. `cp .env.example .env` puis renseignez un `JWT_SECRET` fort et un mot de passe DB.
3. `docker compose up -d --build`.
4. **HTTPS (obligatoire pour la caméra `getUserMedia`)** — config **Caddy** fournie, sur un
   **port personnalisé** (défaut **8443**) pour ne pas entrer en conflit avec un serveur déjà
   présent sur 80/443. Pas de domaine ? Utilisez **sslip.io** avec votre IP. Dans `.env` :
   `DOMAIN=<ip>.sslip.io`, `CADDY_HTTPS_PORT=8443`, `WEB_PORT=127.0.0.1:8973`,
   `APP_CORS_ALLOWED_ORIGINS=https://<ip>.sslip.io:8443`. Puis :
   ```bash
   sudo ufw allow 8443/tcp
   ./deploy.sh --tls --fresh
   ```
   → servie en **https://<ip>.sslip.io:8443**. Caddy utilise son CA local (`tls internal`) →
   le navigateur affiche **un avertissement de certificat à accepter une fois** (HTTPS actif →
   caméra OK). Avec un vrai domaine + ports 80/443 libres, on peut repasser à Let's Encrypt.
5. Sauvegardes : sauvegardez les volumes `pgdata` (base) **et** `minio_data` (images KYC), p. ex.
   `docker run --rm -v <projet>_pgdata:/data -v "$PWD":/backup alpine tar czf /backup/pgdata.tgz /data`
   (idem pour `minio_data`), ou `pg_dump` pour la base.

Mises à jour : `git pull && docker compose up -d --build`.

## Tests

```bash
cd backend && mvn test     # tests JPA + logique d'attribution / résolution recommandeur
cd frontend && npx ng build  # vérifie la compilation de l'UI
```
