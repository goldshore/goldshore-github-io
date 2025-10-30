import type { MessageBatch } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  AGENT_PROMPT_KV: KVNamespace;
  JOBS_QUEUE: Queue;
  SNAP_R2: R2Bucket;
  CORS_ORIGINS: string;
}

type JsonValue = Record<string, any> | null;
type RouteParams = Record<string, string>;

interface RouteTools {
  jsonHeaders: HeadersInit;
  corsHeaders: HeadersInit;
  respond: (
    body: JsonValue | Record<string, any>,
    status?: number,
    headers?: HeadersInit
  ) => Response;
}

interface RouteContext {
  req: Request;
  env: Env;
  params: RouteParams;
  tools: RouteTools;
}

type RouteHandler = (ctx: RouteContext) => Promise<Response | JsonValue | Record<string, any>> | Response | JsonValue | Record<string, any>;

const cors = (req: Request, origins: string) => {
  const o = new URL(req.url).origin;
  const allowed = origins.split(",").map(s => s.trim()).filter(Boolean);
  const origin = allowed.includes(o) ? o : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization,cf-access-jwt-assertion",
  } satisfies HeadersInit;
};

const JSON_CONTENT_HEADERS: HeadersInit = { "content-type": "application/json" };

const jsonResponse = (
  body: JsonValue | Record<string, any>,
  status = 200,
  headers: HeadersInit = JSON_CONTENT_HEADERS
) => {
  const merged = new Headers(headers);
  if (!merged.has("content-type")) {
    merged.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), { status, headers: merged });
};

const router: Record<string, Partial<Record<string, RouteHandler>>> = {
  "/v1/health": {
    GET: async ({ tools }) => tools.respond({ ok: true, ts: Date.now() }),
  },
  "/v1/whoami": {
    GET: async ({ req, tools }) => {
      const email = req.headers.get("cf-access-authenticated-user-email");
      const ok = !!email;
      return tools.respond(ok ? { ok, email } : { ok: false, error: "UNAUTHENTICATED" });
    },
  },
  "/v1/lead": {
    POST: async ({ req, env, tools }) => {
      await ensureTable(env, "leads");
      const ct = req.headers.get("content-type") || "";
      const payload = ct.includes("application/json")
        ? await req.json()
        : Object.fromEntries((await req.formData()).entries());
      const email = (payload.email || "").toString().trim();
      const emailRegex =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (!email) {
        return tools.respond({ ok: false, error: "EMAIL_REQUIRED" }, 400);
      }
      if (!emailRegex.test(email)) {
        return tools.respond({ ok: false, error: "INVALID_EMAIL" }, 400);
      }
      await env.DB.prepare(
        "INSERT OR IGNORE INTO leads (email) VALUES (?)"
      ).bind(email).run();
      return tools.respond({ ok: true });
    },
  },
  "/v1/orders": {
    GET: async ({ env, tools }) => {
      await ensureTable(env, "orders");
      const { results } = await env.DB.prepare(
        "SELECT * FROM orders ORDER BY ts DESC LIMIT 50"
      ).all();
      return tools.respond({ ok: true, data: results });
    },
  },
  "/v1/customers": {
    GET: listCustomers,
    POST: createCustomer,
  },
  "/v1/customers/:id": {
    GET: getCustomer,
    PATCH: updateCustomer,
    PUT: updateCustomer,
    DELETE: deleteCustomer,
  },
  "/v1/subscriptions": {
    GET: listSubscriptions,
    POST: createSubscription,
  },
  "/v1/subscriptions/:id": {
    GET: getSubscription,
    PATCH: updateSubscription,
    PUT: updateSubscription,
    DELETE: deleteSubscription,
  },
  "/v1/customer_subscriptions": {
    GET: listCustomerSubscriptions,
    POST: createCustomerSubscription,
  },
  "/v1/customer_subscriptions/:id": {
    GET: getCustomerSubscription,
    PATCH: updateCustomerSubscription,
    PUT: updateCustomerSubscription,
    DELETE: deleteCustomerSubscription,
  },
  "/v1/risk/config": {
    GET: listRiskConfigs,
    POST: createRiskConfig,
  },
  "/v1/risk/config/:id": {
    GET: getRiskConfig,
    PATCH: updateRiskConfig,
    PUT: updateRiskConfig,
    DELETE: deleteRiskConfig,
  },
  "/v1/risk/check": {
    POST: async ({ req, env, tools }) => {
      const order = await req.json();
      const limits = await getActiveRiskLimits(env);
      if (!limits) {
        return tools.respond({ ok: true, message: "No risk limits configured" });
      }
      if (typeof order.notional === "number" && limits.max_notional !== undefined && order.notional > limits.max_notional) {
        return tools.respond({ ok: false, error: "NOTIONAL_EXCEEDS_LIMIT" });
      }
      return tools.respond({ ok: true });
    },
  },
  "/v1/risk/killswitch": {
    POST: async ({ env, tools }) => {
      await env.DB.prepare("UPDATE risk_configs SET is_published = 0, updated_at = CURRENT_TIMESTAMP").run();
      return tools.respond({ ok: true, message: "Kill switch engaged" });
    },
  },
};

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = cors(req, env.CORS_ORIGINS);
    const jsonHeaders = { ...JSON_CONTENT_HEADERS, ...corsHeaders };
    const defaultHeaders = { ...jsonHeaders };

    const tools: RouteTools = {
      corsHeaders,
      jsonHeaders,
      respond: (body, status = 200, headers = jsonHeaders) => jsonResponse(body, status, headers),
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: defaultHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    for (const route in router) {
      const pattern = new RegExp(`^${route.replace(/:\w+/g, "(?<param>[^/]+)")}$`);
      const match = path.match(pattern);
      if (!match) continue;

      const params: RouteParams = {};
      const paramNames = route.match(/:(\w+)/g) || [];
      paramNames.forEach((name, index) => {
        const key = name.substring(1);
        const value = match[index + 1];
        if (value !== undefined) {
          params[key] = decodeURIComponent(value);
        }
      });

      const handler = router[route]?.[method];
      if (!handler) {
        return tools.respond({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
      }

      const result = await handler({ req, env, params, tools });
      if (result instanceof Response) {
        return result;
      }
      return tools.respond(result as JsonValue | Record<string, any>);
    }

    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  },

  async queue(batch: MessageBatch<any>) {
    for (const message of batch.messages) {
      message.ack();
    }
  },
};

async function listCustomers({ env, tools }: RouteContext) {
  await ensureTable(env, "customers");
  const { results } = await env.DB.prepare(
    "SELECT * FROM customers ORDER BY created_at DESC"
  ).all();
  return tools.respond({ ok: true, data: results });
}

async function createCustomer({ req, env, tools }: RouteContext) {
  await ensureTable(env, "customers");
  const body = await parseBody(req);
  const name = (body?.name ?? "").toString().trim();
  const email = (body?.email ?? "").toString().trim();
  if (!name || !email) {
    return tools.respond({ ok: false, error: "NAME_AND_EMAIL_REQUIRED" }, 400);
  }
  const id = body?.id ? body.id.toString() : crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO customers (id, name, email) VALUES (?, ?, ?)"
  ).bind(id, name, email).run();
  const record = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
  return tools.respond({ ok: true, data: record }, 201);
}

async function getCustomer({ env, params, tools }: RouteContext) {
  await ensureTable(env, "customers");
  const record = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function updateCustomer({ req, env, params, tools }: RouteContext) {
  await ensureTable(env, "customers");
  const body = await parseBody(req);
  if (!body) {
    return tools.respond({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(body.name?.toString().trim() || null);
  }
  if (body.email !== undefined) {
    fields.push("email = ?");
    values.push(body.email?.toString().trim() || null);
  }
  if (!fields.length) {
    return tools.respond({ ok: false, error: "NO_FIELDS" }, 400);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(params.id);
  await env.DB.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const record = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function deleteCustomer({ env, params, tools }: RouteContext) {
  await ensureTable(env, "customers");
  const existing = await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(params.id).run();
  return new Response(null, { status: 204, headers: tools.corsHeaders });
}

async function listSubscriptions({ env, tools }: RouteContext) {
  await ensureTable(env, "subscriptions");
  const { results } = await env.DB.prepare(
    "SELECT * FROM subscriptions ORDER BY created_at DESC"
  ).all();
  return tools.respond({ ok: true, data: results });
}

async function createSubscription({ req, env, tools }: RouteContext) {
  await ensureTable(env, "subscriptions");
  const body = await parseBody(req);
  const name = body?.name?.toString().trim();
  const priceRaw = body?.price;
  if (!name || priceRaw === undefined || priceRaw === null || Number.isNaN(Number(priceRaw))) {
    return tools.respond({ ok: false, error: "NAME_AND_PRICE_REQUIRED" }, 400);
  }
  const price = Number(priceRaw);
  const billingCycle = body?.billing_cycle?.toString().trim() || null;
  const features = body?.features !== undefined ? JSON.stringify(body.features) : null;
  const id = body?.id ? body.id.toString() : crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO subscriptions (id, name, price, billing_cycle, features) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, price, billingCycle, features).run();
  const record = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first();
  return tools.respond({ ok: true, data: record }, 201);
}

async function getSubscription({ env, params, tools }: RouteContext) {
  await ensureTable(env, "subscriptions");
  const record = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function updateSubscription({ req, env, params, tools }: RouteContext) {
  await ensureTable(env, "subscriptions");
  const body = await parseBody(req);
  if (!body) {
    return tools.respond({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(body.name?.toString().trim() || null);
  }
  if (body.price !== undefined) {
    if (body.price !== null && Number.isNaN(Number(body.price))) {
      return tools.respond({ ok: false, error: "INVALID_PRICE" }, 400);
    }
    fields.push("price = ?");
    values.push(body.price === null ? null : Number(body.price));
  }
  if (body.billing_cycle !== undefined) {
    fields.push("billing_cycle = ?");
    values.push(body.billing_cycle?.toString().trim() || null);
  }
  if (body.features !== undefined) {
    fields.push("features = ?");
    values.push(body.features === null ? null : JSON.stringify(body.features));
  }
  if (!fields.length) {
    return tools.respond({ ok: false, error: "NO_FIELDS" }, 400);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(params.id);
  await env.DB.prepare(`UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const record = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function deleteSubscription({ env, params, tools }: RouteContext) {
  await ensureTable(env, "subscriptions");
  const existing = await env.DB.prepare("SELECT id FROM subscriptions WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  await env.DB.prepare("DELETE FROM subscriptions WHERE id = ?").bind(params.id).run();
  return new Response(null, { status: 204, headers: tools.corsHeaders });
}

async function listCustomerSubscriptions({ req, env, tools }: RouteContext) {
  await ensureTable(env, "customer_subscriptions");
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id");
  const subscriptionId = url.searchParams.get("subscription_id");
  const where: string[] = [];
  const values: any[] = [];
  if (customerId) {
    where.push("customer_id = ?");
    values.push(customerId);
  }
  if (subscriptionId) {
    where.push("subscription_id = ?");
    values.push(subscriptionId);
  }
  const sql = `SELECT * FROM customer_subscriptions${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const { results } = await env.DB.prepare(sql).bind(...values).all();
  return tools.respond({ ok: true, data: results });
}

async function createCustomerSubscription({ req, env, tools }: RouteContext) {
  await ensureTable(env, "customer_subscriptions");
  const body = await parseBody(req);
  const customerId = body?.customer_id?.toString().trim();
  const subscriptionId = body?.subscription_id?.toString().trim();
  if (!customerId || !subscriptionId) {
    return tools.respond({ ok: false, error: "CUSTOMER_AND_SUBSCRIPTION_REQUIRED" }, 400);
  }
  const status = body?.status?.toString().trim() || "active";
  const startedAt = body?.started_at?.toString().trim() || null;
  const endedAt = body?.ended_at?.toString().trim() || null;
  const id = body?.id ? body.id.toString() : crypto.randomUUID();
  const customerExists = await env.DB.prepare("SELECT 1 FROM customers WHERE id = ?").bind(customerId).first();
  const subscriptionExists = await env.DB.prepare("SELECT 1 FROM subscriptions WHERE id = ?").bind(subscriptionId).first();
  if (!customerExists || !subscriptionExists) {
    return tools.respond({ ok: false, error: "INVALID_RELATION" }, 400);
  }
  await env.DB.prepare(
    "INSERT INTO customer_subscriptions (id, customer_id, subscription_id, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, customerId, subscriptionId, status, startedAt, endedAt).run();
  const record = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).first();
  return tools.respond({ ok: true, data: record }, 201);
}

async function getCustomerSubscription({ env, params, tools }: RouteContext) {
  await ensureTable(env, "customer_subscriptions");
  const record = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function updateCustomerSubscription({ req, env, params, tools }: RouteContext) {
  await ensureTable(env, "customer_subscriptions");
  const body = await parseBody(req);
  if (!body) {
    return tools.respond({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (body.customer_id !== undefined) {
    fields.push("customer_id = ?");
    values.push(body.customer_id?.toString().trim() || null);
  }
  if (body.subscription_id !== undefined) {
    fields.push("subscription_id = ?");
    values.push(body.subscription_id?.toString().trim() || null);
  }
  if (body.status !== undefined) {
    fields.push("status = ?");
    values.push(body.status?.toString().trim() || null);
  }
  if (body.started_at !== undefined) {
    fields.push("started_at = ?");
    values.push(body.started_at?.toString().trim() || null);
  }
  if (body.ended_at !== undefined) {
    fields.push("ended_at = ?");
    values.push(body.ended_at?.toString().trim() || null);
  }
  if (!fields.length) {
    return tools.respond({ ok: false, error: "NO_FIELDS" }, 400);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(params.id);
  await env.DB.prepare(`UPDATE customer_subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const record = await env.DB.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: record });
}

async function deleteCustomerSubscription({ env, params, tools }: RouteContext) {
  await ensureTable(env, "customer_subscriptions");
  const existing = await env.DB.prepare("SELECT id FROM customer_subscriptions WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  await env.DB.prepare("DELETE FROM customer_subscriptions WHERE id = ?").bind(params.id).run();
  return new Response(null, { status: 204, headers: tools.corsHeaders });
}

async function listRiskConfigs({ env, tools }: RouteContext) {
  await ensureTable(env, "risk_configs");
  const { results } = await env.DB.prepare(
    "SELECT * FROM risk_configs ORDER BY created_at DESC"
  ).all();
  return tools.respond({ ok: true, data: results.map(mapRiskRow) });
}

async function createRiskConfig({ req, env, tools }: RouteContext) {
  await ensureTable(env, "risk_configs");
  const body = await parseBody(req);
  const name = body?.name?.toString().trim() || null;
  const limits = body?.limits ?? {};
  const isPublished = toBoolean(body?.is_published);
  const id = body?.id ? body.id.toString() : crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO risk_configs (id, name, limits, is_published, published_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, JSON.stringify(limits ?? {}), isPublished ? 1 : 0, isPublished ? new Date().toISOString() : null).run();
  const record = await env.DB.prepare(
    "SELECT * FROM risk_configs WHERE id = ?"
  ).bind(id).first();
  return tools.respond({ ok: true, data: mapRiskRow(record) }, 201);
}

async function getRiskConfig({ env, params, tools }: RouteContext) {
  await ensureTable(env, "risk_configs");
  const record = await env.DB.prepare("SELECT * FROM risk_configs WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: mapRiskRow(record) });
}

async function updateRiskConfig({ req, env, params, tools }: RouteContext) {
  await ensureTable(env, "risk_configs");
  const body = await parseBody(req);
  if (!body) {
    return tools.respond({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(body.name?.toString().trim() || null);
  }
  if (body.limits !== undefined) {
    fields.push("limits = ?");
    values.push(JSON.stringify(body.limits ?? {}));
  }
  if (body.is_published !== undefined) {
    const flag = toBoolean(body.is_published);
    fields.push("is_published = ?");
    values.push(flag ? 1 : 0);
    fields.push("published_at = ?");
    values.push(flag ? new Date().toISOString() : null);
  }
  if (!fields.length) {
    return tools.respond({ ok: false, error: "NO_FIELDS" }, 400);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(params.id);
  await env.DB.prepare(`UPDATE risk_configs SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const record = await env.DB.prepare("SELECT * FROM risk_configs WHERE id = ?").bind(params.id).first();
  if (!record) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  return tools.respond({ ok: true, data: mapRiskRow(record) });
}

async function deleteRiskConfig({ env, params, tools }: RouteContext) {
  await ensureTable(env, "risk_configs");
  const existing = await env.DB.prepare("SELECT id FROM risk_configs WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return tools.respond({ ok: false, error: "NOT_FOUND" }, 404);
  }
  await env.DB.prepare("DELETE FROM risk_configs WHERE id = ?").bind(params.id).run();
  return new Response(null, { status: 204, headers: tools.corsHeaders });
}

async function getActiveRiskLimits(env: Env) {
  await ensureTable(env, "risk_configs");
  const record = await env.DB.prepare(
    "SELECT * FROM risk_configs WHERE is_published = 1 ORDER BY published_at DESC LIMIT 1"
  ).first();
  return record ? parseLimits(record.limits) : null;
}

async function ensureTable(env: Env, table: keyof typeof ensureTables) {
  await ensureTables[table](env);
}

const ensureTables = {
  leads: ensureLeadsTable,
  orders: ensureOrdersTable,
  customers: ensureCustomersTable,
  subscriptions: ensureSubscriptionsTable,
  customer_subscriptions: ensureCustomerSubscriptionsTable,
  risk_configs: ensureRiskConfigsTable,
} as const;

async function ensureLeadsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS leads (
      email TEXT PRIMARY KEY,
      ts TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function ensureOrdersTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      qty REAL,
      side TEXT,
      ts TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function ensureCustomersTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function ensureSubscriptionsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT,
      price REAL,
      billing_cycle TEXT,
      features TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function ensureCustomerSubscriptionsTable(env: Env) {
  await ensureCustomersTable(env);
  await ensureSubscriptionsTable(env);
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_subscriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
    )`
  ).run();
}

async function ensureRiskConfigsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS risk_configs (
      id TEXT PRIMARY KEY,
      name TEXT,
      limits TEXT,
      is_published INTEGER DEFAULT 0,
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function parseBody(req: Request): Promise<Record<string, any> | null> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "DELETE") {
    return null;
  }
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await req.json();
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries((await req.formData()).entries());
  }
  return null;
}

function parseLimits(limits: string | null | undefined) {
  if (!limits) return {} as Record<string, any>;
  try {
    const parsed = JSON.parse(limits);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    console.warn("Failed to parse risk limits", error);
    return {};
  }
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalized);
  }
  return false;
}

function mapRiskRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    is_published: Boolean(row.is_published),
    limits: parseLimits(row.limits),
  };
}
