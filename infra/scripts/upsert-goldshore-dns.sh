#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

ZONE_NAME=${ZONE_NAME:-goldshore.org}
API="https://api.cloudflare.com/client/v4"

# Resolve the zone identifier when not provided explicitly.
if [[ -z "${CF_ZONE_ID:-}" ]]; then
  CF_ZONE_ID=$(curl -s -X GET "$API/zones?name=$ZONE_NAME" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id')
fi

if [[ -z "${CF_ZONE_ID:-}" || "${CF_ZONE_ID}" == "null" ]]; then
  echo "Unable to resolve zone id for $ZONE_NAME" >&2
  exit 1
fi

records=$(cat <<JSON
[
  {"name": "goldshore.org", "type": "A", "content": "192.0.2.1", "proxied": true},
  {"name": "www.goldshore.org", "type": "CNAME", "content": "goldshore.org", "proxied": true},
  {"name": "preview.goldshore.org", "type": "CNAME", "content": "goldshore.org", "proxied": true},
  {"name": "dev.goldshore.org", "type": "CNAME", "content": "goldshore.org", "proxied": true}
]
JSON
)

api_request() {
  local method=$1
  local endpoint=$2
  local data=${3-}
  local response
  local curl_args=(-s -X "$method" "$API$endpoint" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

  if [[ -n "$data" ]]; then
    curl_args+=(--data "$data")
  fi

  if ! response=$(curl "${curl_args[@]}"); then
    echo "Cloudflare API request failed for $method $endpoint" >&2
    exit 1
  fi

  echo "$response" | jq -e '.success' > /dev/null || {
    echo "Cloudflare API request failed for $method $endpoint: $response" >&2
    exit 1
  }

  echo "$response"
}

mapfile -t record_entries < <(echo "$records" | jq -c '.[]')

declare -A record_by_name
declare -A record_type_by_name
declare -a ordered_names=()

for record in "${record_entries[@]}"; do
  name=$(echo "$record" | jq -r '.name')
  type=$(echo "$record" | jq -r '.type')

  if [[ -n "${record_by_name[$name]:-}" ]]; then
    if [[ "${record_type_by_name[$name]}" != "$type" ]]; then
      echo "Conflicting record definitions for $name: ${record_type_by_name[$name]} vs $type" >&2
      exit 1
    fi
  else
    ordered_names+=("$name")
  fi

  record_by_name[$name]="$record"
  record_type_by_name[$name]="$type"
done

echo "Syncing DNS records for zone $ZONE_NAME ($CF_ZONE_ID)"

for name in "${ordered_names[@]}"; do
  record="${record_by_name[$name]}"
  type=$(echo "$record" | jq -r '.type')
  content=$(echo "$record" | jq -r '.content')
  proxied=$(echo "$record" | jq -r '.proxied')

  existing=$(api_request "GET" "/zones/$CF_ZONE_ID/dns_records?name=$name&per_page=100")

  mapfile -t conflicting_ids < <(echo "$existing" | jq -r --arg type "$type" '.result[] | select(.type != $type) | .id')
  if [[ ${#conflicting_ids[@]} -gt 0 ]]; then
    echo "Removing conflicting records for $name before creating $type"
    for conflicting_id in "${conflicting_ids[@]}"; do
      api_request "DELETE" "/zones/$CF_ZONE_ID/dns_records/$conflicting_id" > /dev/null
    done
  fi

  record_id=$(echo "$existing" | jq -r --arg type "$type" '.result[] | select(.type == $type) | .id' | head -n1)

  payload=$(jq -n --arg type "$type" --arg name "$name" --arg content "$content" --argjson proxied $proxied '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:1}')

  if [[ -z "$record_id" ]]; then
    echo "Creating $type $name -> $content"
    api_request "POST" "/zones/$CF_ZONE_ID/dns_records" "$payload" > /dev/null
  else
    echo "Updating $type $name -> $content"
    api_request "PUT" "/zones/$CF_ZONE_ID/dns_records/$record_id" "$payload" > /dev/null
  fi
done

echo "DNS synchronized for ${ZONE_NAME}."
