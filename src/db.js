import Database from "better-sqlite3";
export const db = new Database("data.sqlite");
db.exec(`
CREATE TABLE IF NOT EXISTS charlas (user_id INTEGER, persona TEXT, rol TEXT, texto TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, tipo TEXT, url TEXT, prompt TEXT, autor TEXT, modelo TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, pro_hasta INTEGER DEFAULT 0);
`);
