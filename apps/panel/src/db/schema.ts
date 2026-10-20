import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const model = pgTable("model", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  handle: text("handle").notNull().unique(),
  payout: text("payout"),
  feeBps: integer("fee_bps").notNull().default(1000),
  creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogSeq = pgTable("catalog_seq", {
  modelId: uuid("model_id")
    .primaryKey()
    .references(() => model.id),
  ultimo: integer("ultimo").notNull().default(0),
});

export const contentAsset = pgTable(
  "content_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => model.id),
    catalogSeq: integer("catalog_seq").notNull(),
    catalogNo: text("catalog_no").notNull(),
    titulo: text("titulo").notNull(),
    tipo: text("tipo").notNull().default("video"),
    cfUid: text("cf_uid"),
    duracionS: integer("duracion_s"),
    visibilityTier: text("visibility_tier").notNull().default("base"),
    includedTier: text("included_tier"),
    precioMicro: bigint("precio_micro", { mode: "number" }).notNull().default(0),
    pointsPrice: integer("points_price"),
    estado: text("estado").notNull().default("borrador"),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_asset_modelo").on(table.modelId),
    unique("idx_asset_modelo_catalogo").on(table.modelId, table.catalogNo),
    unique("idx_asset_modelo_secuencia").on(table.modelId, table.catalogSeq),
    index("idx_asset_uid").on(table.cfUid),
  ],
);

export const assetEvent = pgTable(
  "asset_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => contentAsset.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => model.id),
    nick: text("nick").notNull(),
    tipo: text("tipo").notNull(),
    montoMicro: bigint("monto_micro", { mode: "number" }).notNull().default(0),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_ev_asset_tipo").on(table.assetId, table.tipo)],
);
