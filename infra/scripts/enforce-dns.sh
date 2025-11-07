#!/usr/bin/env bash
set -euo pipefail

: "${CF_API_TOKEN:?Missing CF_API_TOKEN}"
: "${CF_ZONE_ID:?Missing CF_ZONE_ID}"

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CF_API_TOKEN}"
CONTENT_TYPE_HEADER="Content-Type: application/json"

# Desired state for DNS records
RECORDS=(
  # type|name|content|proxied
  "CNAME|goldshore.org|goldshore-web.pages.dev|true"
  "CNAME|admin.goldshore.org|goldshore-admin.pages.dev|true"
  "CNAME|api.goldshore.org|goldshore-api.workers.dev|true"
  "TXT|_dmarc.goldshore.org|v=DMARC1; p=reject; rua=mailto:ops@goldshore.org; ruf=mailto:ops@goldshore.org; fo=1|false"
  "TXT|goldshore.org|v=spf1 include:_spf.google.com -all|false"
)

echo ">> Enforcing DNS records in zone ${CF_ZONE_ID}"

for record in "${RECORDS[@]}"; do
  IFS='|' read -r type name content proxied <<< "$record"

  echo "   - Ensuring ${type} record for ${name} -> ${content}"

  # Get existing record ID if it exists
  record_id=$(curl -s -X GET "${API_BASE}/zones/${CF_ZONE_ID}/dns_records?type=${type}&name=${name}" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE_HEADER}" \
    | jq -r '.result[0].id')

  # Prepare payload
  payload=$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "${proxied}" \
    '{type: $type, name: $name, content: $content, proxied: $proxied, ttl: 1}')

  if [[ -z "$record_id" || "$record_id" == "null" ]]; then
    # Create new record
    echo "     - Record not found. Creating..."
    curl -s -X POST "${API_BASE}/zones/${CF_ZONE_ID}/dns_records" \
      -H "${AUTH_HEADER}" \
      -H "${CONTENT_TYPE_HEADER}" \
      --data "$payload" \
      | jq .
  else
    # Update existing record
    echo "     - Record found with ID ${record_id}. Updating..."
    curl -s -X PATCH "${API_BASE}/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
      -H "${AUTH_HEADER}" \
      -H "${CONTENT_TYPE_HEADER}" \
      --data "$payload" \
      | jq .
  fi
done

echo ">> DNS enforcement complete."
