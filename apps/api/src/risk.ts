import { D1Database } from "@cloudflare/workers-types";

export async function setRiskConfig(db: D1Database, name: string, is_published: boolean, limits: any) {
  await ensureRiskConfigsTable(db);
  const { results } = await db.prepare("INSERT INTO risk_configs (name, is_published, limits) VALUES (?, ?, ?) RETURNING id, is_published").bind(name, is_published, JSON.stringify(limits)).all();
  return results[0];
}

export async function getRiskConfig(db: D1Database) {
  await ensureRiskConfigsTable(db);
  const { results } = await db.prepare("SELECT * FROM risk_configs WHERE is_published = 1 LIMIT 1").all();
  return results[0];
}

export async function checkRisk(db: D1Database, order: any) {
  const config = await getRiskConfig(db);
  if (!config) {
    return { ok: true, message: "No risk config found, proceeding." };
  }

  const limits = JSON.parse(config.limits);
  if (order.notional > limits.max_notional) {
    return { ok: false, message: "Order exceeds max notional." };
  }

  return { ok: true };
}

export async function killSwitch(db: D1Database) {
  await ensureRiskConfigsTable(db);
  const existing = (await db.prepare("SELECT COUNT(1) as count FROM risk_configs").first()) as
    | { count: number }
    | null;
  if (!existing || !existing.count) {
    await db.prepare(
      "INSERT INTO risk_configs (id, name, limits, is_published, published_at) VALUES (?, ?, ?, 0, NULL)"
    )
      .bind(globalThis.crypto.randomUUID(), "Kill switch initialization", JSON.stringify({ killswitch: true }))
      .run();
  }
  await db.prepare(
    "UPDATE risk_configs SET is_published = 0, limits = json_set(COALESCE(NULLIF(limits, ''), '{}'), '$.killswitch', 1), updated_at = CURRENT_TIMESTAMP"
  ).run();
  return { ok: true, message: "Kill switch engaged." };
}

async function ensureRiskConfigsTable(db: D1Database) {
  await db.prepare(
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
