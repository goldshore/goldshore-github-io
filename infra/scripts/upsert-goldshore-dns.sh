#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  exit 1
fi

ZONE_NAME=${ZONE_NAME:-goldshore.org}
API="https://api.cloudflare.com/client/v4"

# Resolve the zone identifier when not provided explicitly.
cf_api() {
  curl --fail-with-body -sS "$@"
}

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  CF_ZONE_ID=$(cf_api -X GET "$API/zones?name=$ZONE_NAME" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // empty')
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "Unable to resolve zone id for $ZONE_NAME" >&2
  exit 1
fi

remove_conflicting_records() {
  local zone_id=$1
  local name=$2
  local desired_type=$3

  local conflict_types=()
  case "$desired_type" in
    CNAME)
      conflict_types=("A" "AAAA")
      ;;
    A|AAAA)
      conflict_types=("CNAME")
      ;;
    *)
      return
      ;;
  esac

  local conflicts_json
  conflicts_json=$(cf_api -X GET "$API/zones/$zone_id/dns_records?name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

  for conflict_type in "${conflict_types[@]}"; do
    local conflict_ids
    conflict_ids=$(echo "$conflicts_json" | jq -r --arg type "$conflict_type" '(.result // [])[]? | select(.type == $type) | .id')

    while IFS= read -r id; do
      [[ -z "$id" || "$id" == "null" ]] && continue
      cf_api -X DELETE "$API/zones/$zone_id/dns_records/$id" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" >/dev/null
      echo "Removed conflicting $conflict_type record for $name"
    done <<<"$conflict_ids"
  done
}

upsert_record() {
  local zone_id=$1
  local name=$2
  local type=$3
  local content=$4
  local proxied=$5

  remove_conflicting_records "$zone_id" "$name" "$type"

  local existing_id
  existing_id=$(cf_api -X GET "$API/zones/$zone_id/dns_records?type=$type&name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // ""')

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied $proxied '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')

  if [[ -n "$existing_id" ]]; then
    cf_api -X PUT "$API/zones/$zone_id/dns_records/$existing_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Updated $type record for $name"
  else
    cf_api -X POST "$API/zones/$zone_id/dns_records" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Created $type record for $name"
  fi
}

main() {
  local zone_id=$1

  local ipv4_target=${IPv4_TARGET:-192.0.2.1}
  local ipv6_target=${IPv6_TARGET:-}

  local -a records=(
    "$ZONE_NAME|A|$ipv4_target|true"
  )

  if [[ -n "$ipv6_target" ]]; then
    records+=("$ZONE_NAME|AAAA|$ipv6_target|true")
  fi

  records+=(
    "www.$ZONE_NAME|CNAME|$ZONE_NAME|true"
    "preview.$ZONE_NAME|CNAME|$ZONE_NAME|true"
    "dev.$ZONE_NAME|CNAME|$ZONE_NAME|true"
  )

  local record
  for record in "${records[@]}"; do
    IFS='|' read -r name type content proxied <<<"$record"
    upsert_record "$zone_id" "$name" "$type" "$content" "$proxied"
  done

  echo "DNS synchronized for ${ZONE_NAME}."
}

main "$CF_ZONE_ID"
