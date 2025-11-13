import { allowOrigin, corsHeaders, handleOptions } from "./lib/cors";
import type { WebhookEnv } from "./webhook";
import { handleGithubCallback, handleGithubWebhook } from "./routes/github";

export interface Env extends WebhookEnv {}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SessionRecord {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface JwtClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  scope?: string;
  [key: string]: unknown;
}

interface EventQueueMessage {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  subject?: string;
  issuedAt: number;
  metadata?: Record<string, unknown>;
}

export interface Env {
  KV_SESSIONS: KVNamespace;
  KV_CACHE: KVNamespace;
  DO_SESSIONS: DurableObjectNamespace;
  Q_EVENTS: Queue<EventQueueMessage>;
  GOLDSHORE_ENV: string;
  GOLDSHORE_ORIGIN?: string;
  GOLDSHORE_CORS?: string;
  GOLDSHORE_JWT_SECRET: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW?: string;
}

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_LIMIT_WINDOW = 60;

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8"
};

function resolveCorsOrigin(request: Request, env: Env): string {
  return allowOrigin(request.headers.get("Origin"), env);
}

function withCors(origin: string, init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers ?? {});
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return { ...init, headers };
}

function jsonResponse(body: unknown, origin: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  Object.entries(JSON_HEADERS).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  return new Response(JSON.stringify(body), withCors(origin, { ...init, headers }));
}

function errorResponse(message: string, origin: string, status: number): Response {
  return jsonResponse({ error: message }, origin, { status });
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

function base64UrlToUint8Array(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = normalized + (padding === 0 ? "" : "=".repeat(4 - padding));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPayload(segment: string): JwtClaims {
  const json = new TextDecoder().decode(base64UrlToUint8Array(segment));
  return JSON.parse(json) as JwtClaims;
}

export async function verifyJwt(token: string, env: Env): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT");
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(env.GOLDSHORE_JWT_SECRET);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signedContent = encoder.encode(`${headerSegment}.${payloadSegment}`);
  const signature = base64UrlToUint8Array(signatureSegment);
  const signatureBuffer = signature.buffer.slice(
    signature.byteOffset,
    signature.byteOffset + signature.byteLength
  ) as ArrayBuffer;
  const dataBuffer = signedContent.buffer.slice(
    signedContent.byteOffset,
    signedContent.byteOffset + signedContent.byteLength
  ) as ArrayBuffer;

  const valid = await crypto.subtle.verify("HMAC", cryptoKey, signatureBuffer, dataBuffer);
  if (!valid) {
    throw new Error("Invalid signature");
  }

  const claims = decodeJwtPayload(payloadSegment);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof claims.exp === "number" && claims.exp < nowSeconds) {
    throw new Error("Token expired");
  }

  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds) {
    throw new Error("Token not yet valid");
  }

  if (env.JWT_ISSUER && claims.iss !== env.JWT_ISSUER) {
    throw new Error("Unexpected issuer");
  }

  if (env.JWT_AUDIENCE) {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud].filter((value): value is string => Boolean(value));
    if (audiences.length === 0 || !audiences.includes(env.JWT_AUDIENCE)) {
      throw new Error("Unexpected audience");
    }
  }

  return claims;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

export async function enforceRateLimit(identifier: string, env: Env): Promise<RateLimitResult> {
  const limit = Number(env.RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT) || DEFAULT_RATE_LIMIT;
  const windowSeconds = Number(env.RATE_LIMIT_WINDOW ?? DEFAULT_RATE_LIMIT_WINDOW) || DEFAULT_RATE_LIMIT_WINDOW;
  const now = Date.now();
  const windowId = Math.floor(now / (windowSeconds * 1000));
  const storageKey = `rate:${identifier}:${windowId}`;

  const currentCountRaw = await env.KV_CACHE.get(storageKey);
  const currentCount = currentCountRaw ? Number(currentCountRaw) : 0;

  if (currentCount >= limit) {
    const resetAt = (windowId + 1) * windowSeconds * 1000;
    return { allowed: false, remaining: 0, reset: resetAt };
  }

  const updatedCount = currentCount + 1;
  await env.KV_CACHE.put(storageKey, String(updatedCount), { expirationTtl: windowSeconds + 5 });
  const resetAt = (windowId + 1) * windowSeconds * 1000;

  return { allowed: true, remaining: Math.max(limit - updatedCount, 0), reset: resetAt };
}

export function applyRateLimitHeaders(headers: Headers, result: RateLimitResult, limit: number): void {
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.floor(result.reset / 1000)));
}

function normalizePayload(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { value: body } as Record<string, unknown>;
}

async function handleSessionRequest(
  request: Request,
  env: Env,
  origin: string,
  sessionId: string
): Promise<Response> {
  const stub = env.DO_SESSIONS.get(env.DO_SESSIONS.idFromName(sessionId));
  const forwardRequest = new Request("https://session.internal/", {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.clone().arrayBuffer()
  });

  const response = await stub.fetch(forwardRequest);
  const responseHeaders = new Headers(response.headers);
  const headers = withCors(origin, { headers: responseHeaders });
  return new Response(response.body, { ...headers, status: response.status, statusText: response.statusText });
}

interface EventDispatchResult {
  body: Record<string, unknown>;
  status: number;
}

async function handleEventDispatch(
  request: Request,
  env: Env,
  claims: JwtClaims
): Promise<EventDispatchResult> {
  const body = normalizePayload(await request.json().catch(() => ({})));
  const message: EventQueueMessage = {
    id: crypto.randomUUID(),
    type: typeof body.type === "string" && body.type.length > 0 ? (body.type as string) : "event",
    payload: body,
    subject: typeof claims.sub === "string" ? claims.sub : undefined,
    issuedAt: Date.now(),
    metadata: {
      scope: claims.scope,
      ip: request.headers.get("CF-Connecting-IP") ?? undefined,
      userAgent: request.headers.get("User-Agent") ?? undefined
    }
  };

  await env.Q_EVENTS.send(message);

  return { body: { queued: true, id: message.id }, status: 202 };
}

async function authenticateRequest(request: Request, env: Env): Promise<JwtClaims> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token");
  }
  return verifyJwt(token, env);
}

function rateLimitExceededResponse(origin: string, result: RateLimitResult, limit: number): Response {
  const headers = new Headers(JSON_HEADERS);
  applyRateLimitHeaders(headers, result, limit);
  const corsWrapped = withCors(origin, { status: 429, headers });
  return new Response(JSON.stringify({ error: "Rate limit exceeded", reset: result.reset }), corsWrapped);
}

async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const origin = resolveCorsOrigin(request, env);
  const limit = Number(env.RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT) || DEFAULT_RATE_LIMIT;

  if (request.method === "OPTIONS") {
    return handleOptions(request, env);
  }

  if (url.pathname === "/health") {
    return jsonResponse({ ok: true, env: env.GOLDSHORE_ENV }, origin, { status: 200 });
  }

  if (url.pathname === "/github/webhook" && request.method === "POST") {
    return handleGithubWebhook(request, env, ctx);
  }

  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const response = await handleGithubCallback();
    const headers = new Headers(response.headers);
    const cors = corsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  let claims: JwtClaims;
  try {
    claims = await authenticateRequest(request, env);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unauthorized", origin, 401);
  }

  const identifier = claims.sub || request.headers.get("CF-Connecting-IP") || "anonymous";
  const rateLimit = await enforceRateLimit(identifier, env);

  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(origin, rateLimit, limit);
  }

  const headers = new Headers(JSON_HEADERS);
  applyRateLimitHeaders(headers, rateLimit, limit);

  if (url.pathname.startsWith("/v1/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/v1/sessions/", "")).trim();
    if (!sessionId) {
      return jsonResponse({ error: "Missing session ID" }, origin, { status: 400, headers });
    }
    const sessionResponse = await handleSessionRequest(request, env, origin, sessionId);
    const sessionHeaders = new Headers(sessionResponse.headers);
    applyRateLimitHeaders(sessionHeaders, rateLimit, limit);
    return new Response(sessionResponse.body, {
      status: sessionResponse.status,
      statusText: sessionResponse.statusText,
      headers: sessionHeaders
    });
  }

  if (url.pathname === "/v1/events" && request.method === "POST") {
    const { body, status } = await handleEventDispatch(request, env, claims);
    const eventHeaders = new Headers(JSON_HEADERS);
    applyRateLimitHeaders(eventHeaders, rateLimit, limit);
    return jsonResponse(body, origin, { status, headers: eventHeaders });
  }

  if (url.pathname === "/v1/cache" && request.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key) {
      return jsonResponse({ error: "Missing key" }, origin, { status: 400, headers });
    }
    const value = await env.KV_CACHE.get(key, "json");
    return jsonResponse({ key, value }, origin, { status: 200, headers });
  }

  if (url.pathname === "/v1/cache" && request.method === "PUT") {
    const body = normalizePayload(await request.json().catch(() => ({})));
    const key = typeof body.key === "string" ? body.key : undefined;
    if (!key) {
      return jsonResponse({ error: "Missing key" }, origin, { status: 400, headers });
    }
    await env.KV_CACHE.put(key, JSON.stringify(body.value ?? null));
    return jsonResponse({ stored: true, key }, origin, { status: 201, headers });
  }

  return errorResponse("Not Found", origin, 404);
}

async function processQueueMessage(message: EventQueueMessage, env: Env): Promise<void> {
  const sessionId = message.payload.sessionId;
  if (typeof sessionId === "string" && sessionId.length > 0) {
    const stub = env.DO_SESSIONS.get(env.DO_SESSIONS.idFromName(sessionId));
    await stub.fetch("https://session.internal/", {
      method: "POST",
      body: JSON.stringify({
        event: message.type,
        payload: message.payload,
        updatedAt: new Date().toISOString()
      }),
      headers: JSON_HEADERS
    });
  }
}

async function queueHandler(batch: MessageBatch<EventQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processQueueMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error("Failed processing message", error);
      message.retry({ delaySeconds: 30 });
    }
  }
}

async function scheduledHandler(controller: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const heartbeat: EventQueueMessage = {
    id: crypto.randomUUID(),
    type: "heartbeat",
    payload: { source: "cron", scheduledTime: controller.scheduledTime },
    issuedAt: Date.now(),
    metadata: { cron: controller.cron }
  };
  ctx.waitUntil(env.Q_EVENTS.send(heartbeat));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return routeRequest(request, env, ctx);
  },
  async queue(batch: MessageBatch<EventQueueMessage>, env: Env): Promise<void> {
    return queueHandler(batch, env);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    return scheduledHandler(event, env, ctx);
  }
} satisfies ExportedHandler<Env>;

export class SessionDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    switch (method) {
      case "GET": {
        const record = await this.state.storage.get<SessionRecord>("session");
        if (!record) {
          return new Response(JSON.stringify(null), { status: 200, headers: JSON_HEADERS });
        }
        return new Response(JSON.stringify(record), { status: 200, headers: JSON_HEADERS });
      }
      case "POST":
      case "PUT": {
        const body = await request.json().catch(() => ({}));
        const now = new Date().toISOString();
        const existing = (await this.state.storage.get<SessionRecord>("session")) ?? null;
        const record: SessionRecord = {
          id: existing?.id ?? crypto.randomUUID(),
          data: normalizePayload(body),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        await this.state.storage.put("session", record);
        return new Response(JSON.stringify(record), { status: 200, headers: JSON_HEADERS });
      }
      case "DELETE": {
        await this.state.storage.delete("session");
        return new Response(null, { status: 204 });
      }
      default:
        return new Response("Method Not Allowed", { status: 405 });
    }
  }
}
