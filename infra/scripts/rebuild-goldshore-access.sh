#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
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
AUTH_HEADER=("-H" "Authorization: Bearer $CF_API_TOKEN" "-H" "Content-Type: application/json")

existing_apps=$(curl -sS -X GET "$API/apps" "${AUTH_HEADER[@]}")
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

  app_payload=$(jq -n \
    --arg name "$name" \
    --arg domain "$domain" \
    --arg type "$type" \
    --arg session_duration "$session_duration" \
    '{name:$name, domain:$domain, type:$type, session_duration:$session_duration}'
  )

  app_id=$(echo "$existing_apps" | jq -r --arg name "$name" '.result[] | select(.name == $name) | .id' | head -n 1)

  if [[ -z "$app_id" ]]; then
    echo "Creating Access application: $name"
    response=$(curl -sS -X POST "$API/apps" "${AUTH_HEADER[@]}" --data "$app_payload")
    app_id=$(echo "$response" | jq -r '.result.id')
  else
    echo "Updating Access application: $name"
    curl -sS -X PUT "$API/apps/$app_id" "${AUTH_HEADER[@]}" --data "$app_payload" >/dev/null
  fi

  if [[ -z "$app_id" || "$app_id" == "null" ]]; then
    echo "Failed to determine application id for $name" >&2
    continue
  fi

  policies=$(echo "$app" | jq -c '.policies[]?')
  if [[ -z "$policies" ]]; then
    continue
  fi

  existing_policies=$(curl -sS -X GET "$API/apps/$app_id/policies" "${AUTH_HEADER[@]}")

  echo "$policies" | while read -r policy; do
    policy_name=$(echo "$policy" | jq -r '.name')
    policy_payload=$(echo "$policy" | jq '{name, decision, precedence: (.precedence // 1), include}')

    policy_id=$(echo "$existing_policies" | jq -r --arg name "$policy_name" '.result[] | select(.name == $name) | .id' | head -n 1)

    if [[ -z "$policy_id" ]]; then
      echo "  Creating policy: $policy_name"
      curl -sS -X POST "$API/apps/$app_id/policies" "${AUTH_HEADER[@]}" --data "$policy_payload" >/dev/null
    else
      echo "  Updating policy: $policy_name"
      curl -sS -X PUT "$API/apps/$app_id/policies/$policy_id" "${AUTH_HEADER[@]}" --data "$policy_payload" >/dev/null
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
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi
if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  echo "CF_ACCOUNT_ID is required" >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
SESSION_DURATION=${SESSION_DURATION:-"24h"}

apps=(
  "goldshore-admin https://goldshore.org/admin/*"
  "goldshore-preview-admin https://preview.goldshore.org/admin/*"
  "goldshore-dev-admin https://dev.goldshore.org/admin/*"
)

api_request() {
  local method=$1
  local url=$2
  local data=${3:-}
  if [[ -n $data ]]; then
    curl -s -X "$method" "$API$url" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -s -X "$method" "$API$url" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json"
  fi
}

ensure_app() {
  local name=$1
  local domain=$2
  local result
  result=$(api_request GET "/accounts/$CF_ACCOUNT_ID/access/apps?page=1&per_page=100&name=$name")
  local app_id
  app_id=$(echo "$result" | jq -r '.result[] | select(.name == "'$name'") | .id' | head -n1)

  local payload
  payload=$(jq -n --arg name "$name" --arg domain "$domain" --arg duration "$SESSION_DURATION" '{
    name: $name,
    domain: $domain,
    type: "self_hosted",
    session_duration: $duration,
    allowed_idps: []
  }')

  if [[ -n "$app_id" ]]; then
    api_request PUT "/accounts/$CF_ACCOUNT_ID/access/apps/$app_id" "$payload" >/dev/null
    echo "Updated Access application $name"
  else
    app_id=$(api_request POST "/accounts/$CF_ACCOUNT_ID/access/apps" "$payload" | jq -r '.result.id')
    echo "Created Access application $name"
  fi

  echo "$app_id"
}

ensure_policy() {
  local app_id=$1
  local policy_name="Allow Goldshore"
  local payload
  payload=$(jq -n --arg name "$policy_name" '{
    name: $name,
    precedence: 1,
    decision: "allow",
    include: [{ everyone: {} }],
    require: [],
    exclude: []
  }')

  local existing
  existing=$(api_request GET "/accounts/$CF_ACCOUNT_ID/access/apps/$app_id/policies" \
    | jq -r --arg name "$policy_name" '.result[]? | select(.name == $name) | .id' \
    | head -n1)

  if [[ -n "$existing" ]]; then
    api_request PUT "/accounts/$CF_ACCOUNT_ID/access/apps/$app_id/policies/$existing" "$payload" >/dev/null
    echo "Updated Access policy for app $app_id"
  else
    api_request POST "/accounts/$CF_ACCOUNT_ID/access/apps/$app_id/policies" "$payload" >/dev/null
    echo "Created Access policy for app $app_id"
  fi
}

main() {
  for entry in "${apps[@]}"; do
    name=${entry%% *}
    domain=${entry#* }
    app_id=$(ensure_app "$name" "$domain")
    ensure_policy "$app_id"
  done
}

main
