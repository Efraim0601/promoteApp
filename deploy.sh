#!/usr/bin/env bash
#
# deploy.sh — deploy / update the Promote portal on the server.
#
# Usage:
#   ./deploy.sh                 # pull, build, (re)start the stack (HTTP on WEB_PORT)
#   ./deploy.sh --tls           # same, but with the Caddy HTTPS reverse proxy (self-signed, custom port)
#   ./deploy.sh --le            # HTTPS via Let's Encrypt (trusted cert on ports 80/443, real DOMAIN)
#   ./deploy.sh --fresh         # WIPE the database & MinIO volumes, then deploy (clean reseed)
#   ./deploy.sh --no-build      # restart without rebuilding images
#   ./deploy.sh --no-pull       # skip 'git pull'
#   flags can be combined, e.g.  ./deploy.sh --tls --fresh
#
set -euo pipefail
cd "$(dirname "$0")"

TLS=0; LE=0; FRESH=0; BUILD=1; PULL=1
for arg in "$@"; do
  case "$arg" in
    --tls) TLS=1 ;;
    --le) LE=1 ;;
    --fresh) FRESH=1 ;;
    --no-build) BUILD=0 ;;
    --no-pull) PULL=0 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (use --help)"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }
envval() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true; }

# ---- 1. update the code ----
if [ "$PULL" = 1 ] && [ -d .git ]; then
  say "Updating code (git pull)…"
  git pull --ff-only || err "git pull failed — continuing with the current checkout."
fi

# ---- 2. ensure .env exists with real secrets ----
if [ ! -f .env ]; then
  cp .env.example .env
  err ".env was missing — created it from .env.example. Edit it (passwords, JWT_SECRET, ADMIN_*) then re-run."
  exit 1
fi

PLACEHOLDERS="change-this-db-password change-this-to-a-long-random-secret-at-least-32-bytes change-this-strong-admin-password change-this-minio-secret"
INSECURE=0
for key in POSTGRES_PASSWORD JWT_SECRET ADMIN_PASSWORD MINIO_ROOT_PASSWORD; do
  v="$(envval "$key")"
  if [ -z "$v" ]; then err "$key is not set in .env"; INSECURE=1; fi
  for p in $PLACEHOLDERS; do
    [ "$v" = "$p" ] && { err "$key still has the example placeholder value — set a real secret."; INSECURE=1; }
  done
done
JWT="$(envval JWT_SECRET)"
if [ -n "$JWT" ] && [ "${#JWT}" -lt 32 ]; then err "JWT_SECRET must be at least 32 characters."; INSECURE=1; fi
[ "$INSECURE" = 1 ] && { err "Refusing to deploy with missing/insecure secrets. Edit .env and re-run."; exit 1; }

# ---- 3. compose files ----
[ "$TLS" = 1 ] && [ "$LE" = 1 ] && { err "--tls and --le are mutually exclusive (pick one HTTPS mode)."; exit 1; }
FILES=(-f docker-compose.yml)
if [ "$TLS" = 1 ]; then
  FILES+=(-f docker-compose.tls.yml)
  [ -z "$(envval DOMAIN)" ] && { err "--tls requires DOMAIN set in .env (and a DNS A record to this server)."; exit 1; }
fi
if [ "$LE" = 1 ]; then
  FILES+=(-f docker-compose.le.yml)
  [ -z "$(envval DOMAIN)" ] && { err "--le requires DOMAIN set in .env (a real domain with a DNS A record to this server, ports 80/443 open)."; exit 1; }
fi
dc() { docker compose "${FILES[@]}" "$@"; }

# ---- 4. (optional) wipe volumes ----
if [ "$FRESH" = 1 ]; then
  say "Wiping volumes (database + MinIO)…"
  dc down -v || true
fi

# ---- 5. build & start ----
if [ "$BUILD" = 1 ]; then
  say "Building images…"; dc build
fi
say "Starting the stack…"; dc up -d

# ---- 6. health check ----
WEB_PORT="$(envval WEB_PORT)"; WEB_PORT="${WEB_PORT:-8973}"; HOST_PORT="${WEB_PORT##*:}"
say "Waiting for the app to answer on http://localhost:${HOST_PORT} …"
ok=0
for _ in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${HOST_PORT}/api/config" || true)"
  [ "$code" = "200" ] && { ok=1; break; }
  sleep 2
done

echo
dc ps
echo
if [ "$ok" = 1 ]; then
  say "Deployment OK — API answered 200."
else
  err "API did not answer 200 yet. Check logs:  docker compose ${FILES[*]} logs --tail=60 backend"
fi

if [ "$LE" = 1 ]; then
  echo "  Public URL : https://$(envval DOMAIN)   (Let's Encrypt; open 80 and 443 in the firewall — cert issues automatically)"
elif [ "$TLS" = 1 ]; then
  CP="$(envval CADDY_HTTPS_PORT)"; CP="${CP:-8443}"
  echo "  Public URL : https://$(envval DOMAIN):${CP}   (open ${CP} in the firewall; accept the one-time cert warning)"
else
  echo "  Public URL : http://<server-ip>:${HOST_PORT}   (open ${HOST_PORT} in the firewall)"
  echo "  NOTE: the camera (selfie / ID card) needs HTTPS — deploy with --tls in production."
fi
