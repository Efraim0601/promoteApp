#!/usr/bin/env bash
#
# provision-server.sh — bootstrap COMPLET d'un serveur NEUF pour le portail Promote.
#
# Ce que fait le script (idempotent — peut être relancé sans danger) :
#   1. Met le système à jour et installe les prérequis (git, curl, ufw, openssl).
#   2. Installe Docker Engine + le plugin docker compose (dépôt officiel Docker).
#   3. Récupère le code depuis GitHub (clone la 1re fois, puis git pull).
#   4. Crée le fichier .env à partir de .env.example en GÉNÉRANT des secrets forts
#      (mots de passe DB/MinIO, JWT, admin) — uniquement s'il n'existe pas déjà.
#   5. Ouvre le pare-feu (ufw) sur SSH + le port HTTPS de l'app.
#   6. Lance le déploiement applicatif via ./deploy.sh (HTTPS par défaut).
#
# Usage (sur le serveur neuf, en tant qu'utilisateur sudo) :
#   curl -fsSL <url-de-ce-script> -o provision-server.sh   # ou scp-le
#   chmod +x provision-server.sh
#   sudo ./provision-server.sh                 # IP publique auto-détectée, HTTPS auto-signé (sslip.io:8443)
#   sudo DOMAIN=promote.mabanque.cm ./provision-server.sh                  # auto-signé sur 8443
#   sudo LETSENCRYPT=1 DOMAIN=promote.mabanque.cm ./provision-server.sh    # Let's Encrypt (cert de confiance, 80/443)
#   sudo TLS=0 ./provision-server.sh           # HTTP simple (PAS recommandé : caméra KO)
#
# Variables d'environnement reconnues (toutes optionnelles) :
#   REPO_URL    dépôt git (défaut : git@github.com:Efraim0601/promoteApp.git)
#   APP_DIR     dossier d'installation       (défaut : /opt/promoteApp)
#   BRANCH      branche à déployer           (défaut : master)
#   DOMAIN      nom de domaine public        (défaut : <IP>.sslip.io)
#   TLS         1 = HTTPS (défaut) | 0 = HTTP
#   LETSENCRYPT 1 = certificat Let's Encrypt de confiance sur 80/443 (exige un vrai DOMAIN)
#               0 = certificat auto-signé Caddy sur HTTPS_PORT (défaut)
#   HTTPS_PORT  port HTTPS (mode auto-signé)  (défaut : 8443)
#   WEB_PORT    port interne du front         (défaut : 8973)
#
set -euo pipefail

# ---------------------------------------------------------------- réglages
REPO_URL="${REPO_URL:-git@github.com:Efraim0601/promoteApp.git}"
APP_DIR="${APP_DIR:-/opt/promoteApp}"
BRANCH="${BRANCH:-master}"
TLS="${TLS:-1}"
LETSENCRYPT="${LETSENCRYPT:-0}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
WEB_PORT="${WEB_PORT:-8973}"
ACME_EMAIL="${ACME_EMAIL:-admin@afrilandfirstbank.com}"

say()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
err()  { printf '\n\033[1;31mERREUR:\033[0m %s\n' "$*" >&2; }

[ "$(id -u)" -eq 0 ] || { err "Lancez ce script avec sudo / en root."; exit 1; }

# Let's Encrypt implique HTTPS et exige un vrai domaine (pas l'IP, pas un sslip.io auto-détecté).
if [ "$LETSENCRYPT" = 1 ]; then
  TLS=1
  [ -n "${DOMAIN:-}" ] || { err "LETSENCRYPT=1 exige un vrai nom de domaine : relancez avec DOMAIN=promote.mondomaine.cm"; exit 1; }
fi

# L'utilisateur réel (celui qui a fait sudo) — pour lui donner les droits docker et le repo.
RUN_USER="${SUDO_USER:-root}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

# ---------------------------------------------------------------- 1. paquets de base
say "Mise à jour du système et installation des prérequis…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw openssl gnupg

# ---------------------------------------------------------------- 2. Docker Engine + compose
if ! command -v docker >/dev/null 2>&1; then
  say "Installation de Docker Engine (dépôt officiel)…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  say "Docker déjà présent — installation ignorée."
fi
systemctl enable --now docker

# Permettre à l'utilisateur sudo d'utiliser docker sans sudo (effet après reconnexion).
if [ "$RUN_USER" != "root" ]; then
  usermod -aG docker "$RUN_USER" || true
fi

# ---------------------------------------------------------------- 3. récupération du code
if [ ! -d "$APP_DIR/.git" ]; then
  say "Clone du dépôt $REPO_URL dans $APP_DIR…"
  if ! git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null; then
    err "Le clone a échoué."
    cat >&2 <<EOF

  Le dépôt est privé et utilise une URL SSH. Sur ce serveur neuf, il faut une clé
  d'accès. Deux options :

  A) Clé de déploiement (recommandé) — exécutez en tant que '$RUN_USER' :
       ssh-keygen -t ed25519 -C "promote-deploy@\$(hostname)" -f ~/.ssh/id_ed25519 -N ""
       cat ~/.ssh/id_ed25519.pub
     …puis ajoutez cette clé publique dans GitHub :
       repo Efraim0601/promoteApp → Settings → Deploy keys → Add deploy key
     Relancez ensuite ce script.

  B) Utiliser HTTPS + token : relancez avec
       sudo REPO_URL=https://<TOKEN>@github.com/Efraim0601/promoteApp.git ./provision-server.sh
EOF
    exit 1
  fi
  chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"
else
  say "Dépôt déjà présent — mise à jour (git pull)…"
  git -C "$APP_DIR" pull --ff-only || warn "git pull a échoué — on continue avec le checkout actuel."
fi

cd "$APP_DIR"

# ---------------------------------------------------------------- 4. fichier .env + secrets
if [ ! -f .env ]; then
  say "Création de .env avec des secrets générés aléatoirement…"
  cp .env.example .env

  # IP publique pour le domaine sslip.io par défaut.
  PUBLIC_IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  DOMAIN="${DOMAIN:-${PUBLIC_IP}.sslip.io}"

  gen() { openssl rand -base64 "${1:-32}" | tr -d '\n/+=' | cut -c1-"${2:-32}"; }
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"

  # Remplace les valeurs-exemple par de vrais secrets.
  set_env() { local k="$1" v="$2"; sed -i "s|^${k}=.*|${k}=${v}|" .env; }
  set_env POSTGRES_PASSWORD     "$(gen 32 32)"
  set_env MINIO_ROOT_PASSWORD   "$(gen 32 32)"
  set_env JWT_SECRET            "$JWT_SECRET"
  set_env ADMIN_PASSWORD        "$(gen 24 20)"
  set_env PRINT_PASSWORD        "$(gen 24 20)"
  set_env DOMAIN                "$DOMAIN"
  set_env ACME_EMAIL            "$ACME_EMAIL"
  set_env CADDY_HTTPS_PORT      "$HTTPS_PORT"
  set_env SEED_TEST_AGENT       "false"

  if [ "$LETSENCRYPT" = 1 ]; then
    # Let's Encrypt : URL propre sans port. Front sur la boucle locale (Caddy le proxifie).
    set_env WEB_PORT                "127.0.0.1:${WEB_PORT}"
    set_env APP_CORS_ALLOWED_ORIGINS "https://${DOMAIN}"
    set_env TRUSTPAYWAY_NOTIF_URL    "https://${DOMAIN}/api/payment/webhook/trustpayway"
  elif [ "$TLS" = 1 ]; then
    # Auto-signé : derrière Caddy sur HTTPS_PORT, front sur la boucle locale + CORS avec port.
    set_env WEB_PORT                "127.0.0.1:${WEB_PORT}"
    set_env APP_CORS_ALLOWED_ORIGINS "https://${DOMAIN}:${HTTPS_PORT}"
    set_env TRUSTPAYWAY_NOTIF_URL    "https://${DOMAIN}:${HTTPS_PORT}/api/payment/webhook/trustpayway"
  else
    set_env WEB_PORT                "$WEB_PORT"
    set_env APP_CORS_ALLOWED_ORIGINS "http://${PUBLIC_IP}:${WEB_PORT}"
  fi
  chown "$RUN_USER":"$RUN_USER" .env
  chmod 600 .env

  warn "Secrets générés dans $APP_DIR/.env — SAUVEGARDEZ ce fichier (mot de passe admin inclus)."
  say  "Identifiants admin : $(grep '^ADMIN_EMAIL=' .env | cut -d= -f2)  /  $(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2)"
else
  say ".env déjà présent — conservé tel quel (aucun secret écrasé)."
  DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2- || true)"
fi

# ---------------------------------------------------------------- 5. pare-feu (ufw)
say "Configuration du pare-feu (ufw)…"
ufw allow OpenSSH      >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
if [ "$LETSENCRYPT" = 1 ]; then
  ufw allow 80/tcp  >/dev/null 2>&1 || true   # requis pour le challenge ACME + redirection
  ufw allow 443/tcp >/dev/null 2>&1 || true
elif [ "$TLS" = 1 ]; then
  ufw allow "${HTTPS_PORT}/tcp" >/dev/null 2>&1 || true
else
  ufw allow "${WEB_PORT}/tcp"   >/dev/null 2>&1 || true
fi
ufw --force enable >/dev/null 2>&1 || true
ufw status verbose || true

# ---------------------------------------------------------------- 6. déploiement applicatif
say "Lancement du déploiement applicatif (build + démarrage des conteneurs)…"
chmod +x deploy.sh
DEPLOY_FLAGS="--no-pull"          # on vient déjà de récupérer le code
if [ "$LETSENCRYPT" = 1 ]; then
  DEPLOY_FLAGS="$DEPLOY_FLAGS --le"
elif [ "$TLS" = 1 ]; then
  DEPLOY_FLAGS="$DEPLOY_FLAGS --tls"
fi

# Exécuter docker en tant que l'utilisateur (qui est maintenant dans le groupe docker).
# `sg docker` applique le nouveau groupe sans devoir se reconnecter.
if [ "$RUN_USER" != "root" ]; then
  sudo -u "$RUN_USER" sg docker -c "cd '$APP_DIR' && ./deploy.sh $DEPLOY_FLAGS"
else
  ./deploy.sh $DEPLOY_FLAGS
fi

# ---------------------------------------------------------------- bilan
say "Provisioning terminé."
if [ "$LETSENCRYPT" = 1 ]; then
  echo "  URL publique : https://${DOMAIN}"
  echo "  (certificat Let's Encrypt de confiance — émis automatiquement ; aucun avertissement)"
  echo "  Prérequis : enregistrement DNS A de ${DOMAIN} -> IP de ce serveur, ports 80/443 ouverts."
  echo "  Mises à jour ultérieures :  cd $APP_DIR && ./deploy.sh --le"
elif [ "$TLS" = 1 ]; then
  echo "  URL publique : https://${DOMAIN:-<IP>.sslip.io}:${HTTPS_PORT}"
  echo "  (certificat auto-signé Caddy : accepter l'avertissement une fois dans le navigateur)"
  echo "  Mises à jour ultérieures :  cd $APP_DIR && ./deploy.sh --tls"
else
  echo "  URL publique : http://<IP-serveur>:${WEB_PORT}"
  echo "  Mises à jour ultérieures :  cd $APP_DIR && ./deploy.sh"
fi
