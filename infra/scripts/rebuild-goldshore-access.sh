#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  echo "CF_ACCOUNT_ID environment variable must be set" >&2
  exit 1
fi

CONFIG_FILE=${CONFIG_FILE:-infra/access/applications.json}
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Access configuration file not found: $CONFIG_FILE" >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access"

existing_apps=$(curl -s -X GET "$API/apps" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if [[ $(echo "$existing_apps" | jq -r '.success') != "true" ]]; then
  echo "Unable to fetch existing Access applications" >&2
  echo "$existing_apps" >&2
  exit 1
fi

echo "Reconciling Cloudflare Access applications"

jq -c '.applications[]' "$CONFIG_FILE" | while read -r app; do
  name=$(echo "$app" | jq -r '.name')
  domain=$(echo "$app" | jq -r '.domain')
  type=$(echo "$app" | jq -r '.type')
  session_duration=$(echo "$app" | jq -r '.session_duration')

  app_payload=$(jq -n --arg name "$name" --arg domain "$domain" --arg type "$type" --arg session_duration "$session_duration" '{name:$name, domain:$domain, type:$type, session_duration:$session_duration}')

  app_id=$(echo "$existing_apps" | jq -r --arg name "$name" '.result[] | select(.name == $name) | .id' | head -n 1)

  if [[ -z "$app_id" ]]; then
    echo "Creating Access application: $name"
    response=$(curl -s -X POST "$API/apps" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$app_payload")
    app_id=$(echo "$response" | jq -r '.result.id')
  else
    echo "Updating Access application: $name"
    curl -s -X PUT "$API/apps/$app_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$app_payload" > /dev/null
  fi

  if [[ -z "$app_id" || "$app_id" == "null" ]]; then
    echo "Failed to determine application id for $name" >&2
    continue
  fi

  policies=$(echo "$app" | jq -c '.policies[]?')
  if [[ -z "$policies" ]]; then
    continue
  fi

  existing_policies=$(curl -s -X GET "$API/apps/$app_id/policies" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

  echo "$policies" | while read -r policy; do
    policy_name=$(echo "$policy" | jq -r '.name')
    policy_payload=$(echo "$policy" | jq '{name, decision, precedence: (.precedence // 1), include}')

    policy_id=$(echo "$existing_policies" | jq -r --arg name "$policy_name" '.result[] | select(.name == $name) | .id' | head -n 1)

    if [[ -z "$policy_id" ]]; then
      echo "  Creating policy: $policy_name"
      curl -s -X POST "$API/apps/$app_id/policies" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "$policy_payload" > /dev/null
    else
      echo "  Updating policy: $policy_name"
      curl -s -X PUT "$API/apps/$app_id/policies/$policy_id" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "$policy_payload" > /dev/null
    fi
  done

done

echo "Access configuration updated."

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
