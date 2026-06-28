#!/usr/bin/env bash
#
# start-demo.sh — lance Promote en mode DÉMO (données seed + comptes de test).
#
# Usage:
#   ./start-demo.sh              # efface la base et recharge les données démo (--fresh)
#   ./start-demo.sh --keep-data  # redémarre sans effacer PostgreSQL / MinIO
#   ./start-demo.sh --no-build   # sans rebuild des images
#
set -euo pipefail
cd "$(dirname "$0")"

FRESH=1
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --keep-data) FRESH=0 ;;
    --no-build) BUILD=0 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Option inconnue: $arg (utilisez --help)" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1;36m[demo]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[demo]\033[0m %s\n' "$*" >&2; }

command -v docker >/dev/null 2>&1 || { err "Docker requis."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose plugin requis."; exit 1; }

if [ ! -f .env.demo ]; then
  err "Fichier .env.demo introuvable."
  exit 1
fi

say "Configuration démo → .env"
cp .env.demo .env

# shellcheck disable=SC1091
set -a && source .env && set +a
WEB_PORT="${WEB_PORT:-8973}"
HOST_PORT="${WEB_PORT##*:}"

if [ "$FRESH" = 1 ]; then
  say "Réinitialisation des volumes (base + MinIO) pour reseeder…"
  docker compose down -v || true
fi

if [ "$BUILD" = 1 ]; then
  say "Build des images…"
  docker compose build
fi

say "Démarrage de la stack démo…"
docker compose up -d

say "Attente de l'API (http://localhost:${HOST_PORT}/api/config)…"
ok=0
for _ in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${HOST_PORT}/api/config" 2>/dev/null || true)"
  [ "$code" = "200" ] && { ok=1; break; }
  sleep 2
done

echo
docker compose ps
echo

if [ "$ok" = 1 ]; then
  say "Démo prête."
else
  err "L'API ne répond pas encore — vérifiez: docker compose logs --tail=80 backend"
fi

cat <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  Promote — mode DÉMO                                             ║
╠══════════════════════════════════════════════════════════════════╣
║  Application : http://localhost:${HOST_PORT}
║  Parcours client : http://localhost:${HOST_PORT}/client
║  Connexion staff : http://localhost:${HOST_PORT}/login
╠══════════════════════════════════════════════════════════════════╣
║  Comptes (mot de passe « promote » sauf admin) :
║    Admin      ${ADMIN_EMAIL}  →  ${ADMIN_PASSWORD}
║    Manager    manager@afrilandfirstbank.com
║    Superviseur superviseur@afrilandfirstbank.com
║    Chef équipe chef@afrilandfirstbank.com
║    Commercial awa.fall@afrilandfirstbank.com
║    Collecteur collecteur@afrilandfirstbank.com
║    Caissier   ${CASHIER_EMAIL}  →  ${CASHIER_PASSWORD}
║    Imprimeur  ${PRINT_EMAIL}  →  ${PRINT_PASSWORD}
╠══════════════════════════════════════════════════════════════════╣
║  Paiement simulé (MoMo fictif). Mail désactivé.
║  Reseed complet : ./start-demo.sh
║  Prod réelle    : ./start-prod.sh
╚══════════════════════════════════════════════════════════════════╝

EOF
