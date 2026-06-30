# Guide de test — Afriland Carte Promote

Ce document décrit **comment tester les fonctionnalités existantes** du portail Promote,
les **comptes de démonstration** disponibles, et pour **chaque profil** les **parcours d'achat**
réellement implémentés.

> Mot de passe de tous les comptes de démo : **`promote`**
> Les comptes de démo ne sont créés que si `SEED_TEST_AGENT=true` (valeur par défaut hors production).

---

## 1. Accès & pré-requis

| Élément | Local (Docker) | Production |
|---|---|---|
| Application | `https://<ip>.sslip.io:8443` (ou `http://localhost:8973`) | `https://<DOMAIN>` |
| Documentation API (Swagger UI) | `…/swagger-ui.html` | `https://<DOMAIN>/swagger-ui.html` |
| Spécification OpenAPI (JSON) | `…/v3/api-docs` | `https://<DOMAIN>/v3/api-docs` |

> ⚠️ La **caméra** (capture selfie / CNI) exige **HTTPS** (`getUserMedia`). En local, accepter
> une fois l'avertissement de certificat auto-signé, sinon les étapes KYC échouent.

---

## 2. Comptes de démonstration

Connexion **staff** : page **/login**, par **email + mot de passe**. Après connexion, chaque
rôle est redirigé vers sa page d'accueil (« landing »).

| Rôle | Email | Mot de passe | Landing | Rôle métier |
|---|---|---|---|---|
| **ADMIN** | `admin@afrilandfirstbank.com` | `promote` | `/admin` | Direction Promote — vue globale, configuration |
| **MANAGER** | `manager@afrilandfirstbank.com` | `promote` | `/manager` | Produits, promotions, commissions, utilisateurs |
| **SUPERVISEUR** | `superviseur@afrilandfirstbank.com` | `promote` | `/supervision` | Stats des chefs d'équipe de son sous-arbre |
| **CHEF_EQUIPE** | `chef@afrilandfirstbank.com` | `promote` | `/manager` | Stats de son équipe, roster, messagerie |
| **AGENT** | `awa.fall@afrilandfirstbank.com` | `promote` | `/dashboard` | Chargé de clientèle — souscriptions assistées |
| **COLLECTEUR** | `collecteur@afrilandfirstbank.com` | `promote` | `/collecte` | Saisie des ventes de produits bancaires |
| **PRINT_AGENT** | `imprimeur.promote@afrilandfirstbank.com` | `promote` | `/print` | Point d'impression — retrait & impression carte |
| **CASHIER** | `caissier.promote@afrilandfirstbank.com` | `promote` | `/cashier` | Caissier — encaissement espèces |
| **CLIENT (anonyme)** | _aucun compte_ | — | `/home` | Parcours libre / borne / QR |

> Hiérarchie de démo : `admin → manager → superviseur → chef → (agent a1, collecteur)`.
> Elle permet de vérifier les vues **scopées** (chaque niveau ne voit que son sous-arbre).

---

## 3. Les parcours d'achat existants (vue d'ensemble)

Le portail expose **trois parcours générateurs de vente** et des **étapes de traitement** :

| Parcours | Route | Qui le déclenche | Description |
|---|---|---|---|
| **Souscription carte Promote** | `/subscribe` | Client (libre) **ou** Agent (assisté) | Tunnel KYC en 6 étapes + paiement |
| **Recharge de carte** | `/recharge` | Client (libre) **ou** Agent (assisté) | Recharge d'une carte existante |
| **Collecte produits bancaires** | `/collecte` | Collecteur | Enregistrement d'une vente (compte, carte, Sara Money, E-First) |
| **Encaissement espèces** | `/cashier` | Caissier | Validation du paiement *cash* d'une souscription/recharge |
| **Impression carte** | `/print` | Point d'impression | Récupération du dossier KYC payé et impression |

**Moyens de paiement** (souscription/recharge) : **Orange Money (OM)**, **MTN MoMo**, **Espèces (cash)**, **Sara Money**.
**Modes de livraison** (souscription) : **Point Promote**, **En agence** (choix de l'agence), **À domicile** (+ frais de transport).
**Statuts de paiement** : `paid` (payé), `cash` (à encaisser), `pending` (en cours), `failed` (échec).

---

## 4. Parcours détaillé — Souscription carte Promote (`/subscribe`)

Tunnel en **6 étapes** (barre de progression) :

1. **Choix du produit** — sélection de la carte/offre dans le catalogue.
2. **Identité** — prénom, nom, sexe, type de pièce (CNI), numéro, NIU (optionnel), dates.
3. **Pièce d'identité** — capture **recto / verso** de la CNI (caméra ou import).
4. **Photo de profil (selfie)** — capture avec **détection de visage** (auto-capture).
5. **Livraison & paiement** — mode de livraison + moyen de paiement (OM/MTN → n° MoMo ; Sara → réf. + reçu).
6. **Récapitulatif** — vérification du tarif (prix + transport éventuel) puis **validation**.

Puis : **paiement** (`paying`) → écran **succès** (`success`) ou **échec** (`failure`).

### À tester
- [ ] Parcours complet **OM/MTN** : saisie n° MoMo, simulation push, retour `paid`.
- [ ] Parcours **Espèces** : la souscription part en statut `cash` → à encaisser côté **caissier**.
- [ ] Parcours **Sara Money** : référence + capture du reçu.
- [ ] Livraison **À domicile** : vérifier l'ajout des **frais de transport** au total.
- [ ] Livraison **En agence** : sélection obligatoire d'une agence.
- [ ] KYC : visage non détecté → blocage ; CNI floue → alerte qualité.
- [ ] Échec de paiement → écran d'échec + possibilité de reprise.

---

## 5. Parcours détaillé — Recharge (`/recharge`)

Formulaire unique : **prénom, nom, téléphone**, **n° de carte** (4 + 4 chiffres), **montant**, **moyen de paiement**.
Puis paiement → succès / échec (même cycle que la souscription).

### À tester
- [ ] Recharge **OM/MTN** d'un montant valide → `paid`.
- [ ] Recharge **espèces** → statut `cash` (encaissement caissier).
- [ ] Montant invalide / carte incomplète → message d'erreur.

---

## 6. Parcours détaillé — Collecte (`/collecte`, COLLECTEUR)

Saisie d'une vente de produit bancaire. Produits disponibles :
**Compte ouvert**, **Carte bancaire**, **Sara Money**, **E-First**.
Champs contextuels (ex. n° de compte si « Compte ouvert », n° de carte si « Carte bancaire »).

### À tester
- [ ] Créer une collecte pour chaque type de produit.
- [ ] Vérifier le **compteur** (total) et la liste **« mes collectes »**.
- [ ] Vérifier que le collecteur ne voit **que ses propres** collectes.

---

## 7. Étapes de traitement (back-office)

### 7.1 Caissier (`/cashier`)
- Onglet **Espèces** : rechercher une souscription par référence/nom, **valider l'encaissement** → passe de `cash` à `paid`.
- Onglet **Recharges** : encaisser les recharges en attente.
- KPIs : nombre en attente, montant encaissé.

### 7.2 Point d'impression (`/print`)
- Rechercher un dossier **payé** par référence, consulter le KYC, **marquer comme imprimé**.
- KPIs : imprimées (total), aujourd'hui, file d'attente.

---

## 8. Parcours d'achat **par compte** (récapitulatif)

| Compte | Peut **vendre / acheter** ? | Parcours d'achat accessibles |
|---|---|---|
| **CLIENT (anonyme)** | Oui (en self-service) | **Souscription** `/subscribe` · **Recharge** `/recharge` (libre, depuis l'accueil) |
| **AGENT** (`awa.fall`) | Oui (assisté) | **Souscription assistée** + **Recharge** via les actions rapides du `/dashboard` ; la vente est créditée à son portefeuille |
| **COLLECTEUR** (`collecteur`) | Oui | **Collecte** `/collecte` (compte ouvert, carte bancaire, Sara Money, E-First) |
| **CASHIER** (`caissier`) | Traitement | **Encaissement espèces** `/cashier` (clôture des paiements `cash` issus des souscriptions/recharges) |
| **PRINT_AGENT** (`imprimeur`) | Traitement | **Impression** `/print` des cartes payées |
| **MANAGER** (`manager`) | Supervision | Pas de saisie de vente dédiée ; pilotage produits/commissions, vue commerciale globale (`/manager`) |
| **CHEF_EQUIPE** (`chef`) | Supervision | Vue/roster de son équipe + messagerie (`/manager`) ; suit les ventes de ses agents |
| **SUPERVISEUR** (`superviseur`) | Supervision | Stats des chefs d'équipe de son sous-arbre (`/supervision`) |
| **ADMIN** (`admin`) | Configuration | Vue globale, configuration tarif/agences/utilisateurs (`/admin`) ; suit toutes les ventes |

> Les parcours **/subscribe** et **/recharge** sont **publics** (accessibles sans connexion) :
> un compte staff connecté peut donc aussi les emprunter, la vente étant alors **attribuée** à l'agent connecté.

---

## 9. Tableaux de bord & supervision à vérifier

- [ ] **Agent** (`/dashboard`) : ses ventes, ses stats, ses commissions.
- [ ] **Chef d'équipe / Manager** (`/manager`) : ventes agrégées de l'équipe, roster, messagerie.
- [ ] **Superviseur** (`/supervision`) : stats des chefs d'équipe du sous-arbre.
- [ ] **Admin** (`/admin`) : vue globale, configuration (prix, frais, transport, agences, utilisateurs).
- [ ] **Journaux de paiement** (`/paylogs`) et **réconciliation** (`/recon`) : suivi & rapprochement des paiements.
- [ ] **Scoping** : chaque niveau ne voit que son périmètre (vérifier qu'un chef ne voit pas une autre équipe).

---

## 10. Tester l'API directement (Swagger UI)

1. Ouvrir **`/swagger-ui.html`**.
2. Récupérer un jeton : `POST /api/auth/login` (email + mot de passe) — ou `POST /api/auth/login-phone`
   (téléphone 9 chiffres + PIN) pour un collecteur terrain.
3. Cliquer **Authorize** (cadenas) → saisir `Bearer <token>`.
4. Dérouler un endpoint → **Try it out** → **Execute**.

> Endpoints **publics** (sans jeton) : `/api/config`, catalogue en lecture, parcours client.
> Endpoints **protégés** : nécessitent le jeton et le **rôle** adéquat (sinon `403`).

---

## 11. Checklist transverse

- [ ] Connexion/déconnexion pour chacun des 8 rôles → bonne page de landing.
- [ ] Changement de mot de passe (`/change-password`).
- [ ] Multilingue (FR/EN) si activé.
- [ ] Reçu PNG généré après paiement (souscription/recharge).
- [ ] Reprise d'un paiement en `pending` (résilience MoMo).
- [ ] Comportement responsive (mobile / borne).
