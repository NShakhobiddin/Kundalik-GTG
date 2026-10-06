/*
 * Ихтиёрий: PDF'ни бот орқали фойдаланувчининг Telegram чатига юбориш.
 *
 * Cloudflare Workers'га жойлаш:
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Шу файл матнини кодга қўйинг ва Deploy қилинг.
 *   3. Settings → Variables → Secret: BOT_TOKEN = BotFather берган токен.
 *      (Ихтиёрий) ALLOWED_ORIGIN = https://<user>.github.io
 *   4. Worker манзилини (https://....workers.dev) config.js'даги pdfApi'га ёзинг.
 *
 * Хавфсизлик: сўров Telegram initData имзоси орқали текширилади, файл фақат
 * имзодаги фойдаланувчининг ўзига юборилади. Файл серверда сақланмайди.
 */
export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
    if (!env.BOT_TOKEN) return json({ ok: false, error: "BOT_TOKEN not set" }, 500);

    let form;
    try { form = await request.formData(); } catch (e) { return json({ ok: false, error: "bad form" }, 400); }
    const initData = String(form.get("initData") || "");
    const file = form.get("file");
    if (!initData || !file || typeof file === "string") return json({ ok: false, error: "missing" }, 400);
    if (file.size > 20 * 1024 * 1024) return json({ ok: false, error: "too large" }, 413);

    const user = await verifyInitData(initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    const name = String(file.name || "Ish-daftari.pdf").replace(/[^\w.\-]+/g, "-").slice(0, 120);
    const fd = new FormData();
    fd.append("chat_id", String(user.id));
    fd.append("document", new Blob([await file.arrayBuffer()], { type: "application/pdf" }), name.endsWith(".pdf") ? name : name + ".pdf");
    fd.append("caption", "📄 Ish daftari — GlobalTrainings");

    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
    const res = await r.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, error: res.description || "telegram error" }, 502);
    return json({ ok: true });
  }
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const enc = new TextEncoder();
  const secret = await hmac(enc.encode("WebAppData"), enc.encode(token));
  const sig = await hmac(secret, enc.encode(check));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get("user") || "null"); } catch (e) { return null; }
}
