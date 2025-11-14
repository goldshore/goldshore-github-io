# Goldshore API Contract

The Goldshore API is implemented as a Cloudflare Worker located in
`apps/api-worker/src/index.ts` and deployed to
`https://api.goldshore.org`. Preview environments reuse the same script
on `api-preview.goldshore.org` and `api-dev.goldshore.org`.

Unless otherwise noted, requests must include an `Authorization: Bearer
<JWT>` header signed with the shared HMAC secret configured at deploy
time. The worker validates `iss`/`aud` claims using the `JWT_ISSUER` and
`JWT_AUDIENCE` environment variables and enforces a sliding window rate
limit (default: 120 requests per 60 seconds) keyed by the token subject.
Responses emit the standard `X-RateLimit-*` headers.

All JSON responses set `Content-Type: application/json; charset=utf-8`
and include CORS headers derived from the `GOLDSHORE_CORS` allow list.

## Public endpoints

These routes do **not** require authentication.

### `GET /health`
Returns worker status and environment metadata.

```json
{
  "ok": true,
  "env": "production"
}
```

### `POST /github/webhook`
Accepts GitHub App webhooks. The request must include the expected
`X-Hub-Signature-256` header; the handler forwards matching events to the
queue consumers defined in the worker.

### `GET /auth/github/callback`
Completes the GitHub App OAuth handshake and redirects back to the
installer experience. Primarily used during GitHub App installation.

## Authenticated JSON API

All remaining endpoints require a valid bearer token. Error responses use
this shape:

```json
{
  "error": "message"
}
```

When rate limits are exceeded the worker returns HTTP 429 with an error
payload that includes the reset timestamp (milliseconds since epoch).

### Session storage – `/v1/sessions/{id}`
Backed by a Durable Object (`SessionDO`) and accepts the following
methods:

| Method | Description | Payload |
| --- | --- | --- |
| `GET` | Retrieve the stored session data. Returns `null` when unset. | – |
| `POST`/`PUT` | Persist arbitrary JSON data. Existing records are merged with new timestamps. | Any JSON object |
| `DELETE` | Remove the stored session entry. | – |

Responses include `id`, `data`, `createdAt`, and `updatedAt` fields.

### `POST /v1/events`
Queues an event for downstream processing. The request body is normalised
into an object, augmented with contextual metadata, and enqueued on the
`Q_EVENTS` Cloudflare Queue.

```json
{
  "queued": true,
  "id": "<uuid>"
}
```

### Cache helpers – `/v1/cache`
Simple KV cache utilities for small coordination tasks.

- `GET /v1/cache?key=<name>`: returns `{ "key": "<name>", "value": <stored JSON> }`.
- `PUT /v1/cache`: accepts `{ "key": "<name>", "value": <any> }` and stores the JSON payload.

Both routes require a key; missing keys return HTTP 400 with
`{ "error": "Missing key" }`.

## Queue consumers and scheduled tasks

The worker consumes messages from the `goldshore-events` queue and
writes session updates back through the same Durable Object interface.
A cron trigger (`*/30 * * * *`) periodically emits heartbeat events so
consumers can monitor liveness.
