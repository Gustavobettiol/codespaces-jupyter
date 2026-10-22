import "dotenv/config";
import { resolve } from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}. Revisá .env.`);
  return value;
}

function parseAdminIds(value) {
  const ids = value.split(",").map((part) => Number(part.trim()));
  if (ids.length === 0 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("ADMIN_IDS debe contener IDs numéricos positivos separados por coma.");
  }
  return ids;
}

const channelId = required("CHANNEL_ID");
if (!/^-?\d+$/.test(channelId)) {
  throw new Error("CHANNEL_ID debe ser un ID numérico de Telegram, por ejemplo -1001234567890.");
}

const studioUrl = new URL(
  process.env.STUDIO_URL?.trim()
    || "https://curly-meme-6j9x777v6j7hr9w-3001.app.github.dev/studio",
);
if (studioUrl.protocol !== "https:" || studioUrl.username || studioUrl.password) {
  throw new Error("STUDIO_URL debe ser una URL HTTPS válida.");
}

export const config = Object.freeze({
  botToken: required("BOT_TOKEN"),
  channelId,
  adminIds: parseAdminIds(required("ADMIN_IDS")),
  modelName: process.env.MODEL_NAME?.trim() || "Canal privado",
  payAlias: process.env.PAY_ALIAS?.trim() || "",
  studioUrl: studioUrl.toString(),
  dbPath: resolve(process.env.DB_PATH || "./data/secyposbot.sqlite"),
  timezone: process.env.TIMEZONE?.trim() || "UTC",
});

export const plans = Object.freeze([
  Object.freeze({ code: "base", label: "Base", priceUsd: 15, days: 30 }),
  Object.freeze({ code: "plus", label: "Plus", priceUsd: 30, days: 30 }),
  Object.freeze({ code: "vip", label: "VIP", priceUsd: 50, days: 30 }),
]);

export function planByCode(code) {
  return plans.find((plan) => plan.code === code) ?? null;
}

export function isAdmin(id) {
  return config.adminIds.includes(id);
}