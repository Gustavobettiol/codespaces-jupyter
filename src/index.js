import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { db } from "./db.js";
import { bus } from "./bus.js";
import { hablar } from "./venice.js";
import { ELENCO } from "./elenco.js";
import { startBot, presentar, foto } from "./bot.js";

const app = express();
app.use(cors({ origin: (process.env.ALLOWED_ORIGIN || "*").split(","), allowedHeaders: ["Content-Type", "X-Telegram-Init-Data"] }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

function verificar(initData) {
  const p = new URLSearchParams(initData || "");
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash"); p.delete("signature");
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  if (crypto.createHmac("sha256", secret).update(check).digest("hex") !== hash) return null;
  return JSON.parse(p.get("user") || "null");
}
const auth = (req, res, next) => {
  const u = verificar(req.get("X-Telegram-Init-Data"));
  if (!u) return res.status(401).json({ error: "initData invalido" });
  req.user = u; next();
};

app.get("/events", (req, res) => {
  if (req.query.key !== process.env.SCENE_SECRET) return res.sendStatus(403);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const fn = e => res.write(`data: ${JSON.stringify(e)}\n\n`);
  bus.on("evento", fn);
  req.on("close", () => bus.off("evento", fn));
});

app.get("/health", (_q, r) => r.json({ ok: true, elenco: Object.keys(ELENCO) }));
app.get("/api/galeria", (_q, r) => r.json(db.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT 60").all()));
app.get("/api/elenco", (_q, r) => r.json(Object.entries(ELENCO).map(([k, p]) => ({ clave: k, nombre: p.nombre, edad: p.edad, ciudad: p.ciudad, gancho: p.gancho }))));

app.post("/api/foto", auth, async (req, res) => {
  try {
    const { clave = "camila", extra = "selfie, mirando a camara" } = req.body;
    const p = ELENCO[clave] ?? ELENCO.camila;
    const { url } = await foto(p, extra);
    bus.emit("evento", { tipo: "chat", autor: req.user.first_name, texto: extra });
    res.json({ ok: true, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/chat", auth, async (req, res) => {
  const { clave = "camila", mensaje } = req.body;
  const p = ELENCO[clave] ?? ELENCO.camila;
  try {
    const r = await hablar({ persona: p, mensaje });
    bus.emit("evento", { tipo: "chat", autor: req.user.first_name, texto: mensaje });
    bus.emit("evento", { tipo: "ella", texto: r });
    res.json({ ok: true, respuesta: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/presentar", async (req, res) => {
  try { await presentar(req.body.clave || "camila"); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3001, () => console.log("API en :" + (process.env.PORT || 3001)));
startBot();
