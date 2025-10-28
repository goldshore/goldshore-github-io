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
  {"name": "www.goldshore.org", "type": "A", "content": "192.0.2.1", "proxied": true},
  {"name": "preview.goldshore.org", "type": "A", "content": "192.0.2.1", "proxied": true},
  {"name": "dev.goldshore.org", "type": "A", "content": "192.0.2.1", "proxied": true}
]
JSON
)

echo "Syncing DNS records for zone $ZONE_NAME ($CF_ZONE_ID)"

echo "$records" | jq -c '.[]' | while read -r record; do
  name=$(echo "$record" | jq -r '.name')
  type=$(echo "$record" | jq -r '.type')
  content=$(echo "$record" | jq -r '.content')
  proxied=$(echo "$record" | jq -r '.proxied')

  existing=$(curl -s -X GET "$API/zones/$CF_ZONE_ID/dns_records?type=$type&name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")
  record_id=$(echo "$existing" | jq -r '.result[0].id')

  payload=$(jq -n --arg type "$type" --arg name "$name" --arg content "$content" --argjson proxied $proxied '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:1}')

  if [[ "$record_id" == "null" || -z "$record_id" ]]; then
    echo "Creating $type $name -> $content"
    curl -s -X POST "$API/zones/$CF_ZONE_ID/dns_records" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" | jq '.success'
  else
    echo "Updating $type $name -> $content"
    curl -s -X PUT "$API/zones/$CF_ZONE_ID/dns_records/$record_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" | jq '.success'
  fi

done
API=https://api.cloudflare.com/client/v4
AUTH_HEADER=("-H" "Authorization: Bearer ${CF_API_TOKEN}" "-H" "Content-Type: application/json")

zone_response=$(curl -sS -X GET "${API}/zones?name=${ZONE_NAME}" "${AUTH_HEADER[@]}")
zone_id=$(echo "$zone_response" | jq -r '.result[0].id')
if [[ -z "$zone_id" || "$zone_id" == "null" ]]; then
  echo "Unable to find zone ${ZONE_NAME}" >&2
  exit 1
fi

declare -A RECORDS
RECORDS["${ZONE_NAME}|A"]=192.0.2.1
RECORDS["www.${ZONE_NAME}|CNAME"]=${ZONE_NAME}
RECORDS["preview.${ZONE_NAME}|CNAME"]=${ZONE_NAME}
RECORDS["dev.${ZONE_NAME}|CNAME"]=${ZONE_NAME}

upsert_record() {
  local name="$1"
  local type="$2"
  local content="$3"

  existing=$(curl -sS -X GET "${API}/zones/${zone_id}/dns_records?name=${name}&type=${type}" "${AUTH_HEADER[@]}")
  record_id=$(echo "$existing" | jq -r '.result[0].id')

  payload=$(jq -n --arg type "$type" --arg name "$name" --arg content "$content" '{type:$type,name:$name,content:$content,proxied:true,ttl:1}')

  if [[ -z "$record_id" || "$record_id" == "null" ]]; then
    echo "Creating ${type} ${name}" >&2
    curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
  else
    echo "Updating ${type} ${name}" >&2
    curl -sS -X PUT "${API}/zones/${zone_id}/dns_records/${record_id}" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
  fi
}

for key in "${!RECORDS[@]}"; do
  name=${key%|*}
  type=${key#*|}
  upsert_record "$name" "$type" "${RECORDS[$key]}"
done

echo "DNS synchronized for ${ZONE_NAME}."
ZONE_NAME=${1:-goldshore.org}
API="https://api.cloudflare.com/client/v4"

zone_id() {
  curl -s -X GET "$API/zones?name=$ZONE_NAME" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id'
}

upsert_record() {
  local zone_id=$1
  local name=$2
  local type=$3
  local content=$4
  local proxied=$5

  local existing_id
  existing_id=$(curl -s -X GET "$API/zones/$zone_id/dns_records?type=$type&name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // ""')

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied $proxied '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')

  if [[ -n "$existing_id" ]]; then
    curl -s -X PUT "$API/zones/$zone_id/dns_records/$existing_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Updated $type record for $name"
  else
    curl -s -X POST "$API/zones/$zone_id/dns_records" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Created $type record for $name"
  fi
}

main() {
  local zone=$(zone_id)
  if [[ -z "$zone" || "$zone" == "null" ]]; then
    echo "Unable to resolve zone id for $ZONE_NAME" >&2
    exit 1
  fi

  local -a records=(
    "$ZONE_NAME CNAME goldshore-org.pages.dev"
    "www.$ZONE_NAME CNAME goldshore-org.pages.dev"
    "preview.$ZONE_NAME CNAME goldshore-org-preview.pages.dev"
    "dev.$ZONE_NAME CNAME goldshore-org-dev.pages.dev"
  )

  for entry in "${records[@]}"; do
    read -r host type target <<<"$entry"
    upsert_record "$zone" "$host" "$type" "$target" true
  done
}

main "$@"
