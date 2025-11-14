#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN environment variable must be set" >&2
  exit 1
fi

ZONE_NAME=${ZONE_NAME:-goldshore.org}
API="https://api.cloudflare.com/client/v4"

urlencode() {
  jq -nr --arg v "$1" '$v|@uri'
}

cf_api() {
  local method=$1
  shift
  local path=$1
  shift || true

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[DRY-RUN] curl -X $method $API$path $*" >&2
    if [[ $method == "GET" ]]; then
      echo '{"result":[]}'
    else
      echo '{}'
    fi
    return 0
  fi

  curl --fail-with-body -sS -X "$method" "$API$path" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

# Resolve the zone identifier when not provided explicitly.
if [[ -z "${CF_ZONE_ID:-}" ]]; then
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "CF_ZONE_ID must be provided when running in dry-run mode" >&2
    exit 1
  fi

  CF_ZONE_ID=$(cf_api "GET" "/zones?name=$(urlencode "$ZONE_NAME")" | jq -r '.result[0].id // empty')
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
  conflicts_json=$(cf_api "GET" "/zones/$zone_id/dns_records?name=$(urlencode "$name")")

  for conflict_type in "${conflict_types[@]}"; do
    local conflict_ids
    conflict_ids=$(echo "$conflicts_json" | jq -r --arg type "$conflict_type" '(.result // [])[]? | select(.type == $type) | .id')

    while IFS= read -r id; do
      [[ -z "$id" || "$id" == "null" ]] && continue
      cf_api "DELETE" "/zones/$zone_id/dns_records/$id" >/dev/null
      echo "Removed conflicting $conflict_type record for $name"
    done <<<"$conflict_ids"
  done
}

upsert_record() {
  local zone_id=$1
  local name=$2
  local type=$3
  local content=$4
  local proxied=${5:-true}

  remove_conflicting_records "$zone_id" "$name" "$type"

  local encoded_name
  encoded_name=$(urlencode "$name")
  local existing_id
  existing_id=$(cf_api "GET" "/zones/$zone_id/dns_records?type=$type&name=$encoded_name" | jq -r '.result[0].id // ""')

  local proxied_json="false"
  if [[ "${proxied,,}" == "true" ]]; then
    proxied_json="true"
  fi

  local payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied_json" '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')

  if [[ -n "$existing_id" ]]; then
    cf_api "PUT" "/zones/$zone_id/dns_records/$existing_id" --data "$payload" >/dev/null
    echo "Updated $type record for $name -> $content (proxied=$proxied_json)"
  else
    cf_api "POST" "/zones/$zone_id/dns_records" --data "$payload" >/dev/null
    echo "Created $type record for $name -> $content (proxied=$proxied_json)"
  fi
}

main() {
  local zone_id=$1

  local default_proxied=${DEFAULT_PROXIED:-true}
  local apex_ipv4=${APEX_IPV4_TARGET:-${IPv4_TARGET:-192.0.2.1}}
  local apex_ipv6=${APEX_IPV6_TARGET:-${IPv6_TARGET:-}}

  local apex_proxied=${APEX_PROXIED:-$default_proxied}
  local apex_ipv6_proxied=${APEX_IPV6_PROXIED:-$apex_proxied}

  local www_cname_target=${WWW_CNAME_TARGET:-$ZONE_NAME}
  local preview_cname_target=${PREVIEW_CNAME_TARGET:-$ZONE_NAME}
  local dev_cname_target=${DEV_CNAME_TARGET:-$ZONE_NAME}
  local admin_cname_target=${ADMIN_CNAME_TARGET:-$ZONE_NAME}
  local preview_admin_cname_target=${PREVIEW_ADMIN_CNAME_TARGET:-$admin_cname_target}
  local dev_admin_cname_target=${DEV_ADMIN_CNAME_TARGET:-$admin_cname_target}

  local www_proxied=${WWW_PROXIED:-$default_proxied}
  local preview_proxied=${PREVIEW_PROXIED:-$default_proxied}
  local dev_proxied=${DEV_PROXIED:-false}
  local admin_proxied=${ADMIN_PROXIED:-$default_proxied}
  local preview_admin_proxied=${PREVIEW_ADMIN_PROXIED:-$admin_proxied}
  local dev_admin_proxied=${DEV_ADMIN_PROXIED:-$dev_proxied}

  local -a records=()

  if [[ -z "$apex_ipv4" ]]; then
    echo "APEX_IPV4_TARGET (or IPv4_TARGET) must be provided" >&2
    exit 1
  fi

  records+=("$ZONE_NAME|A|$apex_ipv4|$apex_proxied")

  if [[ -n "$apex_ipv6" ]]; then
    records+=("$ZONE_NAME|AAAA|$apex_ipv6|$apex_ipv6_proxied")
  fi

  records+=(
    "www.$ZONE_NAME|CNAME|$www_cname_target|$www_proxied"
    "preview.$ZONE_NAME|CNAME|$preview_cname_target|$preview_proxied"
    "dev.$ZONE_NAME|CNAME|$dev_cname_target|$dev_proxied"
    "admin.$ZONE_NAME|CNAME|$admin_cname_target|$admin_proxied"
    "preview.admin.$ZONE_NAME|CNAME|$preview_admin_cname_target|$preview_admin_proxied"
    "dev.admin.$ZONE_NAME|CNAME|$dev_admin_cname_target|$dev_admin_proxied"
  )

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
      *)
        echo "Unsupported DNS record type: $type" >&2
        exit 1
        ;;
    esac

    upsert_record "$zone_id" "$name" "$type" "$content" "${proxied:-$default_proxied}"
  done

  echo "DNS synchronisation complete."
}

main "$CF_ZONE_ID"
