#!/usr/bin/env bash
set -euo pipefail

: "${CF_API_TOKEN:?Missing CF_API_TOKEN}"
: "${CF_ACCOUNT_ID:?Missing CF_ACCOUNT_ID}"
: "${CF_ZONE_ID:?Missing CF_ZONE_ID}"

# Example desired state (adjust values in follow-up PR or by env vars)
DMARC_VALUE=${DMARC_VALUE:-'v=DMARC1; p=quarantine; sp=quarantine; aspf=s; adkim=s; rua=mailto:postmaster@goldshore.org; ruf=mailto:security@goldshore.org; fo=1'}
SPF_VALUE=${SPF_VALUE:-'v=spf1 include:_spf.google.com -all'}

DNS_HOSTS=(
  goldshore.org
  www.goldshore.org
  preview.goldshore.org
  dev.goldshore.org
  admin.goldshore.org
  admin-preview.goldshore.org
  admin-dev.goldshore.org
  api.goldshore.org
  api-preview.goldshore.org
  api-dev.goldshore.org
)

echo ">> (Stub) Enforce DNS records in zone ${CF_ZONE_ID}"
echo "   - Ensure _dmarc TXT contains: ${DMARC_VALUE}"
echo "   - Ensure root TXT contains SPF: ${SPF_VALUE}"
for host in "${DNS_HOSTS[@]}"; do
  echo "   - Ensure proxied CNAME exists for: ${host}"
done
echo "NOTE: Replace this stub with concrete curl calls to Cloudflare API or use wrangler/terraform."
