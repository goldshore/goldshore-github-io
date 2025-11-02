# Goldshore API Contract

This document summarizes the HTTP endpoints exposed by the Cloudflare Worker shipped as the `goldshore-api` service. The active deployment resides in `apps/api-worker/src/index.ts`, while the legacy SQL-backed prototype remains available under `apps/api` for reference. All responses are JSON and include CORS headers derived from the `CORS_ORIGINS` binding.

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

Run `npm run dev:api` from the repository root (or `npm run -w @goldshore/api-worker dev`) to start a local instance, then execute `./tests/manual-verification.sh` from `apps/api/tests` with the appropriate base URL. Requires a running worker instance, `curl`, and `jq`.
This document describes the REST endpoints that are now available from the Cloudflare Worker that powers the Goldshore API. All responses are JSON and include CORS headers derived from the configured `CORS_ORIGINS` binding.

## Authentication

Unless otherwise noted, the routes documented here do not require authentication. The existing `/v1/whoami` endpoint continues to return the authenticated user (if present).

## Common Error Structure

Errors follow a common shape:

```json
{
  "ok": false,
  "error": "ERROR_CODE"
}
```

HTTP status codes align with the operation (for example, `400` for validation failures, `404` when a resource is not found, and `500` for unexpected errors).

## Customers

| Method & Path | Description |
| --- | --- |
| `GET /v1/customers` | List customers ordered by `created_at` (newest first). |
| `POST /v1/customers` | Create a customer. Body fields: `name` (optional string), `email` (required string), `status` (optional string, defaults to `"active"`). An `id` may be provided; otherwise one is generated. |
| `GET /v1/customers/{id}` | Retrieve a single customer. |
| `PUT /v1/customers/{id}` / `PATCH /v1/customers/{id}` | Update provided fields (`name`, `email`, `status`). |
| `DELETE /v1/customers/{id}` | Delete a customer. Returns HTTP 204 when successful. |

Each customer record contains:

```json
{
  "id": "string",
  "name": "string | null",
  "email": "string | null",
  "status": "string | null",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

## Subscriptions

| Method & Path | Description |
| --- | --- |
| `GET /v1/subscriptions` | List subscriptions. |
| `POST /v1/subscriptions` | Create a subscription. Body fields: `name` (required string), `description` (optional string), `price` (optional number), `billing_cycle` (optional string), `status` (optional string, defaults to `"active"`). |
| `GET /v1/subscriptions/{id}` | Retrieve a subscription. |
| `PUT /v1/subscriptions/{id}` / `PATCH /v1/subscriptions/{id}` | Update any of the mutable fields above. |
| `DELETE /v1/subscriptions/{id}` | Delete a subscription. Returns HTTP 204 on success. |

## Customer Subscriptions

`customer_subscriptions` represents the many-to-many relationship between customers and subscriptions.

| Method & Path | Description |
| --- | --- |
| `GET /v1/customer_subscriptions` | List relationships. Optional query parameters: `customer_id`, `subscription_id` to filter. |
| `POST /v1/customer_subscriptions` | Create a relationship. Body fields: `customer_id` (required), `subscription_id` (required), `status` (optional string, defaults to `"active"`), `started_at` (optional ISO timestamp), `ended_at` (optional ISO timestamp). |
| `GET /v1/customer_subscriptions/{id}` | Retrieve a relationship record. |
| `PUT/PATCH /v1/customer_subscriptions/{id}` | Update provided fields (`customer_id`, `subscription_id`, `status`, `started_at`, `ended_at`). |
| `DELETE /v1/customer_subscriptions/{id}` | Remove a relationship (HTTP 204 on success). |

Relationship records include timestamps and mirror the schema columns: `id`, `customer_id`, `subscription_id`, `status`, `started_at`, `ended_at`, `created_at`, `updated_at`.

## Risk Configuration

| Method & Path | Description |
| --- | --- |
| `GET /v1/risk_config` | List risk configuration records. |
| `POST /v1/risk_config` | Create a risk configuration. Body fields: `name` (optional string), `limits` (object, defaults to `{}`), `is_published` (boolean flag to mark the configuration as available to `/v1/risk/limits`). |
| `GET /v1/risk_config/{id}` | Retrieve a risk configuration. |
| `PUT/PATCH /v1/risk_config/{id}` | Update any combination of `name`, `limits`, `is_published`. When `is_published` transitions to `true`, `published_at` is set to the current timestamp. |
| `DELETE /v1/risk_config/{id}` | Delete a configuration (HTTP 204 on success). |

Risk configuration records return the stored JSON `limits` object in decoded form alongside metadata:

```json
{
  "id": "string",
  "name": "string | null",
  "limits": { "any": "json" },
  "is_published": 0 or 1,
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "published_at": "ISO timestamp | null"
}
```

## Published Risk Limits

`GET /v1/risk/limits` returns the most recently published risk configuration. Response:

```json
{
  "ok": true,
  "data": {
    "id": "config-id",
    "name": "string | null",
    "published_at": "ISO timestamp",
    "limits": { "any": "json" }
  }
}
```

If no risk configuration has been marked as published the API responds with `404` and `error: "NO_PUBLISHED_LIMITS"`.

## Existing Utility Routes

Existing routes such as `/v1/health`, `/v1/whoami`, `/v1/lead`, and `/v1/orders` continue to behave as before.

## Changelog

- Added CRUD handlers for `customers`, `subscriptions`, `customer_subscriptions`, and `risk_config`.
- Added `/v1/risk/limits` endpoint that surfaces the most recent published risk configuration.
