# Test de charge k6 — Carte Promote

Mesure la capacité réelle de la plateforme en reproduisant :
- les **tableaux du personnel** qui s'auto-rafraîchissent (admin / commercial / imprimeur / caissier),
  c.-à-d. le polling toutes les `POLL` secondes (défaut **3 s**, comme `LIVE_REFRESH_MS` côté app) ;
- le **parcours client QR** (upload KYC + souscription + polling du statut + validation paiement).

## ⚠️ À lire avant de lancer

1. **Lancez k6 depuis une machine PROCHE du serveur** (le serveur lui-même ou une VM dans le même
   datacenter/réseau). Sinon la latence mesurée = distance réseau, pas la capacité du serveur.
2. Le port de l'app (`:8443`) est **restreint** : assurez-vous que la machine qui lance k6 peut
   l'atteindre (`curl -k https://VOTRE_HOTE:8443/api/config` doit répondre).
3. Le **parcours client écrit en base** (fausses souscriptions/paiements). Il est **désactivé par
   défaut** (`VUS_CLIENT=0`). Ne l'activez **que** sur un environnement de recette, jamais en prod.
4. Un test de charge **stresse le serveur en production** et peut gêner les vrais utilisateurs.
   Lancez-le hors heures de pointe.

## Installer k6

- Linux (snap)  : `sudo snap install k6`
- Debian/Ubuntu : https://grafana.com/docs/k6/latest/set-up/install-k6/
- macOS         : `brew install k6`
- Docker        : `docker run --rm -i grafana/k6 run - <main.js`

## Lancer

Depuis ce dossier (`load-test/k6/`). Remplacez `BASE_URL` par l'URL réelle de l'app.

### 1) Smoke test (valider la connexion — charge négligeable)
```bash
k6 run -e BASE_URL=https://62.169.26.178.sslip.io:8443 \
       -e VUS_AGENT=1 -e VUS_ADMIN=0 -e VUS_PRINT=0 -e VUS_CASHIER=0 \
       -e DURATION=20s main.js
```
Vous ne nous avez fourni que le compte **commercial** (`awa.fall@…/promote`). Les comptes
admin/imprimeur/caissier ont peut-être un autre mot de passe en prod → soit vous les passez
(`-e ADMIN_EMAIL=… -e PW=…`), soit vous mettez leur `VUS_*=0` (ils sont alors ignorés sans planter).

### 2) Charge réaliste — N utilisateurs simultanés (mode steady)
```bash
k6 run -e BASE_URL=https://VOTRE_HOTE:8443 \
       -e VUS_AGENT=100 -e VUS_ADMIN=5 -e VUS_PRINT=10 -e VUS_CASHIER=10 \
       -e DURATION=5m main.js
```
Modèle « concurrence » : chaque VU = un tableau ouvert qui se rafraîchit toutes les 3 s.
Montez `VUS_AGENT` (50 → 100 → 200 → …) jusqu'à voir `http_req_failed` grimper ou `p(95)` exploser.

### 3) Trouver le point de rupture automatiquement (mode ramp)
```bash
k6 run -e BASE_URL=https://VOTRE_HOTE:8443 -e MODE=ramp -e RAMP_TARGET=800 main.js
```
Monte progressivement le débit (req/s) d'un mix de personnel (70 % commercial, 10 % chacun
admin/imprimeur/caissier) jusqu'à `RAMP_TARGET`. **S'arrête tout seul** quand le taux d'erreurs
dépasse 5 % (≈ le point de rupture).

### 4) Inclure le parcours client QR (RECETTE uniquement — écrit en base)
```bash
k6 run -e BASE_URL=https://RECETTE:8443 \
       -e VUS_AGENT=50 -e VUS_CLIENT=30 -e DURATION=5m main.js
```

## Variables (`-e CLE=valeur`)

| Variable | Défaut | Rôle |
|---|---|---|
| `BASE_URL` | `http://localhost:8390` | Hôte de l'app (l'API est sur `/api`) |
| `MODE` | `steady` | `steady` (VUs constants) ou `ramp` (montée en débit) |
| `DURATION` | `2m` | Durée en mode steady |
| `POLL` | `3` | Intervalle de rafraîchissement (s) — doit = `LIVE_REFRESH_MS` |
| `VUS_ADMIN` / `VUS_AGENT` / `VUS_PRINT` / `VUS_CASHIER` | `5/30/5/5` | Utilisateurs simultanés par rôle (steady) |
| `VUS_CLIENT` | `0` | Parcours client QR simultanés (**écrit en base**) |
| `RAMP_TARGET` | `500` | Débit cible en itérations/s (mode ramp) |
| `PW` | `promote` | Mot de passe des comptes staff |
| `ADMIN_EMAIL` / `AGENT_EMAIL` / `PRINT_EMAIL` / `CASHIER_EMAIL` | comptes démo | Identifiants |
| `INSECURE_TLS` | `true` | Ignore la vérification du certificat (hôte sslip.io/IP) |

## Lire les résultats

- **`http_req_failed`** : taux d'échec. Au-delà de ~2 %, le serveur sature.
- **`http_req_duration` p(95)/p(99)** : latence. Le « coude » (où p95 décolle) = la limite pratique.
- Par endpoint (bloc `{ name:... }`) : repérez le plus lourd. Attendez-vous à ce que
  **`GET /subscriptions (all)`** (liste complète, admin) et **`GET /stats/admin`** soient les premiers
  à se dégrader — ils chargent toute la table à chaque appel (cf. note capacité ci-dessous).
- **`http_reqs … /s`** : débit soutenu atteint.
- **`vus` / `vus_max`** : concurrence atteinte.

### Méthode pour chiffrer la capacité
1. Smoke test → confirme l'accès + latence de base.
2. Mode steady en doublant `VUS_AGENT` (25 → 50 → 100 → 200…) jusqu'à ce que `p(95)` dépasse ~1,5 s
   ou `http_req_failed` > 2 %. Le dernier palier « sain » = la **capacité en utilisateurs simultanés**.
3. Mode ramp pour le **débit max** (req/s) avant rupture.

## Note capacité (rappel)
Les goulots d'étranglement sont logiciels, pas matériels : polling à 3 s + endpoints qui font
`findAll()` (table entière en mémoire à chaque appel) + pool DB Hikari (10 connexions par défaut).
Pour multiplier la capacité ×10 sans changer de serveur : agrégation SQL au lieu de `findAll`,
pagination de `GET /subscriptions`, intervalle de polling 15–30 s (ou push SSE/WebSocket), index DB.
