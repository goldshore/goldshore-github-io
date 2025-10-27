export interface Env {
  KV_SESSIONS: KVNamespace;
  KV_CACHE: KVNamespace;
  D1_CORE: D1Database;
  R2_PUBLIC: R2Bucket;
  Q_EVENTS: Queue<any>;
  GOLDSHORE_CORS: string;
  GOLDSHORE_ENV: string;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Requested-With",
  "Access-Control-Max-Age": "86400"
});

function pickOrigin(req: Request, env: Env) {
  const allow = (env.GOLDSHORE_CORS || "").split(",").map((s) => s.trim());
  const o = req.headers.get("Origin") || "";
  return allow.includes(o) ? o : allow[0] || "*";
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = pickOrigin(req, env);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, env: env.GOLDSHORE_ENV }), {
        headers: { "content-type": "application/json", ...corsHeaders(origin) }
      });
    }

    if (url.pathname === "/trade" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      ctx.waitUntil(env.Q_EVENTS.send(body));
      return new Response(JSON.stringify({ queued: true }), {
        headers: { "content-type": "application/json", ...corsHeaders(origin) }
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) });
  }
} satisfies ExportedHandler<Env>;
