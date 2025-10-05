#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

ZONE_NAME=${ZONE_NAME:-goldshore.org}
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
