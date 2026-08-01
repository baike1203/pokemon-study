// Cloudflare Pages Function: 进度云端读取 /api/load
// GET /api/load?slot=xxx&token=xxx  ->  返回 KV 中的 JSON，或 404
// 注意：EXPECTED_TOKEN 须与前端 index.html 中的 CLOUD_TOKEN 保持一致。
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  const url = new URL(request.url);
  const slot = url.searchParams.get("slot");
  const token = url.searchParams.get("token");
  if (token !== EXPECTED_TOKEN) return json({ error: "forbidden" }, 403);
  if (!slot) return json({ error: "bad slot" }, 400);
  const store = env.POKEMON_STORE;
  if (!store) return json({ error: "KV not bound" }, 500);
  const v = await store.get("prog:" + slot);
  if (!v) return json({ error: "not found" }, 404);
  return new Response(v, { headers: { "Content-Type": "application/json", ...cors(), "Cache-Control": "no-store" } });
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
