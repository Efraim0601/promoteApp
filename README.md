# Portail Souscription — Carte Promote (Afriland First Bank)

Souscription en ligne de la **carte prépayée Promote** avec paiement Mobile Money
(MTN MoMo / Orange Money), parcours KYC, point d'impression et tableaux de bord — réimplémentation
réelle du prototype validé, en **Angular + Spring Boot**, conteneurisée pour un **VPS**, avec
**authentification & autorisation par rôles (RBAC)**.

## Architecture

```
promoteApp/
├── backend/          Spring Boot 3 (Java 17) — API REST, JPA/PostgreSQL, sécurité JWT
├── frontend/         Angular 21 (standalone) — UI mobile, servie par nginx (proxy /api)
├── docker-compose.yml  postgres + backend + frontend
└── .env.example
```

- **Frontend** (nginx) sert l'app et **proxifie `/api`** vers le backend.
- **Backend** expose l'API sur `:8080`, persiste dans **PostgreSQL**.
- **Auth** : JWT stateless. Rôles : `ADMIN`, `AGENT` (chargé de clientèle), `PRINT_AGENT`
  (point d'impression). Le **parcours client (QR)** est public (sans compte).

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
# éditez .env : POSTGRES_PASSWORD, JWT_SECRET (>= 32 octets : openssl rand -base64 48)

docker compose up -d --build
docker compose ps          # vérifier que 'db' est healthy
```

Ouvrez **http://localhost** (ou `http://IP_DU_VPS`).

### Comptes de démonstration (mot de passe : `promote`)

| Email | Rôle |
|-------|------|
| `admin@afrilandfirstbank.com`        | Administrateur |
| `awa.fall@afrilandfirstbank.com`     | Chargé de clientèle (Agence Akwa) |
| `jean.eyenga@afrilandfirstbank.com`  | Chargé de clientèle (Agence Bonanjo) |
| `mariam.bello@afrilandfirstbank.com` | Chargé de clientèle (Yaoundé Centre) |
| `print@afrilandfirstbank.com`        | Point d'impression |

> ⚠️ **Production** : changez ces comptes/mots de passe et le `JWT_SECRET`. Le mot de passe `promote`
> et les comptes de démo ne sont là que pour la recette.

## Développement local (sans Docker)

**Backend** (profil `dev` = base H2 en mémoire, aucun PostgreSQL requis) :
```bash
cd backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
# API sur http://localhost:8080 — ex: curl http://localhost:8080/api/config
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
| `GET /api/subscriptions` | protégé | ADMIN |
| `GET /api/subscriptions/mine` | protégé | AGENT |
| `GET /api/subscriptions/{ref}` | protégé | PRINT_AGENT/ADMIN/AGENT |
| `PATCH /api/subscriptions/{ref}/pay` | public | simulation MoMo |
| `PATCH /api/subscriptions/{ref}/print` | protégé | PRINT_AGENT/ADMIN/AGENT |
| `POST /api/subscriptions/claim` | protégé | AGENT |
| `GET /api/agents/resolve?phone=` | public | résolution recommandeur |
| `GET /api/agents` | protégé | ADMIN |
| `GET /api/stats/admin` · `GET /api/stats/agent` | protégé | ADMIN · AGENT |

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
4. **TLS / nom de domaine** : placez un reverse-proxy (Caddy, Traefik ou nginx) devant le service
   `frontend` pour HTTPS (Let's Encrypt), et mettez `HTTP_PORT` sur un port interne (ex. 8088) puis
   exposez 80/443 via le proxy. Mettez à jour `APP_CORS_ALLOWED_ORIGINS` avec votre URL publique.
5. Sauvegardes : le volume `pgdata` contient la base — sauvegardez-le (`docker run --rm -v
   promoteapp_pgdata:/data ... ` ou `pg_dump`).

Mises à jour : `git pull && docker compose up -d --build`.

## Tests

```bash
cd backend && mvn test     # tests JPA + logique d'attribution / résolution recommandeur
cd frontend && npx ng build  # vérifie la compilation de l'UI
```
