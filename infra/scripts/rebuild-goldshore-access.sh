#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  echo "CF_ACCOUNT_ID is required" >&2
  exit 1
fi

APP_NAME=${APP_NAME:-"GoldShore Admin"}
DOMAIN=${DOMAIN:-"goldshore.org"}
AUD=${AUD:-"https://${DOMAIN}/admin"}
POLICY_NAME=${POLICY_NAME:-"GoldShore admin allow"}
ALLOWED_DOMAIN=${ALLOWED_DOMAIN:-"goldshore.org"}
API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access"
AUTH_HEADER=("-H" "Authorization: Bearer ${CF_API_TOKEN}" "-H" "Content-Type: application/json")

apps=$(curl -sS -X GET "${API}/apps" "${AUTH_HEADER[@]}")
app_id=$(echo "$apps" | jq -r --arg name "$APP_NAME" '.result[] | select(.name == $name) | .id' | head -n1)

payload=$(jq -n \
  --arg name "$APP_NAME" \
  --arg domain "$DOMAIN" \
  --arg aud "$AUD" \
  '{name:$name, domain:$domain, session_duration:"24h", type:"self_hosted", app_launcher_visible:false, self_hosted_domains:[{"name":$domain,"aud":$aud+"/*"}]}'
)

if [[ -z "$app_id" ]]; then
  echo "Creating Access application ${APP_NAME}" >&2
  create_resp=$(curl -sS -X POST "${API}/apps" "${AUTH_HEADER[@]}" --data "$payload")
  app_id=$(echo "$create_resp" | jq -r '.result.id')
else
  echo "Updating Access application ${APP_NAME}" >&2
  curl -sS -X PUT "${API}/apps/${app_id}" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
fi

policies=$(curl -sS -X GET "${API}/apps/${app_id}/policies" "${AUTH_HEADER[@]}")
policy_id=$(echo "$policies" | jq -r --arg name "$POLICY_NAME" '.result[] | select(.name == $name) | .id' | head -n1)

policy_payload=$(jq -n \
  --arg name "$POLICY_NAME" \
  --arg domain "$ALLOWED_DOMAIN" \
  '{name:$name, decision:"allow", include:[{email_domain:{domain:$domain}}], precedence:1, purpose_justification_required:false}')

if [[ -z "$policy_id" ]]; then
  echo "Creating Access policy ${POLICY_NAME}" >&2
  curl -sS -X POST "${API}/apps/${app_id}/policies" "${AUTH_HEADER[@]}" --data "$policy_payload" >/dev/null
else
  echo "Updating Access policy ${POLICY_NAME}" >&2
  curl -sS -X PUT "${API}/apps/${app_id}/policies/${policy_id}" "${AUTH_HEADER[@]}" --data "$policy_payload" >/dev/null
fi

echo "Access application and policy ensured for ${DOMAIN}."
