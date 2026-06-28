# Analyse du visage — Capture d'image intelligente (KYC selfie)

> Où, dans le code, le visage est-il analysé pour la prise de selfie « intelligente »
> (détection + auto-capture) ? Ce document recense les sections concernées.

## Réponse courte

L'analyse du visage est **100 % côté frontend** (Angular), exécutée **dans le navigateur**
du client via **MediaPipe FaceLandmarker** (Tasks Vision, WASM/WebGL auto-hébergé). Le backend
**n'analyse aucun visage** : il se contente de stocker l'image du selfie
([`Subscription.selfieKey`](../backend/src/main/java/com/afriland/promote/model/Subscription.java#L145)).
L'OCR KYC du backend (paquet [`kyc/`](../backend/src/main/java/com/afriland/promote/kyc/)) ne traite
que la **CNI** (texte), pas le visage.

Trois fichiers portent toute la logique :

| Rôle | Fichier | Responsabilité |
|---|---|---|
| **Moteur** | [`face-mesh.ts`](../frontend/src/app/shared/face-mesh.ts) | Wrapper MediaPipe : détecte le visage, calcule sa géométrie (boîte, centre, taille, roll, yaw). |
| **Décision + auto-capture** | [`photo-capture.ts`](../frontend/src/app/shared/photo-capture.ts) | Boucle live, juge si le visage est « bien placé », pilote l'anneau/les messages et déclenche l'obturateur automatiquement. |
| **Netteté/exposition** | [`image-quality.ts`](../frontend/src/app/shared/image-quality.ts) | `assessClarity()` : rejette les images sombres / surexposées / floues avant capture. |

---

## 1. Le moteur de détection — `face-mesh.ts`

[`frontend/src/app/shared/face-mesh.ts`](../frontend/src/app/shared/face-mesh.ts)

Service Angular (`FaceMesh`) qui encapsule **MediaPipe FaceLandmarker** :

- **Chargement paresseux** ([`init()`](../frontend/src/app/shared/face-mesh.ts#L47)) : le modèle
  (`/mediapipe/face_landmarker.task`) et le runtime WASM (`/mediapipe/wasm`) sont **auto-hébergés**
  (aucun CDN externe), chargés en `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numFaces: 1`.
  Best-effort : si le modèle/WASM/WebGL échoue, `ready()` renvoie `false` et l'app retombe sur la
  capture manuelle.
- **[`detect(video, tsMs)`](../frontend/src/app/shared/face-mesh.ts#L70)** : lance la détection sur
  l'image vidéo courante et renvoie, pour le visage principal, une structure
  [`FaceDetection`](../frontend/src/app/shared/face-mesh.ts#L4) en coordonnées normalisées (0..1) :
  - `box` / `cx` / `cy` — boîte englobante et centre du visage,
  - `fill` — hauteur de la tête / hauteur de l'image (à quel point la tête « remplit » le cadre),
  - `roll` — inclinaison de la tête (angle de la ligne des yeux),
  - `yaw` — rotation gauche/droite (décalage du nez par rapport au milieu des yeux),
  - `frontal` — vrai seulement si les **deux yeux + le nez** sont localisés (vrai visage de face).

La géométrie est dérivée de 3 points de repère stables (indices MediaPipe canoniques) :
`EYE_L = 33`, `EYE_R = 263`, `NOSE = 1`
([source](../frontend/src/app/shared/face-mesh.ts#L22-L25)).

```
roll = atan2(dy_yeux, dx_yeux)              // tête droite ≈ 0
yaw  = (nez.x − milieu_yeux.x) / interocular // tête de face ≈ 0
```

---

## 2. La décision « bien cadré » + l'auto-capture — `photo-capture.ts`

[`frontend/src/app/shared/photo-capture.ts`](../frontend/src/app/shared/photo-capture.ts)

Composant `<photo-capture>` réutilisable (selfie **et** pièce d'identité). En mode selfie il est
appelé avec `[round]="true"` et `facing="user"` ; c'est `@Input() detect` qui active l'analyse :

- `detect = 'face'` → analyse du **visage** (le sujet de ce document),
- `detect = 'document'` → cadrage automatique de la **carte**.

### Boucle de détection

- [`startDetection()`](../frontend/src/app/shared/photo-capture.ts#L238) lance une boucle
  `requestAnimationFrame` **throttlée à ~10 fps** (`DETECT_INTERVAL_MS = 90`).
- [`detectTick()`](../frontend/src/app/shared/photo-capture.ts#L261) → en mode face appelle
  [`tickFace()`](../frontend/src/app/shared/photo-capture.ts#L279), **le cœur de l'analyse**.
- Anti-jitter : il faut **`READY_FRAMES = 6`** images « ready » consécutives (~0,7 s) avant que
  l'obturateur ne se déclenche tout seul.

### `tickFace()` — la chaîne de tests (ordre exact)

[`tickFace()`](../frontend/src/app/shared/photo-capture.ts#L279) appelle `faceMesh.detect()`, dessine
les points sur l'overlay, puis applique successivement (le **premier** test échoué fixe l'état et
arrête) :

| # | Condition vérifiée | État si KO | Message i18n |
|---|---|---|---|
| 1 | exactement **1** visage frontal | `none` / `multiple` | `cap_none` / `cap_multiple` |
| 2 | `fill ≥ FACE_FILL_MIN` (0.42) | `too_small` | `cap_too_small` (« Rapprochez-vous ») |
| 3 | `fill ≤ FACE_FILL_MAX` (0.95) | `too_close` | `cap_too_close` (« Reculez ») |
| 4 | centre à ±`FACE_CENTER_TOL` (0.18) du milieu | `offcenter` | `cap_offcenter` |
| 5 | `|yaw| ≤ FACE_YAW_MAX` (0.24) | `look_straight` | `cap_look_straight` |
| 6 | `|roll| ≤ FACE_ROLL_MAX` (0.22 ≈ 12,5°) | `tilt` | `cap_tilt` |
| 7 | netteté (`assessClarity`, seuil flou `FACE_BLUR_MIN = 18`) | `dark` / `blurry` | `cap_dark` / `cap_blurry` |
| 8 | **immobilité** : dérive du centre ≤ `FACE_MOVE_MAX` (0.03) entre 2 images | `ready` (mais ne tire que si stable) | `cap_hold_still` |

Les seuils sont des constantes nommées groupées en haut de la classe
([lignes 183–194](../frontend/src/app/shared/photo-capture.ts#L183-L194)) — c'est **là** qu'on ajuste
la sévérité.

Point important : la géométrie est **recalculée dans l'espace du cercle visible** (cover-crop appliqué
sur la vidéo, [lignes 287–293](../frontend/src/app/shared/photo-capture.ts#L287-L293)) pour que le
jugement corresponde exactement à ce que l'utilisateur voit dans l'ovale.

### Effets visuels pilotés par l'état

- **Anneau de cadrage** : pointillé blanc tant que ce n'est pas bon, **vert plein** dès `ready`
  ([template, lignes 73–77](../frontend/src/app/shared/photo-capture.ts#L73-L77)).
- **Overlay des points du visage** dessiné en direct par
  [`drawFaceOverlay()`](../frontend/src/app/shared/photo-capture.ts#L329) (points verts si `ready`).
- **Bouton manuel verrouillé** tant que le visage n'est pas valide
  ([`canShoot()`](../frontend/src/app/shared/photo-capture.ts#L203)) — anti-capture d'un cadre vide.

---

## 3. Le contrôle qualité (netteté/exposition) — `image-quality.ts`

[`frontend/src/app/shared/image-quality.ts`](../frontend/src/app/shared/image-quality.ts)

- **[`assessClarity(canvas, blurMin)`](../frontend/src/app/shared/image-quality.ts#L67)** est la
  fonction appelée par `tickFace()` (test #7). Pure Canvas 2D, sans OpenCV/ML :
  - **exposition** : luminance moyenne `< MIN_BRIGHTNESS (55)` → `dark` ; trop de pixels quasi-blancs
    (`> GLARE_FRACTION`) → `glare` ;
  - **netteté** : **variance du Laplacien 3×3**
    ([`laplacianVariance()`](../frontend/src/app/shared/image-quality.ts#L103)) `< blurMin` → `blurry`.
    Pour un visage on passe un seuil plus bas (`FACE_BLUR_MIN = 18`) car un visage porte moins de
    détails haute-fréquence qu'une CNI pleine de texte.
- `assessDocument()` (cadrage carte) sert au mode `document`, pas au visage.

---

## 4. Activation, dégradation et intégration

- **Drapeau** : [`KYC_SMART_CAPTURE = true`](../frontend/src/app/shared/constants.ts#L42). Mis à
  `false`, toute l'analyse est désactivée → capture manuelle simple
  ([`liveActive()`](../frontend/src/app/shared/photo-capture.ts#L197)).
- **Repli (fallback)** sans jamais bloquer l'utilisateur :
  - modèle MediaPipe indisponible → état `idle`, aucune contrainte, bouton manuel actif ;
  - pas de caméra / permission refusée / origine non sécurisée →
    [`simulate()`](../frontend/src/app/shared/photo-capture.ts#L445) génère un placeholder.
- **Où le selfie est branché** : étape « Selfie » du tunnel de souscription,
  [`subscribe.html` ~ligne 291](../frontend/src/app/pages/subscribe.html#L291) :
  ```html
  <photo-capture facing="user" [round]="true" [boxW]="200" [boxH]="200"
                 detect="face" ... (captured)="onSelfie($event)"></photo-capture>
  ```
- **Messages d'état** (FR/EN) : clés `cap_*` dans
  [`i18n.ts`](../frontend/src/app/core/i18n.ts#L313-L324).

> Remarque : [`selfie-capture.ts`](../frontend/src/app/shared/selfie-capture.ts) est un **ancien
> composant simple** (capture manuelle ronde, sans analyse). La capture intelligente du visage passe
> par `<photo-capture detect="face">`, **pas** par `<selfie-capture>`.

## Schéma de bout en bout

```
caméra frontale (getUserMedia)
        │
        ▼
photo-capture.startDetection()  ── boucle ~10 fps ──┐
        │                                            │
        ▼                                            │
face-mesh.detect(video, ts)  → FaceDetection         │
        │ (boîte, fill, roll, yaw, frontal)          │
        ▼                                            │
photo-capture.tickFace()                             │
   tests 1→6 (nombre, taille, centrage, yaw, roll)   │
        │                                            │
        ▼                                            │
image-quality.assessClarity()  (sombre ? flou ?)     │
        │                                            │
        ▼                                            │
   immobilité OK pendant 6 images ──────────────────►│ auto-shoot()
        │                                              (ou bouton manuel si "ready")
        ▼
JPEG data URL → (captured) → subscribe.onSelfie() → upload backend (stockage selfieKey)
```

---

## 5. Prompt réutilisable — implémenter cette capture intelligente dans n'importe quel projet

> À copier-coller tel quel dans un assistant de code (Claude Code, Cursor, etc.). Il est
> **agnostique du framework** : il décrit le comportement, l'architecture en 3 modules, les seuils
> exacts et la machine à états, puis demande à l'IA de l'adapter à la stack cible. Remplace les
> `{{…}}` par le contexte de ton projet avant de l'envoyer.

```text
RÔLE
Tu es un développeur front senior. Implémente une « capture selfie intelligente » (KYC) :
détection du visage en direct + auto-capture quand le cadrage est bon, avec repli gracieux.
Tout tourne CÔTÉ CLIENT, dans le navigateur. Aucune image n'est analysée côté serveur.

CONTEXTE PROJET (à remplir)
- Stack front : {{ex. React 18 + TS / Vue 3 / Angular / Svelte / vanilla TS}}
- Où l'insérer : {{ex. étape "Selfie" d'un tunnel d'onboarding}}
- Build/bundler : {{ex. Vite / Webpack / Angular CLI}}
- Contrainte hébergement : {{ex. modèle ML auto-hébergé obligatoire, pas de CDN externe}}

LIBRAIRIE
Utilise MediaPipe Tasks Vision : le paquet `@mediapipe/tasks-vision` (FaceLandmarker).
- Charge le modèle `face_landmarker.task` + le runtime WASM en LOCAL (auto-hébergés sous /mediapipe),
  PAS depuis un CDN.
- Options : runningMode 'VIDEO', numFaces 1, delegate 'GPU' (retombe en CPU si indispo).
- Import DYNAMIQUE (lazy) du bundle MediaPipe : il ne doit être téléchargé que lorsque la capture
  intelligente est réellement ouverte.

ARCHITECTURE — 3 modules découplés
1) MOTEUR (ex. face-detector) : encapsule FaceLandmarker. Expose :
   - ready(): Promise<boolean>  // init paresseuse ; false si modèle/WASM/WebGL échoue
   - detect(video, tsMs): { count, face|null }
   `face` est en coordonnées NORMALISÉES (0..1, non miroir) et contient :
     box{x,y,w,h}, cx, cy, fill (=hauteur tête / hauteur image),
     roll (inclinaison), yaw (rotation G/D), frontal (bool).
   Calcule la pose à partir de 3 repères MediaPipe canoniques :
     oeil gauche = indice 33, oeil droit = 263, nez = 1.
     roll = atan2(reye.y-leye.y, reye.x-leye.x)
     interocular = hypot(dx,dy)
     yaw  = (nose.x - (leye.x+reye.x)/2) / interocular
     frontal = les 3 repères existent.
   tsMs DOIT être strictement croissant (performance.now()) : MediaPipe rejette un timestamp répété.

2) COMPOSANT CAMÉRA (ex. photo-capture) : ouvre la caméra (getUserMedia facingMode 'user'),
   affiche un cadre rond, lance une boucle de détection et déclenche l'auto-capture.
   - Boucle via requestAnimationFrame, THROTTLÉE à ~10 fps (intervalle 90 ms) : suffisant et léger.
   - À chaque tick : appelle tickFace() (voir machine à états), met à jour l'état + l'UI.
   - AUTO-CAPTURE : il faut 6 frames "ready" CONSÉCUTIVES (~0,7 s) avant de tirer l'obturateur.
     Un bouton manuel reste disponible mais VERROUILLÉ tant que l'état n'est pas "ready" (ou "idle").
   - IMPORTANT : juge la géométrie dans l'ESPACE DU CERCLE VISIBLE (applique le même cover-crop
     que l'affichage) pour que le verdict corresponde à ce que l'utilisateur voit. Sinon le centrage
     et la taille seront faux.
   - Dessine en overlay les points du visage (vert si "ready", blanc sinon).

3) QUALITÉ IMAGE (ex. image-quality) : fonctions PURES Canvas 2D, sans OpenCV/ML.
   assessClarity(canvas, blurMin) -> 'dark' | 'glare' | 'blurry' | null :
   - downscale en niveaux de gris (largeur ~320),
   - exposition : luminance moyenne < 55 => 'dark' ; >10% de pixels >=248 => 'glare',
   - netteté : VARIANCE DU LAPLACIEN 3x3 < blurMin => 'blurry'.
   Pour un visage, passe blurMin = 18 (plus bas que pour un document texte, ~70).

MACHINE À ÉTATS — tickFace(), tests dans CET ORDRE (le 1er échec fixe l'état et s'arrête) :
  1. count==0 || !frontal           -> 'none'          (« Aucun visage, placez-vous face caméra »)
  2. count>1                         -> 'multiple'      (« Restez seul dans le cadre »)
  3. fill < 0.42                     -> 'too_small'     (« Rapprochez-vous »)
  4. fill > 0.95                     -> 'too_close'     (« Reculez un peu »)
  5. |cx-0.5|>0.18 || |cy-0.5|>0.18  -> 'offcenter'     (« Centrez le visage »)
  6. |yaw| > 0.24                    -> 'look_straight' (« Regardez droit »)
  7. |roll| > 0.22  (~12,5°)         -> 'tilt'          (« Tête droite »)
  8. assessClarity = 'dark'/'blurry' -> 'dark'/'blurry' (« Trop sombre » / « Stabilisez »)
  9. sinon -> 'ready' ; ne renvoie true (=> compte vers l'auto-capture) QUE si IMMOBILE :
     dérive du centre entre 2 frames <= 0.03. Message "ready" : « Ne bougez plus, capture auto… ».
  Mets tous ces nombres dans des CONSTANTES NOMMÉES groupées en haut, faciles à régler.

UI pilotée par l'état :
  - anneau de cadrage : pointillé blanc tant que != 'ready', vert plein dès 'ready' ;
  - un message court et actionnable par état (i18n, FR par défaut, prévois EN) ;
  - flash blanc bref au déclenchement.

REPLI GRACIEUX (ne JAMAIS bloquer l'utilisateur) :
  - drapeau global SMART_CAPTURE (bool) pour tout désactiver -> capture manuelle simple ;
  - si ready()==false (modèle/WASM indispo) : état 'idle', aucune contrainte, bouton manuel actif ;
  - si caméra absente / refusée / origine non sécurisée : génère un placeholder neutre et continue.
  Note : HTTPS requis en prod (getUserMedia) ; http://localhost fonctionne.

SORTIE & NETTOYAGE :
  - à la capture : cover-fit la frame dans un canvas, MIROIR si caméra frontale, export JPEG (qualité
    ~0.9 pour le rond), émets l'image (data URL) à l'appelant ;
  - stoppe la boucle rAF + libère le MediaStream (tracks.stop()) à la capture et au démontage.

LIVRABLES :
  - les 3 modules ci-dessus, typés, avec commentaires sur les zones d'animation et les seuils ;
  - le câblage dans {{l'écran cible}} ;
  - les instructions pour auto-héberger le modèle + le WASM ;
  - un court README : réglage des seuils, comportement de repli, prérequis HTTPS.
```

### Réglages rapides (mémo)

| Tu veux… | Modifie |
|---|---|
| Capture plus permissive (mobiles bas de gamme) | baisse `FACE_FILL_MIN`, monte les tolérances `CENTER/YAW/ROLL`, baisse `FACE_BLUR_MIN` |
| Auto-capture plus rapide / plus sûre | baisse / monte `READY_FRAMES` (anti-jitter) |
| Plus fluide vs moins de CPU | baisse / monte `DETECT_INTERVAL_MS` |
| Anti-bougé plus strict | baisse `FACE_MOVE_MAX` |
| Tout désactiver (capture manuelle) | drapeau `SMART_CAPTURE = false` |
