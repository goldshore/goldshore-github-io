#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  exit 1
fi

if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  echo "CF_ACCOUNT_ID environment variable must be set" >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
AUTH_HEADER=("-H" "Authorization: Bearer ${CF_API_TOKEN}" "-H" "Content-Type: application/json")

CONFIG=$(cat <<'JSON'
[
  {
    "zone": "goldshore.org",
    "records": [
      {"type": "CNAME", "name": "goldshore.org", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "www.goldshore.org", "content": "goldshore.org", "proxied": true},
      {"type": "CNAME", "name": "preview.goldshore.org", "content": "goldshore-org-preview.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "dev.goldshore.org", "content": "goldshore-org-dev.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "admin.goldshore.org", "content": "goldshore-admin.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "web.goldshore.org", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "A", "name": "api.goldshore.org", "content": "192.0.2.1", "proxied": true},
      {"type": "AAAA", "name": "api.goldshore.org", "content": "100::", "proxied": true}
    ]
  },
  {
    "zone": "goldshore.foundation",
    "records": [
      {"type": "CNAME", "name": "goldshore.foundation", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "www.goldshore.foundation", "content": "goldshore.foundation", "proxied": true},
      {"type": "CNAME", "name": "admin.goldshore.foundation", "content": "goldshore-admin.pages.dev", "proxied": true},
      {"type": "A", "name": "api.goldshore.foundation", "content": "192.0.2.1", "proxied": true},
      {"type": "AAAA", "name": "api.goldshore.foundation", "content": "100::", "proxied": true}
    ]
  },
  {
    "zone": "goldshorefoundation.org",
    "records": [
      {"type": "CNAME", "name": "goldshorefoundation.org", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "www.goldshorefoundation.org", "content": "goldshorefoundation.org", "proxied": true},
      {"type": "CNAME", "name": "admin.goldshorefoundation.org", "content": "goldshore-admin.pages.dev", "proxied": true},
      {"type": "A", "name": "api.goldshorefoundation.org", "content": "192.0.2.1", "proxied": true},
      {"type": "AAAA", "name": "api.goldshorefoundation.org", "content": "100::", "proxied": true}
    ]
  },
  {
    "zone": "fortune-fund.com",
    "records": [
      {"type": "CNAME", "name": "fortune-fund.com", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "www.fortune-fund.com", "content": "fortune-fund.com", "proxied": true},
      {"type": "CNAME", "name": "admin.fortune-fund.com", "content": "goldshore-admin.pages.dev", "proxied": true},
      {"type": "A", "name": "api.fortune-fund.com", "content": "192.0.2.1", "proxied": true},
      {"type": "AAAA", "name": "api.fortune-fund.com", "content": "100::", "proxied": true}
    ]
  },
  {
    "zone": "fortune-fund.games",
    "records": [
      {"type": "CNAME", "name": "fortune-fund.games", "content": "goldshore-org.pages.dev", "proxied": true},
      {"type": "CNAME", "name": "www.fortune-fund.games", "content": "fortune-fund.games", "proxied": true},
      {"type": "CNAME", "name": "admin.fortune-fund.games", "content": "goldshore-admin.pages.dev", "proxied": true},
      {"type": "A", "name": "api.fortune-fund.games", "content": "192.0.2.1", "proxied": true},
      {"type": "AAAA", "name": "api.fortune-fund.games", "content": "100::", "proxied": true}
    ]
  }
]
JSON
)

upsert_record() {
  local zone_id="$1"
  local name="$2"
  local type="$3"
  local content="$4"
  local proxied="$5"

  local query
  query=$(curl -sS -X GET "${API}/zones/${zone_id}/dns_records?name=${name}" "${AUTH_HEADER[@]}")
  if [[ $(echo "$query" | jq -r '.success') != "true" ]]; then
    echo "Failed to query records for ${name}" >&2
    echo "$query" >&2
    return 1
  fi

  local record_id
  record_id=$(echo "$query" | jq -r --arg type "$type" '.result[]? | select(.type == $type) | .id' | head -n1)

  local conflicts
  conflicts=$(echo "$query" | jq -r --arg type "$type" '
    (.result // [])
    | map(select((($type == "CNAME" and .type != "CNAME") or ($type != "CNAME" and .type == "CNAME"))))
    | .[]?
    | "\(.id) \(.type)"
  ')

  if [[ -n "$conflicts" ]]; then
    while read -r conflict_id conflict_type; do
      [[ -z "$conflict_id" ]] && continue
      echo "Removing conflicting ${conflict_type} record for ${name}" >&2
      curl -sS -X DELETE "${API}/zones/${zone_id}/dns_records/${conflict_id}" "${AUTH_HEADER[@]}" >/dev/null
    done <<< "$conflicts"
  fi

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied" \
    '{type:$type, name:$name, content:$content, proxied:$proxied, ttl:1}'
  )

  if [[ -n "$record_id" ]]; then
    curl -sS -X PUT "${API}/zones/${zone_id}/dns_records/${record_id}" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
    echo "Updated ${type} record for ${name}" >&2
  else
    curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${AUTH_HEADER[@]}" --data "$payload" >/dev/null
    echo "Created ${type} record for ${name}" >&2
  fi
}

main() {
  local zone_id=$1

  local ipv4_target=${IPv4_TARGET:-192.0.2.1}
  local ipv6_target=${IPv6_TARGET:-}
  local apex_cname_target=${APEX_CNAME_TARGET:-}
  local preview_cname_target=${PREVIEW_CNAME_TARGET:-"goldshore-org-preview.pages.dev"}
  local dev_cname_target=${DEV_CNAME_TARGET:-"goldshore-org-dev.pages.dev"}
  local www_cname_target=${WWW_CNAME_TARGET:-$ZONE_NAME}
  local default_proxied=${DEFAULT_PROXIED:-true}

  local -a records=()

  if [[ -n "$apex_cname_target" ]]; then
    records+=("$ZONE_NAME|CNAME|$apex_cname_target|$default_proxied")
  else
    records+=("$ZONE_NAME|A|$ipv4_target|$default_proxied")

    if [[ -n "$ipv6_target" ]]; then
      records+=("$ZONE_NAME|AAAA|$ipv6_target|$default_proxied")
    fi
  fi

  if [[ -n "$www_cname_target" ]]; then
    records+=("www.$ZONE_NAME|CNAME|$www_cname_target|$default_proxied")
  fi

  if [[ -n "$preview_cname_target" ]]; then
    records+=("preview.$ZONE_NAME|CNAME|$preview_cname_target|$default_proxied")
  fi

  if [[ -n "$dev_cname_target" ]]; then
    records+=("dev.$ZONE_NAME|CNAME|$dev_cname_target|$default_proxied")
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

done

echo "DNS synchronisation complete."
