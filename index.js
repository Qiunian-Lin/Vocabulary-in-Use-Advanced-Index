/**
 * VIU Advanced — Cloudflare Worker API
 *
 * 路由：
 *   POST /api/register        注册
 *   POST /api/login           登录
 *   GET  /api/data            拉取用户数据
 *   POST /api/data            推送用户数据
 *
 * 环境变量（在 Cloudflare Dashboard 的 Worker Settings > Variables 中设置）：
 *   JWT_SECRET   任意长随机字符串，用于签发 token
 *
 * D1 绑定名称：DB（在 wrangler.toml 中配置）
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

// 简易密码哈希（SHA-256，不存明文）
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(salt));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// 生成随机 salt
function makeSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

// JWT（简化版：header.payload.sig，HS256）
async function signJwt(payload, secret) {
  const enc  = new TextEncoder();
  const head = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function verifyJwt(token, secret) {
  try {
    const [head, body, sig] = token.split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// 从请求头提取并验证 token，返回 username 或 null
async function authUser(request, secret) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const payload = await verifyJwt(token, secret);
  return payload?.username || null;
}

// ── 路由处理 ──────────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const { username, password } = await request.json();

  if (!username || !password)          return err('用户名和密码不能为空');
  if (username.length > 24)            return err('用户名最多 24 个字符');
  if (!/^[\w\u4e00-\u9fa5 _-]+$/.test(username)) return err('用户名含有非法字符');
  if (password.length < 4)             return err('密码至少 4 位');

  // 检查用户名是否已存在
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).bind(username).first();
  if (existing) return err('该用户名已被使用');

  // 存储哈希密码
  const salt   = makeSalt();
  const hashed = await hashPassword(password, salt);
  await env.DB.prepare(
    'INSERT INTO users (username, password_hash, salt, data) VALUES (?, ?, ?, ?)'
  ).bind(username, hashed, salt, JSON.stringify({ known: [], notes: {} })).run();

  // 签发 token（30天有效）
  const token = await signJwt(
    { username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET
  );
  return json({ ok: true, token });
}

async function handleLogin(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) return err('用户名和密码不能为空');

  const user = await env.DB.prepare(
    'SELECT password_hash, salt FROM users WHERE username = ?'
  ).bind(username).first();

  if (!user) return err('用户名不存在');

  const hashed = await hashPassword(password, user.salt);
  if (hashed !== user.password_hash) return err('密码错误');

  const token = await signJwt(
    { username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET
  );
  return json({ ok: true, token });
}

async function handleGetData(request, env) {
  const username = await authUser(request, env.JWT_SECRET);
  if (!username) return err('未登录或 token 已过期', 401);

  const row = await env.DB.prepare(
    'SELECT data FROM users WHERE username = ?'
  ).bind(username).first();

  const data = row?.data ? JSON.parse(row.data) : { known: [], notes: {} };
  return json({ ok: true, data });
}

async function handlePostData(request, env) {
  const username = await authUser(request, env.JWT_SECRET);
  if (!username) return err('未登录或 token 已过期', 401);

  const { known, notes } = await request.json();
  const data = JSON.stringify({
    known: Array.isArray(known) ? known : [],
    notes: (notes && typeof notes === 'object') ? notes : {},
  });

  await env.DB.prepare(
    'UPDATE users SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?'
  ).bind(data, username).run();

  return json({ ok: true });
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/register' && request.method === 'POST') return handleRegister(request, env);
    if (path === '/api/login'    && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/data'     && request.method === 'GET')  return handleGetData(request, env);
    if (path === '/api/data'     && request.method === 'POST') return handlePostData(request, env);

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
