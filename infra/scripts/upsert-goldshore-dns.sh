#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  exit 1
fi

ZONE_NAME=${ZONE_NAME:-goldshore.org}
API="https://api.cloudflare.com/client/v4"
AUTH_HEADER=("-H" "Authorization: Bearer ${CF_API_TOKEN}" "-H" "Content-Type: application/json")

get_zone_id() {
  if [[ -n "${CF_ZONE_ID:-}" ]]; then
    echo "${CF_ZONE_ID}"
    return
  fi

  curl -sS -X GET "${API}/zones?name=${ZONE_NAME}" "${AUTH_HEADER[@]}" | jq -r '.result[0].id // ""'
}

upsert_record() {
  local zone_id=$1
  local name=$2
  local type=$3
  local content=$4
  local proxied_flag=$5

  local existing
  existing=$(curl -sS -X GET "${API}/zones/${zone_id}/dns_records?type=${type}&name=${name}" "${AUTH_HEADER[@]}")
  local record_id
  record_id=$(echo "$existing" | jq -r '.result[0].id // ""')

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied_flag" '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')

  if [[ -n "$record_id" ]]; then
    curl -sS -X PUT "${API}/zones/${zone_id}/dns_records/${record_id}" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
    echo "Updated ${type} record for ${name}" >&2
  else
    curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
    echo "Created ${type} record for ${name}" >&2
  fi
}

main() {
  local zone_id
  zone_id=$(get_zone_id)
  if [[ -z "$zone_id" ]]; then
    echo "Unable to resolve zone id for ${ZONE_NAME}" >&2
    exit 1
  fi

  local hosts=("${ZONE_NAME}" "www.${ZONE_NAME}" "preview.${ZONE_NAME}" "dev.${ZONE_NAME}")
  local ipv4_target="192.0.2.1"
  local ipv6_target="100::"

  for host in "${hosts[@]}"; do
    upsert_record "$zone_id" "$host" "A" "$ipv4_target" true
    upsert_record "$zone_id" "$host" "AAAA" "$ipv6_target" true
  done

  echo "DNS synchronized for ${ZONE_NAME}."
}

main "$@"
