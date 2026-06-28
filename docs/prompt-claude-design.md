# Prompt EXHAUSTIF — Reproduction du portail Afriland dans Claude Design (React + GSAP)

> À copier-coller dans Claude (mode Design / artifact). Ce prompt génère un **prototype React** complet (données simulées) reproduisant **fidèlement et dans le détail** tous les parcours et fonctionnalités du portail Afriland, en les **généralisant à tous les produits bancaires** (cartes Visa, Mastercard, prépayée, virtuelle + comptes + services) et en proposant une **meilleure UX** avec des **animations GSAP** ciblées.
>
> Le prompt est long parce que la demande est de **tout reproduire dans le moindre détail**. Tu peux le livrer en plusieurs artifacts si nécessaire (ordre de construction donné à la fin).

---

## PROMPT À UTILISER

Tu es un designer-développeur senior. Construis un **prototype web React** haut de gamme pour **Afriland First Bank** : un portail interne de **commercialisation de produits bancaires** (cartes Visa, Mastercard, prépayées, virtuelles ; comptes ; services) par un réseau commercial hiérarchisé, avec KYC, paiement Mobile Money, impression de carte, caisse, collecte terrain, commissions, statistiques et administration. C'est la refonte UX d'un portail réel existant : reproduis **toutes** les fonctionnalités décrites ci-dessous, en améliorant l'ergonomie et la fluidité.

### 0. Contraintes techniques

- **React** (function components + hooks), structure claire en composants. **TypeScript** si possible.
- **GSAP** (`gsap`, `useGSAP`, `ScrollTrigger`/`Flip` si utile) pour les animations — uniquement aux emplacements listés en §3.
- **Tout est simulé en mémoire** : aucun backend. Mock data riche (§16), latences simulées par `setTimeout` (paiement, chargements, OCR, polling), pas d'appels réseau réels.
- **Routing simulé** par état (`view` + `role`). La navigation et les écrans visibles **dépendent du rôle connecté**.
- **Barre de démo** fixe en haut : « Se connecter en tant que… » avec un sélecteur de rôle (Admin, Manager, Superviseur, Chef d'équipe, Commercial, Caissier, Point d'impression, Public) qui recharge instantanément l'app dans ce rôle pour explorer tous les parcours sans authentification réelle.
- **Bilingue FR/EN** : un bouton globe dans la barre du haut bascule la langue ; **français par défaut**. Centralise les libellés dans un dictionnaire `t(key)` (au minimum les titres, boutons, statuts, labels de champs).
- **Devise** : FCFA (XAF), format `1 234 500 FCFA`.
- **Responsive** : desktop d'abord (back-office) mais le tunnel de souscription/recharge doit être impeccable sur mobile (≥ 375 px).

### 1. Identité visuelle & design system

- **Marque Afriland** : **vert profond** primaire (`#0E7C43` / `#0B6B3A`), **or/gold** accent (`#C9A227` / `#E0B73A`), fonds clairs neutres, texte anthracite. Surface secondaire `surface-2` pour les en-têtes de tableaux.
- **Style** : cards arrondies (12–16 px), ombres douces, beaucoup d'espace, typo Inter/Manrope, iconographie fine **lucide-react**.
- **Couleurs de paiement** (réutilise-les partout) : Orange Money `#FF7900` (texte blanc), MTN MoMo `#FFCB05` (texte sombre), SARA Money blanc/`#1E3A8A` (+ logo), Espèces `#0E7A45` (symbole ₣).
- **Composants réutilisables** à créer : `Button` (primary/outline/ghost/danger), `Card`, `KpiCard` (valeur + label + couleur + variation), `Badge`/`StatusBadge`, `Modal`, `Table`, `Stepper`/`Steps`, `Tabs`, `Sidebar`, `Topbar`, `Avatar` (initiales + pastille admin), `Field` (label + input + hint + erreur), `PhoneField` (indicatif pays + format E.164), `TileChoice` (tuile radio visuelle), `EmptyState`, `Spinner`, `Toast`, `QrCode`, `PhotoCapture` (caméra simulée), `ReceiptUpload`, `NotifBell`.
- **Accessibilité** : focus clavier visible, contrastes suffisants, états désactivés clairs avec tooltip explicatif.

### 2. Statuts — palette et libellés (à respecter partout)

Affiche les statuts via un `StatusBadge` cohérent :

| Statut interne | Libellé FR | Couleur |
|---|---|---|
| `pending` | En attente | ambre/or |
| `cash` | À payer en espèces | ambre/or |
| `sara_pending` | SARA — à valider | ambre/or |
| `paid` | Payé | vert |
| `paid_done` / `fulfilled` | Crédité / Réglé | vert |
| `printed` | Imprimée / Remise | bleu/violet |
| `to_fulfill` | Payée — à créditer | bleu |
| `failed` | Échec | rouge |
| `expired` | Expiré (délai) | rouge atténué |

### 3. Animations GSAP — emplacements précis (et nulle part ailleurs)

1. **Connexion / splash** : logo + champs en `stagger` (fade + slide-up), léger `back.out`.
2. **Tableaux de bord** : KPI cards en `stagger` à l'arrivée ; **valeurs chiffrées en count-up** ; barres de graphiques qui montent de 0 ; tendance 14 jours animée.
3. **Tunnel de souscription / recharge** : transitions d'étapes du Stepper (slide horizontal + fade) ; barre de progression qui se remplit en `tween` ; à l'étape succès, **coche SVG dessinée** (draw) + halo/confettis discrets.
4. **Capture KYC** : cadre de détection qui « respire » (pulse) ; passage capture → vignette validée via **GSAP Flip**.
5. **Sidebar** : ouverture mobile en slide ; **indicateur d'onglet actif qui glisse**.
6. **Listes/tableaux** : apparition des lignes en `stagger` léger au chargement et au filtrage.
7. **Modales** : scale + fade ; overlay en fade.
8. **Paiement Mobile Money** : **anneau de progression** animé + pulsation pendant l'attente ; transition animée vers payé (vert) ou échec (rouge).
9. **Toasts / notifications** : slide-in coin + auto-dismiss ; **badge non-lus** qui pulse à l'arrivée d'une notif.

Durées 0,2–0,6 s, easing naturel, 60 fps, jamais d'animation gratuite.

### 4. Rôles, hiérarchie et permissions (RBAC)

7 rôles + une **hiérarchie arborescente** (`parentId`). Un compte peut **cumuler plusieurs rôles** (ex. Commercial + Caissier) ; ses permissions = union.

| Rôle | Peut faire | Écran d'atterrissage | Périmètre données |
|---|---|---|---|
| **Admin** | Tout créer/gérer (utilisateurs, rôles, profils, produits, config, agences, audit). | `/admin` | Global |
| **Manager** | Crée **produits/promotions/commissions**, crée **Superviseurs**, associe **Chefs d'équipe** et **Commerciaux**. Vue commerciale globale. | `/manager` | Global |
| **Superviseur** | Pilote son sous-arbre (lecture). **Ne peut PAS créer de commerciaux** (peut gérer des collecteurs uniquement). | `/supervision` | Sous-arbre |
| **Chef d'équipe** | Voit l'activité des **commerciaux qui lui sont affectés**, roster, messagerie. | `/equipe` (team-stats) | Son équipe |
| **Commercial** (Agent/Collecteur) | Réalise souscriptions, recharges, collectes ; suit **ses propres stats et commissions**. | `/commercial` | Ses ventes (+ recommandées) |
| **Caissier** | Valide encaissements espèces/GAB, crédite les recharges. | `/caisse` | File caisse |
| **Point d'impression** | Consulte KYC, vérifie identité, imprime, saisit PAN, remet la carte. | `/impression` | File impression |

**Règles à matérialiser dans l'UI :**
- **Qui crée qui** : Admin → tous ; Manager → Superviseurs/Chefs/Commerciaux ; **Superviseur → pas de bouton « créer commercial »** (absent/désactivé + tooltip « Réservé au Manager »).
- **Scoping visible** : Chef d'équipe = sa seule équipe ; Superviseur = son sous-arbre ; Admin/Manager = global. Les chiffres, listes et rosters changent quand on bascule de rôle.
- **Permissions fines** (modules × actions) pour l'écran Habilitations admin : modules `Souscriptions, Recharges, Collectes, Produits, Promotions, Commissions, Statistiques, Messagerie, Utilisateurs, Configuration` ; actions selon module : `READ, WRITE, VALIDATE, PRINT, EXPORT`.

### 5. Catalogue produits — généralisé (cœur de la refonte)

Le portail commercialise **toute la gamme bancaire**, pas une seule carte. Modélise un **catalogue générique** géré par le Manager. Chaque **produit** porte : `code` unique, `label`, `description`, `groupe/catégorie`, `type` (`CARTE_PHYSIQUE | CARTE_VIRTUELLE | COMPTE | SERVICE`), `prix de base` (XAF), `actif`, `builtin` (non supprimable, éditable seulement). Les **cartes** ont un détail de **composants tarifaires** (frais d'émission, recharge initiale, transport/livraison, pass premium) et peuvent avoir des **variantes** (prépayée vs bancaire). **Promotions** par produit : `PRIX` fixe ou `POURCENTAGE` (0–100), fenêtre de dates optionnelle → **prix effectif** (prix barré + badge « Promo » si une promo est active aujourd'hui ; borné à ≥ 0).

Produits de démo (au minimum) : **Visa Classic / Gold / Premium**, **Mastercard Standard / World**, **Carte prépayée (Promote)**, **Carte virtuelle**, **Compte courant**, **Compte épargne**, **e-First (compte digital)**, **SARA Money**, **Pass Premium**. Catégories : Cartes / Comptes / Services.

Le **tunnel de souscription** consomme ce catalogue : on **choisit d'abord le produit**, puis le parcours s'adapte à son type (une carte physique → KYC + impression ; une carte virtuelle → pas d'impression physique ; un compte/service → collecte simplifiée).

### 6. Layout & navigation

- **Topbar** : logo Afriland cliquable (→ accueil/landing selon rôle), nom + rôle, **cloche de notifications** (badge non-lus), **bouton globe FR/EN**, **icône cadenas → changer mot de passe** (staff), menu profil (déconnexion). Slots gauche/droite.
- **Sidebar par rôle** : seules les sections autorisées apparaissent ; onglet actif surligné avec indicateur animé ; repliable sur mobile (hamburger + slide).
- **Vues publiques** (accueil, souscription self, recharge, QR) : pleine largeur sans sidebar.

### 7. Authentification & session

- **Connexion** (`/login`) : **email + mot de passe** (masquable), bouton « Se connecter », lien **« Mot de passe oublié ? »** (ouvre un champ email + confirmation « Si ce compte existe, un email a été envoyé »). Gestion **session expirée** (bandeau « Session expirée, reconnectez-vous »). Erreurs : identifiants invalides, compte désactivé.
- **Mode collecteur** (présent mais masqué par défaut) : **téléphone (9 chiffres `6XXXXXXXX`) + PIN 4 chiffres**.
- **Redirection post-connexion** vers l'écran d'atterrissage du rôle (cf. §4). Si l'utilisateur cumule des rôles, priorité Admin > Manager > Superviseur > Chef d'équipe > Commercial > Caissier > Impression.
- **Changement de mot de passe** (`/change-password`) : **forcé à la première connexion** (`mustChangePassword`) ou self-service via le cadenas. Champs : mot de passe actuel + nouveau + confirmation. **Validations (miroir front/back)** : ≥ 8 caractères, au moins 1 lettre ET 1 chiffre, confirmation identique, différent de l'ancien. Messages d'erreur dédiés.
- **Géolocalisation** : best-effort (capture GPS simulée après connexion et à la souscription, jamais bloquante).

### 8. Notifications in-app

- **Cloche** dans la topbar avec **badge rouge** du nombre de non-lus (« 99+ » au-delà). Animation de pulse à l'arrivée.
- **Dropdown** (≈ 340 px) : titre « Notifications » + bouton « Tout lire » ; liste scrollable d'items (point bleu si non-lu, **titre** + **corps** optionnel tronqué 2 lignes, émetteur, date relative « il y a 2 h », vignette si image). Clic item → **modale détail** (titre, corps `pre-wrap`, image zoomable) et marque comme lu.
- Source des notifications : **messages d'équipe** (Chef d'équipe/Superviseur/Manager/Admin) et **compositeur de notifications** admin. Simule un **polling** (rafraîchissement périodique) du compteur.

### 9. Parcours de souscription — assistant détaillé (écran phare)

Disponible en **self-service public (QR/lien)** et en **mode assisté (commercial)**. Stepper à étapes (slide animé). **Brouillon persistant** (l'assistant retient la saisie si on revient). Le **mode self** commence par un écran d'accueil/offre ; le **mode assisté** démarre direct à l'étape Identité.

**Écran d'accueil public** (`/start`) : choix « **Acheter / souscrire un produit** » (→ tunnel) ou « **Recharger une carte** » (→ recharge), + lien discret « Connexion staff ». Écran **QR** (`/qr`) : grand QR encodant l'URL publique + bouton « Ouvrir ici ».

**Écran offre (self)** : badge espace client, titre de bienvenue, **récapitulatif de l'offre** (prix carte + recharge initiale + pass premium + total), checklist en 3 étapes (pièce d'identité, téléphone, retrait), bouton « Commencer ».

**Étape 0 — Produit** *(ajout de la refonte)* : galerie du catalogue filtrable par catégorie ; sélection met en avant le visuel produit (carte bancaire en dégradé vert/or avec puce pour les produits « carte »). Le type de produit choisi adapte les étapes suivantes.

**Étape 1 — Identité** (titre « Vos informations », sous-titre). Champs, validations et erreurs exactes :
- **Prénom*** (texte) — requis.
- **Nom*** (texte) — requis.
- **Sexe*** (select : M / F) — requis.
- **Type de pièce** (select : CNI / Passeport / Récépissé ; défaut CNI) — change les libellés suivants.
- **Numéro de pièce*** : CNI = alphanumérique majuscule `^[0-9A-Z]{6,}$` (« CNI invalide ») ; Passeport/Récépissé = `^[0-9A-Z-]{5,}$`. Cross-check OCR : si capture recto plus tard donne un nom/numéro différent → **avertissement non bloquant**.
- **NIU** (optionnel, alphanumérique) — Numéro d'Identification Unique.
- **Date d'expiration*** (saisie `jj/mm/aaaa` ou date-picker) : 8 chiffres, jour 1–31, mois 1–12, année 2024–2099, date **future** (sinon « pièce expirée »).
- **Date de naissance*** (uniquement si CNI ; `aaaa-mm-jj`) : date **passée**, année ≥ 1900. Sert de clé **anti-doublon** (prénom+nom+CNI+naissance).
- **Téléphone*** (champ international E.164, défaut Cameroun `+237`) — validé.
- **Email*** — `^\S+@\S+\.\S+$`.
- **Quartier*** et **Ville*** — requis.
- **Bloc parrain (optionnel)** : téléphone du parrain ; en self, **résolution asynchrone** → si le numéro correspond à un commercial, affiche son **nom + agence** (pastille verte) ; sinon « parrain inconnu ». La vente sera créditée au parrain.

**Étape 2 — Documents (KYC)** : capture **pièce recto** et **pièce verso** (verso masqué si Passeport) via `PhotoCapture` (caméra arrière, **auto-capture**, cadre 280×180 qui pulse, conseils : « bien à plat / bonne lumière / éviter les reflets / bien cadrée »). Vignette validée (GSAP Flip), bouton **Reprendre**. Affiche l'avertissement OCR si désaccord nom/numéro.

**Étape 3 — Selfie** : capture **caméra frontale**, cadre **rond** 200×200, **détection de visage simulée** avec messages d'état : `recherche…`, `aucun visage`, `plusieurs visages`, `trop loin`, `trop près`, `décentré`, `regardez droit`, `inclinaison`, `trop sombre`, `flou`, `parfait — ne bougez plus` puis **auto-capture** après ~0,7 s stable. Bouton basculer caméra, Reprendre.

**Étape 4 — Paiement** :
- **Livraison/retrait** (si plusieurs modes) : tuiles **Promote (bureau)** / **En agence** (→ select d'agence `Nom — Ville`) / **Domicile** (ajoute frais de transport). Erreur si agence non choisie.
- **Méthode** : 4 tuiles **Orange Money / MTN MoMo / SARA Money / Espèces** (couleurs §1).
- **Si OM/MTN** : champ **numéro Mobile Money** (pré-rempli avec le téléphone KYC), **double validation** E.164 + **opérateur camerounais** (MTN `^6(7\d{7}|5[0-4]\d{6}|8[0-4]\d{6})$`, OM `^6(9\d{7}|5[5-9]\d{6}|8[5-9]\d{6})$`) avec erreurs « ce numéro n'est pas MTN/OM ».
- **Si SARA** : encart d'instructions numérotées (1–5), **numéro de compte SARA** à créditer, **upload du reçu** (image/PDF) → **extraction OCR simulée** (référence, téléphone payeur, montant) affichée puis **confirmée/corrigée** par l'utilisateur (champ référence éditable requis).
- **Si Espèces** : rien à saisir (sera validé en caisse).

**Étape 5 — Récapitulatif** : visuel de carte au nom du client + 2 cards : (1) **données personnelles** (client, sexe, pièce, NIU, validité, téléphone, email, quartier, ville, méthode de paiement, n° MoMo, livraison, parrain) ; (2) **résumé tarifaire** (type de carte, prix produit, recharge initiale, pass premium, transport si domicile, **Total** mis en avant). Bouton de confirmation contextualisé : **« Payer maintenant »** (MoMo) / **« Confirmer (espèces) »** / **« Confirmer (SARA) »**, avec spinner.

**Traitement du paiement** (MoMo) :
1. **Envoi** (~1,3 s) : « Envoi de la demande… », logo opérateur animé.
2. **Attente** : « Validez sur votre téléphone », instructions USSD, numéro en gras, astuce « peut prendre jusqu'à 2 min », référence affichée. **Anneau de progression GSAP**.
3. **Polling simulé** : ~56 tentatives, backoff (3 s ×10, puis 5 s ×14, puis 10 s), ~7 min max.
4. **Issue** : **Payé** → écran succès ; **Échec** → écran échec ; **épuisement** → écran **« attente prolongée »** avec « J'ai payé / Rafraîchir » et « Continuer à attendre ».
5. **Boutons de simulation de démo** (« Valider » / « Échouer ») pour piloter l'issue dans le prototype.

**Écran Échec** : icône d'alerte rouge animée + message selon la raison détectée — **solde insuffisant** / **délai expiré** / **rejet** — message détaillé de l'agrégateur, référence conservée. Boutons **Réessayer** / **Accueil**.

**Écran Succès / Référence** (aussi pour Espèces et SARA, sans polling) : coche verte animée (ou pictogramme ambre « en attente » pour cash/SARA), **référence `PRM-XXXX`** copiable, **QR code** (deep link vers le point d'impression `/impression?ref=…`), encart retrait (« préparez votre pièce »), résumé paiement (badge statut + montant), **« Télécharger le reçu » (PNG)** généré côté client (réf + QR), **« Nouvelle souscription »**, **« Accueil »**, et pour le commercial **« Aller au point d'impression »**.

### 10. Parcours de recharge (`/recharge`)

Écran d'accueil (titre, description, checklist 3 étapes) puis **formulaire** : Prénom*, Nom*, Téléphone* (E.164), **Numéro de carte (PAN)** en **double saisie 4 + 4** avec **auto-avance** et affichage masqué `XXXX **** **** XXXX`, **Montant** (numérique, **bornes min/max** configurables, ex. 500 – 1 000 000, message « entre X et Y »), puis **méthode de paiement** (mêmes 4 options + numéro MoMo / reçu SARA identiques au tunnel). Confirmation contextuelle. Mêmes états paiement (envoi/attente/échec/succès). Écran succès affiche le **PAN masqué** et permet le **téléchargement du reçu**. Côté caisse, une recharge payée passe en file **« à créditer »**.

### 11. Espace Commercial (`/commercial`)

- **En-tête** : avatar + « Bonjour, [Nom] » + agence.
- **Actions** : **Nouvelle souscription**, **Nouvelle recharge**, **Mes collectes** (si collecteur), **Réclamer une vente (QR)**, **Vérifier une référence**.
- **KPI personnels** (count-up) : Mes souscriptions, Succès (payées), En attente, Montant encaissé, **Mes commissions**.
- **« Mes ventes »** (live) : recherche avancée (réf, nom, NIU, réf SARA, téléphones), filtres **statut** + **méthode** + **dates**, **Export CSV** (colonnes complètes : Date, Référence, Nom, Sexe, CNI, Expiration, NIU, Téléphone, Email, Quartier, Région, Ville, Selfie?, CNI recto?, CNI verso?, Paiement, Téléphone paiement, Recommandé par, Téléphone parrain, Livraison, N° carte, PAN, Statut, Montant, Réf SARA), **lignes dépliables** (photos KYC + 30 champs de détail). Bouton « Effacer ».
- **Modale « Réclamer une vente »** : téléphone* + CNI* (≥ 6) + NIU (optionnel) → résultat « vente trouvée / assignée à votre portefeuille » ou erreurs « introuvable / déjà réclamée / non payée ».
- **Modale « Vérifier une référence »** : recherche dans toute la base (réf/nom/téléphone) → fiche(s) avec statut, montant, méthode, bouton **Télécharger reçu**.

### 12. Pilotage d'équipe — Chef d'équipe & Superviseur (`/equipe`)

- Bandeau de **périmètre** : « Mon équipe » (Chef d'équipe) / « Mon sous-arbre » / « Organisation commerciale » (Manager/Admin).
- **Filtre par produit** + bouton rafraîchir.
- **KPI agrégés** : Souscriptions, Collectes, **Commissions (XAF)**.
- **Tableau par membre** : Membre (nom + badge rôle), Souscriptions, Collectes, **Commissions** (classement).
- **Roster + messagerie** : liste à cocher des membres ; formulaire **Titre + Message** ; envoi à la sélection ou à **toute l'équipe** ; confirmation « Envoyé à N membre(s) ». Destinataires **bornés au sous-arbre** côté logique. **Aucun bouton de création de commercial pour le Superviseur.**

### 13. Console Manager (`/manager`)

Onglets **Catalogue**, **Commissions**, **Hiérarchie/Équipes**, **Statistiques**.

- **Catalogue** : formulaire **nouveau produit** (Libellé*, Code, Catégorie/Groupe, Type, Prix XAF) ; **liste de cartes-produits** (badge type, libellé/code, groupe, statut, **prix effectif vs base barré + badge Promo**, boutons Éditer/Supprimer si non-builtin). **Édition inline** : libellé, code (si non-builtin), groupe, prix, actif ; **composants tarifaires** (pour les cartes) ; **promotions** (liste avec badge actif/inactif, valeur % ou montant, dates, toggle, suppression + formulaire d'ajout : type PRIX/POURCENTAGE, valeur, début, fin). Erreur « ce code existe déjà ».
- **Commissions** : **règles** — formulaire (Portée `PRODUIT`/`GROUPE` + code ; Bénéficiaire `RÔLE`/`UTILISATEUR` + valeur ; Type `POURCENTAGE`/`FIXE` + valeur ; fenêtre de dates) ; tableau des règles (badge actif, portée → bénéficiaire, montant, toggle/suppression). **Journal des commissions générées** (`CommissionEntry`) : bénéficiaire, produit, référence de vente, montant, **statut PENDING/VALIDATED/PAID**, total. Règle de résolution affichée : `UTILISATEUR > RÔLE`, `PRODUIT > GROUPE`, plus récente gagne ; génération **idempotente** par `(typeVente, réfVente, bénéficiaire)`.
- **Hiérarchie/Équipes** : **organigramme visuel** (Admin/Manager → Superviseurs → Chefs d'équipe → Commerciaux) ; création de Superviseurs ; affectation de Chefs d'équipe et Commerciaux (drag/select de `parentId`). Le Manager crée des commerciaux ; le Superviseur non.
- **Statistiques** : lien/vue vers le pilotage d'équipe global.

### 14. Back-office Admin (`/admin`)

Sidebar à sections (toutes détaillées) ; onglets **Achat / Recharge** sur la vue d'ensemble.

- **Vue d'ensemble** :
  - **Filtres** Depuis / Jusqu'au (+ « Tout »).
  - **Bloc « Aujourd'hui »** (indépendant du filtre) : Cartes payées (vert), Cartes récupérées (primary), Encaissé (or), En attente validation (or).
  - **KPI globaux** : Cartes payées, Cartes récupérées, Montant encaissé, Total souscriptions, En attente, **Paiements échoués (cliquable → détail)**.
  - **Entonnoir Mobile Money** (badge live) : Total, **Taux de réussite %**, **Temps médian de confirmation (s)** ; pastilles Payé / Pending / Échoué technique ; **graphique tendance 14 jours** (barres empilées vert/rouge/or par jour, infobulle, légende) ; **répartition par réseau** (Orange / MTN / SARA / Espèces : payé/total · %) ; **catégories d'échec technique** (libellé, compteur, %, barre) + note d'avertissement + bouton Copier.
  - **Réconciliation par fenêtre horaire** : champ « Fenêtre (heures) » 1–168, bouton Actualiser, résultats (Scannés, Mises à jour, Inchangés, Erreurs) + **liste des changements** (réf : ancien → nouveau statut).
  - **Vérification live (streaming)** : « Régulariser tous les dossiers en attente/échoués » ; bouton Actualiser/Arrêter, compteur X/Y, KPI (Scannés, Mises à jour, Inchangés, Erreurs), **logs en direct défilants** (monospace, lignes colorées).
  - **Performances par agent** : liste paginée (avatar, nom, nb ventes, barre, agence + montant collecté).
- **Configuration** : Prix carte, Frais, Transport ; **Offre prépayée** (recharge initiale + pass premium + total) ; **Offre bancaire** (recharge initiale + pass premium + total) ; **bornes recharge** (min/max). Bouton Enregistrer (états Enregistrement… / Enregistré ✓).
- **Utilisateurs** : recherche + **filtre par rôle** + dates ; **Ajouter utilisateur** ; **Import en masse** (CSV/coller, template, aperçu avec statuts Nouveau/Doublon/Invalide, politique doublons Ignorer/Mettre à jour, résultat + téléchargement des identifiants générés) ; **compositeur de notifications** (chips destinataires par rôle, objet, message, image, Envoyer) ; **sélection multiple + assignation de rôle en masse + notifier** ; tableau (checkbox, avatar, nom+email, téléphone+agence, badges profils/rôles, état désactivé) ; **édition inline** (infos / rôles multi-select / profils / activer-désactiver / recréer / réinitialiser identifiants). Création : Nom*, Email*, Téléphone, Agence (si commercial), **Rôles multi-select**, **parent hiérarchique** ; affiche **mot de passe temporaire** + **PIN** (si collecteur). *Le Superviseur ne voit que la gestion des collecteurs.*
- **Agences** : **stats lieux de retrait** (Retrait en agence / Livraison Promote / Domicile, barres + %) avec filtres période ; **classement des agences** (rang, nom cliquable, barre, nb + %, **drill-down** : Client/Téléphone/Date/Statut) ; **import** d'agences ; **liste** (Nom, Ville, Actif, Éditer/Supprimer) + formulaire création (Nom*, Ville*, Actif).
- **Transactions** : tableau filtrable (dates, statut, méthode, recherche) — Date, Référence, Nom, Téléphone, NIU, Statut, Montant, Méthode, Livraison ; clic → **détail** (toutes les infos, photos, motif d'échec, actions).
- **Recharges** : KPI (Payées/Total/Montant) + tendance 14 j + par réseau ; tableau (Référence, Nom, **PAN masqué**, Montant, Statut, Méthode, Date).
- **Collectes** : stats (total, par produit, par commercial) ; tableau détaillé (Référence, Commercial, Produit, Client, Téléphone, N° compte, N° carte, Type carte, Date) ; **Export Excel** multi-feuilles.
- **Habilitations** : **matrice de permissions** (profils × modules × actions), profils builtin non supprimables, création/édition de profils, assignation aux utilisateurs.
- **Audit** : onglets **Connexions** (Date, Utilisateur, Rôle, Email, IP, User-Agent, Succès/Échec) et **Actions** (Date, Utilisateur, Action ex. `CREATE_USER`, Entité, Détails, IP) — filtrables.
- **Carte** : carte interactive (style Leaflet) avec marqueurs **clients** (GPS) et **agents** (position), popups au clic.

### 15. Écrans opérationnels

- **Caissier (`/caisse`)** — 4 modes : **Espèces**, **GAB/Virement** (champ référence GAB requis), **Recharges**, **Retraits agence**. KPI : mes validations / aujourd'hui / file d'attente (+ montants). Recherche → **fiche** (selfie, CNI recto/verso avec **Reprendre**, infos client, méthode, **montant à collecter** en ambre) → **Valider le paiement** / **Rejeter** (raison) → écran succès. Mode **Recharges** : file des payées non créditées (bandeau d'alerte), **Créditer la recharge** avec **upload de preuve obligatoire** (capture de l'écran de crédit) avant validation. Mode **Retraits agence** : clients ayant choisi le retrait en agence.
- **Point d'impression (`/impression`)** — KPI : imprimées / aujourd'hui / file. **Réconciliation de stock** (Cartes remises / Activées / En attente d'activation + tableau). Recherche → **fiche KYC** (selfie vérifié, CNI recto/verso avec Reprendre, infos, NIU éditable, méthode, livraison, parrain, montant à collecter si cash, reçu SARA si applicable). **Validation SARA** (afficher reçu, champs réf/payeur/montant pré-remplis OCR à confirmer, Valider/Rejeter). **Impression** (si payé ou cash) : **saisie N° de carte** (4+4 masqué, requis) + **PAN** optionnel (4+4 masqué) → **Imprimer** → succès. États bloqués si paiement non régularisé.
- **Supervision — Rapprochement journalier (`/supervision`)** : sélecteur de date (max aujourd'hui, raccourci « Aujourd'hui »), liens rapides. **Section Impression** (Total imprimé / En attente activation + tableau par imprimeur : Nom, Agence, Imprimées, Activées, En attente). **Section Encaissement** (Total encaissé / En attente + tableau par caissier : Nom, Agence, Nb dossiers, Montant).
- **Collecte (`/collecte`)** — commercial/collecteur : sélection **produit** (Compte ouvert / Carte bancaire / SARA Money / e-First — généralise aussi aux produits du catalogue), champs communs (Nom client*, **CNI** si compte/e-First, Téléphone*), spécifiques **carte bancaire** (N° carte 4+4, **Type de carte** : Fellow / Partner / Prépayée / Visa Classic / Visa Gold / Blanche…), Enregistrer/Annuler. **« Mes collectes »** : liste (nom + produit + tél + réf + date), Éditer/Supprimer, **Export XLSX**.

### 16. Données simulées attendues

Jeu de mock réaliste et cohérent avec le **scoping hiérarchique** :
- **Utilisateurs** : 1 Admin, 1 Manager, 2 Superviseurs, 3 Chefs d'équipe, 6–8 Commerciaux, 1 Caissier, 1 Point d'impression — reliés par `parentId` (organigramme cohérent), avec agence, téléphone, statut.
- **Catalogue** : ~10–12 produits sur les catégories Cartes/Comptes/Services, dont 1–2 **promotions actives** (prix effectif visible).
- **Ventes/souscriptions** : 30–50 avec statuts variés (pending/paid/cash/sara_pending/failed/printed), méthodes réparties (OM/MTN/SARA/Espèces), dates étalées sur ~14 jours, certaines **recommandées** (parrain).
- **Recharges** (~10), **collectes** (~15), **règles + entrées de commissions** (statuts variés), **notifications** (dont messages d'équipe), **logs d'audit** (connexions + actions).
- Les **KPI, graphiques, entonnoir, rosters et listes se calculent à partir de ces données et changent selon le rôle connecté** (un Chef d'équipe ne voit que ses commerciaux, etc.).

### 17. Exigences de qualité

- Cohérence visuelle totale ; **états vides** soignés ; **squelettes/loaders** pendant les latences simulées ; toasts de confirmation.
- **Scoping par rôle démontrable** en basculant via la barre de démo.
- **Catalogue multi-produits** au cœur de l'expérience (jamais une seule carte en dur).
- **Bascule FR/EN** fonctionnelle sur les libellés principaux.
- **Animations GSAP uniquement aux emplacements de §3**, fluides et discrètes.
- **PAN toujours masqué** `XXXX **** **** XXXX` (seuls 4+4 capturés).
- Code propre, composants nommés, commentaires sur les zones d'animation et de mock.

### 18. Ordre de construction (livre un prototype navigable de bout en bout)

1. Design system + barre de bascule de rôle + Topbar/Sidebar + i18n FR/EN + StatusBadge.
2. Auth (login, mot de passe oublié, changement forcé) + cloche de notifications.
3. Tableaux de bord par rôle (Commercial, Chef d'équipe/Superviseur, Manager, Admin) avec KPI count-up et graphiques.
4. **Tunnel de souscription** complet (produit → identité → KYC → selfie → paiement → récap → traitement → succès/échec) + **recharge**.
5. Console Manager (catalogue + commissions + hiérarchie).
6. Back-office Admin (vue d'ensemble + entonnoir + réconciliation + utilisateurs + agences + transactions + habilitations + audit + carte).
7. Écrans opérationnels (caisse, impression, supervision, collecte).

Soigne particulièrement le tunnel de souscription, l'entonnoir Mobile Money et le catalogue produits : ce sont les pièces maîtresses.

---

### Notes d'adaptation (hors prompt)

- Cible réelle : **front React + back Spring Boot** ; le prototype Claude Design simule l'API par des mocks, mais l'architecture des écrans/flux reste rebranchable sur l'API REST existante (`/api/subscriptions`, `/api/recharges`, `/api/collectes`, `/api/products`, `/api/commissions`, `/api/stats/*`, `/api/team`, `/api/users`, `/api/profiles`, `/api/notifications`, `/api/payment/*`, `/api/kyc/*`, `/api/audit/*`).
- **Généralisation produits** : Visa/Mastercard/prépayée/virtuelle + comptes + services, catalogue configurable (au-delà de la seule carte prépayée d'origine).
- **Hiérarchie** reproduite : Admin → Manager → Superviseur → Chef d'équipe → Commercial + rôles opérationnels Caissier & Point d'impression. Règle explicite : *le Superviseur ne crée pas de commerciaux ; le Manager oui.*
- Couvre **l'intégralité des fonctionnalités existantes** : KYC intelligent (détection visage + OCR pièce), paiement Mobile Money (entonnoir, polling, réconciliation, vérification live SSE), SARA (reçu + OCR), espèces (caisse), recharge (PAN 4+4, fulfillment), collecte (produits bancaires), commissions paramétrables idempotentes, statistiques scopées, messagerie d'équipe, notifications, habilitations fines, audit, géolocalisation/carte, import en masse, exports CSV/XLSX, bilingue FR/EN, reçus PNG.
