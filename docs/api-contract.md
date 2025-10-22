# Goldshore API Contract

This document summarizes the HTTP endpoints exposed by the Cloudflare Worker found in `apps/api/src/index.ts`. All responses are JSON and include CORS headers derived from the `CORS_ORIGINS` binding.

## Authentication

The majority of endpoints do not require authentication. `/v1/whoami` checks `cf-access-authenticated-user-email` and responds with `401` if it is absent.

## Common response envelope

Successful requests return `{ "ok": true, ... }`. Errors include `{ "ok": false, "error": "CODE" }` and appropriate HTTP status codes.

## Endpoints

### `GET /v1/health`
Simple uptime probe returning `{ ok: true, ts: <epoch_ms> }`.

### `GET /v1/whoami`
Reports the authenticated email (if any).

### `POST /v1/lead`
Registers a marketing lead.
- **Body**: `{ "email": "user@example.com" }`
- **Responses**:
  - `200`: `{ ok: true }`
  - `400`: `{ ok: false, error: "EMAIL_REQUIRED" | "INVALID_JSON" }`

### Customers

| Method & Path | Description | Request Body | Success |
| --- | --- | --- | --- |
| `GET /v1/customers` | List customers ordered by `created_at` | – | `{ ok: true, data: Customer[] }` |
| `GET /v1/customers/{id}` | Retrieve a single customer | – | `{ ok: true, data: Customer }` |
| `POST /v1/customers` | Create a customer | `{ name: string, email: string }` | `201` + `{ ok: true, data: Customer }` |
| `PATCH /v1/customers/{id}` | Update fields | Any subset of `{ name, email }` | `{ ok: true, data: Customer }` |
| `DELETE /v1/customers/{id}` | Remove a customer | – | `204` |

`Customer` objects contain `{ id, name, email, created_at }`.

### Subscriptions

Same semantics as customers with schema `{ id, name, price, features, created_at }`. `features` is stored as a JSON string.

### Customer Subscriptions

Associative mapping between customers and subscriptions.

| Method & Path | Description | Request Body |
| --- | --- | --- |
| `GET /v1/customer_subscriptions` | List mappings ordered by `start_date`. | – |
| `GET /v1/customer_subscriptions/{id}` | Retrieve mapping. | – |
| `POST /v1/customer_subscriptions` | Create mapping. | `{ customer_id, subscription_id, start_date }` |
| `PATCH /v1/customer_subscriptions/{id}` | Update mapping. | Any subset of `{ customer_id, subscription_id, start_date }` |
| `DELETE /v1/customer_subscriptions/{id}` | Delete mapping. | – |

### Risk Configuration

Configuration rows describing firm-wide risk limits.

| Method & Path | Description | Request Body |
| --- | --- | --- |
| `GET /v1/risk/config` | List risk configs. | – |
| `GET /v1/risk/config/{id}` | Retrieve config. | – |
| `POST /v1/risk/config` | Create config. | `{ max_daily_loss?: number, max_order_value?: number, killswitch?: boolean }` |
| `PATCH /v1/risk/config/{id}` | Update config. | Any subset of above fields. |
| `DELETE /v1/risk/config/{id}` | Delete config. | – |

Responses contain normalized numeric fields and `killswitch` as a boolean.

### `GET /v1/risk/limits`
Summarizes the latest risk configuration.
- **Response**: `{ ok: true, data: { configs: RiskConfig[], current: RiskConfig | null, limits: { maxDailyLoss, maxOrderValue, killSwitchEngaged } | null } }`
- `RiskConfig` matches the shape returned from `/v1/risk/config`.

## Error codes

- `INVALID_JSON`: payload could not be parsed.
- `NAME_AND_EMAIL_REQUIRED`, `NAME_AND_PRICE_REQUIRED`, `MISSING_FIELDS`, `NO_FIELDS`, `INVALID_LIMITS`, `INVALID_PRICE`: validation failures.
- `CUSTOMER_CREATE_FAILED`: typically triggered by duplicate emails.
- `METHOD_NOT_ALLOWED`, `NOT_FOUND`: standard HTTP semantics.

## Manual Verification

Run `./tests/manual-verification.sh` from `apps/api` (or provide a base URL) to exercise the CRUD endpoints end-to-end. Requires a running worker instance, `curl`, and `jq`.
