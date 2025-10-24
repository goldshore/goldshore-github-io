#!/usr/bin/env bash
# Manual smoke test script for the API Worker endpoints.
# Usage: ./tests/manual-verification.sh [base_url]
set -euo pipefail

BASE_URL=${1:-"http://127.0.0.1:8787"}

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

echo "Using base URL: $BASE_URL"

echo "Creating sample customer"
CUSTOMER_RESPONSE=$(curl -sS -X POST "$BASE_URL/v1/customers" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"api-customer@example.com"}')
CUSTOMER_ID=$(echo "$CUSTOMER_RESPONSE" | jq -r '.data.id')
echo "$CUSTOMER_RESPONSE" | jq '.'

echo "Creating subscription"
SUBSCRIPTION_RESPONSE=$(curl -sS -X POST "$BASE_URL/v1/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pro","price":199,"features":["priority-support","multi-seat"]}')
SUBSCRIPTION_ID=$(echo "$SUBSCRIPTION_RESPONSE" | jq -r '.data.id')
echo "$SUBSCRIPTION_RESPONSE" | jq '.'

echo "Linking customer to subscription"
LINK_RESPONSE=$(curl -sS -X POST "$BASE_URL/v1/customer_subscriptions" \
  -H "Content-Type: application/json" \
  -d "{\"customer_id\":\"$CUSTOMER_ID\",\"subscription_id\":\"$SUBSCRIPTION_ID\",\"start_date\":\"2024-01-01\"}")
echo "$LINK_RESPONSE" | jq '.'

if [[ -z "${CUSTOMER_ID}" || -z "${SUBSCRIPTION_ID}" ]]; then
  echo "Customer or subscription creation failed" >&2
  exit 1
fi

echo "Listing customers"
curl -sS "$BASE_URL/v1/customers" | jq '.'

echo "Listing subscriptions"
curl -sS "$BASE_URL/v1/subscriptions" | jq '.'

echo "Listing customer subscriptions"
curl -sS "$BASE_URL/v1/customer_subscriptions" | jq '.'

echo "Creating risk config"
RISK_RESPONSE=$(curl -sS -X POST "$BASE_URL/v1/risk/config" \
  -H "Content-Type: application/json" \
  -d '{"max_daily_loss":100000,"max_order_value":25000,"killswitch":false}')
echo "$RISK_RESPONSE" | jq '.'

echo "Reading risk limits"
curl -sS "$BASE_URL/v1/risk/limits" | jq '.'

echo "Manual verification completed."
