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
      const email = (body.email||"").toString().trim();
      const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (!email) return new Response(JSON.stringify({ ok:false, error:"EMAIL_REQUIRED" }), { status:400, headers });
      if (!emailRegex.test(email)) return new Response(JSON.stringify({ ok:false, error:"INVALID_EMAIL" }), { status:400, headers });
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS leads (email TEXT PRIMARY KEY, ts TEXT DEFAULT CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR IGNORE INTO leads (email) VALUES (?)").bind(email).run();
      return { ok: true };
    },
  },
  "/v1/orders": {
    GET: async (req: Request, env: Env) => {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, symbol TEXT, qty REAL, side TEXT, ts TEXT DEFAULT CURRENT_TIMESTAMP)").run();
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
      return { ok: true, data: results };
    },
  },
  "/v1/customers": {
    POST: async (req: Request, env: Env) => {
      const { name, email } = await req.json();
      const customer = await createCustomer(env.DB, name, email);
      return new Response(JSON.stringify({ ok: true, data: customer }), { status: 201 });
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
      return { ok: true };
    },
    DELETE: async (req: Request, env: Env, params: { id: string }) => {
      await deleteCustomer(env.DB, params.id);
      return { ok: true };
    },
  },
  "/v1/subscriptions": {
    POST: async (req: Request, env: Env) => {
      const { name, price, billing_cycle } = await req.json();
      const subscription = await createSubscription(env.DB, name, price, billing_cycle);
      return new Response(JSON.stringify({ ok: true, data: subscription }), { status: 201 });
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
      return { ok: true };
    },
    DELETE: async (req: Request, env: Env, params: { id: string }) => {
      await deleteSubscription(env.DB, params.id);
      return { ok: true };
    },
  },
  "/v1/risk/config": {
    POST: async (req: Request, env: Env) => {
      const { name, is_published, limits } = await req.json();
      const config = await setRiskConfig(env.DB, name, is_published, limits);
      return new Response(JSON.stringify({ ok: true, data: config }), { status: 201 });
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
      return new Response(JSON.stringify({ ok: true, data: customerSubscription }), { status: 201 });
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
      return new Response(null, { status: 204 });
    },
  },
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const headers = { "content-type": "application/json", ...cors(req, env.CORS_ORIGINS) };
    if (req.method === "OPTIONS") return new Response(null, { headers });

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    for (const route in router) {
      const pattern = new RegExp(`^${route.replace(/:\w+/g, "(\\w+)")}$`);
      const match = path.match(pattern);

      if (match) {
        const params = {};
        const paramNames = (route.match(/:\w+/g) || []).map(name => name.substring(1));
        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        if (router[route][method]) {
          const result = await router[route][method](req, env, params);
          if (result instanceof Response) {
            return result;
          }
          return new Response(JSON.stringify(result), { headers });
        }
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404, headers });
  },

  async queue(batch: MessageBatch<any>) {
    for (const m of batch.messages) m.ack();
  }
};
