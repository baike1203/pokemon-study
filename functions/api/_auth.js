// 云端账号共享工具（非路由文件，以下划线开头，Cloudflare Pages 不会把它当接口）
const PBKDF2_ITER = 100000;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
  });
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const u = new Uint8Array(hex.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
  return u;
}

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" }, key, 256);
  return `pbkdf2$sha256$${PBKDF2_ITER}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(pw, stored) {
  try {
    const parts = stored.split("$");
    if (parts[0] !== "pbkdf2" || parts[2] !== String(PBKDF2_ITER)) return false;
    const salt = fromHex(parts[3]);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" }, key, 256);
    return toHex(bits) === parts[4];
  } catch (e) {
    return false;
  }
}

export function newToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

export async function getUserFromRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!TOKEN_RE.test(token)) return null;
  const row = await env.POKEMON_DB.prepare("SELECT username FROM sessions WHERE token = ?").bind(token).first();
  return row ? row.username : null;
}
