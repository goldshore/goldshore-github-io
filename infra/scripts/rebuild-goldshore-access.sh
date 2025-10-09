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
