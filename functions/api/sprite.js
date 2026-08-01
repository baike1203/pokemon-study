// Cloudflare Pages Function: 同站点精灵图代理 /api/sprite
// 作用：在自己域名下直接代理 PokeAPI HOME 3D 渲染图，
//       免去第三方公共代理(ghproxy)跑路风险，并走 Cloudflare 边缘缓存加速。
// 用法：GET /api/sprite?id=25  ->  返回 image/png

const POKEAPI_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home";

export async function onRequest({ request }) {
  // 跨域预检（其他域名调用时浏览器会先发 OPTIONS）
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Allow": "GET, HEAD, OPTIONS", "Access-Control-Allow-Origin": "*" },
    });
  }

  let id;
  try {
    id = new URL(request.url).searchParams.get("id");
  } catch (e) {
    id = null;
  }
  // 仅允许 1~4 位数字 id（1~151 宝可梦）
  if (!id || !/^\d{1,4}$/.test(id)) {
    return new Response("Missing or invalid id", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const target = `${POKEAPI_BASE}/${id}.png`;
  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (pokemon-study)" },
    });
    if (!upstream.ok) {
      return new Response("Upstream error", {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // 浏览器 + Cloudflare 边缘缓存 1 天；图随 PokeAPI 几乎不变，可大胆缓存
        "Cache-Control": "public, max-age=86400",
        "CDN-Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response("Proxy failed: " + e.message, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
