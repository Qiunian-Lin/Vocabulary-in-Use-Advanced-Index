/**
 * sync.js — Google Drive 跨设备同步
 *
 * 每个用户的数据存为 Drive AppData 目录下的 viu_<username>.json
 * 使用 Google Identity Services (GSI) + Drive REST API
 * 不依赖任何后端，纯前端 OAuth。
 *
 * 加载顺序：vocab_data.js → auth.js → sync.js → store.js → app/study.js
 *
 * ── 使用前必须配置 ────────────────────────────────────────────────────────
 * 1. 前往 https://console.cloud.google.com/
 * 2. 新建项目 → 启用 "Google Drive API"
 * 3. OAuth 同意屏幕 → 外部 → 添加范围:
 *      https://www.googleapis.com/auth/drive.appdata
 * 4. 凭据 → 创建 OAuth 2.0 客户端 ID（类型: Web 应用）
 *    授权来源填你的 GitHub Pages 域名，例如:
 *      https://yourname.github.io
 * 5. 把下面的 CLIENT_ID 替换为你的客户端 ID
 * ─────────────────────────────────────────────────────────────────────────
 */

const Sync = (() => {
  // ★ 替换为你的 OAuth 2.0 客户端 ID
  const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  const SCOPE     = 'https://www.googleapis.com/auth/drive.appdata';
  const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

  let tokenClient = null;
  let accessToken = null;
  let _resolveReady, _rejectReady;
  const readyPromise = new Promise((res, rej) => {
    _resolveReady = res; _rejectReady = rej;
  });

  // ── 文件名 ────────────────────────────────────────────────────────────────
  function fileName() {
    const u = Auth.currentUser();
    if (!u) return null;
    // 用户名 → 安全文件名
    return 'viu_' + u.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '.json';
  }

  // ── GSI 初始化 ────────────────────────────────────────────────────────────
  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = resolve;
      s.onerror = () => reject(new Error('GSI 加载失败'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
      console.warn('[Sync] CLIENT_ID 未配置，同步功能已禁用。');
      _rejectReady(new Error('CLIENT_ID 未配置'));
      return;
    }
    try {
      await loadGsi();
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { _rejectReady(new Error(resp.error)); return; }
          accessToken = resp.access_token;
          _resolveReady();
        },
      });
      // 尝试静默获取 token（用户曾授权过则无弹窗）
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      _rejectReady(e);
    }
  }

  // ── 手动触发授权（首次或 token 过期）────────────────────────────────────
  function authorize() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) { reject(new Error('未初始化')); return; }
      const orig = tokenClient.callback;
      tokenClient.callback = (resp) => {
        tokenClient.callback = orig;
        if (resp.error) { reject(new Error(resp.error)); return; }
        accessToken = resp.access_token;
        resolve();
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  // ── Drive REST 助手 ───────────────────────────────────────────────────────
  async function driveRequest(url, options = {}) {
    if (!accessToken) throw new Error('未授权');
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...(options.headers || {})
      }
    });
    if (resp.status === 401) {
      // token 过期 → 重新授权
      await authorize();
      return driveRequest(url, options);
    }
    return resp;
  }

  // 查找 appDataFolder 中的文件，返回 fileId 或 null
  async function findFile(name) {
    const q = encodeURIComponent(`name='${name}' and trashed=false`);
    const resp = await driveRequest(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`
    );
    const data = await resp.json();
    return data.files?.[0]?.id || null;
  }

  // 读取文件内容
  async function readFile(fileId) {
    const resp = await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );
    return resp.json();
  }

  // 创建文件
  async function createFile(name, content) {
    const meta = JSON.stringify({ name, parents: ['appDataFolder'] });
    const body = new FormData();
    body.append('metadata', new Blob([meta], { type: 'application/json' }));
    body.append('file',     new Blob([JSON.stringify(content)], { type: 'application/json' }));
    const resp = await driveRequest(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', body }
    );
    const data = await resp.json();
    return data.id;
  }

  // 更新文件
  async function updateFile(fileId, content) {
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content)
      }
    );
  }

  // ── 公开 API ──────────────────────────────────────────────────────────────

  /**
   * 从 Drive 拉取当前用户数据，合并到 localStorage
   * 以 Drive 为准（云端优先）
   */
  async function pull() {
    try {
      await readyPromise;
      const name = fileName();
      if (!name) return;
      const fileId = await findFile(name);
      if (!fileId) return; // 新用户，Drive 无文件
      const remote = await readFile(fileId);
      if (remote && typeof remote === 'object') {
        // 合并：known 取并集，notes 云端优先
        const localKnown = new Set(JSON.parse(localStorage.getItem(`viu_known:${Auth.currentUser()}`) || '[]'));
        const remoteKnown = new Set(remote.known || []);
        const merged = new Set([...localKnown, ...remoteKnown]);
        localStorage.setItem(`viu_known:${Auth.currentUser()}`, JSON.stringify([...merged]));

        const localNotes  = JSON.parse(localStorage.getItem(`viu_notes:${Auth.currentUser()}`) || '{}');
        const remoteNotes = remote.notes || {};
        const mergedNotes = { ...localNotes, ...remoteNotes }; // 云端覆盖本地
        localStorage.setItem(`viu_notes:${Auth.currentUser()}`, JSON.stringify(mergedNotes));

        showSyncBadge('已同步 ↓');
      }
    } catch (e) {
      console.warn('[Sync] pull 失败:', e.message);
    }
  }

  /**
   * 把当前用户本地数据推送到 Drive
   * 由 store.js 在每次写入后调用（防抖 2s）
   */
  let pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        await readyPromise;
        const name = fileName();
        if (!name) return;
        const content = {
          username: Auth.currentUser(),
          known: JSON.parse(localStorage.getItem(`viu_known:${Auth.currentUser()}`) || '[]'),
          notes: JSON.parse(localStorage.getItem(`viu_notes:${Auth.currentUser()}`) || '{}'),
          updated: new Date().toISOString()
        };
        let fileId = await findFile(name);
        if (fileId) {
          await updateFile(fileId, content);
        } else {
          await createFile(name, content);
        }
        showSyncBadge('已同步 ↑');
      } catch (e) {
        console.warn('[Sync] push 失败:', e.message);
        showSyncBadge('同步失败', true);
      }
    }, 2000);
  }

  // ── 同步状态角标 ──────────────────────────────────────────────────────────
  function injectSyncStyles() {
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
        transition: opacity 0.3s;
        pointer-events: none;
      }
      #syncBadge.visible { opacity: 1; }
      #syncBadge.error { color: var(--accent); border-color: var(--accent); }

      /* 头部同步按钮 */
      #syncConnectBtn {
        padding: 4px 10px;
        font-family: var(--mono); font-size: 0.65rem; font-weight: 300;
        color: #888; text-transform: uppercase; letter-spacing: 0.1em;
        border: 1px solid #444; border-radius: 3px;
        background: transparent; cursor: pointer;
        transition: color 0.12s, border-color 0.12s;
      }
      #syncConnectBtn:hover { color: #fff; border-color: #888; }
      #syncConnectBtn.connected { color: #6dbf8a; border-color: #6dbf8a; }
    `;
    document.head.appendChild(s);
  }

  let badgeTimer = null;
  function showSyncBadge(text, isError = false) {
    injectSyncStyles();
    let badge = document.getElementById('syncBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'syncBadge';
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.className = 'visible' + (isError ? ' error' : '');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { badge.className = ''; }, 2500);
  }

  // 在 header user badge 旁插入"连接 Drive"按钮
  function mountSyncButton() {
    injectSyncStyles();
    if (document.getElementById('syncConnectBtn')) return;
    const badge = document.getElementById('headerUserBadge');
    if (!badge) return;
    const btn = document.createElement('button');
    btn.id = 'syncConnectBtn';
    btn.textContent = '同步';
    btn.title = '连接 Google Drive 跨设备同步';
    btn.addEventListener('click', async () => {
      try {
        await authorize();
        btn.textContent = '同步中…';
        await pull();
        btn.textContent = '已连接';
        btn.classList.add('connected');
        // 刷新页面数据
        if (typeof render === 'function') render();
      } catch (e) {
        showSyncBadge('授权失败', true);
      }
    });
    badge.appendChild(btn);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); });
  } else {
    init();
  }

  // auth.js 登录后会调用 mountUserBadge，我们在其后挂载同步按钮
  // 用 MutationObserver 监听 headerUserBadge 出现
  const _observer = new MutationObserver(() => {
    if (document.getElementById('headerUserBadge') && !document.getElementById('syncConnectBtn')) {
      mountSyncButton();
      // 登录后自动尝试静默同步
      pull().then(() => {
        if (typeof render === 'function') render();
      });
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      _observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  return { pull, push, authorize };
})();
