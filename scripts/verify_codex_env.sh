#!/usr/bin/env bash
set -euo pipefail

REQUIRED_VARS=(
  CF_API_TOKEN
  CF_ACCOUNT_ID
  CF_ZONE_ID
  GITHUB_APP_ID
  GITHUB_CLIENT_ID
  GITHUB_WEBHOOK_SECRET
  GITHUB_APP_PRIVATE_KEY
  OPENAI_API_KEY
  GH_TOKEN
  AGENT_WEBHOOK_URL
  POLICY_APPLY_TOKEN
  ACCESS_AUD_GOLDSHORE_ADMIN
)

missing_vars=()

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var-}" ]]; then
    missing_vars+=("$var")
  fi
done

if (( ${#missing_vars[@]} > 0 )); then
  echo "❌ Missing required environment variables:" >&2
  for var in "${missing_vars[@]}"; do
    echo "  - $var" >&2
  done
  echo >&2
  cat <<'MSG' >&2
Please export each variable (e.g. `export NAME=value`) or add it to your secrets manager
before running deployment scripts or the Codex automation. Refer to TODO:SECRETS.md and
the docs in infra/ for instructions on provisioning Cloudflare and GitHub credentials.
MSG
  exit 1
fi

echo "✅ All required environment variables are present."
