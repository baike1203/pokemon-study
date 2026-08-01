// Cloudflare Pages Function: 进度云端保存 /api/save
// POST body: { token, slot, data }  ->  存入 KV(POKEMON_STORE) key="prog:"+slot
// 注意：EXPECTED_TOKEN 须与前端 index.html 中的 CLOUD_TOKEN 保持一致。
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { ...cors(), Allow: "POST, OPTIONS" } });
  }
  try {
    const body = await request.json();
    const token = body && body.token;
    const slot = body && body.slot;
    const data = body && body.data;
    if (token !== EXPECTED_TOKEN) return json({ error: "forbidden" }, 403);
    if (!slot || typeof slot !== "string") return json({ error: "bad slot" }, 400);
    if (!data || typeof data !== "object") return json({ error: "bad data" }, 400);
    const store = env.POKEMON_STORE;
    if (!store) return json({ error: "KV not bound" }, 500);
    await store.put("prog:" + slot, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
    return json({ ok: true, savedAt: Date.now() });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

const EXPECTED_TOKEN = "poke-study-cloud-7f3a9c2e";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...cors() } });
}
