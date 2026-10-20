import { createServer } from "node:http";
import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync } from "node:fs";
import { extname, join, resolve, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDemoStore } from "./demo-store.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.DEMO_PORT || 3000);
const dbPath = resolve(process.env.DEMO_DB_PATH || join(root, "data/demo-catalog.sqlite"));
const uploadDir = resolve(process.env.DEMO_UPLOAD_DIR || join(root, "data/demo-videos"));
const maxUploadBytes = 500 * 1024 * 1024;
const allowedExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogv", ".mkv"]);
const tiers = new Set(["base", "plus", "vip"]);
const store = createDemoStore(dbPath);
mkdirSync(uploadDir, { recursive: true });

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readJson(req, maxBytes = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("La solicitud excede el tamaño permitido."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("El cuerpo JSON no es válido."), { status: 400 });
  }
}

function serveStatic(pathname, res) {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ]);
  const entry = files.get(pathname);
  if (!entry) return false;
  res.writeHead(200, { "Content-Type": entry[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  createReadStream(join(publicDir, entry[0])).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const { pathname } = url;

    if (req.method === "GET" && serveStatic(pathname, res)) return;

    if (req.method === "GET" && pathname === "/api/assets") {
      return sendJson(res, 200, store.listAssets({
        studio: url.searchParams.get("studio") === "1",
        tier: url.searchParams.get("tier"),
      }));
    }

    if (req.method === "POST" && pathname === "/api/assets") {
      const body = await readJson(req);
      const originalName = typeof body.filename === "string" ? basename(body.filename).slice(0, 240) : "";
      const extension = extname(originalName).toLowerCase();
      if (!originalName || !allowedExtensions.has(extension)) {
        return sendJson(res, 400, { error: "Formato no admitido. Usa MP4, MOV, M4V, WebM, OGV o MKV." });
      }
      return sendJson(res, 201, store.createAsset({ id: randomUUID(), originalName }));
    }

    const uploadMatch = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/upload$/i);
    if (req.method === "PUT" && uploadMatch) {
      const asset = store.getAsset(uploadMatch[1]);
      if (!asset || asset.status !== "uploading") return sendJson(res, 404, { error: "Borrador de subida no encontrado." });
      const length = Number(req.headers["content-length"]);
      if (!Number.isSafeInteger(length) || length <= 0 || length > maxUploadBytes) {
        return sendJson(res, 413, { error: "El video debe pesar entre 1 byte y 500 MiB." });
      }
      const extension = extname(asset.original_name).toLowerCase();
      const storageKey = `${asset.id}${extension}`;
      const temporaryPath = join(uploadDir, `${storageKey}.${randomUUID()}.part`);
      try {
        await pipeline(req, createWriteStream(temporaryPath, { flags: "wx" }));
        const uploadedFile = await stat(temporaryPath);
        if (uploadedFile.size !== length) {
          throw Object.assign(new Error("La carga quedó incompleta; vuelve a intentarlo."), { status: 400 });
        }
        renameSync(temporaryPath, join(uploadDir, storageKey));
        if (!store.markUploaded(asset.id, storageKey)) {
          rmSync(join(uploadDir, storageKey), { force: true });
          return sendJson(res, 409, { error: "El artículo cambió durante la subida." });
        }
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        rmSync(temporaryPath, { force: true });
        throw error;
      }
    }

    const assetMatch = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    if (req.method === "PATCH" && assetMatch) {
      const asset = store.getAsset(assetMatch[1]);
      if (!asset || !asset.storage_key) return sendJson(res, 404, { error: "Artículo no encontrado o aún no subido." });
      const body = await readJson(req);
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
      const minTier = body.minTier;
      const priceCents = body.priceCents;
      const status = body.status;
      if (!title || !tiers.has(minTier) || !Number.isSafeInteger(priceCents) || priceCents < 0 || !["draft", "published"].includes(status)) {
        return sendJson(res, 400, { error: "Completa el título, nivel y precio válido." });
      }
      if (store.updateAsset(asset.id, { title, minTier, priceCents, status })) {
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 409, { error: "No se pudo actualizar el artículo." });
    }

    const eventMatch = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/(view|sale)$/i);
    if (req.method === "POST" && eventMatch) {
      const body = await readJson(req);
      const nick = typeof body.nick === "string" ? body.nick.slice(0, 64) : "";
      const kind = eventMatch[2];
      const amountCents = kind === "sale" ? Number(body.amountCents) : 0;
      if (!nick || (kind === "sale" && (!Number.isSafeInteger(amountCents) || amountCents < 0))) {
        return sendJson(res, 400, { error: "Identidad de prueba o importe no válido." });
      }
      if (!store.recordEvent({ assetId: eventMatch[1], nick, kind, amountCents })) {
        return sendJson(res, 404, { error: "Solo se registran eventos de artículos publicados." });
      }
      return sendJson(res, 201, { ok: true });
    }

    const videoMatch = pathname.match(/^\/media\/([0-9a-f-]{36}\.[a-z0-9]+)$/i);
    if (req.method === "GET" && videoMatch) {
      const asset = store.getAsset(videoMatch[1].slice(0, 36));
      const studioPreview = url.searchParams.get("studio") === "1";
      if (!asset || (asset.status !== "published" && !studioPreview) || asset.storage_key !== videoMatch[1]) {
        return sendJson(res, 404, { error: "Video no disponible." });
      }
      const filePath = join(uploadDir, asset.storage_key);
      const file = await stat(filePath);
      const mimeTypes = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".m4v": "video/x-m4v",
        ".webm": "video/webm",
        ".ogv": "video/ogg",
        ".mkv": "video/x-matroska",
      };
      const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (req.headers.range && !range) return sendJson(res, 416, { error: "Rango de video no válido." });
      const start = range ? Number(range[1] || 0) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
      if (start > end || start >= file.size) {
        res.writeHead(416, { "Content-Range": `bytes */${file.size}` });
        return res.end();
      }
      res.writeHead(range ? 206 : 200, {
        "Content-Type": mimeTypes[extname(asset.storage_key).toLowerCase()] || "application/octet-stream",
        "Content-Disposition": "inline",
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    return sendJson(res, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    console.error("Error en demo local:", error.message);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "Error interno del demo." });
    else res.destroy(error);
  }
});

server.on("close", () => store.close());
server.listen(port, "0.0.0.0", () => {
  console.log(`Demo de catálogo disponible en http://localhost:${port}`);
  console.log("Mantén el puerto de Codespaces en modo Private; es un demo sin inicio de sesión propio.");
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
