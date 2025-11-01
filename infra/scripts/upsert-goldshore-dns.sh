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
      local delete_response
      delete_response=$(curl -sS -X DELETE "${API}/zones/${zone_id}/dns_records/${conflict_id}" "${AUTH_HEADER[@]}")
      if [[ $(echo "$delete_response" | jq -r '.success') != "true" ]]; then
        echo "Failed to remove conflicting ${conflict_type} record for ${name}" >&2
        echo "$delete_response" >&2
        return 1
      fi
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
    local update_response
    update_response=$(curl -sS -X PUT "${API}/zones/${zone_id}/dns_records/${record_id}" "${AUTH_HEADER[@]}" --data "$payload")
    if [[ $(echo "$update_response" | jq -r '.success') != "true" ]]; then
      echo "Failed to update ${type} record for ${name}" >&2
      echo "$update_response" >&2
      return 1
    fi
    echo "Updated ${type} record for ${name}" >&2
  else
    local create_response
    create_response=$(curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${AUTH_HEADER[@]}" --data "$payload")
    if [[ $(echo "$create_response" | jq -r '.success') != "true" ]]; then
      echo "Failed to create ${type} record for ${name}" >&2
      echo "$create_response" >&2
      return 1
    fi
    echo "Created ${type} record for ${name}" >&2
  fi
}

resolve_zone_id() {
  local zone_name="$1"

  if [[ -n "${CF_ZONE_ID:-}" ]]; then
    echo "$CF_ZONE_ID"
    return 0
  fi

  local response
  response=$(curl -sS -X GET "${API}/zones?name=${zone_name}&account.id=${CF_ACCOUNT_ID}" "${AUTH_HEADER[@]}")

  if [[ $(echo "$response" | jq -r '.success') != "true" ]]; then
    echo "Failed to resolve zone id for ${zone_name}" >&2
    echo "$response" >&2
    return 1
  fi

  local zone_id
  zone_id=$(echo "$response" | jq -r '.result[0].id // empty')

  if [[ -z "$zone_id" ]]; then
    echo "Zone ${zone_name} not found in account ${CF_ACCOUNT_ID}" >&2
    return 1
  fi

  echo "$zone_id"
}

normalise_boolean() {
  local value="$1"
  case "${value,,}" in
    true|false)
      echo "${value,,}"
      ;;
    1|yes)
      echo "true"
      ;;
    0|no)
      echo "false"
      ;;
    *)
      echo "invalid"
      ;;
  esac
}

sync_zone() {
  local zone_json="$1"
  local zone_name
  zone_name=$(echo "$zone_json" | jq -r '.zone')

  local zone_id
  zone_id=$(resolve_zone_id "$zone_name") || return 1

  echo "Synchronising records for ${zone_name} (${zone_id})" >&2

  local default_proxied
  default_proxied=$(normalise_boolean "${DEFAULT_PROXIED:-true}")
  if [[ "$default_proxied" == "invalid" ]]; then
    echo "DEFAULT_PROXIED must be true/false/1/0/yes/no" >&2
    return 1
  fi

  declare -A host_record_types=()

  while IFS= read -r record; do
    local name type content proxied
    name=$(echo "$record" | jq -r '.name')
    type=$(echo "$record" | jq -r '.type')
    content=$(echo "$record" | jq -r '.content')
    proxied=$(echo "$record" | jq -r '.proxied // empty')

    local skip_record=false

    if [[ "$name" == "$zone_name" ]]; then
      if [[ "$type" == "CNAME" && ${APEX_CNAME_TARGET+x} ]]; then
        if [[ -n "${APEX_CNAME_TARGET}" ]]; then
          content="$APEX_CNAME_TARGET"
        else
          echo "Skipping CNAME record for ${name} because APEX_CNAME_TARGET is empty" >&2
          skip_record=true
        fi
      elif [[ "$type" == "A" && ${IPv4_TARGET+x} ]]; then
        if [[ -n "${IPv4_TARGET}" ]]; then
          content="$IPv4_TARGET"
        else
          echo "Skipping A record for ${name} because IPv4_TARGET is empty" >&2
          skip_record=true
        fi
      elif [[ "$type" == "AAAA" && ${IPv6_TARGET+x} ]]; then
        if [[ -n "${IPv6_TARGET}" ]]; then
          content="$IPv6_TARGET"
        else
          echo "Skipping AAAA record for ${name} because IPv6_TARGET is empty" >&2
          skip_record=true
        fi
      fi
    elif [[ "$name" == "www.$zone_name" && ${WWW_CNAME_TARGET+x} ]]; then
      if [[ -n "${WWW_CNAME_TARGET}" ]]; then
        content="$WWW_CNAME_TARGET"
      else
        echo "Skipping CNAME record for ${name} because WWW_CNAME_TARGET is empty" >&2
        skip_record=true
      fi
    elif [[ "$name" == "preview.$zone_name" && ${PREVIEW_CNAME_TARGET+x} ]]; then
      if [[ -n "${PREVIEW_CNAME_TARGET}" ]]; then
        content="$PREVIEW_CNAME_TARGET"
      else
        echo "Skipping CNAME record for ${name} because PREVIEW_CNAME_TARGET is empty" >&2
        skip_record=true
      fi
    elif [[ "$name" == "dev.$zone_name" && ${DEV_CNAME_TARGET+x} ]]; then
      if [[ -n "${DEV_CNAME_TARGET}" ]]; then
        content="$DEV_CNAME_TARGET"
      else
        echo "Skipping CNAME record for ${name} because DEV_CNAME_TARGET is empty" >&2
        skip_record=true
      fi
    elif [[ "$name" == "api.$zone_name" ]]; then
      if [[ "$type" == "A" && ${IPv4_TARGET+x} ]]; then
        if [[ -n "${IPv4_TARGET}" ]]; then
          content="$IPv4_TARGET"
        else
          echo "Skipping A record for ${name} because IPv4_TARGET is empty" >&2
          skip_record=true
        fi
      elif [[ "$type" == "AAAA" && ${IPv6_TARGET+x} ]]; then
        if [[ -n "${IPv6_TARGET}" ]]; then
          content="$IPv6_TARGET"
        else
          echo "Skipping AAAA record for ${name} because IPv6_TARGET is empty" >&2
          skip_record=true
        fi
      fi
    fi

    if [[ "$skip_record" == true ]]; then
      continue
    fi

    if [[ -z "$content" ]]; then
      echo "Skipping ${type} record for ${name} due to empty content" >&2
      continue
    fi

    if [[ -z "$proxied" ]]; then
      proxied="$default_proxied"
    else
      proxied=$(normalise_boolean "$proxied")
      if [[ "$proxied" == "invalid" ]]; then
        echo "Invalid proxied value for ${name}" >&2
        return 1
      fi
    fi

    case "$type" in
      CNAME)
        if [[ "${host_record_types[$name]:-}" == "address" ]]; then
          echo "Configuration error: ${name} cannot have both address and CNAME records" >&2
          return 1
        fi
        host_record_types[$name]="cname"
        ;;
      A|AAAA)
        if [[ "${host_record_types[$name]:-}" == "cname" ]]; then
          echo "Configuration error: ${name} cannot have both address and CNAME records" >&2
          return 1
        fi
        host_record_types[$name]="address"
        ;;
    esac

    upsert_record "$zone_id" "$name" "$type" "$content" "$proxied"
  done < <(echo "$zone_json" | jq -c '.records[]')

  echo "Zone ${zone_name} synchronised." >&2
}

main() {
  local filter_zone="${ZONE:-${ZONE_NAME:-}}"
  local -a zone_entries=()

  if [[ -n "$filter_zone" ]]; then
    mapfile -t zone_entries < <(echo "$CONFIG" | jq -c --arg zone "$filter_zone" '.[] | select(.zone == $zone)')
    if (( ${#zone_entries[@]} == 0 )); then
      echo "Zone ${filter_zone} not found in configuration" >&2
      exit 1
    fi
  else
    mapfile -t zone_entries < <(echo "$CONFIG" | jq -c '.[]')
  fi

  if (( ${#zone_entries[@]} == 0 )); then
    echo "No zones matched the provided configuration." >&2
    exit 0
  fi

  if [[ -n "${CF_ZONE_ID:-}" && ${#zone_entries[@]} -gt 1 ]]; then
    echo "CF_ZONE_ID is set but multiple zones are selected; please unset CF_ZONE_ID or filter to a single zone." >&2
    exit 1
  fi

  local zone_json
  for zone_json in "${zone_entries[@]}"; do
    sync_zone "$zone_json"
  done

  echo "DNS synchronisation complete."
}

main "$@"
