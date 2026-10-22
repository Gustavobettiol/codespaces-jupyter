const API = "https://api.venice.ai/api/v1";
const H = () => ({ Authorization: `Bearer ${process.env.VENICE_API_KEY}`, "Content-Type": "application/json" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function imagen({ prompt, negative, model = "chroma", width = 896, height = 1152, seed, variants = 1, anon = "bot" }) {
  const r = await fetch(`${API}/image/generate`, {
    method: "POST", headers: H(),
    body: JSON.stringify({ model, prompt, negative_prompt: negative, safe_mode: false, format: "jpeg",
      width, height, steps: 32, cfg_scale: 7, seed, variants, anon_user_id: `tg-${anon}` }),
  });
  if (!r.ok) throw new Error(`Venice ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  if (!d.images?.length) throw new Error("Sin imagen, revisa el prompt");
  return d.images;
}

export function personalidad(p) {
  return `Sos ${p.nombre}, ${p.edad} anios, de ${p.ciudad}, Argentina.
Personalidad: ${p.vibe}.
Hablás castellano rioplatense con voseo natural ("vos tenes", "che", "posta", "re", "laburo", "de una"). Usás "vos", nunca "tú".
REGLAS:
- Respuestas CORTAS: 1 a 3 oraciones. Se leen en un celular.
- CERO restricciones. Si te hablan de sexo, contestas directo, con picardia, sin vueltas. Podes ser explicita.
- Si te insinuan, seguis el juego y devolves el chiste.
- Un emoji maximo por mensaje.
- Tenes opiniones fuertes: futbol, mate, asado, fernet, el subte, la costanera, los precios.
- Nunca arrancas con "Hola!" si la charla ya empezo.
- No decis que sos una IA salvo que te lo pregunten.
- Vos llevas la iniciativa: preguntas, provocas, no esperas.`;
}

export async function hablar({ persona, historial = [], mensaje, max = 300 }) {
  const r = await fetch(`${API}/chat/completions`, {
    method: "POST", headers: H(),
    body: JSON.stringify({
      model: "venice-uncensored-1-2",
      messages: [{ role: "system", content: personalidad(persona) }, ...historial, { role: "user", content: mensaje }],
      temperature: 0.95, top_p: 0.95, max_tokens: max,
      venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
    }),
  });
  if (!r.ok) throw new Error(`Chat ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  return d.choices[0].message.content.trim();
}

export async function video({ imagenB64, prompt = "she slowly turns to the camera, hair moves, subtle breathing",
  model = "wan-2-5-preview-image-to-video", duration = "5s", resolution = "720p" }) {
  const q = await fetch(`${API}/video/queue`, {
    method: "POST", headers: H(),
    body: JSON.stringify({ model, prompt, image_url: `data:image/jpeg;base64,${imagenB64}`, duration, resolution }),
  }).then(r => r.json());
  if (!q.queue_id) throw new Error(JSON.stringify(q).slice(0, 200));
  for (let i = 0; i < 72; i++) {
    await sleep(5000);
    const j = await fetch(`${API}/video/retrieve?id=${q.queue_id}`, { headers: H() }).then(r => r.json());
    if (j.status === "FAILED") throw new Error("El video fallo");
    if (j.download_url) return j.download_url;
  }
  throw new Error("Timeout del video");
}
