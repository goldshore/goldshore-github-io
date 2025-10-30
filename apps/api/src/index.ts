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

const json = (req: Request, env: Env, data: JsonValue | Record<string, unknown>, status = 200) => {
  const headers = { "content-type": "application/json", ...cors(req, env.CORS_ORIGINS) };
  return new Response(JSON.stringify(data), { status, headers });
};

const empty = (req: Request, env: Env, status = 204) => {
  const headers = cors(req, env.CORS_ORIGINS);
  return new Response(null, { status, headers });
};

import { createCustomer, getCustomer, updateCustomer, deleteCustomer, listCustomers } from "./customers";
import { createSubscription, getSubscription, updateSubscription, deleteSubscription, listSubscriptions } from "./subscriptions";
import { setRiskConfig, getRiskConfig, checkRisk, killSwitch } from "./risk";
import { createCustomerSubscription, getCustomerSubscription, updateCustomerSubscription, deleteCustomerSubscription, listCustomerSubscriptions } from "./customer_subscriptions";

const router = {
  "/v1/health": {
    GET: () => ({ ok: true, ts: Date.now() }),
  },
  "/v1/whoami": {
    GET: (req: Request) => {
      const email = req.headers.get("cf-access-authenticated-user-email");
      const ok = !!email;
      return ok ? { ok, email } : { ok: false, error: "UNAUTHENTICATED" };
    },
  },
  "/v1/lead": {
    POST: async (req: Request, env: Env) => {
      const ct = req.headers.get("content-type") || "";
      const body = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
      const email = (body.email || "").toString().trim();
      const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (!email) return json(req, env, { ok: false, error: "EMAIL_REQUIRED" }, 400);
      if (!emailRegex.test(email)) return json(req, env, { ok: false, error: "INVALID_EMAIL" }, 400);
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS leads (email TEXT PRIMARY KEY, ts TEXT DEFAULT CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR IGNORE INTO leads (email) VALUES (?)").bind(email).run();
      return json(req, env, { ok: true });
    },
  },
  "/v1/orders": {
    GET: async (req: Request, env: Env) => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, symbol TEXT, qty REAL, side TEXT, ts TEXT DEFAULT CURRENT_TIMESTAMP)"
      ).run();
      const { results } = await env.DB.prepare("SELECT * FROM orders ORDER BY ts DESC LIMIT 50").all();
      return json(req, env, { ok: true, data: results });
    }
  },
  "/v1/customers": {
    POST: async (req: Request, env: Env) => {
      const { name, email } = await req.json();
      const customer = await createCustomer(env.DB, name, email);
      return json(req, env, { ok: true, data: customer }, 201);
    },
    GET: async (req: Request, env: Env) => {
      const customers = await listCustomers(env.DB);
      return { ok: true, data: customers };
    },
  },
  "/v1/customers/:id": {
    GET: async (req: Request, env: Env, params: { id: string }) => {
      const customer = await getCustomer(env.DB, params.id);
      return { ok: true, data: customer };
    },
    PUT: async (req: Request, env: Env, params: { id: string }) => {
      const { name, email } = await req.json();
      await updateCustomer(env.DB, params.id, name, email);
      return json(req, env, { ok: true });
    },
    DELETE: async (req: Request, env: Env, params: { id: string }) => {
      await deleteCustomer(env.DB, params.id);
      return json(req, env, { ok: true });
    },
  },
  "/v1/subscriptions": {
    POST: async (req: Request, env: Env) => {
      const { name, price, billing_cycle } = await req.json();
      const subscription = await createSubscription(env.DB, name, price, billing_cycle);
      return json(req, env, { ok: true, data: subscription }, 201);
    },
    GET: async (req: Request, env: Env) => {
      const subscriptions = await listSubscriptions(env.DB);
      return { ok: true, data: subscriptions };
    },
  },
  "/v1/subscriptions/:id": {
    GET: async (req: Request, env: Env, params: { id: string }) => {
      const subscription = await getSubscription(env.DB, params.id);
      return { ok: true, data: subscription };
    },
    PUT: async (req: Request, env: Env, params: { id: string }) => {
      const { name, price, billing_cycle } = await req.json();
      await updateSubscription(env.DB, params.id, name, price, billing_cycle);
      return json(req, env, { ok: true });
    },
    DELETE: async (req: Request, env: Env, params: { id: string }) => {
      await deleteSubscription(env.DB, params.id);
      return json(req, env, { ok: true });
    },
  },
  "/v1/risk/config": {
    POST: async (req: Request, env: Env) => {
      const { name, is_published, limits } = await req.json();
      const config = await setRiskConfig(env.DB, name, is_published, limits);
      return json(req, env, { ok: true, data: config }, 201);
    },
    GET: async (req: Request, env: Env) => {
      const config = await getRiskConfig(env.DB);
      return { ok: true, data: config };
    },
  },
  "/v1/risk/check": {
    POST: async (req: Request, env: Env) => {
      const order = await req.json();
      const result = await checkRisk(env.DB, order);
      return result;
    },
  },
  "/v1/risk/killswitch": {
    POST: async (req: Request, env: Env) => {
      const result = await killSwitch(env.DB);
      return result;
    },
  },
  "/v1/customer_subscriptions": {
    POST: async (req: Request, env: Env) => {
      const { customer_id, subscription_id } = await req.json();
      const customerSubscription = await createCustomerSubscription(env.DB, customer_id, subscription_id);
      return json(req, env, { ok: true, data: customerSubscription }, 201);
    },
    GET: async (req: Request, env: Env) => {
      const url = new URL(req.url);
      const customer_id = url.searchParams.get("customer_id");
      const customerSubscriptions = await listCustomerSubscriptions(env.DB, customer_id);
      return { ok: true, data: customerSubscriptions };
    },
  },
  "/v1/customer_subscriptions/:id": {
    GET: async (req: Request, env: Env, params: { id: string }) => {
      const customerSubscription = await getCustomerSubscription(env.DB, params.id);
      return { ok: true, data: customerSubscription };
    },
    PATCH: async (req: Request, env: Env, params: { id: string }) => {
      const { status } = await req.json();
      await updateCustomerSubscription(env.DB, params.id, status);
      const customerSubscription = await getCustomerSubscription(env.DB, params.id);
      return { ok: true, data: customerSubscription };
    },
    DELETE: async (req: Request, env: Env, params: { id: string }) => {
      await deleteCustomerSubscription(env.DB, params.id);
      return empty(req, env);
    },
  },
};

const worker = {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return empty(req, env);

    const headers = { "content-type": "application/json", ...cors(req, env.CORS_ORIGINS) };
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    for (const route in router) {
      const pattern = new RegExp(`^${route.replace(/:\w+/g, "(\\w+)")}$`);
      const match = path.match(pattern);

      if (match) {
        const params: Record<string, string> = {};
        const paramNames = (route.match(/:\w+/g) || []).map(name => name.substring(1));
        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        const handler = (router as any)[route]?.[method];
        if (handler) {
          const result = await handler(req, env, params);
          if (result instanceof Response) {
            return result;
          }
          return new Response(JSON.stringify(result), { headers });
        }
      }
    }

    return json(req, env, { ok: false, error: "NOT_FOUND" }, 404);
  },

  async queue(batch: MessageBatch<any>) {
    for (const m of batch.messages) m.ack();
  }
};

export default worker;
