import { verifyPassword, newToken, json } from "./_auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const username = (body.username || "").trim();
  const password = body.password || "";
  const row = await env.POKEMON_DB.prepare("SELECT password_hash FROM accounts WHERE username = ?").bind(username).first();
  if (!row) return json({ error: "用户名或密码错误" }, 401);
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return json({ error: "用户名或密码错误" }, 401);
  const token = newToken();
  await env.POKEMON_DB.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, datetime('now','+30 days'))")
    .bind(token, username).run();
  return json({ token, username });
}
