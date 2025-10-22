export interface Env {
  DB: D1Database; AGENT_PROMPT_KV: KVNamespace; JOBS_QUEUE: Queue; SNAP_R2: R2Bucket;
  CORS_ORIGINS: string;
}
const cors = (req: Request, origins: string) => {
  const o = new URL(req.url).origin;
  const allowed = origins.split(",").map(s=>s.trim());
  const hdr = {
    "Access-Control-Allow-Origin": allowed.includes(o) ? o : allowed[0] || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization,cf-access-jwt-assertion",
  };
  return hdr;
};

const CREATE_STATEMENTS: Record<string, string> = {
  leads:
    "CREATE TABLE IF NOT EXISTS leads (email TEXT PRIMARY KEY, ts TEXT DEFAULT CURRENT_TIMESTAMP)",
  customers:
    "CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  subscriptions:
    "CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, name TEXT, price REAL, features TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  customer_subscriptions:
    "CREATE TABLE IF NOT EXISTS customer_subscriptions (id TEXT PRIMARY KEY, customer_id TEXT, subscription_id TEXT, start_date TEXT)",
  risk_config:
    "CREATE TABLE IF NOT EXISTS risk_config (id TEXT PRIMARY KEY, max_daily_loss REAL, max_order_value REAL, killswitch INTEGER DEFAULT 0)",
  orders:
    "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, symbol TEXT, qty REAL, side TEXT, ts TEXT DEFAULT CURRENT_TIMESTAMP)"
};

const ensureTable = async (env: Env, table: keyof typeof CREATE_STATEMENTS) => {
  await env.DB.prepare(CREATE_STATEMENTS[table]).run();
};

const jsonResponse = (payload: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(payload), { status, headers });

const parseBody = async (req: Request) => {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch (err) {
      throw new Error("INVALID_JSON");
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries((await req.formData()).entries());
  }
  if (ct.includes("multipart/form-data")) {
    return Object.fromEntries((await req.formData()).entries());
  }
  return {};
};

const toBoolean = (value: any) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
};

const mapRiskRow = (row: any) => ({
  id: row.id,
  max_daily_loss: row.max_daily_loss === null || row.max_daily_loss === undefined ? null : Number(row.max_daily_loss),
  max_order_value: row.max_order_value === null || row.max_order_value === undefined ? null : Number(row.max_order_value),
  killswitch: toBoolean(row.killswitch)
});

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = cors(req, env.CORS_ORIGINS);
    const jsonHeaders = { "content-type": "application/json", ...corsHeaders };
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(req.url);
    if (url.pathname === "/v1/health") {
      return jsonResponse({ ok: true, ts: Date.now() }, 200, jsonHeaders);
    }

    if (url.pathname === "/v1/whoami") {
      const email = req.headers.get("cf-access-authenticated-user-email");
      const ok = !!email;
      return jsonResponse(ok ? { ok, email } : { ok: false, error: "UNAUTHENTICATED" }, ok ? 200 : 401, jsonHeaders);
    }

    if (url.pathname === "/v1/lead" && req.method === "POST") {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const email = (body.email || "").toString().trim();
      if (!email) return jsonResponse({ ok: false, error: "EMAIL_REQUIRED" }, 400, jsonHeaders);
      await ensureTable(env, "leads");
      await env.DB.prepare("INSERT OR IGNORE INTO leads (email) VALUES (?)").bind(email).run();
      return jsonResponse({ ok: true }, 200, jsonHeaders);
    }

    // Example orders endpoint
    if (url.pathname.startsWith("/v1/orders") && req.method === "GET") {
      await ensureTable(env, "orders");
      const { results } = await env.DB.prepare("SELECT * FROM orders ORDER BY ts DESC LIMIT 50").all();
      return jsonResponse({ ok: true, data: results }, 200, jsonHeaders);
    }

    const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments[0] === "v1") {
      const resource = segments[1];
      const id = segments[2];

      if (resource === "customers") {
        return this.handleCustomers(req, env, jsonHeaders, corsHeaders, id);
      }

      if (resource === "subscriptions") {
        return this.handleSubscriptions(req, env, jsonHeaders, corsHeaders, id);
      }

      if (resource === "customer_subscriptions") {
        return this.handleCustomerSubscriptions(req, env, jsonHeaders, corsHeaders, id);
      }

      if (resource === "risk") {
        const riskResource = segments[2];
        if (riskResource === "limits" && req.method === "GET" && segments.length === 3) {
          return this.handleRiskLimits(env, jsonHeaders);
        }
        if (riskResource === "config") {
          const configId = segments[3];
          return this.handleRiskConfig(req, env, jsonHeaders, corsHeaders, configId);
        }
      }
    }

    return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
  },

  async queue(batch: MessageBatch<any>) {
    for (const m of batch.messages) m.ack();
  },

  async handleCustomers(
    req: Request,
    env: Env,
    jsonHeaders: HeadersInit,
    corsHeaders: HeadersInit,
    id?: string
  ): Promise<Response> {
    await ensureTable(env, "customers");
    if (req.method === "GET") {
      if (id) {
        const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).all();
        if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
        return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
      }
      const { results } = await env.DB.prepare("SELECT * FROM customers ORDER BY created_at DESC").all();
      return jsonResponse({ ok: true, data: results }, 200, jsonHeaders);
    }

    if (req.method === "POST") {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const name = (body.name || "").toString().trim();
      const email = (body.email || "").toString().trim();
      if (!name || !email) {
        return jsonResponse({ ok: false, error: "NAME_AND_EMAIL_REQUIRED" }, 400, jsonHeaders);
      }
      const newId = body.id ? body.id.toString() : crypto.randomUUID();
      try {
        await env.DB.prepare("INSERT INTO customers (id, name, email) VALUES (?, ?, ?)").bind(newId, name, email).run();
      } catch (err) {
        return jsonResponse({ ok: false, error: "CUSTOMER_CREATE_FAILED" }, 400, jsonHeaders);
      }
      const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(newId).all();
      return jsonResponse({ ok: true, data: results[0] }, 201, jsonHeaders);
    }

    if (req.method === "PATCH" && id) {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const fields: string[] = [];
      const values: any[] = [];
      if (body.name !== undefined) {
        fields.push("name = ?");
        values.push(body.name.toString());
      }
      if (body.email !== undefined) {
        fields.push("email = ?");
        values.push(body.email.toString());
      }
      if (!fields.length) {
        return jsonResponse({ ok: false, error: "NO_FIELDS" }, 400, jsonHeaders);
      }
      values.push(id);
      await env.DB.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).all();
      if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
      return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
    }

    if (req.method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, jsonHeaders);
  },

  async handleSubscriptions(
    req: Request,
    env: Env,
    jsonHeaders: HeadersInit,
    corsHeaders: HeadersInit,
    id?: string
  ): Promise<Response> {
    await ensureTable(env, "subscriptions");
    if (req.method === "GET") {
      if (id) {
        const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).all();
        if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
        return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
      }
      const { results } = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all();
      return jsonResponse({ ok: true, data: results }, 200, jsonHeaders);
    }

    if (req.method === "POST") {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const name = (body.name || "").toString().trim();
      const priceValue = body.price;
      if (!name || priceValue === undefined || priceValue === null || Number.isNaN(Number(priceValue))) {
        return jsonResponse({ ok: false, error: "NAME_AND_PRICE_REQUIRED" }, 400, jsonHeaders);
      }
      const price = Number(priceValue);
      const features = body.features !== undefined ? JSON.stringify(body.features) : null;
      const newId = body.id ? body.id.toString() : crypto.randomUUID();
      await env.DB.prepare("INSERT INTO subscriptions (id, name, price, features) VALUES (?, ?, ?, ?)")
        .bind(newId, name, price, features)
        .run();
      const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(newId).all();
      return jsonResponse({ ok: true, data: results[0] }, 201, jsonHeaders);
    }

    if (req.method === "PATCH" && id) {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const fields: string[] = [];
      const values: any[] = [];
      if (body.name !== undefined) {
        fields.push("name = ?");
        values.push(body.name.toString());
      }
      if (body.price !== undefined) {
        if (Number.isNaN(Number(body.price))) {
          return jsonResponse({ ok: false, error: "INVALID_PRICE" }, 400, jsonHeaders);
        }
        fields.push("price = ?");
        values.push(Number(body.price));
      }
      if (body.features !== undefined) {
        fields.push("features = ?");
        values.push(JSON.stringify(body.features));
      }
      if (!fields.length) {
        return jsonResponse({ ok: false, error: "NO_FIELDS" }, 400, jsonHeaders);
      }
      values.push(id);
      await env.DB.prepare(`UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).all();
      if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
      return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
    }

    if (req.method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, jsonHeaders);
  },

  async handleCustomerSubscriptions(
    req: Request,
    env: Env,
    jsonHeaders: HeadersInit,
    corsHeaders: HeadersInit,
    id?: string
  ): Promise<Response> {
    await ensureTable(env, "customer_subscriptions");
    if (req.method === "GET") {
      if (id) {
        const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).all();
        if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
        return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
      }
      const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions ORDER BY start_date DESC").all();
      return jsonResponse({ ok: true, data: results }, 200, jsonHeaders);
    }

    if (req.method === "POST") {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const customerId = (body.customer_id || "").toString().trim();
      const subscriptionId = (body.subscription_id || "").toString().trim();
      const startDate = (body.start_date || "").toString().trim();
      if (!customerId || !subscriptionId || !startDate) {
        return jsonResponse({ ok: false, error: "MISSING_FIELDS" }, 400, jsonHeaders);
      }
      const newId = body.id ? body.id.toString() : crypto.randomUUID();
      await env.DB
        .prepare("INSERT INTO customer_subscriptions (id, customer_id, subscription_id, start_date) VALUES (?, ?, ?, ?)")
        .bind(newId, customerId, subscriptionId, startDate)
        .run();
      const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(newId).all();
      return jsonResponse({ ok: true, data: results[0] }, 201, jsonHeaders);
    }

    if (req.method === "PATCH" && id) {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const fields: string[] = [];
      const values: any[] = [];
      if (body.customer_id !== undefined) {
        fields.push("customer_id = ?");
        values.push(body.customer_id.toString());
      }
      if (body.subscription_id !== undefined) {
        fields.push("subscription_id = ?");
        values.push(body.subscription_id.toString());
      }
      if (body.start_date !== undefined) {
        fields.push("start_date = ?");
        values.push(body.start_date.toString());
      }
      if (!fields.length) {
        return jsonResponse({ ok: false, error: "NO_FIELDS" }, 400, jsonHeaders);
      }
      values.push(id);
      await env.DB.prepare(`UPDATE customer_subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).all();
      if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
      return jsonResponse({ ok: true, data: results[0] }, 200, jsonHeaders);
    }

    if (req.method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM customer_subscriptions WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, jsonHeaders);
  },

  async handleRiskConfig(
    req: Request,
    env: Env,
    jsonHeaders: HeadersInit,
    corsHeaders: HeadersInit,
    id?: string
  ): Promise<Response> {
    await ensureTable(env, "risk_config");
    if (req.method === "GET") {
      if (id) {
        const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(id).all();
        if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
        return jsonResponse({ ok: true, data: mapRiskRow(results[0]) }, 200, jsonHeaders);
      }
      const { results } = await env.DB.prepare("SELECT * FROM risk_config").all();
      return jsonResponse({ ok: true, data: results.map(mapRiskRow) }, 200, jsonHeaders);
    }

    if (req.method === "POST") {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const maxDailyLoss = body.max_daily_loss !== undefined ? Number(body.max_daily_loss) : null;
      const maxOrderValue = body.max_order_value !== undefined ? Number(body.max_order_value) : null;
      if ((maxDailyLoss !== null && Number.isNaN(maxDailyLoss)) || (maxOrderValue !== null && Number.isNaN(maxOrderValue))) {
        return jsonResponse({ ok: false, error: "INVALID_LIMITS" }, 400, jsonHeaders);
      }
      const killswitch = body.killswitch !== undefined ? (toBoolean(body.killswitch) ? 1 : 0) : 0;
      const newId = body.id ? body.id.toString() : crypto.randomUUID();
      await env.DB
        .prepare("INSERT INTO risk_config (id, max_daily_loss, max_order_value, killswitch) VALUES (?, ?, ?, ?)")
        .bind(newId, maxDailyLoss, maxOrderValue, killswitch)
        .run();
      const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(newId).all();
      return jsonResponse({ ok: true, data: mapRiskRow(results[0]) }, 201, jsonHeaders);
    }

    if (req.method === "PATCH" && id) {
      let body: any;
      try {
        body = await parseBody(req);
      } catch (err) {
        return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, jsonHeaders);
      }
      const fields: string[] = [];
      const values: any[] = [];
      if (body.max_daily_loss !== undefined) {
        const value = Number(body.max_daily_loss);
        if (Number.isNaN(value)) return jsonResponse({ ok: false, error: "INVALID_LIMITS" }, 400, jsonHeaders);
        fields.push("max_daily_loss = ?");
        values.push(value);
      }
      if (body.max_order_value !== undefined) {
        const value = Number(body.max_order_value);
        if (Number.isNaN(value)) return jsonResponse({ ok: false, error: "INVALID_LIMITS" }, 400, jsonHeaders);
        fields.push("max_order_value = ?");
        values.push(value);
      }
      if (body.killswitch !== undefined) {
        fields.push("killswitch = ?");
        values.push(toBoolean(body.killswitch) ? 1 : 0);
      }
      if (!fields.length) {
        return jsonResponse({ ok: false, error: "NO_FIELDS" }, 400, jsonHeaders);
      }
      values.push(id);
      await env.DB.prepare(`UPDATE risk_config SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(id).all();
      if (!results.length) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, jsonHeaders);
      return jsonResponse({ ok: true, data: mapRiskRow(results[0]) }, 200, jsonHeaders);
    }

    if (req.method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM risk_config WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, jsonHeaders);
  },

  async handleRiskLimits(env: Env, jsonHeaders: HeadersInit): Promise<Response> {
    await ensureTable(env, "risk_config");
    const { results } = await env.DB.prepare("SELECT * FROM risk_config ORDER BY rowid ASC").all();
    const configs = results.map(mapRiskRow);
    const current = configs[configs.length - 1] || null;
    return jsonResponse(
      {
        ok: true,
        data: {
          configs,
          current,
          limits: current
            ? {
                maxDailyLoss: current.max_daily_loss,
                maxOrderValue: current.max_order_value,
                killSwitchEngaged: current.killswitch
              }
            : null
        }
      },
      200,
      jsonHeaders
    );
  }
};
