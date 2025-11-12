CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  channel TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sentiment_ticks (
  ts INTEGER,
  symbol TEXT,
  score REAL,
  source TEXT,
  PRIMARY KEY (ts, symbol)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  side TEXT,
  qty REAL,
  status TEXT,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS positions (
  symbol TEXT PRIMARY KEY,
  qty REAL,
  avg_price REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
