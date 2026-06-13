#!/usr/bin/env bash
#
# Manual TrustPayWay reconciliation via the running Promote API.
# Queries get-status for all MoMo orders (subscriptions + recharges) from the last N hours
# that are still pending or failed, and updates local pay_status to match the aggregator.
#
# Usage:
#   ./scripts/reconcile-payments.sh           # last 1 hour (default)
#   ./scripts/reconcile-payments.sh 2         # last 2 hours (capped by PAYMENT_RECONCILE_LOOKBACK_SECONDS)
#
# Reads from .env (project root):
#   APP_PUBLIC_URL or RECONCILE_APP_URL  — base URL, e.g. https://rfprepaidcard.afrilandfirstbank.com
#   ADMIN_EMAIL / ADMIN_PASSWORD         — admin account (JWT login)
#
# Requires: curl, and python3 (optional, for pretty JSON)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
HOURS="${1:-1}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(APP_PUBLIC_URL|RECONCILE_APP_URL|ADMIN_EMAIL|ADMIN_PASSWORD)=' "$ENV_FILE" || true)
  set +a
fi

BASE="${RECONCILE_APP_URL:-${APP_PUBLIC_URL:-}}"
EMAIL="${ADMIN_EMAIL:-}"
PASSWORD="${ADMIN_PASSWORD:-}"

die() { echo "❌ $*" >&2; exit 1; }

[[ -n "$BASE"     ]] || die "APP_PUBLIC_URL or RECONCILE_APP_URL is empty (set in .env)"
[[ -n "$EMAIL"    ]] || die "ADMIN_EMAIL is empty (set in .env)"
[[ -n "$PASSWORD" ]] || die "ADMIN_PASSWORD is empty (set in .env)"
command -v curl >/dev/null || die "curl not found"

# Strip trailing slash and /client suffix (same rule as account emails).
while [[ "$BASE" == */ ]]; do BASE="${BASE%/}"; done
if [[ "$BASE" == */client ]]; then BASE="${BASE%/client}"; fi

pretty_json() {
  if command -v python3 >/dev/null; then
    python3 -m json.tool 2>/dev/null || cat
  else
    cat
  fi
}

echo "▶ App URL  : $BASE"
echo "▶ Fenêtre  : dernières ${HOURS}h"
echo "▶ Admin    : $EMAIL"
echo

echo "1) Connexion admin ..."
LOGIN_RESP=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

if command -v python3 >/dev/null; then
  TOKEN=$(printf '%s' "$LOGIN_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("token",""))' 2>/dev/null || true)
else
  TOKEN=$(printf '%s' "$LOGIN_RESP" | grep -oE '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"token"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
fi

[[ -n "$TOKEN" ]] || die "échec de connexion — vérifiez ADMIN_EMAIL / ADMIN_PASSWORD. Réponse: $LOGIN_RESP"
echo "   ✅ connecté"
echo

echo "2) Réconciliation TrustPayWay (POST /api/payment/reconcile?hours=$HOURS) ..."
echo "   (peut prendre 1–2 min selon le nombre de transactions)"
echo

HTTP_CODE=$(curl -sS -w "%{http_code}" -o /tmp/reconcile-result.json -X POST \
  "$BASE/api/payment/reconcile?hours=$HOURS" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "❌ HTTP $HTTP_CODE"
  cat /tmp/reconcile-result.json | pretty_json
  exit 1
fi

cat /tmp/reconcile-result.json | pretty_json

if command -v python3 >/dev/null; then
  python3 <<'PY' /tmp/reconcile-result.json
import json, sys
d = json.load(open(sys.argv[1]))
print()
print(f"Résumé : {d.get('scanned',0)} scannées | {d.get('updated',0)} mises à jour | "
      f"{d.get('unchanged',0)} inchangées | {d.get('errors',0)} erreurs")
changed = [x for x in d.get('details', []) if x.get('changed')]
if changed:
    print()
    print("Mises à jour :")
    for x in changed:
        print(f"  • {x.get('ref')}: {x.get('statusBefore')} → {x.get('statusAfter')}")
PY
fi

echo
echo "✅ Terminé."
