#!/usr/bin/env bash
set -euo pipefail

: "${CF_API_TOKEN:?CF_API_TOKEN missing}"
: "${CF_ACCOUNT_ID:?CF_ACCOUNT_ID missing}"

ZONE="${ZONE_NAME:-${ZONE:-goldshore.org}}"
API="https://api.cloudflare.com/client/v4"
AUTH_HEADER=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

zone_response=$(curl -sS -X GET "${API}/zones?name=${ZONE}" "${AUTH_HEADER[@]}")
zone_id=$(echo "${zone_response}" | jq -r '.result[0].id // empty')
if [[ -z "${zone_id}" ]]; then
  echo "Unable to find zone ${ZONE}" >&2
  exit 1
fi

upsert_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="${4:-true}"

  local existing_response
  existing_response=$(curl -sS -X GET "${API}/zones/${zone_id}/dns_records?type=${type}&name=${name}" "${AUTH_HEADER[@]}")
  local record_id
  record_id=$(echo "${existing_response}" | jq -r '.result[0].id // empty')

  local payload
  payload=$(jq -n \
    --arg type "${type}" \
    --arg name "${name}" \
    --arg content "${content}" \
    --argjson proxied "${proxied}" \
    '{type: $type, name: $name, content: $content, proxied: $proxied}')

  if [[ -n "${record_id}" ]]; then
    curl -sS -X PUT "${API}/zones/${zone_id}/dns_records/${record_id}" "${AUTH_HEADER[@]}" --data "${payload}" >/dev/null
    echo "✓ updated ${type} ${name} -> ${content}"
  else
    curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${AUTH_HEADER[@]}" --data "${payload}" >/dev/null
    echo "✓ created ${type} ${name} -> ${content}"
  fi
}

upsert_record CNAME "${ZONE}" "goldshore-org.pages.dev"
upsert_record CNAME "www.${ZONE}" "${ZONE}"
upsert_record CNAME "preview.${ZONE}" "goldshore-org-preview.pages.dev"
upsert_record CNAME "dev.${ZONE}" "goldshore-org-dev.pages.dev"

echo "✓ DNS upsert complete."
