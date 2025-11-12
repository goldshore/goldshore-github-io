#!/usr/bin/env bash
set -euo pipefail

note() { printf "\n\033[1;34m[info]\033[0m %s\n" "$*"; }
fail() { printf "\n\033[1;31m[fail]\033[0m %s\n" "$*"; exit 1; }

required_env=(CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CODEX_JWT_HS256_KEY GITHUB_CLIENT_SECRET GITHUB_PRIVATE_KEY GITHUB_WEBHOOK_SECRET)
for v in "${required_env[@]}"; do
  [[ -n "${!v:-}" ]] || fail "Missing secret: $v"
done

note "Wrangler version"
wrangler --version | grep -Eo "[0-9]+\.[0-9]+\.[0-9]+" | awk 'BEGIN{req="3.78.0"} {if($0<req) exit 1}' || fail "Wrangler < 3.78.0"

note "Route /health reachable (200)"
code=$(curl -sS -o /dev/null -w '%{http_code}' https://api.goldshore.org/health)
[[ "$code" == "200" ]] || fail "/health returned $code"

note "Webhook path not Access-gated"
h1=$(curl -sS -i https://api.goldshore.org/github/webhook | head -n1 | awk '{print $2}')
[[ "$h1" == "403" || "$h1" == "405" ]] || fail "Webhook path not returning 403/405; likely Access login page"

note "Queues exist"
wrangler queues list | grep -q "goldshore-events" || fail "goldshore-events missing"
wrangler queues list | grep -q "goldshore-dlq" || fail "goldshore-dlq missing"

note "Poll requires JWT (401)"
code=$(curl -sS -o /dev/null -w '%{http_code}' https://api.goldshore.org/poll)
[[ "$code" == "401" ]] || fail "/poll returned $code (should be 401)"

note "CORS single-origin echo for admin.goldshore.org"
curl -sSI -H "Origin: https://admin.goldshore.org" https://api.goldshore.org/health \
 | awk -F': ' '/^Access-Control-Allow-Origin:/ {print $2}' \
 | grep -qx "https://admin.goldshore.org" || fail "CORS did not echo admin origin"

note "All preflights passed"
