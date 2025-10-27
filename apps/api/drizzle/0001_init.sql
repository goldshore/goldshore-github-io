CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  price REAL,
  billing_cycle TEXT
);

CREATE TABLE IF NOT EXISTS risk_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  is_published BOOLEAN,
  limits TEXT
);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  subscription_id INTEGER,
  status TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers (id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
);
