import { hashPassword, newToken, json } from "./_auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!/^[A-Za-z0-9_一-龥]{2,20}$/.test(username)) return json({ error: "用户名需 2-20 位（字母/数字/中文）" }, 400);
  if (password.length < 6) return json({ error: "密码至少 6 位" }, 400);
  const existing = await env.POKEMON_DB.prepare("SELECT username FROM accounts WHERE username = ?").bind(username).first();
  if (existing) return json({ error: "用户名已存在，请直接登录" }, 409);
  const pw_hash = await hashPassword(password);
  await env.POKEMON_DB.prepare("INSERT INTO accounts (username, password_hash, progress, updated_at) VALUES (?, ?, ?, datetime('now'))")
    .bind(username, pw_hash, Date.now()).run();
  const token = newToken();
  await env.POKEMON_DB.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, datetime('now','+30 days'))")
    .bind(token, username).run();
  return json({ token, username });
}
