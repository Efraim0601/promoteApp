#!/usr/bin/env bash
#
# redeploy.sh — UNE seule commande pour mettre à jour la prod en toute sécurité.
#
#   ./redeploy.sh
#
# Ce que ça fait :
#   1. se cale sur la branche master et récupère le dernier code (git pull),
#   2. reconstruit les images backend + frontend,
#   3. recrée les conteneurs avec l'overlay HTTPS Let's Encrypt (domaine + TLS),
#   4. vérifie que l'API répond.
#
# Les données (PostgreSQL + MinIO) et le certificat (caddy_data) sont CONSERVÉS :
# ce script n'utilise jamais `down -v` ni `--fresh`.
#
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

say "Synchronisation sur master (récupération du dernier code)…"
git fetch origin
git checkout master
git pull --ff-only
say "Code déployé : $(git log --oneline -1)"

# Délègue le build + la recréation + le contrôle de santé à deploy.sh, avec
# l'overlay Let's Encrypt (--le) et sans re-puller (--no-pull : déjà fait ci-dessus).
say "Build des images + recréation des conteneurs (données conservées)…"
exec ./deploy.sh --le --no-pull
