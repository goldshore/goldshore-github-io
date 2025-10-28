#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  echo "CF_API_TOKEN is required" >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
ZONE_NAMES=${ZONE_NAMES:-${ZONE_NAME:-goldshore.org}}
DEFAULT_ADMIN_PAGES_HOST=${ADMIN_PAGES_HOST:-goldshore-org.pages.dev}
DEFAULT_WEB_PAGES_HOST=${WEB_PAGES_HOST:-goldshore-org.pages.dev}
DEFAULT_API_WORKER_HOST=${API_WORKER_HOST:-}

zones=()

parse_zone_names() {
  local IFS=','
  read -r -a zones <<< "$ZONE_NAMES"
}

parse_zone_names
old_ifs=$IFS
IFS=',' read -r -a zones <<< "$ZONE_NAMES"
IFS=$old_ifs

for raw_zone in "${zones[@]}"; do
  zone_name=$(echo "$raw_zone" | xargs)
  [[ -z "$zone_name" ]] && continue

  zone_key=$(echo "$zone_name" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]/_/g')
  zone_id_var="CF_ZONE_ID_${zone_key}"
  admin_host_var="ADMIN_PAGES_HOST_${zone_key}"
  web_host_var="WEB_PAGES_HOST_${zone_key}"
  api_host_var="API_WORKER_HOST_${zone_key}"

  zone_id=${!zone_id_var:-}
  admin_host=${!admin_host_var:-$DEFAULT_ADMIN_PAGES_HOST}
  web_host=${!web_host_var:-$DEFAULT_WEB_PAGES_HOST}
  api_host=${!api_host_var:-$DEFAULT_API_WORKER_HOST}
  if [[ -z "$api_host" ]]; then
    api_host=$zone_name
  fi

  if [[ -z "$zone_id" && ${#zones[@]} -eq 1 && -n "${CF_ZONE_ID:-}" ]]; then
    zone_id=$CF_ZONE_ID
  fi

  if [[ -z "$zone_id" ]]; then
    zone_id=$(curl -sS -X GET "$API/zones?name=$zone_name" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" | jq -r '.result[0].id // ""')
  fi

  if [[ -z "$zone_id" ]]; then
    echo "Unable to resolve zone id for $zone_name" >&2
    exit 1
  fi

  records=$(jq -n \
    --arg zone "$zone_name" \
    --arg admin "$admin_host" \
    --arg api "$api_host" \
    --arg web "$web_host" '[
      {name:$zone, type:"A", content:"192.0.2.1", proxied:true},
      {name:$zone, type:"AAAA", content:"100::", proxied:true},
      {name:"www." + $zone, type:"CNAME", content:$zone, proxied:true},
      {name:"preview." + $zone, type:"CNAME", content:$zone, proxied:true},
      {name:"dev." + $zone, type:"CNAME", content:$zone, proxied:true},
      {name:"admin." + $zone, type:"CNAME", content:$admin, proxied:true},
      {name:"api." + $zone, type:"CNAME", content:$api, proxied:true},
      {name:"web." + $zone, type:"CNAME", content:$web, proxied:true}
    ]')

  echo "Syncing DNS records for zone $zone_name ($zone_id)"

  while IFS= read -r record; do
    name=$(echo "$record" | jq -r '.name')
    type=$(echo "$record" | jq -r '.type')
    content=$(echo "$record" | jq -r '.content')
    proxied=$(echo "$record" | jq '.proxied // false')

    existing=$(curl -sS -X GET "$API/zones/$zone_id/dns_records?name=$name" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json")
    if [[ $(echo "$existing" | jq -r '.success') != "true" ]]; then
      echo "Failed to query DNS records for $name" >&2
      echo "$existing" >&2
      exit 1
    fi

    record_id=$(echo "$existing" | jq -r --arg type "$type" '
      (.result // [])
      | map(select(.type == $type) | .id)
      | (.[0] // "")
    ')
    conflicts=$(echo "$existing" | jq -r --arg type "$type" '
      (.result // [])
      | map(select(
          ($type == "CNAME" and .type != "CNAME")
          or
          ($type != "CNAME" and .type == "CNAME")
        ))
      | .[]?
      | "\(.id) \(.type)"
    ')

    if [[ -n "$conflicts" ]]; then
      while read -r conflict_id conflict_type; do
        [[ -z "$conflict_id" ]] && continue
        response=$(curl -sS -X DELETE "$API/zones/$zone_id/dns_records/$conflict_id" \
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
      response=$(curl -sS -X POST "$API/zones/$zone_id/dns_records" \
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
      response=$(curl -sS -X PUT "$API/zones/$zone_id/dns_records/$record_id" \
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

  echo "DNS synchronized for $zone_name."
done
