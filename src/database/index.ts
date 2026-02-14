import { Database } from 'bun:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/conjone.sqlite');
const db = new Database(dbPath, { create: true });

// Habilita o modo WAL (Write-Ahead Logging) para permitir leituras simultâneas 
// e define um timeout para evitar o erro 'database is locked'
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    whatsapp_number TEXT UNIQUE,
    setup_step TEXT DEFAULT 'START',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
