/**
 * sync.js — Google Drive 跨设备同步
 *
 * 每个用户的数据存为 Drive AppData 目录下的 viu_<username>.json
 * 使用 Google Identity Services (GSI) Token 模式 + Drive REST API
 *
 * 加载顺序：vocab_data.js → auth.js → sync.js → store.js → app/study.js
 *
 * ── 配置步骤 ──────────────────────────────────────────────────────────────
 * 1. https://console.cloud.google.com → 新建项目
 * 2. API 和服务 → 启用 Google Drive API
 * 3. OAuth 同意屏幕 → 外部 → 范围添加:
 *      https://www.googleapis.com/auth/drive.appdata
 * 4. 凭据 → OAuth 2.0 客户端 ID → Web 应用
 *    授权的 JavaScript 来源: https://你的用户名.github.io
 * 5. 替换下方 CLIENT_ID
 * ─────────────────────────────────────────────────────────────────────────
 */

const Sync = (() => {
  // ★ 替换为你的 OAuth 2.0 客户端 ID
  const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  let tokenClient  = null;
  let accessToken  = null;   // 有值 = 已授权
  let gsiLoaded    = false;
  let pendingAuth  = null;   // 当前正在进行的授权 Promise

  // ── 文件名（每个用户名对应一个文件）──────────────────────────────────────
  function fileName() {
    const u = Auth.currentUser();
    if (!u) return null;
    return 'viu_' + u.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '.json';
  }

  // ── 加载 GSI 脚本 ─────────────────────────────────────────────────────────
  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { gsiLoaded = true; resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => { gsiLoaded = true; resolve(); };
      s.onerror = () => reject(new Error('GSI 脚本加载失败，请检查网络'));
      document.head.appendChild(s);
    });
  }

  // ── 初始化 tokenClient（只做一次）────────────────────────────────────────
  async function ensureTokenClient() {
    if (tokenClient) return;
    if (!gsiLoaded) await loadGsi();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      // callback 在 requestToken() 里动态赋值
      callback: () => {},
    });
  }

  // ── 请求 token（弹窗授权）────────────────────────────────────────────────
  // 同一时间只允许一个授权流程
  function requestToken(prompt = 'consent') {
    if (pendingAuth) return pendingAuth;
    pendingAuth = new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        pendingAuth = null;
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
        } else {
          accessToken = resp.access_token;
          resolve();
        }
      };
      tokenClient.requestAccessToken({ prompt });
    });
    return pendingAuth;
  }

  // ── 公开授权入口（按钮调用）──────────────────────────────────────────────
  async function authorize() {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
      throw new Error('CLIENT_ID 未配置，请先在 sync.js 中填入你的 Google OAuth 客户端 ID');
    }
    await ensureTokenClient();
    await requestToken('consent');
  }

  // ── Drive REST 助手 ───────────────────────────────────────────────────────
  async function driveReq(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Authorization': `Bearer ${accessToken}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      // token 过期，重新授权后重试一次
      await requestToken('');
      return driveReq(url, options);
    }
    return res;
  }

  async function findFile(name) {
    const q = encodeURIComponent(`name='${name}' and trashed=false`);
    const res = await driveReq(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`
    );
    const d = await res.json();
    return d.files?.[0]?.id ?? null;
  }

  async function readFile(fileId) {
    const res = await driveReq(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );
    return res.json();
  }

  async function createFile(name, content) {
    const form = new FormData();
    form.append('metadata', new Blob(
      [JSON.stringify({ name, parents: ['appDataFolder'] })],
      { type: 'application/json' }
    ));
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
    const res = await driveReq(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', body: form }
    );
    const d = await res.json();
    return d.id;
  }

  async function updateFile(fileId, content) {
    await driveReq(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      }
    );
  }

  // ── 拉取（云端 → 本地，合并）────────────────────────────────────────────
  async function pull() {
    if (!accessToken) return; // 未授权则跳过，不报错
    const name = fileName();
    if (!name) return;
    const fileId = await findFile(name);
    if (!fileId) return; // 新用户云端无数据
    const remote = await readFile(fileId);
    if (!remote || typeof remote !== 'object') return;

    const u = Auth.currentUser();
    const kKey = `viu_known:${u}`;
    const nKey = `viu_notes:${u}`;

    // known：本地 ∪ 云端
    const local  = new Set(JSON.parse(localStorage.getItem(kKey) || '[]'));
    const cloud  = new Set(remote.known || []);
    localStorage.setItem(kKey, JSON.stringify([...new Set([...local, ...cloud])]));

    // notes：云端覆盖本地（最后一次保存获胜）
    const lNotes = JSON.parse(localStorage.getItem(nKey) || '{}');
    const cNotes = remote.notes || {};
    localStorage.setItem(nKey, JSON.stringify({ ...lNotes, ...cNotes }));

    showBadge('已同步 ↓');
  }

  // ── 推送（本地 → 云端，防抖 2s）─────────────────────────────────────────
  let pushTimer = null;
  function push() {
    if (!accessToken) return; // 未授权则跳过
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        const name = fileName();
        if (!name) return;
        const u = Auth.currentUser();
        const content = {
          username: u,
          known: JSON.parse(localStorage.getItem(`viu_known:${u}`) || '[]'),
          notes: JSON.parse(localStorage.getItem(`viu_notes:${u}`) || '{}'),
          updated: new Date().toISOString(),
        };
        const fileId = await findFile(name);
        if (fileId) await updateFile(fileId, content);
        else        await createFile(name, content);
        showBadge('已同步 ↑');
      } catch (e) {
        console.warn('[Sync] push 失败:', e.message);
        showBadge('同步失败', true);
      }
    }, 2000);
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('syncStyles')) return;
    const s = document.createElement('style');
    s.id = 'syncStyles';
    s.textContent = `
      #syncBadge {
        position: fixed; bottom: 18px; right: 18px; z-index: 5000;
        font-family: var(--mono); font-size: 0.65rem; font-weight: 300;
        color: var(--ink-3); background: var(--paper-2);
        border: 1px solid var(--paper-3); border-radius: 20px;
        padding: 4px 12px; opacity: 0;
        transition: opacity 0.3s; pointer-events: none;
      }
      #syncBadge.visible { opacity: 1; }
      #syncBadge.err { color: var(--accent); border-color: var(--accent); }
      #syncConnectBtn {
        padding: 4px 10px;
        font-family: var(--mono); font-size: 0.65rem; font-weight: 300;
        color: #888; text-transform: uppercase; letter-spacing: 0.1em;
        border: 1px solid #444; border-radius: 3px;
        background: transparent; cursor: pointer;
        transition: color 0.12s, border-color 0.12s;
        white-space: nowrap;
      }
      #syncConnectBtn:hover { color: #fff; border-color: #888; }
      #syncConnectBtn.on { color: #6dbf8a; border-color: #6dbf8a; cursor: default; }
      #syncConnectBtn:disabled { opacity: 0.5; cursor: wait; }
    `;
    document.head.appendChild(s);
  }

  let badgeTimer = null;
  function showBadge(text, isErr = false) {
    injectStyles();
    let el = document.getElementById('syncBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'syncBadge';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'visible' + (isErr ? ' err' : '');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { el.className = ''; }, 2800);
  }

  function mountSyncButton() {
    injectStyles();
    if (document.getElementById('syncConnectBtn')) return;
    const badge = document.getElementById('headerUserBadge');
    if (!badge) return;

    const btn = document.createElement('button');
    btn.id = 'syncConnectBtn';
    btn.textContent = '同步';
    btn.title = '连接 Google Drive，跨设备同步数据';
    badge.appendChild(btn);

    btn.addEventListener('click', async () => {
      if (btn.classList.contains('on')) return;
      btn.disabled = true;
      btn.textContent = '授权中…';
      try {
        await authorize();               // 弹出 Google 授权窗口
        btn.textContent = '同步中…';
        await pull();                    // 拉取云端数据
        btn.textContent = '已连接';
        btn.classList.add('on');
        btn.disabled = false;
        // 刷新页面展示
        if (typeof render === 'function') render();
        if (typeof showCard === 'function') showCard();
      } catch (e) {
        btn.textContent = '同步';
        btn.disabled = false;
        // 把真实错误信息显示出来，方便排查
        showBadge('授权失败: ' + e.message, true);
        console.error('[Sync] 授权失败:', e);
      }
    });
  }

  // 监听 headerUserBadge 挂载后插入同步按钮
  const obs = new MutationObserver(() => {
    if (document.getElementById('headerUserBadge') && !document.getElementById('syncConnectBtn')) {
      mountSyncButton();
    }
  });
  function startObserver() {
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  return { authorize, pull, push };
})();
