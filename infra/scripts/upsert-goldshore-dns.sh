#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

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

  local hosts=("$ZONE_NAME" "www.$ZONE_NAME" "preview.$ZONE_NAME" "dev.$ZONE_NAME")
  for host in "${hosts[@]}"; do
    upsert_record "$zone" "$host" "A" "192.0.2.1" true
    upsert_record "$zone" "$host" "AAAA" "100::" true
  done
}

main "$@"
