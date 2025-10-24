export interface Env {
  DB: D1Database; AGENT_PROMPT_KV: KVNamespace; JOBS_QUEUE: Queue; SNAP_R2: R2Bucket;
  CORS_ORIGINS: string;
}

type JsonValue = Record<string, any> | null;

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

const ensureTables = {
  customers: async (env: Env) => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
  },
  subscriptions: async (env: Env) => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        price REAL,
        billing_cycle TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
  },
  customer_subscriptions: async (env: Env) => {
    await ensureTables.customers(env);
    await ensureTables.subscriptions(env);
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS customer_subscriptions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        ended_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      )`
    ).run();
  },
  risk_config: async (env: Env) => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS risk_config (
        id TEXT PRIMARY KEY,
        name TEXT,
        limits TEXT,
        is_published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        published_at TEXT
      )`
    ).run();
  }
};

const parseRequestBody = async (req: Request): Promise<JsonValue> => {
  const ct = req.headers.get("content-type")||"";
  if (req.method === "GET" || req.method === "DELETE") return null;
  if (ct.includes("application/json")) return await req.json();
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries((await req.formData()).entries());
  }
  return null;
};

const respond = (status: number, data: JsonValue | { [key: string]: any }, headers: HeadersInit) => {
  const finalHeaders = new Headers(headers);
  if (status === 204) {
    finalHeaders.delete("content-type");
    return new Response(null, { status, headers: finalHeaders });
  }
  return new Response(JSON.stringify(data), { status, headers: finalHeaders });
};

const getId = () => crypto.randomUUID();

const handleCustomers = async (req: Request, env: Env, headers: HeadersInit, id?: string) => {
  await ensureTables.customers(env);
  if (req.method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM customers ORDER BY created_at DESC").all();
    return respond(200, { ok:true, data:results }, headers);
  }
  if (req.method === "GET" && id) {
    const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "POST" && !id) {
    const body = await parseRequestBody(req);
    const name = body?.name?.toString().trim();
    const email = body?.email?.toString().trim();
    const status = body?.status?.toString().trim() || "active";
    if (!email) return respond(400, { ok:false, error:"EMAIL_REQUIRED" }, headers);
    const recordId = body?.id?.toString().trim() || getId();
    await env.DB.prepare(
      "INSERT INTO customers (id, name, email, status) VALUES (?, ?, ?, ?)"
    ).bind(recordId, name||null, email, status).run();
    const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(recordId).all();
    return respond(201, { ok:true, data:results[0] }, headers);
  }
  if ((req.method === "PUT" || req.method === "PATCH") && id) {
    const body = await parseRequestBody(req);
    if (!body) return respond(400, { ok:false, error:"INVALID_BODY" }, headers);
    const fields: string[] = [];
    const values: any[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name?.toString().trim()||null); }
    if (body.email !== undefined) { fields.push("email = ?"); values.push(body.email?.toString().trim()||null); }
    if (body.status !== undefined) { fields.push("status = ?"); values.push(body.status?.toString().trim()||null); }
    if (!fields.length) return respond(400, { ok:false, error:"NO_FIELDS" }, headers);
    fields.push("updated_at = CURRENT_TIMESTAMP");
    await env.DB.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
    const { results } = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "DELETE" && id) {
    const existing = await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(id).first();
    if (!existing) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
    return respond(204, { ok:true }, headers);
  }
  return respond(405, { ok:false, error:"METHOD_NOT_ALLOWED" }, headers);
};

const handleSubscriptions = async (req: Request, env: Env, headers: HeadersInit, id?: string) => {
  await ensureTables.subscriptions(env);
  if (req.method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all();
    return respond(200, { ok:true, data:results }, headers);
  }
  if (req.method === "GET" && id) {
    const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "POST" && !id) {
    const body = await parseRequestBody(req);
    const name = body?.name?.toString().trim();
    if (!name) return respond(400, { ok:false, error:"NAME_REQUIRED" }, headers);
    const description = body?.description?.toString().trim() || null;
    const price = body?.price !== undefined ? Number(body.price) : null;
    const billingCycle = body?.billing_cycle?.toString().trim() || null;
    const status = body?.status?.toString().trim() || "active";
    const recordId = body?.id?.toString().trim() || getId();
    await env.DB.prepare(
      "INSERT INTO subscriptions (id, name, description, price, billing_cycle, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(recordId, name, description, price, billingCycle, status).run();
    const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(recordId).all();
    return respond(201, { ok:true, data:results[0] }, headers);
  }
  if ((req.method === "PUT" || req.method === "PATCH") && id) {
    const body = await parseRequestBody(req);
    if (!body) return respond(400, { ok:false, error:"INVALID_BODY" }, headers);
    const fields: string[] = [];
    const values: any[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name?.toString().trim()||null); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description?.toString().trim()||null); }
    if (body.price !== undefined) { fields.push("price = ?"); values.push(body.price === null?null:Number(body.price)); }
    if (body.billing_cycle !== undefined) { fields.push("billing_cycle = ?"); values.push(body.billing_cycle?.toString().trim()||null); }
    if (body.status !== undefined) { fields.push("status = ?"); values.push(body.status?.toString().trim()||null); }
    if (!fields.length) return respond(400, { ok:false, error:"NO_FIELDS" }, headers);
    fields.push("updated_at = CURRENT_TIMESTAMP");
    await env.DB.prepare(`UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
    const { results } = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "DELETE" && id) {
    const existing = await env.DB.prepare("SELECT id FROM subscriptions WHERE id = ?").bind(id).first();
    if (!existing) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    await env.DB.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
    return respond(204, { ok:true }, headers);
  }
  return respond(405, { ok:false, error:"METHOD_NOT_ALLOWED" }, headers);
};

const handleCustomerSubscriptions = async (req: Request, env: Env, headers: HeadersInit, id?: string) => {
  await ensureTables.customer_subscriptions(env);
  if (req.method === "GET" && !id) {
    const customerId = new URL(req.url).searchParams.get("customer_id");
    const subscriptionId = new URL(req.url).searchParams.get("subscription_id");
    const where: string[] = [];
    const values: any[] = [];
    if (customerId) { where.push("customer_id = ?"); values.push(customerId); }
    if (subscriptionId) { where.push("subscription_id = ?"); values.push(subscriptionId); }
    const sql = `SELECT * FROM customer_subscriptions${where.length?` WHERE ${where.join(" AND ")}`:""} ORDER BY created_at DESC`;
    const { results } = await env.DB.prepare(sql).bind(...values).all();
    return respond(200, { ok:true, data:results }, headers);
  }
  if (req.method === "GET" && id) {
    const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "POST" && !id) {
    const body = await parseRequestBody(req);
    const customerId = body?.customer_id?.toString().trim();
    const subscriptionId = body?.subscription_id?.toString().trim();
    if (!customerId || !subscriptionId) return respond(400, { ok:false, error:"CUSTOMER_AND_SUBSCRIPTION_REQUIRED" }, headers);
    const status = body?.status?.toString().trim() || "active";
    const startedAt = body?.started_at?.toString().trim() || null;
    const endedAt = body?.ended_at?.toString().trim() || null;
    const recordId = body?.id?.toString().trim() || getId();
    const customerExists = await env.DB.prepare("SELECT 1 FROM customers WHERE id = ?").bind(customerId).first();
    const subscriptionExists = await env.DB.prepare("SELECT 1 FROM subscriptions WHERE id = ?").bind(subscriptionId).first();
    if (!customerExists || !subscriptionExists) return respond(400, { ok:false, error:"INVALID_RELATION" }, headers);
    await env.DB.prepare(
      "INSERT INTO customer_subscriptions (id, customer_id, subscription_id, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(recordId, customerId, subscriptionId, status, startedAt, endedAt).run();
    const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(recordId).all();
    return respond(201, { ok:true, data:results[0] }, headers);
  }
  if ((req.method === "PUT" || req.method === "PATCH") && id) {
    const body = await parseRequestBody(req);
    if (!body) return respond(400, { ok:false, error:"INVALID_BODY" }, headers);
    const fields: string[] = [];
    const values: any[] = [];
    if (body.customer_id !== undefined) { fields.push("customer_id = ?"); values.push(body.customer_id?.toString().trim()||null); }
    if (body.subscription_id !== undefined) { fields.push("subscription_id = ?"); values.push(body.subscription_id?.toString().trim()||null); }
    if (body.status !== undefined) { fields.push("status = ?"); values.push(body.status?.toString().trim()||null); }
    if (body.started_at !== undefined) { fields.push("started_at = ?"); values.push(body.started_at?.toString().trim()||null); }
    if (body.ended_at !== undefined) { fields.push("ended_at = ?"); values.push(body.ended_at?.toString().trim()||null); }
    if (!fields.length) return respond(400, { ok:false, error:"NO_FIELDS" }, headers);
    fields.push("updated_at = CURRENT_TIMESTAMP");
    await env.DB.prepare(`UPDATE customer_subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
    const { results } = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    return respond(200, { ok:true, data:results[0] }, headers);
  }
  if (req.method === "DELETE" && id) {
    const existing = await env.DB.prepare("SELECT id FROM customer_subscriptions WHERE id = ?").bind(id).first();
    if (!existing) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    await env.DB.prepare("DELETE FROM customer_subscriptions WHERE id = ?").bind(id).run();
    return respond(204, { ok:true }, headers);
  }
  return respond(405, { ok:false, error:"METHOD_NOT_ALLOWED" }, headers);
};

const handleRiskConfig = async (req: Request, env: Env, headers: HeadersInit, id?: string) => {
  await ensureTables.risk_config(env);
  if (req.method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM risk_config ORDER BY created_at DESC").all();
    const data = results.map(record => ({ ...record, limits: parseLimits(record.limits) }));
    return respond(200, { ok:true, data }, headers);
  }
  if (req.method === "GET" && id) {
    const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    const record = results[0];
    return respond(200, { ok:true, data:{ ...record, limits: parseLimits(record.limits) } }, headers);
  }
  if (req.method === "POST" && !id) {
    const body = await parseRequestBody(req);
    const name = body?.name?.toString().trim();
    const limits = body?.limits ?? {};
    const isPublished = Boolean(body?.is_published);
    const recordId = body?.id?.toString().trim() || getId();
    await env.DB.prepare(
      "INSERT INTO risk_config (id, name, limits, is_published, published_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      recordId,
      name || null,
      JSON.stringify(limits ?? {}),
      isPublished ? 1 : 0,
      isPublished ? new Date().toISOString() : null
    ).run();
    const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(recordId).all();
    const record = results[0];
    return respond(201, { ok:true, data:{ ...record, limits: parseLimits(record.limits) } }, headers);
  }
  if ((req.method === "PUT" || req.method === "PATCH") && id) {
    const body = await parseRequestBody(req);
    if (!body) return respond(400, { ok:false, error:"INVALID_BODY" }, headers);
    const fields: string[] = [];
    const values: any[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name?.toString().trim()||null); }
    if (body.limits !== undefined) { fields.push("limits = ?"); values.push(JSON.stringify(body.limits ?? {})); }
    if (body.is_published !== undefined) {
      const flag = body.is_published ? 1 : 0;
      fields.push("is_published = ?"); values.push(flag);
      fields.push("published_at = ?"); values.push(body.is_published ? new Date().toISOString() : null);
    }
    if (!fields.length) return respond(400, { ok:false, error:"NO_FIELDS" }, headers);
    fields.push("updated_at = CURRENT_TIMESTAMP");
    await env.DB.prepare(`UPDATE risk_config SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
    const { results } = await env.DB.prepare("SELECT * FROM risk_config WHERE id = ?").bind(id).all();
    if (!results.length) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    const record = results[0];
    return respond(200, { ok:true, data:{ ...record, limits: parseLimits(record.limits) } }, headers);
  }
  if (req.method === "DELETE" && id) {
    const existing = await env.DB.prepare("SELECT id FROM risk_config WHERE id = ?").bind(id).first();
    if (!existing) return respond(404, { ok:false, error:"NOT_FOUND" }, headers);
    await env.DB.prepare("DELETE FROM risk_config WHERE id = ?").bind(id).run();
    return respond(204, { ok:true }, headers);
  }
  return respond(405, { ok:false, error:"METHOD_NOT_ALLOWED" }, headers);
};

const handleRiskLimits = async (env: Env, headers: HeadersInit) => {
  await ensureTables.risk_config(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM risk_config WHERE is_published = 1 ORDER BY published_at DESC LIMIT 1"
  ).all();
  if (!results.length) return respond(404, { ok:false, error:"NO_PUBLISHED_LIMITS" }, headers);
  const record = results[0];
  return respond(200, { ok:true, data:{ id: record.id, name: record.name, published_at: record.published_at, limits: parseLimits(record.limits) } }, headers);
};

const parseLimits = (limits: string | null | undefined) => {
  if (!limits) return {};
  try {
    return JSON.parse(limits);
  } catch (error) {
    console.warn("Failed to parse limits", error);
    return {};
  }
};
