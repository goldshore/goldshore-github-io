import { D1Database } from "@cloudflare/workers-types";

export async function createCustomer(db: D1Database, name: string, email: string) {
  const { results } = await db.prepare("INSERT INTO customers (name, email) VALUES (?, ?) RETURNING id").bind(name, email).all();
  return results[0];
}

export async function getCustomer(db: D1Database, id: string) {
  const { results } = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(id).all();
  return results[0];
}

export async function updateCustomer(db: D1Database, id: string, name: string, email: string) {
  await db.prepare("UPDATE customers SET name = ?, email = ? WHERE id = ?").bind(name, email, id).run();
}

export async function deleteCustomer(db: D1Database, id: string) {
  await db.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
}

export async function listCustomers(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM customers").all();
  return results;
}
