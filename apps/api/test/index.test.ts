import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

let mf: Miniflare;
let buildDir: string;

beforeAll(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), "goldshore-api-"));
  const outfile = path.join(buildDir, "worker.mjs");
  await build({
    entryPoints: ["src/index.ts"],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: "inline"
  });
  mf = new Miniflare({
    modules: [{ type: "ESModule", path: outfile }],
    modulesRoot: buildDir,
    rootPath: buildDir,
    compatibilityDate: "2024-09-01",
    kvNamespaces: ["AGENT_PROMPT_KV"],
    r2Buckets: ["SNAP_R2"],
    queueProducers: ["JOBS_QUEUE"],
    d1Databases: { DB: ":memory:" },
    bindings: {
      CORS_ORIGINS: "http://localhost"
    }
  });
  const db = await mf.getD1Database("DB");
  const schema = readFileSync("drizzle/0001_init.sql", "utf8");
  const statements = schema.split(';');
  for (const statement of statements) {
    if (statement.trim()) {
      await db.prepare(statement).run();
    }
  }
});

afterAll(async () => {
  await mf?.dispose();
  if (buildDir) rmSync(buildDir, { recursive: true, force: true });
});

const request = async (path: string, init?: RequestInit) => {
  const res = await mf.dispatchFetch(`http://localhost${path}`, init);
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse JSON for ${path}: ${text}`);
    }
  }
  return { res, json };
};

describe("Goldshore API REST handlers", () => {
  it("manages customers, subscriptions, and relationships", async () => {
    const customerCreate = await request("/v1/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" })
    });
    expect(customerCreate.res.status).toBe(201);
    expect(customerCreate.json.ok).toBe(true);
    const customerId = customerCreate.json.data.id;

    const subscriptionCreate = await request("/v1/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Pro", price: 49.99, billing_cycle: "monthly" })
    });
    expect(subscriptionCreate.res.status).toBe(201);
    const subscriptionId = subscriptionCreate.json.data.id;

    const relationshipCreate = await request("/v1/customer_subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, subscription_id: subscriptionId })
    });
    expect(relationshipCreate.res.status).toBe(201);
    const relationshipId = relationshipCreate.json.data.id;

    const listRelationships = await request(`/v1/customer_subscriptions?customer_id=${customerId}`);
    expect(listRelationships.res.status).toBe(200);
    expect(listRelationships.json.data.length).toBe(1);

    const updateRelationship = await request(`/v1/customer_subscriptions/${relationshipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "canceled" })
    });
    expect(updateRelationship.res.status).toBe(200);
    expect(updateRelationship.json.data.status).toBe("canceled");

    const deleteRelationship = await request(`/v1/customer_subscriptions/${relationshipId}`, {
      method: "DELETE"
    });
    expect(deleteRelationship.res.status).toBe(204);

    const customerList = await request("/v1/customers");
    expect(customerList.res.status).toBe(200);
    expect(customerList.json.data.length).toBeGreaterThan(0);
  });

  it("publishes risk limits", async () => {
    const riskCreate = await request("/v1/risk/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Default",
        is_published: true,
        limits: { max_notional: 50000, regions: ["US"] }
      })
    });
    expect(riskCreate.res.status).toBe(201);
    expect(riskCreate.json.data.is_published).toBe(1);

    const riskLimits = await request("/v1/risk/config", {
      method: "GET",
    });
    expect(riskLimits.res.status).toBe(200);
    expect(riskLimits.json.data.is_published).toBe(1);
  });

  it("validates email on lead capture", async () => {
    const validLead = await request("/v1/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" })
    });
    expect(validLead.res.status).toBe(200);

    const invalidLead = await request("/v1/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    });
    expect(invalidLead.res.status).toBe(400);
  });

  it("validates email on lead capture", async () => {
    const validLead = await request("/v1/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" })
    });
    expect(validLead.res.status).toBe(200);

    const invalidLead = await request("/v1/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    });
    expect(invalidLead.res.status).toBe(400);
  });
});
