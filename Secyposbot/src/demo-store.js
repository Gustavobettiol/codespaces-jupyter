import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS catalog_seq (
    model_id TEXT PRIMARY KEY,
    last INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS content_asset (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    catalog_seq INTEGER NOT NULL,
    catalog_no TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'video',
    storage_key TEXT,
    original_name TEXT,
    min_tier TEXT NOT NULL DEFAULT 'base',
    price_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (model_id, catalog_seq),
    UNIQUE (model_id, catalog_no)
  );

  CREATE TABLE IF NOT EXISTS asset_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL REFERENCES content_asset(id),
    nick TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('view', 'sale')),
    amount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_demo_events_asset_kind
    ON asset_event(asset_id, kind);
`;

export function createDemoStore(dbPath, modelId = "demo-model") {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schema);

  const createAsset = db.transaction(({ id, originalName }) => {
    db.prepare(`
      INSERT INTO catalog_seq (model_id, last) VALUES (?, 0)
      ON CONFLICT(model_id) DO NOTHING
    `).run(modelId);
    const { last } = db.prepare(`
      UPDATE catalog_seq SET last = last + 1 WHERE model_id = ? RETURNING last
    `).get(modelId);
    const catalogNo = `A-${String(last).padStart(4, "0")}`;
    db.prepare(`
      INSERT INTO content_asset
        (id, model_id, catalog_seq, catalog_no, original_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, modelId, last, catalogNo, originalName);
    return { id, catalog_no: catalogNo, status: "uploading" };
  });

  return {
    createAsset,
    markUploaded(id, storageKey) {
      return db.prepare(`
        UPDATE content_asset SET storage_key = ?, status = 'draft'
        WHERE id = ? AND status = 'uploading'
      `).run(storageKey, id).changes === 1;
    },
    updateAsset(id, { title, minTier, priceCents, status }) {
      return db.prepare(`
        UPDATE content_asset
        SET title = ?, min_tier = ?, price_cents = ?, status = ?
        WHERE id = ? AND status IN ('draft', 'published')
      `).run(title, minTier, priceCents, status, id).changes === 1;
    },
    getAsset(id) {
      return db.prepare("SELECT * FROM content_asset WHERE id = ?").get(id) ?? null;
    },
    listAssets({ studio, tier }) {
      const tiersByRank = { base: 0, plus: 1, vip: 2 };
      const filter = studio
        ? ""
        : "WHERE a.status = 'published' AND CASE a.min_tier WHEN 'base' THEN 0 WHEN 'plus' THEN 1 ELSE 2 END <= ?";
      const query = db.prepare(`
        SELECT a.*,
          COUNT(e.id) FILTER (WHERE e.kind = 'view') AS views,
          COUNT(DISTINCT e.nick) FILTER (WHERE e.kind = 'view') AS unique_viewers,
          COUNT(e.id) FILTER (WHERE e.kind = 'sale') AS sales,
          COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'sale'), 0) AS revenue_cents,
          COUNT(DISTINCT e.nick) FILTER (
            WHERE e.kind = 'sale' AND EXISTS (
              SELECT 1 FROM asset_event v
              WHERE v.asset_id = a.id AND v.kind = 'view' AND v.nick = e.nick
            )
          ) AS converters
        FROM content_asset a
        LEFT JOIN asset_event e ON e.asset_id = a.id
        ${filter}
        GROUP BY a.id
        ORDER BY a.catalog_seq DESC
      `);
      return studio ? query.all() : query.all(tiersByRank[tier] ?? 0);
    },
    recordEvent({ assetId, nick, kind, amountCents = 0 }) {
      return db.prepare(`
        INSERT INTO asset_event (asset_id, nick, kind, amount_cents)
        SELECT ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM content_asset WHERE id = ? AND status = 'published'
        )
      `).run(assetId, nick, kind, amountCents, assetId).changes === 1;
    },
    close() {
      db.close();
    },
  };
}
