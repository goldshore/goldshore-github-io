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
  CF_ZONE_ID=$(curl -sS -X GET "$API/zones?name=$ZONE_NAME" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // ""')
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "Unable to resolve zone id for $ZONE_NAME" >&2
  exit 1
fi

records=$(cat <<JSON
[
  {"name": "${ZONE_NAME}", "type": "A", "content": "192.0.2.1", "proxied": true},
  {"name": "${ZONE_NAME}", "type": "AAAA", "content": "100::", "proxied": true},
  {"name": "www.${ZONE_NAME}", "type": "CNAME", "content": "${ZONE_NAME}", "proxied": true},
  {"name": "preview.${ZONE_NAME}", "type": "CNAME", "content": "${ZONE_NAME}", "proxied": true},
  {"name": "dev.${ZONE_NAME}", "type": "CNAME", "content": "${ZONE_NAME}", "proxied": true}
]
JSON
)

echo "Syncing DNS records for zone $ZONE_NAME ($CF_ZONE_ID)"

while IFS= read -r record; do
  name=$(echo "$record" | jq -r '.name')
  type=$(echo "$record" | jq -r '.type')
  content=$(echo "$record" | jq -r '.content')
  proxied=$(echo "$record" | jq '.proxied // false')

  existing=$(curl -sS -X GET "$API/zones/$CF_ZONE_ID/dns_records?name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")
  if [[ $(echo "$existing" | jq -r '.success') != "true" ]]; then
    echo "Failed to query DNS records for $name" >&2
    echo "$existing" >&2
    exit 1
  fi

  record_id=$(echo "$existing" | jq -r --arg type "$type" '.result[] | select(.type == $type) | .id' | head -n1)
  conflicts=$(echo "$existing" | jq -r --arg type "$type" '.result[] | select(.type != $type) | "\(.id) \(.type)"')

  if [[ -n "$conflicts" ]]; then
    while read -r conflict_id conflict_type; do
      [[ -z "$conflict_id" ]] && continue
      response=$(curl -sS -X DELETE "$API/zones/$CF_ZONE_ID/dns_records/$conflict_id" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json")
      if [[ $(echo "$response" | jq -r '.success') != "true" ]]; then
        echo "Failed to delete conflicting $conflict_type record for $name" >&2
        echo "$response" >&2
        exit 1
      fi
      echo "Deleted conflicting $conflict_type record for $name"
    done <<< "$conflicts"
  fi

  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied" '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:1}')

  if [[ -z "$record_id" ]]; then
    response=$(curl -sS -X POST "$API/zones/$CF_ZONE_ID/dns_records" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload")
    if [[ $(echo "$response" | jq -r '.success') != "true" ]]; then
      echo "Failed to create $type record for $name" >&2
      echo "$response" >&2
      exit 1
    fi
    echo "Created $type record for $name"
  else
    response=$(curl -sS -X PUT "$API/zones/$CF_ZONE_ID/dns_records/$record_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload")
    if [[ $(echo "$response" | jq -r '.success') != "true" ]]; then
      echo "Failed to update $type record for $name" >&2
      echo "$response" >&2
      exit 1
    fi
    echo "Updated $type record for $name"
  fi

done < <(echo "$records" | jq -c '.[]')

echo "DNS synchronized for $ZONE_NAME."
