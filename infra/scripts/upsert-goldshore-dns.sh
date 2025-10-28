#!/usr/bin/env bash
set -euo pipefail

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
      {"type": "CNAME", "name": "web.goldshore.foundation", "content": "goldshore-org.pages.dev", "proxied": true},
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
      {"type": "CNAME", "name": "web.goldshorefoundation.org", "content": "goldshore-org.pages.dev", "proxied": true},
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
      {"type": "CNAME", "name": "web.fortune-fund.com", "content": "goldshore-org.pages.dev", "proxied": true},
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
      {"type": "CNAME", "name": "web.fortune-fund.games", "content": "goldshore-org.pages.dev", "proxied": true},
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

echo "$CONFIG" | jq -c '.[]' | while read -r zone; do
  zone_name=$(echo "$zone" | jq -r '.zone')
  echo "Synchronising zone ${zone_name}" >&2
  zone_lookup=$(curl -sS -X GET "${API}/zones?name=${zone_name}" "${AUTH_HEADER[@]}")
  zone_id=$(echo "$zone_lookup" | jq -r '.result[0].id // empty')
  if [[ -z "$zone_id" ]]; then
    echo "Unable to resolve zone id for ${zone_name}" >&2
    continue
  fi

  echo "$zone" | jq -c '.records[]' | while read -r record; do
    type=$(echo "$record" | jq -r '.type')
    name=$(echo "$record" | jq -r '.name')
    content=$(echo "$record" | jq -r '.content')
    proxied=$(echo "$record" | jq '.proxied // false')
    upsert_record "$zone_id" "$name" "$type" "$content" "$proxied"
  done

done

echo "DNS synchronisation complete."
