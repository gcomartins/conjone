import { Database } from 'bun:sqlite';

import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/conjone.sqlite');
const db = new Database(dbPath, { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    whatsapp_number TEXT UNIQUE,
    gemini_api_key TEXT,
    google_refresh_token TEXT,
    setup_step TEXT DEFAULT 'START',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS system_control (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
