import { getUserFromRequest, json } from "./_auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const username = await getUserFromRequest(request, env);
  if (!username) return json({ error: "未登录" }, 401);
  const row = await env.POKEMON_DB.prepare("SELECT progress FROM accounts WHERE username = ?").bind(username).first();
  if (!row || !row.progress) return json({ progress: null });
  try { return json({ progress: JSON.parse(row.progress) }); }
  catch (e) { return json({ progress: null }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const username = await getUserFromRequest(request, env);
  if (!username) return json({ error: "未登录" }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const progress = body && body.progress;
  if (typeof progress !== "object" || progress === null) return json({ error: "进度数据无效" }, 400);
  await env.POKEMON_DB.prepare("UPDATE accounts SET progress = ?, updated_at = ? WHERE username = ?")
    .bind(JSON.stringify(progress), Date.now(), username).run();
  return json({ ok: true });
}
