# Cas d'utilisation — Portail Afriland Carte Promote

| Champ | Valeur |
|---|---|
| Projet | Portail Carte Promote — Afriland First Bank |
| Version | 1.0 |
| Date | Juin 2026 |

---

## Table des matières

- [Diagramme des acteurs](#diagramme-des-acteurs)
- [UC01 — Souscrire à la carte Promote (canal public)](#uc01--souscrire-à-la-carte-promote-canal-public)
- [UC02 — Souscrire à la carte Promote (canal agent)](#uc02--souscrire-à-la-carte-promote-canal-agent)
- [UC03 — Recharger une carte Promote](#uc03--recharger-une-carte-promote)
- [UC04 — S'authentifier (staff)](#uc04--sauthentifier-staff)
- [UC05 — Valider un paiement espèces](#uc05--valider-un-paiement-espèces)
- [UC06 — Valider un reçu de virement SARA](#uc06--valider-un-reçu-de-virement-sara)
- [UC07 — Imprimer et remettre une carte](#uc07--imprimer-et-remettre-une-carte)
- [UC08 — Récupérer une souscription QR](#uc08--récupérer-une-souscription-qr)
- [UC09 — Saisir une collecte terrain](#uc09--saisir-une-collecte-terrain)
- [UC10 — Consulter les statistiques de collecte (superviseur)](#uc10--consulter-les-statistiques-de-collecte-superviseur)
- [UC11 — Administrer les utilisateurs](#uc11--administrer-les-utilisateurs)
- [UC12 — Configurer les tarifs](#uc12--configurer-les-tarifs)
- [UC13 — Réconcilier les paiements (admin)](#uc13--réconcilier-les-paiements-admin)
- [UC14 — Consulter le journal d'audit](#uc14--consulter-le-journal-daudit)
- [UC15 — Exporter les données](#uc15--exporter-les-données)
- [UC16 — Réinitialiser son mot de passe](#uc16--réinitialiser-son-mot-de-passe)
- [UC17 — Fulfiller une recharge](#uc17--fulfiller-une-recharge)
- [UC18 — Consulter la carte de géolocalisation des agents](#uc18--consulter-la-carte-de-géolocalisation-des-agents)

---

## Diagramme des acteurs

```
                     ┌──────────────────────────────────────┐
                     │   Portail Carte Promote               │
                     │                                       │
  Client/Prospect ───┤── UC01 Souscrire (public)             │
                     │── UC03 Recharger (public)             │
                     │── UC16 Réinitialiser mot de passe     │
                     │                                       │
  Agent ─────────────┤── UC02 Souscrire (assisté)            │
                     │── UC08 Récupérer souscription QR      │
                     │── UC06 Valider reçu SARA              │
                     │                                       │
  Caissier ──────────┤── UC05 Valider paiement espèces       │
                     │── UC06 Valider reçu SARA              │
                     │── UC17 Fulfiller recharge             │
                     │                                       │
  Point impression ──┤── UC07 Imprimer et remettre carte     │
                     │                                       │
  Collecteur ────────┤── UC09 Saisir collecte terrain        │
                     │                                       │
  Superviseur ───────┤── UC10 Consulter stats collecte       │
                     │                                       │
  Admin ─────────────┤── UC11 Administrer utilisateurs       │
                     │── UC12 Configurer tarifs              │
                     │── UC13 Réconcilier paiements          │
                     │── UC14 Consulter audit                │
                     │── UC15 Exporter données               │
                     │── UC18 Carte géolocalisation          │
                     └──────────────────────────────────────┘
```

---

## UC01 — Souscrire à la carte Promote (canal public)

| Champ | Valeur |
|---|---|
| Identifiant | UC01 |
| Nom | Souscription publique (client) |
| Acteur principal | Client / Prospect |
| Pré-conditions | Aucune (accès public) |
| Post-conditions | Souscription créée, paiement initié, référence communiquée au client |

### Scénario nominal

1. Le client accède à l'URL publique ou scanne un QR code → page de souscription.
2. **Étape 1 — Identité** : le client saisit ses informations personnelles (prénom, nom, sexe, type de pièce d'identité, numéro CNI, NIU, date d'expiration CNI, téléphone, e-mail, quartier, ville).
3. Le système valide les formats en temps réel (téléphone, CNI, date).
4. **Étape 2 — Documents** : le client capture ou upload la photo de sa CNI recto, puis verso. Le système upload chaque image et retourne une clé de stockage.
5. **Étape 3 — Selfie** : le client prend une photo de lui-même via la caméra du téléphone. L'upload est obligatoire pour passer à l'étape suivante.
6. **Étape 4 — Paiement** : le client choisit le type de carte (`prepaid`/`bancaire`), le mode de livraison (`promote`/`agence`/`home`), la méthode de paiement, saisit le numéro de téléphone Mobile Money, renseigne éventuellement le numéro d'un référent commercial.
7. **Étape 5 — Récapitulatif** : affichage de toutes les données saisies et du montant total. Le client confirme.
8. Le système crée la souscription (statut `pending`), génère la référence `PRM-XXXX`, déclenche le paiement Mobile Money.
9. Le client voit l'écran d'attente avec sa référence. L'invite USSD s'affiche sur son téléphone.
10. Le client valide le paiement sur son téléphone. Le portail se met à jour (`paid`).
11. Le client reçoit l'écran de confirmation avec sa référence et un QR code de son dossier.

### Scénarios alternatifs

**A1 — Paiement en espèces**
- En étape 4, le client sélectionne `cash`. Aucun numéro MoMo n'est demandé.
- La souscription est créée avec le statut spécial indiquant un paiement espèces en attente de validation caissier.

**A2 — Paiement par virement SARA**
- Le client sélectionne `sara` et upload le reçu PDF/image de son virement.
- L'OCR extrait les données du reçu. Le client valide les informations pré-remplies.
- La souscription est créée avec le statut `sara_pending`, en attente de validation agent ou caissier.

**A3 — Paiement Mobile Money échoué**
- Le client n'approuve pas l'invite USSD ou le débit échoue.
- Le système met à jour le statut à `failed`. Un message d'erreur est affiché.
- Le client peut tenter un nouveau paiement.

### Exceptions

| Situation | Traitement |
|---|---|
| Champ obligatoire manquant | Validation inline, le bouton suivant est désactivé |
| Format téléphone invalide | Message d'erreur sous le champ |
| Selfie non capturé | Blocage de la navigation vers l'étape suivante |
| Upload KYC échoué | Message d'erreur, possibilité de réessayer |
| Double souscription détectée (même CNI en `pending`) | Alerte avec la référence existante |
| Timeout paiement (> 15 min) | Statut `failed`, message explicatif |

---

## UC02 — Souscrire à la carte Promote (canal agent)

| Champ | Valeur |
|---|---|
| Identifiant | UC02 |
| Nom | Souscription assistée par agent |
| Acteur principal | Agent |
| Pré-conditions | Agent authentifié (rôle `AGENT`) |
| Post-conditions | Souscription créée avec l'identifiant de l'agent, paiement initié |

### Scénario nominal

1. L'agent se connecte au portail et accède à la page de souscription.
2. Il suit le même formulaire en 5 étapes que la souscription publique, en renseignant les données du client en face de lui.
3. À l'étape 4, il peut renseigner le numéro de téléphone du référent commercial (collègue ayant apporté le client). Le système résout automatiquement le nom du référent.
4. À la confirmation, le système crée la souscription et l'associe automatiquement à l'identifiant de l'agent (`agentId`).
5. L'agent reçoit la référence à communiquer au client.
6. L'agent peut partager le QR code du dossier avec le client (pour suivi futur).

### Scénarios alternatifs

**A1 — Client avec reçu SARA pré-existant**
L'agent upload le reçu SARA du client. Les données sont extraites par OCR et pré-remplies.

### Règles spécifiques

- L'identifiant de l'agent est injecté côté backend à partir du JWT ; il ne peut pas être falsifié côté client.
- Si le numéro de référent correspond à un agent enregistré, la vente est créditée à ce référent dans son tableau de bord.

---

## UC03 — Recharger une carte Promote

| Champ | Valeur |
|---|---|
| Identifiant | UC03 |
| Nom | Recharge carte Promote |
| Acteur principal | Client (détenteur de carte) |
| Pré-conditions | Le client possède une carte Promote (PAN connu) |
| Post-conditions | Demande de recharge créée, paiement initié, caissier notifié pour crédit |

### Scénario nominal

1. Le client accède à la page de recharge (URL publique).
2. Il saisit : prénom, nom, téléphone, PAN de la carte (4 premiers + 4 derniers chiffres), montant désiré, méthode de paiement.
3. Le système vérifie que le montant respecte les bornes configurées (`min`/`max`).
4. Le client soumet. Le système crée la demande de recharge (`RC-XXXXXX`), déclenche le paiement.
5. Le client valide l'invite USSD sur son téléphone.
6. La recharge passe en statut `payée en attente de crédit`.
7. Un caissier consulte la liste des recharges en attente et effectue le crédit réel sur la carte (fulfillment).
8. La recharge est marquée `fulfilled`.

### Scénarios alternatifs

**A1 — Paiement espèces ou SARA** : même traitement qu'en UC01.

**A2 — Montant hors bornes** : message d'erreur avec les limites affichées.

---

## UC04 — S'authentifier (staff)

| Champ | Valeur |
|---|---|
| Identifiant | UC04 |
| Nom | Authentification staff |
| Acteur principal | Tout utilisateur staff |
| Pré-conditions | Compte utilisateur actif créé par l'administrateur |
| Post-conditions | JWT émis, utilisateur redirigé vers son tableau de bord |

### Scénario nominal (email + mot de passe)

1. L'utilisateur accède à la page de connexion.
2. Il saisit son adresse e-mail et son mot de passe.
3. Le système valide les credentials. En cas de succès, il émet un JWT (durée 24h) et redirige vers le tableau de bord correspondant au rôle.

### Scénario alternatif — Connexion mobile (téléphone + PIN)

1. L'utilisateur sélectionne l'option connexion mobile.
2. Il saisit son numéro de téléphone et son PIN à 4 chiffres.
3. En cas de succès, même comportement qu'au scénario nominal.

### Scénario alternatif — Premier login (changement de mot de passe obligatoire)

1. L'utilisateur se connecte pour la première fois avec les credentials initiaux fournis par l'admin.
2. Le système le redirige vers l'écran de changement de mot de passe obligatoire.
3. L'utilisateur saisit un nouveau mot de passe. Le système l'applique et redirige vers le tableau de bord.

### Exceptions

| Situation | Traitement |
|---|---|
| Credentials incorrects | Message générique (sans distinguer e-mail ou mot de passe) |
| Compte désactivé | Message spécifique : compte désactivé |
| Champs vides | Validation inline |

---

## UC05 — Valider un paiement espèces

| Champ | Valeur |
|---|---|
| Identifiant | UC05 |
| Nom | Validation paiement espèces |
| Acteur principal | Caissier |
| Pré-conditions | Caissier authentifié (rôle `CASHIER`), souscription ou recharge en attente avec méthode `cash` |
| Post-conditions | Paiement validé (`paid`) ou rejeté (`failed`) |

### Scénario nominal

1. Le caissier consulte sa liste de paiements en attente de validation.
2. Il sélectionne un dossier (souscription ou recharge).
3. Il vérifie les informations du client et le montant à encaisser.
4. Il collecte physiquement les espèces.
5. Il saisit une référence de reçu papier dans le portail.
6. Il confirme (`validate`). Le système passe le statut à `paid`, enregistre l'identité du caissier, la date et la référence.

### Scénario alternatif — Rejet

1. Le caissier ne peut pas encaisser (client absent, fonds insuffisants).
2. Il sélectionne `reject` et saisit un motif.
3. Le statut passe à `failed`.

---

## UC06 — Valider un reçu de virement SARA

| Champ | Valeur |
|---|---|
| Identifiant | UC06 |
| Nom | Validation reçu SARA |
| Acteur principal | Agent ou Caissier |
| Pré-conditions | Utilisateur authentifié avec rôle `AGENT` ou `CASHIER`, souscription/recharge avec statut `sara_pending` |
| Post-conditions | Paiement validé (`paid`) ou rejeté (`failed`) |

### Scénario nominal

1. L'utilisateur accède au dossier en statut `sara_pending`.
2. Il consulte le reçu SARA scanné (image ou PDF) et les données extraites par OCR (référence, montant, téléphone payeur, date).
3. Il compare avec le montant attendu de la souscription.
4. Il confirme (`validate`) si les données correspondent. Le statut passe à `paid`.

### Scénario alternatif — Données OCR incorrectes

1. L'OCR a extrait des données erronées.
2. L'utilisateur peut corriger manuellement les champs avant de valider.

### Scénario alternatif — Rejet

Le reçu est frauduleux ou le montant ne correspond pas. L'utilisateur rejette avec un motif.

---

## UC07 — Imprimer et remettre une carte

| Champ | Valeur |
|---|---|
| Identifiant | UC07 |
| Nom | Impression et remise de la carte physique |
| Acteur principal | Agent point d'impression |
| Pré-conditions | Utilisateur authentifié (rôle `PRINT_AGENT`), souscription avec statut `paid` |
| Post-conditions | Carte imprimée et remise au client, dossier marqué `printed` |

### Scénario nominal

1. L'agent point d'impression recherche le dossier (par référence, nom ou téléphone).
2. Il ouvre le dossier et consulte les documents KYC : selfie, CNI recto, CNI verso.
3. Il vérifie que le selfie correspond à la personne en face de lui.
4. Il valide le selfie (`selfieVerified = true`).
5. Il imprime physiquement la carte sur la machine d'impression.
6. Il saisit le numéro de la carte remise (4 premiers + 4 derniers chiffres).
7. Il marque le dossier comme imprimé (`printed`). Le système enregistre son identité et l'horodatage.
8. La carte est remise au client.

### Scénarios alternatifs

**A1 — Photo KYC défectueuse**
- Le selfie ou la CNI est floue ou illisible.
- L'agent peut uploader un nouveau document (`PATCH /{ref}/photo`) sans modifier le reste du dossier.

**A2 — Selfie rejeté**
- L'agent constate que le selfie ne correspond pas à la personne présente.
- Il rejette le selfie et documente le motif. La remise est suspendue.

---

## UC08 — Récupérer une souscription QR

| Champ | Valeur |
|---|---|
| Identifiant | UC08 |
| Nom | Réclamation d'une souscription self-service |
| Acteur principal | Agent |
| Pré-conditions | Agent authentifié (rôle `AGENT`), souscription créée via QR code non encore rattachée à un agent |
| Post-conditions | Souscription rattachée à l'agent (créditée dans ses statistiques) |

### Scénario nominal

1. Un client a souscrit via le QR code de l'agence (sans être assisté par un agent).
2. L'agent scanne le QR code de la confirmation du client, ou saisit la référence.
3. Le système retrouve la souscription et l'associe à l'agent (`agentId`).
4. La souscription apparaît dans le tableau de bord de l'agent.

### Règle

Une souscription déjà rattachée à un agent ne peut pas être réclamée à nouveau.

---

## UC09 — Saisir une collecte terrain

| Champ | Valeur |
|---|---|
| Identifiant | UC09 |
| Nom | Saisie collecte terrain |
| Acteur principal | Collecteur |
| Pré-conditions | Collecteur authentifié (rôle `COLLECTEUR`) |
| Post-conditions | Collecte enregistrée et associée au collecteur |

### Scénario nominal

1. Le collecteur accède à son interface de collecte.
2. Il sélectionne le produit vendu :
   - `compte_ouvert` : saisit le numéro de compte
   - `carte_bancaire` : saisit le numéro masqué de la carte et le type
   - `sara_money` : saisit les informations du client
   - `e_first` : saisit les informations du client
3. Il renseigne le nom et le numéro de téléphone du client.
4. Il soumet. Le système génère une référence `COL-XXXXXX` et enregistre la collecte avec son identifiant.
5. La collecte apparaît dans son historique.

---

## UC10 — Consulter les statistiques de collecte (superviseur)

| Champ | Valeur |
|---|---|
| Identifiant | UC10 |
| Nom | Consultation statistiques collecte |
| Acteur principal | Superviseur |
| Pré-conditions | Superviseur authentifié (rôle `SUPERVISEUR`) |
| Post-conditions | — (lecture seule) |

### Scénario nominal

1. Le superviseur accède à son tableau de bord de collecte.
2. Il filtre les données par : période (dates de début/fin), collecteur, type de produit.
3. Le système affiche les statistiques agrégées : nombre de collectes par produit, par collecteur, totaux.
4. Le superviseur peut exporter les données filtrées au format Excel.

---

## UC11 — Administrer les utilisateurs

| Champ | Valeur |
|---|---|
| Identifiant | UC11 |
| Nom | Gestion des utilisateurs staff |
| Acteur principal | Administrateur |
| Pré-conditions | Administrateur authentifié (rôle `ADMIN`) |
| Post-conditions | Utilisateur créé, modifié, activé/désactivé ou supprimé |

### Scénarios

**Créer un utilisateur**
1. L'admin ouvre le formulaire de création utilisateur.
2. Il saisit : nom, e-mail, téléphone, agence, rôle(s), mot de passe initial.
3. Il soumet. Le système crée le compte. Le nouvel utilisateur devra changer son mot de passe à la première connexion.

**Modifier un utilisateur**
1. L'admin sélectionne un utilisateur dans la liste.
2. Il modifie les champs souhaités (nom, rôles, agence, statut actif/inactif).
3. Il sauvegarde.

**Réinitialiser les credentials**
1. L'admin sélectionne un utilisateur et choisit la réinitialisation.
2. Il définit un nouveau mot de passe temporaire ou génère un PIN.
3. Les nouveaux credentials sont communiqués à l'utilisateur hors bande.

**Import en masse**
1. L'admin téléverse un fichier CSV/Excel contenant la liste des utilisateurs.
2. Le système importe chaque ligne, en ignorant les doublons (e-mail déjà existant).

---

## UC12 — Configurer les tarifs

| Champ | Valeur |
|---|---|
| Identifiant | UC12 |
| Nom | Configuration tarifaire |
| Acteur principal | Administrateur |
| Pré-conditions | Administrateur authentifié |
| Post-conditions | Nouveaux tarifs appliqués immédiatement à toutes les nouvelles souscriptions |

### Scénario nominal

1. L'admin accède à la section Configuration.
2. Il modifie les paramètres : prix de la carte, frais de service, frais de transport, bornes de recharge (min/max).
3. Il sauvegarde. Les nouveaux montants s'appliquent immédiatement pour les nouvelles souscriptions/recharges.

**Note :** les souscriptions et recharges existantes conservent les montants saisis au moment de leur création.

---

## UC13 — Réconcilier les paiements (admin)

| Champ | Valeur |
|---|---|
| Identifiant | UC13 |
| Nom | Réconciliation manuelle des paiements |
| Acteur principal | Administrateur |
| Pré-conditions | Administrateur authentifié, paiements en statut `pending` à réconcilier |
| Post-conditions | Statuts mis à jour selon réponse TrustPayWay |

### Scénario nominal

1. L'admin accède au panneau de gestion des paiements.
2. Il déclenche une réconciliation manuelle en définissant la fenêtre temporelle (ex. dernières 24h).
3. Le système interroge TrustPayWay pour chaque paiement `pending` dans la fenêtre.
4. Les paiements confirmés passent à `paid` ; les paiements échoués passent à `failed`.
5. Le système retourne un rapport : `{ scanned, updated, unchanged }`.

### Réconciliation automatique (UC13b)

- Déclenchée automatiquement toutes les 5 minutes (configurable via `PAYMENT_RECONCILE`).
- Parcourt les paiements `pending` de moins d'une heure.
- Expire les paiements `pending` de plus de 15 minutes sans réponse.

---

## UC14 — Consulter le journal d'audit

| Champ | Valeur |
|---|---|
| Identifiant | UC14 |
| Nom | Consultation du journal d'audit |
| Acteur principal | Administrateur |
| Pré-conditions | Administrateur authentifié |
| Post-conditions | — (lecture seule) |

### Scénario nominal

1. L'admin accède à la section Audit.
2. Il filtre par : période, utilisateur, type d'action, entité.
3. Le système affiche la liste des actions enregistrées avec : acteur, action, entité, référence, adresse IP, horodatage.
4. Il peut consulter le journal de connexions : succès et échecs par IP.

---

## UC15 — Exporter les données

| Champ | Valeur |
|---|---|
| Identifiant | UC15 |
| Nom | Export Excel des données |
| Acteur principal | Administrateur, Superviseur |
| Pré-conditions | Utilisateur authentifié avec droits d'export |
| Post-conditions | Fichier Excel téléchargé sur le poste de l'utilisateur |

### Scénario nominal

1. L'utilisateur applique les filtres souhaités (dates, statuts, agence…).
2. Il clique sur « Exporter Excel ».
3. Le système génère le fichier (format `.xlsx` via SheetJS) et le propose au téléchargement.
4. Les données sensibles (ex. PAN) sont exportées sous forme masquée.

---

## UC16 — Réinitialiser son mot de passe

| Champ | Valeur |
|---|---|
| Identifiant | UC16 |
| Nom | Réinitialisation de mot de passe |
| Acteur principal | Tout utilisateur staff |
| Pré-conditions | Compte avec adresse e-mail valide |
| Post-conditions | Nouveau mot de passe défini, accès rétabli |

### Scénario nominal

1. L'utilisateur clique sur « Mot de passe oublié » sur la page de connexion.
2. Il saisit son adresse e-mail.
3. Le système envoie un lien de réinitialisation (SMTP Office 365).
4. L'utilisateur clique sur le lien, saisit un nouveau mot de passe.
5. Le système applique le nouveau mot de passe. L'utilisateur peut se connecter.

---

## UC17 — Fulfiller une recharge

| Champ | Valeur |
|---|---|
| Identifiant | UC17 |
| Nom | Crédit effectif de la recharge sur la carte |
| Acteur principal | Caissier |
| Pré-conditions | Caissier authentifié (rôle `CASHIER`), recharge avec statut `paid` non encore créditée |
| Post-conditions | Recharge marquée `fulfilled`, carte créditée physiquement |

### Scénario nominal

1. Le caissier consulte la liste des recharges en attente de crédit (`pending-fulfillment`).
2. Il sélectionne une recharge.
3. Il effectue le crédit réel sur la carte (opération externe au portail — système carte bancaire).
4. Il confirme le crédit dans le portail : `PATCH /{ref}/fulfill`.
5. Le système enregistre l'identité du caissier, la date du crédit et marque la recharge `fulfilled`.

---

## UC18 — Consulter la carte de géolocalisation des agents

| Champ | Valeur |
|---|---|
| Identifiant | UC18 |
| Nom | Carte de géolocalisation des agents |
| Acteur principal | Administrateur |
| Pré-conditions | Administrateur authentifié, au moins un agent connecté avec GPS actif |
| Post-conditions | — (lecture seule) |

### Scénario nominal

1. L'admin accède à la carte (page `admin-map`).
2. La carte affiche les dernières positions connues de tous les agents actifs (Leaflet / OpenStreetMap).
3. Chaque point affiche : nom de l'agent, agence, heure de la dernière position.
4. L'admin peut filtrer par agence ou région.

### Collecte de position (côté agent)

- Dès la connexion, le navigateur demande l'accès à la géolocalisation GPS.
- Si accordée, la position est envoyée au backend (`POST /api/auth/location`) à intervalles réguliers.
- La position mise à jour est visible quasi en temps réel sur la carte admin.

---

*Document rédigé en juin 2026 — version 1.0*
