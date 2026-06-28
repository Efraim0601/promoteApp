# Prompt — Reconstruire l'intégralité du front-end à partir du backend seul

> À copier-coller comme brief pour un agent/ingénieur. Hypothèse de départ : **il n'existe aucun front-end**. Les deux seules sources de vérité sont (1) le **backend Spring Boot** (`backend/`, package `com.afriland.promote`) et (2) le **fichier de design de référence `Afriland Portal (2).html`** (prototype React/GSAP fourni à la racine du dépôt).

---

## 1. Rôle et objectif

Tu es un·e ingénieur·e front-end senior (Angular). Ta mission : **construire de zéro le front-end web complet** d'une plateforme bancaire de vente, en t'appuyant **uniquement** sur :

1. **L'API du backend Spring Boot** = la source de vérité fonctionnelle et contractuelle (le shéma de la base de donnée peut être modifiée le cas échéant selon le workflow à implémenter). Tu dois lire les contrôleurs (`com.afriland.promote.web.*Controller`) et les DTO (`com.afriland.promote.web.dto.Dtos`) pour connaître les routes, les payloads et les statuts. 
2. **`Afriland Portal (2).html`** = la source de vérité **visuelle et UX** (parcours, écrans, charte, animations, textes FR/EN). C'est un bundle React/GSAP : décode-le (manifeste `__bundler/manifest` en gzip+base64, document dans `__bundler/template`) pour en extraire les écrans, la palette, les timelines GSAP et le dictionnaire i18n.

Le front doit consommer le backend tel quel et **reproduire fidèlement le rendu et les effets de dynamisme** du fichier HTML. (utiliser Angular pour le frontend

---

## 2. Vision produit (le « pourquoi »)

Une **plateforme de vente de n'importe quel produit bancaire** (cartes, comptes, services), animée par un **réseau commercial organisé en équipes** :

- **Catalogue** de produits configurables (cartes Visa/Mastercard/prépayée, comptes courant/épargne/e-First, services type SARA Money, Pass Premium…), avec **promotions** (prix fixe ou %).
- **Réseau commercial hiérarchique** : `ADMIN → MANAGER → SUPERVISEUR → CHEF_EQUIPE → COMMERCIAUX`, plus les rôles opérationnels `CAISSIER`, `POINT D'IMPRESSION`, `commercial`.
- **Commissions automatiques** : règles par produit ou groupe, par rôle ou utilisateur, en montant fixe ou pourcentage ; un journal de commissions généré à chaque vente réglée.
- **Statistiques cloisonnées par périmètre hiérarchique** (chacun voit son sous-arbre) + **messagerie/notifications d'équipe**.
- **Le flow « carte » existant doit être préservé intégralement** (souscription → paiement → activation → impression), car c'est le cœur historique. Les autres produits réutilisent les mêmes briques (vente, attribution commerciale, commission) sans KYC/impression quand ce n'est pas pertinent.

---

## 3. Pile technique et conventions (obligatoires)

- **Angular standalone** (dernière version stable), composants **standalone** (pas de NgModule), **signals** pour l'état, `inject()` pour la DI, control-flow `@if/@for/@switch`.
- **Un service API central** (`core/api.ts`) typé, basé sur `HttpClient`, base `/api`, avec **proxy** dev (`proxy.conf.json` → `http://localhost:8390`).
- **Auth** : `core/auth.ts` — stocke le JWT, l'envoie en `Authorization: Bearer`, **dérive rôles ET permissions du JWT décodé** (jamais d'un objet user périmé), intercepteur 401 → redirection login, garde de session + garde de rôle sur les routes.
- **Theming par variables CSS** (`:root` + classes de thème). Pas de framework UI lourd (ni Material ni Bootstrap).
- **Animations GSAP** via une **directive réutilisable `[reveal]`** (voir §6) — pas de logique d'animation dupliquée dans chaque composant.
- **i18n FR/EN** : reprendre le dictionnaire complet du fichier HTML (clés `login_*`, `funnel_*`, `dash_*`, `mgr_*`, `adm_*`, `cash_*`, `print_*`, `sup_*`, `col_*`…). FR par défaut, bascule FR/EN.
- **Mobile-first** puis layout web pleine largeur (sidebar pour les consoles). **Accessibilité** : respecter `prefers-reduced-motion`.
- **Aucun secret en dur** ; les clés agrégateur/SMTP restent côté backend.

---

## 4. Authentification, rôles et autorisations
-prévoir une interface de configuration lié à l'Active directory.
- **JWT** via `POST /api/auth/login` (email+mot de passe) et `POST /api/auth/login-phone` (téléphone+PIN, pour collecteurs). `GET /api/auth/me` recharge le profil.
- **8 rôles** (`Role`) et leur **page d'atterrissage** :

| Rôle | Atterrissage | Vocation |
|---|---|---|
| `ADMIN` | `/admin` | Direction : vue globale, config, utilisateurs, audit |
| `MANAGER` | `/manager` | Catalogue, promotions, commissions, hiérarchie, stats globales |
| `SUPERVISEUR` | `/supervision` | Stats de son sous-arbre, supervision quotidienne |
| `CHEF_EQUIPE` | `/team-stats` | Stats de son équipe, roster, messagerie |
| `AGENT` (commercial) | `/agent` | Souscriptions assistées, ses ventes, claim QR |
| `CASHIER` | `/cashier` | Encaissement espèces, validation ATM, recharges, retraits agence |
| `PRINT_AGENT` | `/print` | Vérif KYC, activation + impression carte |
| `COLLECTEUR` | `/collecte` | Saisie de ventes de produits bancaires (collectes) |

- **Modèle de permissions fines** (profils = groupes de permissions, `GET /api/profiles`) : `SOUSCRIPTIONS_*`, `RECHARGES_*`, `COLLECTES_*`, `UTILISATEURS_*`, `CONFIG_*`, `PRODUITS_*`, `PROMOTIONS_*`, `COMMISSIONS_*`, `STATS_READ`, `MESSAGES_*`. Le front masque/dévoile les actions selon les permissions du JWT (ADMIN bypass).
- Parcours **public anonyme** (sans login) : choix d'un service, souscription self-service, recharge, entrée par QR.

---

## 5. Le flow « carte » à préserver (cœur métier)

Modèle `Subscription` (réf. `PRM-xxxx`), statut global dérivé : `pending → paid → remis`, plus `cash`, `sara_pending`, `failed`. **Recharge** (réf. `RCxxxxxxxx`) : `pending → paid → to_fulfill → fulfilled`.

1. **Souscription (funnel multi-étapes)** — `POST /api/subscriptions` (assistée, canal `agent`) ou `POST /api/subscriptions/self` (public). Étapes du template : **Produit → Identité → Documents (CNI recto/verso) → Selfie → Paiement → Récapitulatif**.
   - KYC : capture photo CNI + selfie → upload `POST /api/kyc/image` (renvoie une clé objet) ; OCR CNI optionnel `POST /api/kyc/cni-ocr` (avertissement non bloquant).
2. **Paiement** — selon `pay` :
   - **MoMo** (`om`/`mtn`) : `create` renvoie `pending`, l'agrégateur pousse un USSD ; le front **poll** `GET /api/subscriptions/{ref}/status` (et le webhook réconcilie côté back). En dev, `GET /api/payment/provider` = `simulated` → endpoint de simulation `PATCH /api/subscriptions/{ref}/pay` (`outcome=validate|fail`).
   - **Espèces** (`cash`) : payable en caisse → `PATCH /api/subscriptions/{ref}/cash-validate` (caissier).
   - **SARA** (`sara`) : upload reçu `POST /api/kyc/receipt` (extraction réf/émetteur/montant) → validation `PATCH /api/subscriptions/{ref}/sara-validate` (agent/point de vente).
3. **Écrans de fin** (fidèles au template) : **succès** (check élastique + **confettis** + référence + **QR** à présenter au point d'impression + reçu téléchargeable) ; **échec** (icône en **shake** + motif « Solde insuffisant »… + réessayer).
4. **Activation + impression** — Point d'impression : retrouve le dossier par réf/recherche (`GET /api/subscriptions/search`), vérifie le KYC (selfie + CNI via `GET /api/subscriptions/{ref}/image/{kind}`), saisit le **numéro de carte physique + PAN** puis `PATCH /api/subscriptions/{ref}/print` → statut `printed`.
5. **Recharge** — `POST /api/recharges` (PAN + montant + moyen), même logique de paiement ; puis le **caissier crédite** réellement la carte et valide `PATCH /api/recharges/{ref}/fulfill` (avec preuve), passant `to_fulfill → fulfilled`.

> Pour les **autres produits bancaires** (comptes, services), réutiliser la brique « vente » via les **collectes** (`/api/collectes`) ou la souscription générique, **sans** KYC/impression, mais **avec** attribution commerciale et génération de commission.

---

## 6. Système de design et dynamisme (extraits de `Afriland Portal (2).html`)

**Charte** (thème par défaut) :
- Police **Plus Jakarta Sans** (400–800).
- Rouge **`#C8102E`** (primaire), navy **`#1B1B2F`** (texte), fond **`#F7F8FA`**, muted **`#6B7280`**.
- Sémantiques : succès `#059669`, alerte `#D97706`, info `#2563EB`, danger `#DC2626`. Opérateurs : Orange Money `#FF7900`, MTN `#FFCB05`.
- Rayons (12/18px), ombres douces, badges de statut colorés.

**Dynamisme (GSAP)** — créer une directive `[reveal]` rejouant les timelines d'entrée du template via `data-reveal="<preset>"` :
- `logo` : chute élastique `elastic.out(1,0.5)` (y:-60, scale .2 → 1).
- `card`/`kpi` : montée rebond `back.out(1.4)` en **cascade** (`stagger`).
- `input` : glissé depuis la gauche (x:-40 → 0, stagger).
- `button` : pop `back.out(1.7)`.
- `check` : check de succès élastique + **confettis** (points colorés projetés depuis le centre).
- `fail` : icône d'échec en rotation puis **shake** (yoyo).
- Keyframes CSS complémentaires : `slideUp`, `fadeIn`, `breathe`, `spinRing`, `drawCheck`, `shakeX`, `countPulse`, `gradientShift`. Respecter `prefers-reduced-motion` (rendu visible sans mouvement) et dégrader proprement si GSAP absent.

**Carte des écrans / parcours** (états du template) : `login`, `home`/`services`, `funnel` (6 étapes), `payment` (attente USSD : ring + ripple), `success`, `failure`, puis dashboards : `dashboard` (commercial), `team`, `collection`, `cashier`, `print`, `supervision`, `manager` (catalogue/commissions/hiérarchie/stats), `admin` (overview + entonnoir MoMo, users, transactions, agences, permissions, audit), `recon` (réconciliation), `paylogs`, plus `recharge`/`rech_payment`/`rech_success`. Reprendre **le dictionnaire i18n FR/EN** intégral du fichier.

---

## 7. Inventaire de l'API à câbler (source : contrôleurs backend)

> Tu DOIS vérifier signatures et payloads exacts dans le code. Récapitulatif des routes existantes :

- **Auth** `/api/auth` : `POST /login`, `POST /login-phone`, `GET /me`, `POST /location`, `POST /forgot-password`, `POST /change-password`.
- **Souscriptions** `/api/subscriptions` : `POST /` (assistée), `POST /self` (public), `GET /`, `GET /mine`, `GET /search`, `GET /{ref}`, `GET /{ref}/image/{kind}`, `PATCH /{ref}/pay`, `GET /{ref}/status`, `PATCH /{ref}/print`, `PATCH /{ref}/photo`, `PATCH /{ref}/sara-validate`, `PATCH /{ref}/cash-validate`, `POST /claim`, `PATCH /{ref}/niu`.
- **Recharges** `/api/recharges` : `POST /`, `GET /`, `GET /pending-fulfillment`, `GET /search`, `GET /for-card`, `GET /{ref}`, `GET /{ref}/image/{kind}`, `PATCH /{ref}/pay`, `GET /{ref}/status`, `PATCH /{ref}/sara-validate`, `PATCH /{ref}/cash-validate`, `PATCH /{ref}/fulfill`.
- **Collectes** `/api/collectes` : `POST /`, `GET /`, `GET /mine`, `GET /stats`, `PUT /{ref}`, `DELETE /{ref}`.
- **Produits** `/api/products` : `GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/promotions`, `PUT /promotions/{promoId}`, `DELETE /promotions/{promoId}`.
- **Commissions** `/api/commissions` : `GET /rules`, `POST /rules`, `PUT /rules/{id}`, `DELETE /rules/{id}`, `GET /entries`, `GET /mine`.
- **Config** `/api/config` : `GET /`, `PUT /` (montants carte).
- **Utilisateurs** `/api/users` : `GET /`, `POST /` (création + invitation), `PUT /{id}`, `PATCH /{id}/enabled`, `PUT /{id}/roles`, `POST /{id}/recreate`, `POST /{id}/reset-credentials`, `POST /import`.
- **Profils/permissions** `/api/profiles` : `GET /`, `POST /`, `PUT /{id}`, `DELETE /{id}`, `PUT /users/{userId}`.
- **Agences** `/api/agencies` : `GET /`, `POST /import`. **Agents** `/api/agents` : `GET /`, `GET /resolve`.
- **Stats** `/api/stats` : `GET /hierarchy`, `/admin`, `/agent`, `/print`, `/print/cards`, `/cashier`, `/print/supervision`, `/cashier/supervision`, `/payments`, `/agencies`.
- **Équipe** `/api/team` : `GET /` (roster), `POST /message`. **Notifications** `/api/notifications` : `GET /mine`, `GET /unread-count`, `PATCH /{id}/read`, `POST /read-all`, `POST /`.
- **KYC** `/api/kyc` : `POST /image`, `POST /receipt`, `POST /cni-ocr`. **Carte/map** `/api/map/points`.
- **Paiement** `/api/payment` : `GET /provider`, `POST /reconcile`, `GET /reconcile/stream` (SSE), `POST /webhook/trustpayway`. **Vérif** `/api/verify/{orderId}`.
- **Audit** `/api/audit` : `GET /logins`, `GET /actions`.

---

## 8. Portée écran par écran (à livrer en totalité)

1. **Public** : page d'accueil (choisir souscrire / recharger), funnel de souscription (6 étapes + capture KYC + selfie), paiement (USSD/espèces/SARA), succès/échec, recharge, entrée QR + claim.
2. **Commercial (AGENT)** : tableau de bord (KPI : payées/en attente/échouées, montant collecté, commissions), nouvelle souscription assistée, mes ventes (filtrables, export), claim QR.
3. **Chef d'équipe / Superviseur** : stats de l'équipe/sous-arbre, roster, supervision quotidienne (impression + encaissement), messagerie.
4. **Manager** : catalogue (CRUD produits + composants tarifaires), promotions (CRUD), règles de commission + journal, hiérarchie (création utilisateurs, rattachement, **drag&drop**), stats globales.
5. **Admin** : overview (KPI globaux + **entonnoir Mobile Money** + tendance 14 j + par réseau/agent), utilisateurs (CRUD, import, activer/désactiver, rôles, profils), transactions (table détaillée paginée + photo client), agences (CRUD/import), permissions (matrice modules×actions), audit (connexions + actions, config d'audit), réconciliation agrégateur (SSE), logs de paiements.
6. **Caisse** : files espèces / ATM / recharges / retraits agence, validation/rejet, créditation des recharges (preuve).
7. **Point d'impression** : file KYC, vérification (selfie + CNI), saisie n° carte + PAN, impression, validation SARA.
8. **Collecteur** : nouvelle collecte (produit + client), mes collectes, export.
9. **Transverse** : login (+ mot de passe oublié, changement forcé), changement de mot de passe, notifications (cloche + composer), géolocalisation au login (`POST /api/auth/location`), bascule FR/EN, thème.

---

## 9. Exigences non fonctionnelles

- **Performance** : polling visibilité-aware (pause hors onglet), pas de sur-appel ; tables paginées ; lazy-loading des images via `/{ref}/image/{kind}`.
- **Robustesse** : gestion centralisée des erreurs HTTP, états de chargement (skeletons), reprise des paiements `pending`.
- **Sécurité** : JWT, pas de PII en clair dans les logs, masquage PAN, garde de rôle côté route + masquage UI par permission.
- **Statuts cohérents** : badges `pending`/`paid`/`cash`/`sara_pending`/`failed`/`printed` (cartes) et `to_fulfill`/`fulfilled` (recharges), couleurs sémantiques du template.

---

## 10. Livrables et critères d'acceptation

- Projet Angular standalone qui **build sans erreur** et **sert** en dev avec proxy vers le backend (`:8390`).
- **Chaque rôle** des §4/§8 a son parcours fonctionnel **contre le backend en marche**, vérifié de bout en bout (login → écran → appel API réel).
- **Le flow carte complet** fonctionne : souscription → paiement (simulé en dev) → succès (QR + confettis) → recherche au point d'impression → activation/impression → statut `printed`. Idem recharge → fulfill.
- **Rendu et animations fidèles** au fichier HTML (charte, Plus Jakarta Sans, timelines GSAP, i18n FR/EN).
- **Aucune modification du backend** ; aucun secret commité.

---

## 11. Démarche conseillée

1. Décoder `Afriland Portal (2).html` → extraire écrans, i18n, palette, timelines.
2. Cartographier l'API : lire `web/*Controller.java` + `web/dto/Dtos.java` (payloads/statuts exacts).
3. Poser la **fondation** : design system (variables CSS + Plus Jakarta Sans), `core/api.ts`, `core/auth.ts`, garde/intercepteur, directive `[reveal]` (GSAP), i18n.
4. Implémenter d'abord le **parcours public + flow carte** (le plus visible et le cœur métier), avec paiement simulé.
5. Puis les **dashboards par rôle** (du plus simple : commercial → caisse/impression → manager/admin).
6. Vérifier chaque écran contre le backend dev (comptes de test fournis par le seed démo), itérer sur la fidélité visuelle.
7. assurez vous que toutes les fonctionnalité donnent bien
