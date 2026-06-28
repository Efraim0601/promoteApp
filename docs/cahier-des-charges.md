# Cahier des Charges — Portail Afriland Carte Promote

| Champ | Valeur |
|---|---|
| Projet | Portail Carte Promote — Afriland First Bank |
| Version | 1.0 |
| Date | Juin 2026 |
| Statut | En production (socle) + évolutions catalogue/commissions/hiérarchie en cours d'intégration |
| Maître d'ouvrage | Direction Digital — Afriland First Bank |
| Maître d'œuvre | Équipe Développement Promote |
| Documents liés | [Spécifications fonctionnelles](cahier-specifications.md) · [Architecture](cahier-architecture.md) · [Cas d'utilisation](use-cases.md) · [Schéma de données](db-schema.md) |

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Objectifs et enjeux](#2-objectifs-et-enjeux)
3. [Périmètre du projet](#3-périmètre-du-projet)
4. [Acteurs, rôles et hiérarchie](#4-acteurs-rôles-et-hiérarchie)
5. [Besoins fonctionnels](#5-besoins-fonctionnels)
6. [Habilitations et matrice des permissions](#6-habilitations-et-matrice-des-permissions)
7. [Architecture et besoins techniques](#7-architecture-et-besoins-techniques)
8. [Exigences non fonctionnelles](#8-exigences-non-fonctionnelles)
9. [Règles de gestion](#9-règles-de-gestion)
10. [Contraintes, limites et risques](#10-contraintes-limites-et-risques)
11. [Livrables et environnements](#11-livrables-et-environnements)
12. [Glossaire](#12-glossaire)

---

## 1. Présentation générale

### 1.1 Objet du document

Le présent cahier des charges définit le besoin, le périmètre, les contraintes et les exigences du **portail Carte Promote**, application web de gestion du programme de carte prépayée d'Afriland First Bank. Il sert de référentiel contractuel commun à la maîtrise d'ouvrage, à l'équipe de développement, à la recette et à l'exploitation.

Il complète les [spécifications fonctionnelles détaillées](cahier-specifications.md) (exigences `SF-*`) en couvrant le périmètre élargi : objectifs métier, organisation commerciale (hiérarchie, commissions), contraintes techniques, livrables et risques.

### 1.2 Contexte métier

Afriland First Bank commercialise la **Carte Promote**, carte prépayée destinée principalement à une clientèle non bancarisée, distribuée par un réseau d'agents commerciaux et de points d'impression. Avant le portail, le processus reposait sur des outils disparates (KoboToolbox, fichiers Excel, échanges papier), sans traçabilité ni pilotage temps réel.

Le portail unifie et numérise l'intégralité du cycle de vie commercial :

| Étape | Avant | Après |
|---|---|---|
| Souscription | Papier / KoboToolbox | Parcours web multi-étapes (QR ou agent) |
| Vérification KYC | Scan email / papier | Capture photo intégrée, stockage sécurisé |
| Paiement | Espèces guichet / virement manuel | Mobile Money (Orange, MTN), espèces validées, virement SARA |
| Impression | Non traçable | Point d'impression avec validation KYC |
| Recharge | Guichet physique | Demande en ligne + crédit numérique |
| Produits bancaires | Tableurs | Collecte terrain structurée |
| Pilotage commercial | Excel | Tableaux de bord temps réel, commissions automatiques |

### 1.3 Parties prenantes

| Partie prenante | Rôle dans le projet |
|---|---|
| Direction Digital Afriland | Commanditaire, validation, recette |
| Équipe IT Afriland | Exploitation de l'infrastructure on-premise |
| Managers / superviseurs / chefs d'équipe | Pilotage du réseau commercial |
| Agents commerciaux | Utilisateurs terrain principaux |
| Points d'impression | Remise physique des cartes |
| Caissiers | Validation des paiements alternatifs |
| Collecteurs terrain | Saisie des ventes de produits bancaires |
| Clients finaux | Souscripteurs / détenteurs de la carte |

---

## 2. Objectifs et enjeux

### 2.1 Objectifs métier

- **O1 — Numériser** de bout en bout la souscription et la recharge de la Carte Promote.
- **O2 — Fiabiliser les encaissements** via Mobile Money, espèces et virement SARA, avec réconciliation automatique.
- **O3 — Sécuriser les données sensibles** (KYC, PAN, secrets) conformément aux exigences PCI/RGPD.
- **O4 — Piloter le réseau commercial** en temps réel : ventes, encaissements, classement, géolocalisation.
- **O5 — Structurer la rémunération** des commerciaux par un moteur de commissions paramétrable et auditable.
- **O6 — Industrialiser le catalogue** produits et tarifs comme source unique de vérité configurable sans redéploiement.

### 2.2 Indicateurs de succès

| Indicateur | Cible |
|---|---|
| Taux de souscriptions traitées 100 % numériquement | ≥ 95 % |
| Taux de paiements MoMo réconciliés automatiquement | ≥ 98 % |
| Délai moyen souscription → carte imprimée | Réduit vs processus papier |
| Incidents de double débit MoMo | 0 (anti-doublon + `gatewayRef` unique) |
| Disponibilité du portail | ≥ 99 % |

---

## 3. Périmètre du projet

### 3.1 Dans le périmètre

| Module | Description |
|---|---|
| **Souscription** | Parcours complet (public/QR ou assisté agent), KYC, géolocalisation |
| **Recharge** | Demande + paiement + crédit effectif par le caissier |
| **KYC & documents** | Capture, upload, OCR du reçu SARA, consultation sécurisée |
| **Paiement** | Mobile Money (Orange/MTN via TrustPayWay), espèces, virement SARA, réconciliation |
| **Point d'impression** | Vérification KYC, impression, remise carte |
| **Caisse** | Validation espèces / SARA, fulfillment des recharges |
| **Collecte terrain** | Saisie des ventes de produits bancaires |
| **Catalogue produits** | Produits, composants tarifaires et promotions configurables |
| **Commissions** | Règles paramétrables + génération automatique des commissions par vente |
| **Hiérarchie commerciale** | Organigramme (manager → superviseur → chef d'équipe → agents), stats scopées |
| **Messagerie d'équipe** | Diffusion de messages bornée au sous-arbre de l'émetteur |
| **Administration** | Utilisateurs, profils de permissions, configuration, agences |
| **Statistiques** | Tableaux de bord par rôle, KPI, géolocalisation |
| **Audit** | Journal des actions et des connexions |
| **Notifications** | Alertes in-app entre utilisateurs |

### 3.2 Hors périmètre

- Système Core Banking (aucun accès direct ; interface humaine via agents).
- Gestion du stock de cartes physiques vierges.
- Comptabilité et facturation bancaire.
- Application mobile native iOS / Android (le portail est une SPA responsive).
- CRM / service client.
- Versement effectif des commissions en paie (le portail calcule et trace, ne paie pas).

---

## 4. Acteurs, rôles et hiérarchie

### 4.1 Acteur externe

| Acteur | Description | Accès |
|---|---|---|
| **Client / Prospect** | Personne physique souscrivant ou rechargeant | URL publique, QR code (anonyme) |

### 4.2 Acteurs internes (rôles RBAC)

| Rôle technique | Désignation métier | Périmètre principal |
|---|---|---|
| `ADMIN` | Direction Promote | Accès total : configuration, utilisateurs, stats globales, audit |
| `MANAGER` | Manager commercial | Catalogue, promotions, commissions, création d'utilisateurs, vue commerciale globale |
| `AGENT` | Chargé de clientèle | Souscriptions assistées, ses ventes, réclamation QR |
| `PRINT_AGENT` | Agent point d'impression | Consultation KYC, impression, remise carte |
| `CASHIER` | Caissier | Validation espèces / SARA, fulfillment recharges |
| `COLLECTEUR` | Collecteur terrain | Saisie et consultation de ses propres collectes |
| `SUPERVISEUR` | Superviseur | Statistiques des chefs d'équipe de son sous-arbre (lecture) |
| `CHEF_EQUIPE` | Chef d'équipe | Statistiques de sa seule équipe, roster, messagerie |

### 4.3 Hiérarchie commerciale

- Chaque compte porte un lien `parentUserId` désignant son responsable hiérarchique, formant un **organigramme arborescent** (admin/manager au sommet, `parentUserId` nul).
- La construction de l'arbre est **protégée contre les cycles** (`HierarchyService`).
- Les statistiques et la messagerie sont **scopées au sous-arbre** de l'utilisateur, contrôle appliqué côté serveur :
  - `ADMIN` / `MANAGER` : vue globale.
  - `SUPERVISEUR` : sous-arbre (ses chefs d'équipe et leurs agents).
  - `CHEF_EQUIPE` : sa seule équipe.

### 4.4 Cumul de rôles

Un utilisateur peut cumuler plusieurs rôles (ex. agent + caissier). Ses permissions effectives sont l'**union** des permissions de tous ses rôles et de son profil éventuel.

---

## 5. Besoins fonctionnels

> Les exigences détaillées des modules historiques (Souscription, Recharge, KYC, Paiement, Impression, Caisse, Collecte, Administration, Statistiques, Sécurité) sont spécifiées dans le [cahier des spécifications fonctionnelles](cahier-specifications.md) sous la forme `SF-*`. La présente section les résume et **détaille les modules d'évolution** (catalogue, promotions, commissions, hiérarchie, messagerie).

### 5.1 Modules socle (résumé)

| Module | Besoin clé |
|---|---|
| Souscription | Formulaire 5 étapes (identité, documents, selfie, paiement, récapitulatif) ; canal public/QR et assisté agent ; référence `PRM-XXXX` ; anti-doublon CNI ; géolocalisation. |
| Recharge | Demande publique ; PAN 4+4 ; bornes min/max ; référence `RC-XXXXXX` ; crédit effectif par le caissier. |
| KYC | Upload JPEG/PNG/PDF ≤ 6 Mo ; OCR du reçu SARA ; stockage MinIO, accès backend authentifié uniquement. |
| Paiement | Orange Money, MTN, espèces, SARA ; anti-double débit (fenêtre 5 min) ; `gatewayRef` unique ; statut public ; réconciliation auto + manuelle. |
| Point d'impression | Liste payées non imprimées ; consultation KYC ; validation selfie ; saisie PAN remis ; traçabilité immuable. |
| Caisse | Validation/rejet espèces et SARA ; fulfillment des recharges ; horodatage et référence reçu. |
| Collecte | Saisie des produits bancaires terrain ; le collecteur ne voit que ses collectes. |
| Administration | Gestion utilisateurs, profils de permissions, configuration tarifaire, agences, imports en masse, exports Excel, audit. |
| Statistiques | Tableaux de bord par rôle, KPI, géolocalisation des agents. |
| Sécurité | Email+mot de passe ou téléphone+PIN ; changement à la 1re connexion ; RBAC frontend+backend ; masquage PAN ; HTTPS. |

### 5.2 Module Catalogue produits *(évolution)*

Le catalogue est la **source unique de vérité** des produits et tarifs, remplaçant les valeurs auparavant codées en dur.

- **CDC-CAT-01** — Un `MANAGER` (ou `ADMIN`) gère le catalogue depuis un écran dédié (`/api/products`).
- **CDC-CAT-02** — Un **produit** (`Product`) porte : code métier unique, libellé, description, groupe (`groupCode`), nature (`kind` = `CARD` ou `BANK`), prix de référence (`basePrice`, XAF), indicateurs `builtin` et `active`.
  - `CARD` : la carte prépayée/bancaire, dont le tarif est décomposé en **composants** (`ProductComponent` : `fees`, `transport`, `rechargeInitiale`, `passPremium`, et variantes bancaires).
  - `BANK` : les produits bancaires saisis en collecte (`compte_ouvert`, `carte_bancaire`, `sara_money`, `e_first`), avec un prix de base servant d'assiette de commission.
- **CDC-CAT-03** — Les produits **`builtin`** (la carte + les 4 produits bancaires initiaux) ne peuvent pas être supprimés, seulement édités ; ils sont **seedés idempotemment** depuis la configuration existante.
- **CDC-CAT-04** — Le produit `CARD` est **répercuté vers `CardConfig`** afin que le moteur de souscription historique reste inchangé : modifier le catalogue suffit à mettre à jour les tarifs appliqués aux nouveaux dossiers.

### 5.3 Module Promotions *(évolution)*

- **CDC-PRO-01** — Une **promotion** (`Promotion`) s'applique à un produit, sous forme de **prix promo fixe** (`PRICE`) ou de **remise en pourcentage** (`PERCENT`, 0–100).
- **CDC-PRO-02** — Une promotion peut être bornée par une **fenêtre de dates** optionnelle (début / fin) ; absence de borne = toujours active.
- **CDC-PRO-03** — Le **prix effectif** d'un produit est le prix promo lorsqu'une promotion est active le jour courant, sinon le `basePrice`. Le résultat est toujours **borné à ≥ 0**.
- **CDC-PRO-04** — La gestion des promotions se fait via `POST/PUT/DELETE /api/products/{id}/promotions`.

### 5.4 Module Commissions *(évolution)*

- **CDC-COM-01** — Une **règle de commission** (`CommissionRule`) définit la rémunération d'un bénéficiaire sur une vente :
  - **Portée** : par produit (`PRODUCT`) ou par groupe de produits (`GROUP`).
  - **Cible** : un rôle/profil (`ROLE`) ou un utilisateur précis (`USER`, surcharge individuelle).
  - **Taux** : montant fixe (`FIXED`, XAF) ou pourcentage (`PERCENT`, 0–100) de l'assiette.
  - **Fenêtre de dates** optionnelle.
- **CDC-COM-02** — **Ordre de résolution** quand plusieurs règles s'appliquent : surcharge `USER` > `ROLE` ; portée `PRODUCT` > `GROUP` ; à égalité, la règle active la plus récente l'emporte.
- **CDC-COM-03** — Une **commission** (`CommissionEntry`) est **générée automatiquement** lorsqu'une souscription passe à l'état payé (`SubscriptionService`) ou qu'une collecte est enregistrée (`CollecteService`).
- **CDC-COM-04** — La génération est **idempotente** : la contrainte d'unicité `(saleType, saleRef, beneficiaryId)` garantit qu'un rejeu de webhook ou une réconciliation ne crédite jamais deux fois.
- **CDC-COM-05** — Une commission porte : type de vente (`SUBSCRIPTION`/`COLLECTE`), référence de vente, code produit, bénéficiaire, assiette, montant, règle appliquée et **statut** (`PENDING` → `VALIDATED` → `PAID`).
- **CDC-COM-06** — Endpoints : `/api/commissions/rules` (CRUD règles), `/api/commissions/entries` (consultation), `/api/commissions/mine` (les commissions du bénéficiaire connecté).

### 5.5 Module Statistiques hiérarchiques *(évolution)*

- **CDC-STA-01** — `GET /api/stats/hierarchy` fournit des statistiques **scopées** selon le rôle et la position dans l'arbre (`HierarchyStatsService`) : global pour admin/manager, sous-arbre pour superviseur/chef d'équipe.
- **CDC-STA-02** — Le périmètre est **imposé côté serveur** : un utilisateur ne peut pas accéder aux chiffres d'une branche dont il n'est pas responsable.

### 5.6 Module Messagerie d'équipe *(évolution)*

- **CDC-MSG-01** — `GET /api/team` retourne le **roster** (membres du sous-arbre de l'appelant).
- **CDC-MSG-02** — `POST /api/team/message` diffuse un message aux destinataires, **bornés au sous-arbre** de l'émetteur, en réutilisant le service de notifications in-app.

---

## 6. Habilitations et matrice des permissions

Les permissions sont **fines** (`Permission`) et regroupées en **profils** réutilisables (`AppProfile`). Les permissions effectives d'un utilisateur sont l'union de celles de ses rôles et de son profil.

| Domaine | Permissions |
|---|---|
| Souscriptions | `SOUSCRIPTIONS_READ`, `_WRITE`, `_VALIDATE`, `_PRINT`, `_EXPORT` |
| Recharges | `RECHARGES_READ`, `_VALIDATE`, `_EXPORT` |
| Collectes | `COLLECTES_READ`, `_WRITE`, `_EXPORT` |
| Utilisateurs | `UTILISATEURS_READ`, `_WRITE` |
| Configuration | `CONFIG_READ`, `_WRITE` |
| Produits | `PRODUITS_READ`, `_WRITE` |
| Promotions | `PROMOTIONS_READ`, `_WRITE` |
| Commissions | `COMMISSIONS_READ`, `_WRITE`, `_EXPORT` |
| Statistiques | `STATS_READ` |
| Messagerie | `MESSAGES_READ`, `_WRITE` |

Le contrôle d'accès est appliqué **aux deux niveaux** : guards de routes Angular côté frontend et Spring Security côté backend.

---

## 7. Architecture et besoins techniques

### 7.1 Pile technologique

| Couche | Technologie |
|---|---|
| Frontend | Angular (SPA responsive), guards de routes par rôle |
| Backend | Spring Boot (Java), API REST, stateless (JWT) |
| Authentification | JWT signé HMAC-SHA256 (secret ≥ 32 octets en variable d'environnement) |
| Base de données | PostgreSQL (schéma géré par Hibernate `ddl-auto=update`) |
| Stockage objets | MinIO (compatible S3), réseau interne |
| Reverse proxy / TLS | Caddy (certificat Let's Encrypt automatique) |
| Paiement MoMo | Agrégateur TrustPayWay (USSD Orange Money / MTN) |
| Conteneurisation | Docker Compose (overlay `le.yml` en production) |
| OCR | Extraction des reçus SARA (référence, payeur, montant, statut, date) |

### 7.2 Contraintes techniques

- **Hébergement on-premise** sur serveur dédié Afriland (pas de cloud public imposé).
- Paiement Mobile Money via **TrustPayWay uniquement**.
- **Aucun accès direct** à la base Core Banking.
- Évolution du schéma par Hibernate (`ddl-auto=update`), **non destructive** ; pas de migration formalisée (Flyway/Liquibase).
  - Contrainte connue : la colonne `Promotion.value` est nommée `promo_value` (`VALUE` étant réservé sous certains SGBD/H2).
- Déploiement : `./deploy.sh --le`, toujours avec l'overlay `le.yml`, **jamais** `down -v` (préservation des données).

### 7.3 Sécurité (durcissement)

- **Anti-force-brute** sur les endpoints de connexion (`LoginRateLimiter`) : verrouillage temporaire après seuil d'échecs (réponse HTTP 429), déblocage automatique.
- **Garde au démarrage** (`SecretsGuard`) : refus de démarrage en production si des secrets sont restés à leur valeur par défaut (JWT, mots de passe admin/print/cashier/DB).
- **Masquage du PAN** aux trois niveaux (frontend, backend, base) au format `XXXX **** **** XXXX` ; seuls 4+4 chiffres capturés (conformité PCI).
- Documents KYC accessibles **uniquement via le backend authentifié**.
- Mots de passe stockés en **Bcrypt** ; secrets agrégateur en variables d'environnement, jamais en code source.

---

## 8. Exigences non fonctionnelles

### 8.1 Performance

| Exigence | Cible |
|---|---|
| Temps de réponse API (CRUD) | < 500 ms au P95 |
| Déclenchement paiement | < 5 s (hors délai opérateur) |
| Upload document KYC (6 Mo) | < 10 s sur 3G |
| Rendu SPA (FCP) | < 3 s sur mobile 3G |

### 8.2 Disponibilité et exploitation

| Exigence | Cible |
|---|---|
| Disponibilité | ≥ 99 % (hors maintenance planifiée) |
| Indisponibilité planifiée | < 2 h/mois, hors heures ouvrées |
| Reprise après redémarrage | < 60 s (restart policy Docker) |
| Réconciliation des paiements | Automatique (~5 min) + manuelle (jusqu'à 168 h) |

### 8.3 Scalabilité

- Backend **stateless** (JWT) → duplication horizontale sans modification.
- Pool `paymentExecutor` jusqu'à 256 traitements de paiement simultanés.
- En multi-instances, la réconciliation automatique ne doit être active **que sur un seul réplica**.

### 8.4 Sécurité, compatibilité, i18n

- RBAC aux deux niveaux ; audit de toutes les mutations ; HTTPS (TLS 1.2+).
- Navigateurs : Chrome ≥ 90, Firefox ≥ 88, Safari ≥ 14, Edge ≥ 90 ; mobile Android/iOS ; résolution mini 375 px.
- Interface en **français** ; internationalisation préparée (le back-office manager utilise du français inline).

---

## 9. Règles de gestion

| Code | Règle |
|---|---|
| **RG-001** | Une souscription est créée `pending`, passe à `paid` après confirmation, ou `failed` en cas d'échec. |
| **RG-002** | Une carte ne peut être imprimée que si la souscription est `paid` ou `cash`. |
| **RG-003** | Un paiement MoMo ne peut être déclenché qu'une fois par dossier dans une fenêtre de 5 min (anti-double débit). |
| **RG-004** | Le PAN est toujours stocké masqué `XXXX **** **** XXXX`. Aucune exception. |
| **RG-005** | Un agent ne voit que ses propres souscriptions ; l'administrateur voit toutes les souscriptions. |
| **RG-006** | La réconciliation expire les paiements restés `pending` après 15 min. |
| **RG-007** | L'upload d'un reçu SARA déclenche l'OCR ; les données extraites sont validées par un humain avant soumission. |
| **RG-008** | La configuration tarifaire historique (`CardConfig`) est un singleton (id=1). |
| **RG-009** | Un utilisateur désactivé (`enabled=false`) ne peut plus s'authentifier, même avec des credentials valides. |
| **RG-010** | Tout fulfillment de recharge doit être précédé d'un paiement validé (`payStatus=paid`). |
| **RG-011** | La géolocalisation GPS est capturée à la souscription et n'est jamais modifiable ensuite. |
| **RG-012** | Un référent commercial est identifié par son téléphone normalisé ; s'il correspond à un agent, la vente lui est créditée. |
| **RG-013** | Le prix effectif d'un produit = prix promo si une promotion est active ce jour, sinon `basePrice` ; borné à ≥ 0. |
| **RG-014** | Le produit `CARD` du catalogue est répercuté vers `CardConfig` ; le runtime de souscription reste inchangé. |
| **RG-015** | Résolution de commission : `USER` > `ROLE`, `PRODUCT` > `GROUP`, puis règle active la plus récente. |
| **RG-016** | Une commission est unique par `(saleType, saleRef, beneficiaryId)` : génération idempotente, jamais de double crédit. |
| **RG-017** | Les produits `builtin` ne sont pas supprimables, seulement éditables. |
| **RG-018** | Stats et messagerie sont bornées au sous-arbre de l'utilisateur, contrôle imposé côté serveur. |
| **RG-019** | La construction de la hiérarchie est protégée contre les cycles. |

---

## 10. Contraintes, limites et risques

### 10.1 Limites fonctionnelles

- Recherche par PAN limitée aux 4 premiers / 4 derniers chiffres (conformité PCI).
- Pas de révocation immédiate des JWT (durée de vie fixe, 24 h par défaut).
- Réconciliation automatique à activer sur un seul réplica en multi-instances.
- SMS de confirmation non gérés par le portail (relèvent de l'opérateur MoMo).
- Le portail **calcule et trace** les commissions mais ne réalise pas le versement en paie.

### 10.2 Données sensibles

| Donnée | Classification | Traitement |
|---|---|---|
| PAN complet | Confidentiel — PCI DSS | Jamais stocké ni transmis (4+4 masqué) |
| Documents KYC (CNI, selfie) | Confidentiel — RGPD | MinIO, accès backend authentifié uniquement |
| Mots de passe | Confidentiel | Bcrypt, jamais en clair |
| Clés TrustPayWay | Secret applicatif | Variables d'environnement |

### 10.3 Risques et mesures

| Risque | Mesure |
|---|---|
| Double débit MoMo | Anti-doublon (fenêtre 5 min) + `gatewayRef` globalement unique |
| Démarrage avec secrets par défaut | `SecretsGuard` bloque le démarrage en production |
| Force brute sur la connexion | `LoginRateLimiter` (verrouillage temporaire + 429) |
| Perte de données au déploiement | Procédure imposée : `./deploy.sh --le`, jamais `down -v` |
| Double crédit de commission | Contrainte d'unicité `(saleType, saleRef, beneficiaryId)` |
| Accès transverse aux stats | Scoping serveur par sous-arbre hiérarchique |

---

## 11. Livrables et environnements

### 11.1 Livrables

- Application web (frontend Angular + backend Spring Boot) conteneurisée.
- Base PostgreSQL + stockage MinIO + reverse proxy Caddy (TLS).
- Scripts d'exploitation : déploiement (`deploy.sh`), réconciliation manuelle des paiements.
- Documentation : ce cahier des charges, [spécifications fonctionnelles](cahier-specifications.md), [architecture](cahier-architecture.md), [cas d'utilisation](use-cases.md), [schéma de données](db-schema.md), guide utilisateur.

### 11.2 Environnements

| Environnement | Usage |
|---|---|
| Développement | Local (profils `dev`/`test`, `SecretsGuard` désactivé) |
| Production | Serveur on-premise Afriland, overlay Docker `le.yml`, branche `master` |

---

## 12. Glossaire

| Terme | Définition |
|---|---|
| **PAN** | Primary Account Number — numéro à 16 chiffres de la carte |
| **KYC** | Know Your Customer — vérification d'identité du client |
| **MoMo** | Mobile Money — paiement par téléphone mobile |
| **USSD** | Protocole de menus interactifs mobiles (paiement MoMo) |
| **SARA** | Système de virement inter-bancaire camerounais |
| **TrustPayWay** | Agrégateur de paiement Mobile Money utilisé par Afriland |
| **Catalogue** | Référentiel unique des produits, composants tarifaires et promotions |
| **Composant tarifaire** | Ligne de tarif d'un produit `CARD` (frais, transport, recharge initiale, pass premium…) |
| **Commission** | Rémunération d'un bénéficiaire sur une vente, calculée par règle paramétrable |
| **Assiette** | Base de calcul d'une commission (prix de vente du produit) |
| **Sous-arbre** | Ensemble des utilisateurs rattachés (directement ou non) à un responsable hiérarchique |
| **Fulfill** | Crédit effectif de la carte après validation du paiement |
| **Réconciliation** | Synchronisation des statuts de paiement avec TrustPayWay |
| **JWT** | JSON Web Token — jeton d'authentification signé et stateless |
| **MinIO** | Serveur de stockage d'objets compatible S3, on-premise |
| **OCR** | Reconnaissance automatique de texte dans une image |
| **RBAC** | Role-Based Access Control — contrôle d'accès par rôle |
| **SPA** | Single Page Application — application web sans rechargement |

---

*Document rédigé en juin 2026 — version 1.0. Complète le [cahier des spécifications fonctionnelles](cahier-specifications.md).*
