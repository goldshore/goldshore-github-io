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

ZONE_NAME=${ZONE_NAME:-goldshore.org}
API="https://api.cloudflare.com/client/v4"

# Resolve the zone identifier when not provided explicitly.
if [[ -z "${CF_ZONE_ID:-}" ]]; then
  CF_ZONE_ID=$(curl -sS -X GET "$API/zones?name=$ZONE_NAME" \
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
  conflicts_json=$(curl -sS -X GET "$API/zones/$zone_id/dns_records?name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

  for conflict_type in "${conflict_types[@]}"; do
    local conflict_ids
    conflict_ids=$(echo "$conflicts_json" | jq -r --arg type "$conflict_type" '(.result // [])[]? | select(.type == $type) | .id')

    while IFS= read -r id; do
      [[ -z "$id" || "$id" == "null" ]] && continue
      curl -sS -X DELETE "$API/zones/$zone_id/dns_records/$id" \
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
  existing_id=$(curl -sS -X GET "$API/zones/$zone_id/dns_records?type=$type&name=$name" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // ""')

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied $proxied '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')

  if [[ -n "$existing_id" ]]; then
    curl -sS -X PUT "$API/zones/$zone_id/dns_records/$existing_id" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Updated $type record for $name"
  else
    curl -sS -X POST "$API/zones/$zone_id/dns_records" \
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

  declare -A host_record_types=()
  local record
  for record in "${records[@]}"; do
    IFS='|' read -r name type content proxied <<<"$record"

    if [[ -z "$name" || -z "$type" || -z "$content" ]]; then
      echo "Skipping malformed record definition: $record" >&2
      continue
    fi

    case "$type" in
      CNAME)
        if [[ "${host_record_types[$name]:-}" == "address" ]]; then
          echo "Configuration error: $name cannot have both address and CNAME records" >&2
          exit 1
        fi
        host_record_types[$name]="cname"
        ;;
      A|AAAA)
        if [[ "${host_record_types[$name]:-}" == "cname" ]]; then
          echo "Configuration error: $name cannot have both address and CNAME records" >&2
          exit 1
        fi
        host_record_types[$name]="address"
        ;;
    esac

    upsert_record "$zone_id" "$name" "$type" "$content" "${proxied:-$default_proxied}"
  done

  echo "DNS synchronized for ${ZONE_NAME}."
}

main "$CF_ZONE_ID"
