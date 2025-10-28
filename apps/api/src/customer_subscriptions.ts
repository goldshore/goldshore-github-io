import { D1Database } from "@cloudflare/workers-types";

export async function createCustomerSubscription(db: D1Database, customer_id: string, subscription_id: string) {
  const { results } = await db.prepare("INSERT INTO customer_subscriptions (customer_id, subscription_id) VALUES (?, ?) RETURNING id").bind(customer_id, subscription_id).all();
  return results[0];
}

export async function getCustomerSubscription(db: D1Database, id: string) {
  const { results } = await db.prepare("SELECT * FROM customer_subscriptions WHERE id = ?").bind(id).all();
  return results[0];
}

export async function updateCustomerSubscription(db: D1Database, id: string, status: string) {
  await db.prepare("UPDATE customer_subscriptions SET status = ? WHERE id = ?").bind(status, id).run();
}

export async function deleteCustomerSubscription(db: D1Database, id: string) {
  await db.prepare("DELETE FROM customer_subscriptions WHERE id = ?").bind(id).run();
}

export async function listCustomerSubscriptions(db: D1Database, customer_id: string) {
  const { results } = await db.prepare("SELECT * FROM customer_subscriptions WHERE customer_id = ?").bind(customer_id).all();
  return results;
}
