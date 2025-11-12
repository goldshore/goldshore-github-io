import { D1Database } from "@cloudflare/workers-types";

export async function createSubscription(db: D1Database, name: string, price: number, billing_cycle: string) {
  const { results } = await db.prepare("INSERT INTO subscriptions (name, price, billing_cycle) VALUES (?, ?, ?) RETURNING id").bind(name, price, billing_cycle).all();
  return results[0];
}

export async function getSubscription(db: D1Database, id: string) {
  const { results } = await db.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).all();
  return results[0];
}

export async function updateSubscription(db: D1Database, id: string, name: string, price: number, billing_cycle: string) {
  await db.prepare("UPDATE subscriptions SET name = ?, price = ?, billing_cycle = ? WHERE id = ?").bind(name, price, billing_cycle, id).run();
}

export async function deleteSubscription(db: D1Database, id: string) {
  await db.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
}

export async function listSubscriptions(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM subscriptions").all();
  return results;
}
