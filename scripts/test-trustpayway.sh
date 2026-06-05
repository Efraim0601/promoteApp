#!/usr/bin/env bash
#
# Standalone smoke test for the TrustPayWay sandbox API — validates the exact calls
# our TrustPayWayGateway makes, with no dependency on the running app.
#
#   1. POST {base}/api/login        (Bearer SECRET_KEY, body {applicationId}) -> access_token
#   2. POST {base}/api/{network}/process-payment  (Bearer token)             -> transaction_id
#   3. GET  {base}/api/{network}/get-status/{id}  (Bearer token)             -> status (polled)
#
# Reads credentials from .env (TRUSTPAYWAY_BASE_URL / _SECRET_KEY / _APPLICATION_ID).
#
# Usage:
#   ./scripts/test-trustpayway.sh <network> <msisdn> <amount>
#   ./scripts/test-trustpayway.sh orange 237690000000 100
#
# network = mtn | orange   (the {network} path segment)
# msisdn  = full number incl. country code, digits only (e.g. 237690000000)
# amount  = integer XAF

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

# --- load .env (only the TrustPayWay keys we need) ---
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source <(grep -E '^TRUSTPAYWAY_' "$ENV_FILE" || true); set +a
fi

NETWORK="${1:-orange}"
MSISDN="${2:-237690000000}"
AMOUNT="${3:-100}"

BASE="${TRUSTPAYWAY_BASE_URL:-}"
SECRET="${TRUSTPAYWAY_SECRET_KEY:-}"
APPID="${TRUSTPAYWAY_APPLICATION_ID:-}"

die() { echo "❌ $*" >&2; exit 1; }
[[ -n "$BASE"   ]] || die "TRUSTPAYWAY_BASE_URL is empty (set it in .env)"
[[ -n "$SECRET" ]] || die "TRUSTPAYWAY_SECRET_KEY is empty — register at $BASE/#register to obtain it"
[[ -n "$APPID"  ]] || die "TRUSTPAYWAY_APPLICATION_ID is empty (set it in .env)"
command -v curl >/dev/null || die "curl not found"

# tiny JSON field extractor (python3 if available, else grep fallback)
json() { # json <field>
  if command -v python3 >/dev/null; then
    python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get(sys.argv[1],"") if isinstance(d,dict) else "")' "$1" 2>/dev/null || true
  else
    grep -oE "\"$1\"[: ]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"$1\"[: ]*\"([^\"]*)\".*/\1/"
  fi
}

ORDER_ID="TEST-$(date +%s)"

echo "▶ Base URL : $BASE"
echo "▶ Network  : $NETWORK   MSISDN: $MSISDN   Amount: $AMOUNT XAF   orderId: $ORDER_ID"
echo

# --- 1. login ---------------------------------------------------------------
echo "1) POST /api/login ..."
LOGIN=$(curl -sS -X POST "$BASE/api/login" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"applicationId\":\"$APPID\"}")
echo "   response: $LOGIN"
TOKEN=$(printf '%s' "$LOGIN" | json access_token)
[[ -n "$TOKEN" ]] || die "no access_token in login response (check SECRET_KEY / applicationId)"
echo "   ✅ token: ${TOKEN:0:24}..."
echo

# --- 2. process-payment -----------------------------------------------------
echo "2) POST /api/$NETWORK/process-payment ..."
PAY=$(curl -sS -X POST "$BASE/api/$NETWORK/process-payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":\"$AMOUNT\",\"currency\":\"XAF\",\"subscriberMsisdn\":\"$MSISDN\",\"description\":\"Carte Promote $ORDER_ID\",\"orderId\":\"$ORDER_ID\",\"notifUrl\":\"${TRUSTPAYWAY_NOTIF_URL:-https://example.com/webhook}\"}")
echo "   response: $PAY"
# transaction_id lives under data.transaction_id
TXID=$(printf '%s' "$PAY" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print((d.get("data") or {}).get("transaction_id",""))
except Exception: print("")' 2>/dev/null || true)
[[ -n "$TXID" ]] || { echo "   ⚠ no transaction_id (the customer may need to confirm, or check the payload)"; exit 0; }
echo "   ✅ transaction_id: $TXID"
echo

# --- 3. poll get-status -----------------------------------------------------
echo "3) GET /api/$NETWORK/get-status/$TXID  (polling ~5x) ..."
for i in $(seq 1 5); do
  ST=$(curl -sS "$BASE/api/$NETWORK/get-status/$TXID" -H "Authorization: Bearer $TOKEN")
  STATUS=$(printf '%s' "$ST" | json status)
  echo "   [$i] status=$STATUS   ($ST)"
  case "$STATUS" in
    COMPLETED|SUCCESSFUL|FAILED|CANCELLED|EXPIRED|REJECTED) break ;;
  esac
  sleep 3
done
echo
echo "Done. Confirm the PIN on the test phone to see the status move to COMPLETED."
