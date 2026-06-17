# Cahier des Spécifications Fonctionnelles — Portail Afriland Carte Promote

| Champ | Valeur |
|---|---|
| Projet | Portail Carte Promote — Afriland First Bank |
| Version | 1.0 |
| Date | Juin 2026 |
| Statut | En production |
| Auteur | Équipe Digital — Afriland First Bank |

---

## Table des matières

1. [Objet et contexte](#1-objet-et-contexte)
2. [Périmètre fonctionnel](#2-périmètre-fonctionnel)
3. [Acteurs et rôles](#3-acteurs-et-rôles)
4. [Exigences fonctionnelles](#4-exigences-fonctionnelles)
   - 4.1 [Module Souscription](#41-module-souscription)
   - 4.2 [Module Recharge](#42-module-recharge)
   - 4.3 [Module KYC et documents](#43-module-kyc-et-documents)
   - 4.4 [Module Paiement](#44-module-paiement)
   - 4.5 [Module Point d'impression](#45-module-point-dimpression)
   - 4.6 [Module Caisse](#46-module-caisse)
   - 4.7 [Module Collecte terrain](#47-module-collecte-terrain)
   - 4.8 [Module Administration](#48-module-administration)
   - 4.9 [Module Statistiques et tableaux de bord](#49-module-statistiques-et-tableaux-de-bord)
   - 4.10 [Module Authentification et sécurité](#410-module-authentification-et-sécurité)
5. [Exigences non fonctionnelles](#5-exigences-non-fonctionnelles)
6. [Règles de gestion](#6-règles-de-gestion)
7. [Contraintes et limites](#7-contraintes-et-limites)
8. [Glossaire](#8-glossaire)

---

## 1. Objet et contexte

### 1.1 Objet du document

Le présent cahier décrit les spécifications fonctionnelles du portail **Carte Promote**, application web de gestion du programme de carte prépayée Afriland First Bank. Il constitue le référentiel des besoins fonctionnels pour les équipes de développement, de recette et de maintenance.

### 1.2 Contexte métier

Afriland First Bank commercialise une carte prépayée baptisée **Carte Promote** destinée à une clientèle principalement non bancarisée. Avant ce portail, le processus était partiellement manuel, reposant sur des outils disparates (KoboToolbox, fichiers Excel, échanges papier).

Le portail Carte Promote unifie et numérise l'intégralité du cycle de vie :

| Étape | Avant | Après |
|---|---|---|
| Souscription | Formulaire papier / KoboToolbox | Formulaire web multi-étapes (QR ou agent) |
| Vérification KYC | Copie papier / scan email | Capture photo intégrée, stockage sécurisé |
| Paiement | Espèces au guichet ou virement manuel | Mobile Money (Orange Money, MTN), espèces validées numériquement, virement SARA |
| Impression | Processus non traçable | Point d'impression avec validation visuelle du KYC |
| Recharge | Guichet physique | Formulaire en ligne + crédit numérique |
| Suivi commercial | Tableurs Excel | Tableaux de bord temps réel multi-rôles |

### 1.3 Parties prenantes

| Partie prenante | Rôle dans le projet |
|---|---|
| Direction Digital Afriland | Commanditaire / recette |
| Équipe IT Afriland | Exploitation infrastructure |
| Agents commerciaux | Utilisateurs terrain principaux |
| Points d'impression | Partenaires de remise physique |
| Caissiers | Validation des paiements alternatifs |
| Collecteurs terrain | Saisie des ventes de produits bancaires |
| Clients finaux | Souscripteurs / détenteurs de la carte |

---

## 2. Périmètre fonctionnel

### 2.1 Dans le périmètre

| Module | Description |
|---|---|
| **Souscription** | Parcours complet de demande de carte (public ou assisté par agent) |
| **KYC** | Capture, upload et consultation des documents d'identité et selfie |
| **Paiement** | Mobile Money (Orange/MTN), espèces, virement SARA ; réconciliation |
| **Point d'impression** | Vérification KYC, impression, remise de la carte physique |
| **Recharge** | Demande de recharge + paiement + crédit effectif par le caissier |
| **Caisse** | Validation des paiements espèces et reçus SARA |
| **Collecte terrain** | Saisie des ventes de produits bancaires (compte, carte, SARA Money, e-First) |
| **Administration** | Gestion des utilisateurs, de la configuration tarifaire, des agences |
| **Statistiques** | KPI par rôle : ventes, encaissements, activités, géolocalisation |
| **Audit** | Journal de toutes les actions et tentatives de connexion |
| **Notifications** | Alertes in-app entre utilisateurs |

### 2.2 Hors périmètre

- Système Core Banking (interface en lecture seule au travers des agents terrain)
- Gestion du stock de cartes physiques vierges
- Facturation et comptabilité bancaire
- Application mobile native (iOS / Android)
- Service client (CRM)

---

## 3. Acteurs et rôles

### 3.1 Acteurs externes (non authentifiés)

| Acteur | Description | Canal d'accès |
|---|---|---|
| **Client / Prospect** | Personne physique souhaitant souscrire ou recharger sa carte | URL publique, QR code |

### 3.2 Acteurs internes (authentifiés)

| Rôle technique | Désignation métier | Périmètre principal |
|---|---|---|
| `ADMIN` | Administrateur système | Accès total : configuration, utilisateurs, statistiques globales, audit |
| `AGENT` | Chargé de clientèle | Souscriptions assistées, réclamation QR, tableaux de bord personnels |
| `PRINT_AGENT` | Agent point d'impression | Consultation KYC, impression, remise carte, remplacement photo |
| `CASHIER` | Caissier | Validation espèces/SARA, fulfillment recharges |
| `COLLECTEUR` | Collecteur terrain | Saisie et consultation de ses propres collectes |
| `SUPERVISEUR` | Superviseur collecte | Lecture seule des statistiques de collecte (aucune écriture) |

### 3.3 Cumul de rôles

Un utilisateur peut se voir attribuer plusieurs rôles simultanément (ex. un agent peut aussi être caissier). La liste des permissions effectives est l'union de tous ses rôles.

---

## 4. Exigences fonctionnelles

### 4.1 Module Souscription

#### 4.1.1 Souscription publique (canal client)

**SF-SUB-01** — Le système doit proposer un formulaire de souscription accessible sans authentification, atteignable via un QR code ou une URL directe.

**SF-SUB-02** — Le formulaire est organisé en 5 étapes linéaires avec barre de progression :
1. **Identité** : prénom, nom, sexe, type de pièce, numéro CNI, NIU, date d'expiration, téléphone, e-mail, adresse (quartier, ville)
2. **Documents** : capture ou upload CNI recto + CNI verso
3. **Selfie** : capture de la photo du client (obligatoire, bloque la progression si absente)
4. **Paiement** : choix méthode, type de carte, mode de livraison, numéro de téléphone MoMo, référent commercial
5. **Récapitulatif** : affichage de toutes les données avant confirmation

**SF-SUB-03** — La navigation entre étapes doit autoriser le retour en arrière sans perte des données déjà saisies.

**SF-SUB-04** — Le système doit valider chaque champ au moment de la saisie (validation temps réel) :
- Format téléphone (libphonenumber-js, préfixes camerounais)
- Numéro CNI : 8 chiffres pour carte nationale
- Date d'expiration CNI : format JJ/MM/AAAA, date future
- NIU : format alphanumérique

**SF-SUB-05** — Après soumission, le système génère une référence unique de type `PRM-XXXX` et lance le paiement. Le client accède à un écran de confirmation avec sa référence et un code QR de son dossier.

**SF-SUB-06** — Le client peut choisir parmi les types de carte : `prepaid` (carte prépayée) ou `bancaire` (carte bancaire).

**SF-SUB-07** — Le client choisit son mode de livraison : `promote` (retrait en point Promote), `agence` (agence Afriland), `home` (livraison à domicile).

#### 4.1.2 Souscription assistée (canal agent)

**SF-SUB-08** — Un agent authentifié peut créer une souscription pour le compte d'un client. Son identifiant est automatiquement rattaché à la souscription.

**SF-SUB-09** — L'agent peut renseigner le numéro de téléphone du référent commercial. Le système résout automatiquement le nom du référent via le répertoire des agents.

**SF-SUB-10** — L'agent peut rechercher et consulter l'ensemble de ses souscriptions (`/mine`) : liste filtrée, paginée, avec indicateurs de statut.

**SF-SUB-11** — L'agent peut récupérer une souscription créée en libre-service par un client en scannant son QR code (`/claim`). La souscription est alors rattachée à l'agent.

#### 4.1.3 Règles communes

**SF-SUB-12** — Deux souscriptions avec le même numéro CNI normalisé ne doivent pas pouvoir coexister avec le statut `pending`. Le système doit détecter les doublons et alerter.

**SF-SUB-13** — La géolocalisation GPS du point de souscription est capturée automatiquement (latitude, longitude, précision) et stockée avec la souscription.

---

### 4.2 Module Recharge

**SF-RCH-01** — Le système doit permettre à toute personne (sans authentification) de déposer une demande de recharge de carte prépayée.

**SF-RCH-02** — Le formulaire de recharge collecte : prénom, nom, téléphone, PAN de la carte (4 premiers + 4 derniers chiffres), montant, méthode de paiement.

**SF-RCH-03** — Le montant de recharge doit respecter les bornes configurées par l'administrateur (`recharge_min`, `recharge_max`).

**SF-RCH-04** — Après paiement validé, la recharge est dans l'état `payée mais non créditée`. Un caissier doit confirmer le crédit effectif de la carte (`fulfill`).

**SF-RCH-05** — Le système génère une référence de recharge de type `RC-XXXXXX`.

**SF-RCH-06** — Le caissier accède à la liste des recharges en attente de crédit (`pending-fulfillment`) et peut les marquer comme effectuées.

---

### 4.3 Module KYC et documents

**SF-KYC-01** — Le système doit permettre l'upload de documents au format JPEG, PNG ou PDF, avec une taille maximale de 6 Mo par fichier.

**SF-KYC-02** — Les documents capturables sont : selfie client, CNI recto, CNI verso, reçu de virement SARA.

**SF-KYC-03** — Pour le reçu SARA (PDF ou image), le système effectue une extraction automatique des données clés par OCR : référence, téléphone du payeur, montant, statut, date.

**SF-KYC-04** — Les données extraites sont pré-remplies dans le formulaire pour validation par l'agent avant soumission.

**SF-KYC-05** — Les documents sont stockés de manière sécurisée (MinIO, réseau interne) et ne sont jamais accessibles directement depuis le navigateur sans authentification.

**SF-KYC-06** — Le point d'impression peut remplacer un document KYC défectueux (`PATCH /{ref}/photo`) sans modifier les autres données du dossier.

---

### 4.4 Module Paiement

**SF-PAY-01** — Le système doit supporter les méthodes de paiement suivantes :
- **Orange Money** (`om`) : débit USSD via TrustPayWay
- **MTN MoMo** (`mtn`) : débit USSD via TrustPayWay
- **Espèces** (`cash`) : collecte physique validée numériquement par le caissier
- **Virement SARA** (`sara`) : upload du reçu, validation par agent/caissier

**SF-PAY-02** — Pour le paiement Mobile Money, le client reçoit une invite USSD sur son téléphone pour confirmer le débit. Le système attend la confirmation par webhook ou polling.

**SF-PAY-03** — Le système doit implémenter une protection anti-double débit : si une demande identique (même téléphone, même montant, même opérateur) est en cours dans une fenêtre de 5 minutes, la seconde requête réutilise la première transaction.

**SF-PAY-04** — Un statut de paiement public (`GET /{ref}/status`) permet au client de suivre l'avancement sans authentification.

**SF-PAY-05** — Le système doit réconcilier automatiquement les paiements en attente toutes les 5 minutes (configurable) via le service TrustPayWay.

**SF-PAY-06** — L'administrateur peut déclencher une réconciliation manuelle sur une fenêtre temporelle arbitraire (jusqu'à 168h en arrière).

**SF-PAY-07** — Tout paiement Mobile Money doit avoir une référence agrégateur (`gatewayRef`) globalement unique pour éviter les rejets `Duplicate transaction`.

---

### 4.5 Module Point d'impression

**SF-PRT-01** — L'agent point d'impression accède à la liste des souscriptions payées non encore imprimées.

**SF-PRT-02** — L'agent peut rechercher un dossier par référence, nom ou numéro de téléphone.

**SF-PRT-03** — L'agent consulte le dossier KYC complet (selfie, CNI recto/verso) pour vérification visuelle avant impression.

**SF-PRT-04** — L'agent peut valider ou rejeter le selfie (`selfieVerified`). Un selfie non validé est signalé visuellement.

**SF-PRT-05** — Après impression physique, l'agent saisit le numéro de la carte remise (4 premiers + 4 derniers chiffres du PAN) et marque le dossier comme imprimé.

**SF-PRT-06** — La traçabilité de l'impression (agent, date/heure) est enregistrée de manière immuable.

---

### 4.6 Module Caisse

**SF-CSH-01** — Le caissier accède à la liste de toutes les souscriptions et recharges en attente de validation paiement (espèces ou SARA).

**SF-CSH-02** — Pour une validation espèces, le caissier saisit une référence de reçu physique et confirme (`validate`) ou rejette (`reject`) l'encaissement.

**SF-CSH-03** — Pour une validation SARA, le caissier vérifie les données extraites du reçu OCR et confirme ou rejette.

**SF-CSH-04** — La validation espèces enregistre l'identité du caissier, la date et la référence du reçu papier.

**SF-CSH-05** — Un paiement validé passe à l'état `paid`. Un paiement rejeté passe à l'état `failed` avec un message explicatif.

---

### 4.7 Module Collecte terrain

**SF-COL-01** — Le collecteur peut saisir une vente de produit bancaire réalisée sur le terrain.

**SF-COL-02** — Les produits collectables sont : `compte_ouvert`, `carte_bancaire`, `sara_money`, `e_first`.

**SF-COL-03** — Pour chaque collecte, le système enregistre : produit, nom et téléphone du client, informations spécifiques au produit (n° compte, n° carte masqué, type de carte).

**SF-COL-04** — Le collecteur ne voit que ses propres collectes.

**SF-COL-05** — Le superviseur accède aux statistiques agrégées de toutes les collectes (par période, par collecteur, par produit) sans pouvoir modifier les données.

---

### 4.8 Module Administration

#### 4.8.1 Gestion des utilisateurs

**SF-ADM-01** — L'administrateur peut créer, modifier, activer/désactiver les comptes utilisateurs staff.

**SF-ADM-02** — L'administrateur peut attribuer un ou plusieurs rôles à un utilisateur.

**SF-ADM-03** — L'administrateur peut importer des utilisateurs en masse (fichier CSV/Excel).

**SF-ADM-04** — L'administrateur peut réinitialiser les credentials d'un utilisateur (mot de passe ou PIN).

**SF-ADM-05** — L'administrateur peut créer des profils de permissions nommés (`AppProfile`) pour définir des jeux de droits fins réutilisables.

#### 4.8.2 Configuration tarifaire

**SF-ADM-06** — L'administrateur peut modifier les paramètres de `CardConfig` :
- Prix de la carte
- Frais de service
- Frais de transport/livraison
- Montant minimum et maximum de recharge

**SF-ADM-07** — La configuration est un singleton global (id=1) ; toute modification est effective immédiatement pour tous les nouveaux dossiers.

#### 4.8.3 Gestion des agences

**SF-ADM-08** — L'administrateur peut maintenir la liste des agences Afriland (nom, ville, actif/inactif).

**SF-ADM-09** — L'administrateur peut importer la liste des agences en masse.

#### 4.8.4 Audit et traçabilité

**SF-ADM-10** — L'administrateur peut consulter le journal d'audit complet (`action_audit`) : acteur, action, entité, IP, horodatage.

**SF-ADM-11** — L'administrateur peut consulter le journal des connexions (`login_audit`) : succès et échecs, IP, horodatage.

**SF-ADM-12** — L'administrateur peut exporter les données (souscriptions, recharges, collectes) au format Excel.

---

### 4.9 Module Statistiques et tableaux de bord

**SF-STA-01 — Dashboard Administrateur**
- Nombre total de souscriptions (par statut, par période)
- Volumes encaissés (par méthode de paiement)
- Top agents (nombre de ventes)
- Statistiques par agence
- Carte de géolocalisation des agents connectés

**SF-STA-02 — Dashboard Agent**
- Ses propres souscriptions (en cours, payées, imprimées)
- Son classement dans le réseau commercial
- Souscriptions issues de son QR code réclamé

**SF-STA-03 — Dashboard Point d'impression**
- Dossiers en attente d'impression
- Historique des cartes remises par la session

**SF-STA-04 — Dashboard Caissier**
- Paiements en attente de validation (espèces / SARA)
- Recharges en attente de crédit
- Historique des validations du jour

**SF-STA-05 — Dashboard Superviseur collecte**
- Statistiques des collectes par produit, période, collecteur
- Export Excel des données de collecte

---

### 4.10 Module Authentification et sécurité

**SF-SEC-01** — Le personnel staff se connecte via email + mot de passe ou via numéro de téléphone + PIN à 4 chiffres (usage mobile terrain).

**SF-SEC-02** — Lors de la première connexion, le système impose un changement de mot de passe.

**SF-SEC-03** — L'utilisateur peut réinitialiser son mot de passe via un lien envoyé par e-mail.

**SF-SEC-04** — Le système doit verrouiller les routes par rôle (guards Angular côté frontend + Spring Security côté backend).

**SF-SEC-05** — Le PAN de la carte ne doit jamais être saisi ou stocké en clair. Seuls les 4 premiers et 4 derniers chiffres sont capturés ; le format de stockage est `XXXX **** **** XXXX`.

**SF-SEC-06** — Toutes les communications doivent passer par HTTPS (TLS 1.2+). Le certificat Let's Encrypt est géré automatiquement par Caddy.

---

## 5. Exigences non fonctionnelles

### 5.1 Performance

| Exigence | Cible |
|---|---|
| Temps de réponse API (opérations CRUD) | < 500 ms au P95 |
| Temps de réponse API paiement (déclenchement) | < 5 s (hors délai opérateur) |
| Upload document KYC (6 Mo) | < 10 s sur réseau 3G |
| Rendu de la SPA (first contentful paint) | < 3 s sur mobile 3G |

### 5.2 Disponibilité

| Exigence | Cible |
|---|---|
| Disponibilité du portail | 99 % (hors maintenance planifiée) |
| Durée d'indisponibilité planifiée | < 2h/mois, hors heures ouvrées |
| Reprise après redémarrage du serveur | < 60 s (Docker Compose restart policy) |

### 5.3 Scalabilité

- Le backend est stateless (JWT) et peut être dupliqué horizontalement sans modification.
- Le pool de threads `paymentExecutor` supporte jusqu'à 256 traitements de paiement simultanés.
- La base de données PostgreSQL supporte une croissance jusqu'à plusieurs millions de souscriptions sans refonte du schéma.

### 5.4 Sécurité

- Authentification par JWT signé HMAC-SHA256 (secret ≥ 32 caractères, variable d'environnement)
- Aucune session serveur (stateless)
- Contrôle d'accès basé sur les rôles (RBAC) aux deux niveaux (frontend + backend)
- Masquage du PAN aux deux niveaux (frontend + backend + base de données)
- Documents KYC accessibles uniquement via le backend authentifié
- Audit log de toutes les mutations

### 5.5 Compatibilité

- Navigateurs supportés : Chrome ≥ 90, Firefox ≥ 88, Safari ≥ 14, Edge ≥ 90
- Support mobile : Android Chrome (prioritaire), iOS Safari
- Résolution minimale : 375 px (smartphone)
- Aucune application native requise (PWA responsive)

### 5.6 Accessibilité et internationalisation

- Interface en français (langue principale)
- Libellés et messages d'erreur en français
- Internationalisation préparée via service `i18n`

---

## 6. Règles de gestion

| Code | Règle |
|---|---|
| **RG-001** | Une souscription est créée avec le statut `pending`. Elle passe à `paid` après confirmation du paiement, ou `failed` en cas d'échec. |
| **RG-002** | Une carte ne peut être imprimée que si la souscription est dans l'état `paid` ou `cash`. |
| **RG-003** | Un paiement Mobile Money ne peut être déclenché qu'une seule fois par dossier dans une fenêtre de 5 minutes (anti-double débit). |
| **RG-004** | Le PAN de la carte est toujours stocké au format masqué `XXXX **** **** XXXX`. Aucune exception. |
| **RG-005** — | L'agent ne peut voir que ses propres souscriptions dans son tableau de bord. L'administrateur voit toutes les souscriptions. |
| **RG-006** | La réconciliation automatique expire les paiements restés `pending` après 15 minutes. |
| **RG-007** | L'upload d'un reçu SARA déclenche automatiquement l'OCR. Les données extraites sont présentées pour validation humaine avant soumission. |
| **RG-008** | La configuration tarifaire (`CardConfig`) est un singleton ; il ne peut exister qu'un seul enregistrement (id=1). |
| **RG-009** | Un utilisateur désactivé (`enabled=false`) ne peut plus s'authentifier, même avec des credentials valides. |
| **RG-010** | Tout fulfillment de recharge doit être précédé d'un paiement validé (`payStatus=paid`). |
| **RG-011** | La géolocalisation GPS est capturée au moment de la souscription. Elle n'est jamais modifiable après création. |
| **RG-012** | Un référent commercial est identifié par son numéro de téléphone normalisé. Si ce numéro correspond à un agent enregistré, la vente lui est créditée. |

---

## 7. Contraintes et limites

### 7.1 Contraintes techniques

- Hébergement on-premise sur serveur dédié Afriland (pas de cloud public imposé).
- Paiement Mobile Money via l'agrégateur TrustPayWay uniquement.
- Aucun accès direct à la base de données Core Banking.
- Évolution du schéma de base de données gérée par Hibernate (`ddl-auto=update`) — pas de système de migration formalisé (Flyway/Liquibase).

### 7.2 Limites fonctionnelles

- La recherche par PAN n'est possible que sur les 4 premiers ou 4 derniers chiffres (conformité PCI).
- Pas de révocation immédiate des JWT (durée de vie fixe, 24h par défaut).
- La réconciliation automatique doit être activée sur un seul réplica backend en cas de déploiement multi-instances.
- Les SMS de confirmation ne sont pas gérés par le portail (relevant de l'opérateur MoMo).

### 7.3 Données sensibles

| Donnée | Classification | Traitement |
|---|---|---|
| PAN complet | Confidentiel — PCI DSS | Jamais stocké ni transmis |
| Documents KYC (CNI, selfie) | Confidentiel — RGPD | Stockés chiffrés (MinIO), accès backend uniquement |
| Mots de passe | Confidentiel | Stockés en Bcrypt, jamais en clair |
| Clés agrégateur TrustPayWay | Secret applicatif | Variables d'environnement, jamais dans le code source |

---

## 8. Glossaire

| Terme | Définition |
|---|---|
| **PAN** | Primary Account Number — numéro à 16 chiffres gravé sur la carte |
| **KYC** | Know Your Customer — vérification de l'identité du client |
| **MoMo** | Mobile Money — service de paiement par téléphone mobile |
| **USSD** | Unstructured Supplementary Service Data — protocole de communication mobile pour les menus interactifs (paiement MoMo) |
| **SARA** | Système de virement inter-bancaire camerounais |
| **TrustPayWay** | Agrégateur de paiement Mobile Money utilisé par Afriland |
| **QR code** | Code bidimensionnel scannable contenant le lien de souscription personnalisé d'un agent |
| **Fulfill** | Action de créditer effectivement la carte après que le paiement ait été validé |
| **Réconciliation** | Processus de synchronisation des statuts de paiement avec l'agrégateur TrustPayWay |
| **Webhook** | Notification push de TrustPayWay vers le portail lors de la confirmation d'un paiement |
| **SPA** | Single Page Application — application web chargée une seule fois, navigable sans rechargement |
| **JWT** | JSON Web Token — jeton d'authentification signé et stateless |
| **MinIO** | Serveur de stockage d'objets compatible S3, hébergé on-premise |
| **OCR** | Optical Character Recognition — reconnaissance automatique de texte dans une image |

---

*Document rédigé en juin 2026 — version 1.0*
