import fs from "node:fs";
import crypto from "node:crypto";
import { Bot, InputFile, InlineKeyboard } from "grammy";
import { ELENCO, NEG, CALIDAD } from "./elenco.js";
import { imagen, hablar } from "./venice.js";
import { db } from "./db.js";
import { bus } from "./bus.js";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const BOT_USER = process.env.BOT_USERNAME;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync("public/media", { recursive: true });

const guardar = (u, p, rol, t) => db.prepare("INSERT INTO charlas VALUES (?,?,?,?,?)").run(u, p, rol, t, Date.now());
const activaDe = u => db.prepare("SELECT persona FROM charlas WHERE user_id=? ORDER BY ts DESC LIMIT 1").get(u)?.persona;

function historial(u, p, n = 14) {
  return db.prepare("SELECT rol, texto FROM charlas WHERE user_id=? AND persona=? ORDER BY ts DESC LIMIT ?")
    .all(u, p, n).reverse().map(r => ({ role: r.rol === "ella" ? "assistant" : "user", content: r.texto }));
}

export async function foto(persona, extra = "selfie, looking at camera") {
  const [b64] = await imagen({
    prompt: `${persona.look}, ${extra}, ${persona.escena}, ${CALIDAD}, vertical composition`,
    negative: NEG, seed: persona.seed, anon: persona.nombre,
  });
  const id = crypto.randomUUID();
  fs.writeFileSync(`public/media/${id}.jpg`, Buffer.from(b64, "base64"));
  const url = `/media/${id}.jpg`;
  db.prepare("INSERT INTO media (id,tipo,url,prompt,autor,modelo,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, "foto", url, extra, persona.nombre, persona.nombre, Date.now());
  bus.emit("evento", { tipo: "media", url, video: false, autor: persona.nombre, modelo: persona.nombre });
  return { id, url, b64 };
}

function partir(t) {
  const out = [];
  for (const f of t.split(/(?<=[.!?…])\s+/)) {
    const ult = out.at(-1);
    if (ult && (ult + " " + f).length < 160) out[out.length - 1] += " " + f; else out.push(f);
  }
  return out.slice(0, 3);
}

async function tipear(chatId, texto) {
  for (const b of partir(texto)) {
    await bot.api.sendChatAction(chatId, "typing");
    await sleep(Math.min(1800, 350 + b.length * 32));
    await bot.api.sendMessage(chatId, b);
    await sleep(180);
  }
}

const boton = (k, p) => ({ text: `${p.nombre}, ${p.edad} · ${p.ciudad.split(",")[0]}`, callback_data: `ch:${k}` });
const menu = () => ({ inline_keyboard: Object.entries(ELENCO).map(([k, p]) => [boton(k, p)]) });

export async function presentar(clave) {
  const p = ELENCO[clave];
  const { b64 } = await foto(p, "selfie, looking at camera with a cheeky smile");
  await bot.api.sendPhoto(CHANNEL, new InputFile(Buffer.from(b64, "base64"), "a.jpg"), {
    caption: `🔥 <b>${p.nombre}, ${p.edad}</b>\n📍 ${p.ciudad}\n💬 <i>"${p.gancho}"</i>\n✨ ${p.dato}\n\nEscribile → @${BOT_USER}`,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().url("Hablar con ella 💬", `https://t.me/${BOT_USER}?start=${clave}`),
  });
  bus.emit("evento", { tipo: "ticker", texto: `Nueva en el canal: ${p.nombre}, ${p.edad} — ${p.ciudad}` });
}

async function arrancar(ctx, clave) {
  const p = ELENCO[clave], uid = ctx.from.id;
  db.prepare("DELETE FROM charlas WHERE user_id=? AND persona=?").run(uid, clave);
  const { b64 } = await foto(p, "selfie, looking at camera, playful expression");
  await ctx.replyWithPhoto(new InputFile(Buffer.from(b64, "base64"), "a.jpg"),
    { caption: `<b>${p.nombre}</b>, ${p.edad} · ${p.ciudad}`, parse_mode: "HTML" });
  guardar(uid, clave, "ella", p.gancho);
  bus.emit("evento", { tipo: "personaje", nombre: p.nombre, meta: `${p.edad} · ${p.ciudad}` });
  await tipear(ctx.chat.id, p.gancho);
}

bot.command("start", async ctx => {
  const clave = ctx.match?.trim();
  if (clave && ELENCO[clave]) return arrancar(ctx, clave);
  await ctx.reply("👋 <b>Elegí con quién querés hablar</b>\n\nSon argentinas, tienen opiniones y no se guardan nada.",
    { parse_mode: "HTML", reply_markup: menu() });
});
bot.command("elenco", ctx => ctx.reply("👀", { reply_markup: menu() }));
bot.callbackQuery(/^ch:(.+)$/, async ctx => { await ctx.answerCallbackQuery(); await arrancar(ctx, ctx.match[1]); });

bot.command("foto", async ctx => {
  const clave = activaDe(ctx.from.id) ?? "camila";
  await ctx.replyWithChatAction("upload_photo");
  const { b64 } = await foto(ELENCO[clave], ctx.match?.trim() || "selfie, flirty");
  await ctx.replyWithPhoto(new InputFile(Buffer.from(b64, "base64"), "a.jpg"), { caption: `— ${ELENCO[clave].nombre} 📸` });
});

bot.command("presentar", async ctx => {
  const clave = ctx.match?.trim() || Object.keys(ELENCO)[Math.floor(Math.random() * 4)];
  if (!ELENCO[clave]) return ctx.reply("Claves: " + Object.keys(ELENCO).join(", "));
  await ctx.reply("Posteando a " + ELENCO[clave].nombre + " en el canal…");
  await presentar(clave);
});

bot.command("reset", async ctx => {
  const clave = activaDe(ctx.from.id);
  if (!clave) return ctx.reply("Elegí una con /elenco");
  db.prepare("DELETE FROM charlas WHERE user_id=? AND persona=?").run(ctx.from.id, clave);
  await arrancar(ctx, clave);
});

bot.on("message:text", async ctx => {
  if (ctx.message.text.startsWith("/")) return;
  const uid = ctx.from.id, clave = activaDe(uid);
  if (!clave) return ctx.reply("Primero elegí una con /elenco 👇", { reply_markup: menu() });
  guardar(uid, clave, "vos", ctx.message.text);
  bus.emit("evento", { tipo: "chat", autor: ctx.from.username ?? ctx.from.first_name, texto: ctx.message.text });
  try {
    const r = await hablar({ persona: ELENCO[clave], historial: historial(uid, clave), mensaje: ctx.message.text });
    guardar(uid, clave, "ella", r);
    bus.emit("evento", { tipo: "ella", texto: r });
    await tipear(ctx.chat.id, r);
  } catch (e) { await ctx.reply("❌ " + e.message.slice(0, 140)); }
});

export function startBot() {
  bot.start({ onStart: () => console.log("Bot arriba") });
  if (CHANNEL) {
    const claves = Object.keys(ELENCO); let i = 0;
    setInterval(() => presentar(claves[i++ % claves.length]).catch(console.error), 6 * 3600 * 1000);
  }
  return bot;
}
