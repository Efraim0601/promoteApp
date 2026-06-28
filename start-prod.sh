#!/usr/bin/env bash
#
# start-prod.sh — lance Promote en mode PRODUCTION (secrets réels, sans comptes démo).
#
# Usage:
#   cp .env.example .env && nano .env    # une seule fois : renseigner les secrets
#   ./start-prod.sh                      # HTTP sur WEB_PORT
#   ./start-prod.sh --le                 # HTTPS Let's Encrypt (DOMAIN dans .env)
#   ./start-prod.sh --tls                # HTTPS auto-signé (port CADDY_HTTPS_PORT)
#   ./start-prod.sh --fresh              # efface la base puis redéploie (attention !)
#   ./start-prod.sh --no-build --no-pull # redémarrage rapide
#
# Délègue à deploy.sh après avoir forcé SEED_TEST_AGENT=false et validé .env.
#
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;32m[prod]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[prod]\033[0m %s\n' "$*" >&2; }

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    err "Fichier .env créé depuis .env.example — renseignez les secrets puis relancez."
    exit 1
  fi
  err "Fichier .env absent. Copiez .env.example vers .env et configurez-le."
  exit 1
fi

# Désactive les comptes démo (manager, agent awa.fall, etc.) — prod réelle.
if grep -q '^SEED_TEST_AGENT=' .env 2>/dev/null; then
  sed -i 's/^SEED_TEST_AGENT=.*/SEED_TEST_AGENT=false/' .env
else
  echo 'SEED_TEST_AGENT=false' >> .env
fi

# Évite d'écraser une config prod par le mode démo.
if [ -f .env.demo ] && cmp -s .env .env.demo 2>/dev/null; then
  err "Le .env actuel est identique à .env.demo — configurez un .env production réel."
  exit 1
fi

say "Mode production — SEED_TEST_AGENT=false, validation des secrets…"
exec ./deploy.sh "$@"
