// Cloudflare Pages Function —— jsonbin 代理
// 路由：/api/data   （GET 读云端 JSON，PUT 写云端 JSON）
// 关键：jsonbin 的 Master Key 只存在 Cloudflare 环境变量里，绝不进前端/仓库。
//
// 需要在 Cloudflare Pages → Settings → Environment variables 配：
//   JSONBIN_KEY  = jsonbin 的 X-Master-Key
//   JSONBIN_BIN  = 你的 bin id
//   SYNC_TOKEN   = 你自定义的一串同步口令（前端在「更多」里粘贴，请求头带上校验）
//
// 本地想跑 Function：`npx wrangler pages dev . --compatibility-date=2024-01-01`
// 并在项目根建 `.dev.vars`（已 gitignore）写上面三个变量。

const JSONBIN = 'https://api.jsonbin.io/v3/b';

function withCORS(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type,x-sync-token');
  return resp;
}
const json = (obj, status = 200) =>
  withCORS(new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }));

function authed(request, env) {
  if (!env.SYNC_TOKEN) return true; // 未设口令则不校验（不建议，部署后请务必设）
  return request.headers.get('x-sync-token') === env.SYNC_TOKEN;
}
function configured(env) { return env.JSONBIN_KEY && env.JSONBIN_BIN; }

export async function onRequestOptions() {
  return withCORS(new Response(null, { status: 204 }));
}

export async function onRequestGet({ request, env }) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!configured(env)) return json({ error: 'server not configured' }, 500);
  const r = await fetch(`${JSONBIN}/${env.JSONBIN_BIN}/latest`, {
    headers: { 'X-Master-Key': env.JSONBIN_KEY, 'X-Bin-Meta': 'false' },
  });
  if (!r.ok) return json({ error: 'upstream ' + r.status }, 502);
  const data = await r.text();
  return withCORS(new Response(data, { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

export async function onRequestPut({ request, env }) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!configured(env)) return json({ error: 'server not configured' }, 500);
  const body = await request.text();
  const r = await fetch(`${JSONBIN}/${env.JSONBIN_BIN}`, {
    method: 'PUT',
    headers: { 'X-Master-Key': env.JSONBIN_KEY, 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok) return json({ error: 'upstream ' + r.status }, 502);
  return json({ ok: true });
}
