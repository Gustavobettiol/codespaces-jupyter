const $ = (selector) => document.querySelector(selector);
const fileInput = $("#video-file");
const editor = $("#editor");
const status = $("#upload-status");
let currentAsset = null;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) throw new Error(body?.error || `Error ${response.status}`);
  return body;
}

function visitorNick() {
  let nick = localStorage.getItem("demoNick");
  if (!nick) {
    const animals = ["Lince", "Zorro", "Cuervo", "Jaguar", "Lobo", "Puma", "Tigre", "Buho"];
    const adjectives = ["Ambar", "Lunar", "Cobalto", "Sereno", "Bravo", "Fugaz", "Dorado", "Libre"];
    const random = new Uint32Array(2);
    crypto.getRandomValues(random);
    nick = `${animals[random[0] % animals.length]} ${adjectives[random[1] % adjectives.length]} ${10 + random[0] % 90}`;
    localStorage.setItem("demoNick", nick);
  }
  return nick;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2800);
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function loadAssets() {
  const studio = document.body.dataset.mode !== "customer";
  const tier = $("#customer-tier").value;
  $("#tier-filter").classList.toggle("hidden", studio);
  const assets = await api(studio ? "/api/assets?studio=1" : `/api/assets?tier=${tier}`);
  const container = $("#assets");
  if (!assets.length) {
    container.innerHTML = `<div class="empty">${studio ? "Todavía no hay artículos. Sube el primer video desde tu dispositivo." : "No hay contenido publicado en este nivel."}</div>`;
    return;
  }
  container.innerHTML = assets.map((asset) => {
    const views = Number(asset.views);
    const unique = Number(asset.unique_viewers);
    const sales = Number(asset.sales);
    const converters = Number(asset.converters);
    const conversion = unique ? Math.round((converters / unique) * 100) : 0;
    const isPublished = asset.status === "published";
    const canView = studio || isPublished;
    const price = Number(asset.price_cents);
    const media = canView
      ? `<video class="player" controls preload="metadata" playsinline src="/media/${encodeURIComponent(asset.storage_key)}${studio && !isPublished ? "?studio=1" : ""}" data-id="${asset.id}" data-track="${isPublished}"></video>`
      : `<div class="locked">${isPublished ? `Disponible desde ${escapeHtml(asset.min_tier.toUpperCase())}` : "Borrador — solo visible en el panel"}</div>`;
    return `<article class="asset-card">
      <div class="asset-media">${media}</div>
      <div class="asset-body">
        <div class="asset-title"><span class="catalog-badge">${escapeHtml(asset.catalog_no)}</span><span class="state ${isPublished ? "published" : ""}">${isPublished ? "Publicado" : "Borrador"}</span></div>
        <h3>${escapeHtml(asset.title || asset.original_name || "Artículo sin título")}</h3>
        <p class="meta">${escapeHtml(asset.min_tier.toUpperCase())} · ${price ? `USD ${(price / 100).toFixed(2)}` : "Incluido"} · ${escapeHtml(asset.original_name || "")}</p>
        ${studio ? `<div class="metrics"><div><b>${views}</b><span>vistas</span></div><div><b>${unique}</b><span>personas</span></div><div><b>${sales}</b><span>ventas</span></div><div><b>${conversion}%</b><span>conversión</span></div></div>` : ""}
        ${isPublished && price > 0 ? `<button class="button buy" data-buy="${asset.id}" data-price="${price}">Simular desbloqueo · USD ${(price / 100).toFixed(2)}</button>` : ""}
      </div>
    </article>`;
  }).join("");

  container.querySelectorAll('video[data-track="true"]').forEach((video) => {
    video.addEventListener("play", async () => {
      try {
        await api(`/api/assets/${video.dataset.id}/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nick: visitorNick() }),
        });
      } catch (error) {
        toast(error.message);
      }
    }, { once: true });
  });

  container.querySelectorAll("[data-buy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/assets/${button.dataset.buy}/sale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nick: visitorNick(), amountCents: Number(button.dataset.price) }),
        });
        toast("Venta de prueba registrada.");
        await loadAssets();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  currentAsset = null;
  editor.classList.add("hidden");
  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    setStatus("El archivo supera el máximo de 500 MiB.", true);
    return;
  }
  const allowed = /\.(mp4|mov|m4v|webm|ogv|mkv)$/i.test(file.name);
  if (!allowed) {
    setStatus("Formato no admitido. Selecciona MP4, MOV, M4V, WebM, OGV o MKV.", true);
    return;
  }
  $("#file-label").textContent = file.name;
  setStatus("Preparando artículo y asignando número de catálogo…");
  try {
    currentAsset = await api("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    $("#catalog-badge").textContent = currentAsset.catalog_no;
    setStatus("Subiendo al almacenamiento del Codespace… no cierres esta página.");
    await api(`/api/assets/${currentAsset.id}/upload`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    $("#title").value = file.name.replace(/\.[^.]+$/, "");
    $("#tier").value = "base";
    $("#price").value = "0";
    $("#publish").value = "draft";
    editor.classList.remove("hidden");
    setStatus(`Video subido. Número ${currentAsset.catalog_no} reservado permanentemente.`);
    await loadAssets();
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#save-asset").addEventListener("click", async () => {
  if (!currentAsset) return;
  const price = Number($("#price").value);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    setStatus("Introduce un precio válido.", true);
    return;
  }
  try {
    await api(`/api/assets/${currentAsset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("#title").value,
        minTier: $("#tier").value,
        priceCents: Math.round(price * 100),
        status: $("#publish").value,
      }),
    });
    setStatus("Artículo guardado.");
    editor.classList.add("hidden");
    fileInput.value = "";
    await loadAssets();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    const customer = button.dataset.mode === "customer";
    document.body.dataset.mode = customer ? "customer" : "studio";
    $("#studio").classList.toggle("hidden", customer);
    document.querySelectorAll(".mode").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    loadAssets().catch((error) => toast(error.message));
  });
});

$("#refresh").addEventListener("click", () => loadAssets().catch((error) => toast(error.message)));
$("#customer-tier").addEventListener("change", () => loadAssets().catch((error) => toast(error.message)));
document.body.dataset.mode = "studio";
loadAssets().catch((error) => toast(error.message));
