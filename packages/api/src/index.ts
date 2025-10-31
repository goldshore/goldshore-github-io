export interface Env {
  GOLDSHORE_ENV: string;
  GOLDSHORE_ORIGIN: string;
  GOLDSHORE_CORS: string;

  FF_ENABLE_TRADING: string;
  FF_ENABLE_SENTIMENT: string;

  ACCESS_AUD: string;

  CODEX_JWT_REQUIRED: string; // "true" | "false"
  CODEX_JWT_ALG: "HS256";
  CODEX_JWT_ISS: string;
  CODEX_JWT_AUD: string;
  CODEX_JWT_SECRET_KID: string;
  CODEX_JWT_HS256_KEY: string;

  OPENAI_TPM_LIMIT: string;
  OPENAI_RPM_LIMIT: string;
  OPENAI_DPM_LIMIT: string;
  RATE_LIMIT_WINDOW_MS: string;
  RATE_LIMIT_BUCKET_SIZE: string;
  RATE_LIMIT_TOKEN_BUDGET: string;

  DO_SESSIONS: DurableObjectNamespace;
  DO_RATE_LIMITER: DurableObjectNamespace;

  Q_EVENTS: Queue<any>;
}

// ---------- Utilities ----------
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

const text = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });

function parseAllowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.GOLDSHORE_CORS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function buildCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type"
  };
}

function withCors(origin: string | null, env: Env, res: Response) {
  if (!origin) return res;
  const allow = parseAllowedOrigins(env);
  if (!allow.has(origin)) return res;
  const headers = new Headers(res.headers);
  const cors = buildCorsHeaders(origin);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

// ---------- Base64url helpers ----------
function b64urlToUint8(s: string): Uint8Array {
  // pad + replace
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  s += "=".repeat(pad);
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ---------- JWT (HS256) ----------
async function verifyJwtHS256(token: string, env: Env): Promise<Record<string, any>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(payloadB64)));

  if (header.alg !== "HS256") throw new Error("alg not HS256");
  if (env.CODEX_JWT_SECRET_KID && header.kid !== env.CODEX_JWT_SECRET_KID) {
    throw new Error("kid mismatch");
  }

  const keyRaw = b64urlToUint8(env.CODEX_JWT_HS256_KEY);
  const cryptoKey = await crypto.subtle.importKey("raw", keyRaw, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

  const data = utf8(`${headerB64}.${payloadB64}`);
  const signature = b64urlToUint8(sigB64);
  const ok = await crypto.subtle.verify("HMAC", cryptoKey, signature, data);
  if (!ok) throw new Error("bad signature");

  // Claims checks
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) throw new Error("token expired");
  if (env.CODEX_JWT_ISS && payload.iss !== env.CODEX_JWT_ISS) throw new Error("iss mismatch");
  // aud may be string or array
  const audOk =
    !env.CODEX_JWT_AUD ||
    payload.aud === env.CODEX_JWT_AUD ||
    (Array.isArray(payload.aud) && payload.aud.includes(env.CODEX_JWT_AUD));
  if (!audOk) throw new Error("aud mismatch");

  return payload;
}

function getBearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

// ---------- Rate limiter (Durable Object) ----------
async function checkLimit(
  env: Env,
  key: string,
  tokens: number
): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const id = env.DO_RATE_LIMITER.idFromName(key);
  const stub = env.DO_RATE_LIMITER.get(id);
  const res = await stub.fetch("https://do/limit", {
    method: "POST",
    body: JSON.stringify({ key, tokens })
  });
  if (res.ok) return { ok: true };
  try {
    const body = await res.json<any>();
    return { ok: false, retryAfterMs: body.retryAfterMs ?? 60000 };
  } catch {
    return { ok: false, retryAfterMs: 60000 };
  }
}

// ---------- Router ----------
async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");

  // Preflight
  if (req.method === "OPTIONS") {
    const allow = parseAllowedOrigins(env);
    if (origin && allow.has(origin)) {
      return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
    }
    return new Response(null, { status: 204 });
  }

  // Health
  if (url.pathname === "/health") {
    return withCors(
      origin,
      env,
      json({
        ok: true,
        env: env.GOLDSHORE_ENV || "unknown",
        time: new Date().toISOString()
      })
    );
  }

  // Protected polling for Codex agent
  if (url.pathname === "/poll" && req.method === "GET") {
    if (env.CODEX_JWT_REQUIRED === "true") {
      const token = getBearer(req);
      if (!token) return withCors(origin, env, json({ error: "Missing token" }, 401));
      try {
        await verifyJwtHS256(token, env);
      } catch (e) {
        return withCors(origin, env, json({ error: "Unauthorized" }, 401));
      }
    }

    // Estimate per-poll token cost conservatively
    const estTokens = 800;
    const limit = await checkLimit(env, "codex", estTokens);
    if (!limit.ok) {
      const retry = Math.ceil((limit.retryAfterMs ?? 60000) / 1000);
      return withCors(
        origin,
        env,
        new Response(null, { status: 429, headers: { "Retry-After": String(retry) } })
      );
    }

    // Do your polling work here (e.g., drain queue, call APIs, etc.)
    // Example: enqueue a heartbeat event (non-blocking)
    ctx.waitUntil(env.Q_EVENTS.send({ type: "codex.poll.heartbeat", ts: Date.now() }));

    return withCors(origin, env, json({ ok: true, polled: true }));
  }

  // Example secured API (pattern for admin-only routes via Cloudflare Access if you add it)
  if (url.pathname === "/admin/ping") {
    return withCors(origin, env, json({ pong: true }));
  }

  return withCors(origin, env, text("Not Found", 404));
}

// ---------- Queue consumer ----------
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e: any) {
      return json({ error: "Internal Error", detail: String(e?.message ?? e) }, 500);
    }
  },

  // Cloudflare Queues consumer (matches wrangler config)
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      try {
        // TODO: implement real handling
        // Example: handle event types
        switch (msg.body?.type) {
          case "codex.poll.heartbeat":
            // no-op
            break;
          default:
            // fallthrough for unknown events
            break;
        }
        msg.ack();
      } catch {
        // NACK -> will retry, then DLQ after retries
      }
    }
  }
};
