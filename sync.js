/**
 * sync.js — Google Drive 跨设备同步
 * 加载顺序：vocab_data.js → auth.js → sync.js → store.js → app/study.js
 *
 * ── 配置 CLIENT_ID ────────────────────────────────────────────────────────
 * Google Cloud Console → 凭据 → OAuth 2.0 客户端 ID → 复制后替换下方字符串
 */

const Sync = (() => {
  const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // ★ 替换
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  let tokenClient = null;
  let accessToken = null;
  let gsiLoaded   = false;
  let pendingAuth = null;
  let cachedFileId = null; // 缓存文件 ID，避免重复创建

  // ── 文件名（每个用户对应一个云端文件）──────────────────────────────────
  function fileName() {
    const u = Auth.currentUser();
    if (!u) return null;
    return 'viu_' + u.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '.json';
  }

  // ── 等待 GSI 就绪（脚本已在 HTML head 中加载）──────────────────────────
  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { gsiLoaded = true; resolve(); return; }
      // 轮询等待，最多 10 秒
      let waited = 0;
      const t = setInterval(() => {
        waited += 100;
        if (window.google?.accounts?.oauth2) {
          clearInterval(t); gsiLoaded = true; resolve();
        } else if (waited >= 10000) {
          clearInterval(t);
          reject(new Error('Google 授权服务加载超时，请确认网络可访问 Google（需要 VPN）'));
        }
      }, 100);
    });
  }

  async function ensureTokenClient() {
    if (tokenClient) return;
    if (!gsiLoaded) await loadGsi();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }

  function requestToken(prompt = 'consent') {
    if (pendingAuth) return pendingAuth;
    pendingAuth = new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        pendingAuth = null;
        if (resp.error) reject(new Error(resp.error_description || resp.error));
        else { accessToken = resp.access_token; resolve(); }
      };
      tokenClient.requestAccessToken({ prompt });
    });
    return pendingAuth;
  }

  async function authorize() {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
      throw new Error('CLIENT_ID 未配置，请在 sync.js 中填入你的 Google OAuth 客户端 ID');
    }
    await ensureTokenClient();
    await requestToken('consent');
  }

  // ── Drive REST ────────────────────────────────────────────────────────────
  async function driveReq(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Authorization': `Bearer ${accessToken}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      await requestToken('');
      return driveReq(url, options);
    }
    return res;
  }

  async function findFile(name) {
    const q = encodeURIComponent(`name='${name}'`);
    const res = await driveReq(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime+desc`
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

  // ── Pull：云端 → 本地，合并后通知页面刷新 ────────────────────────────────
  async function pull() {
    if (!accessToken) return;
    const name = fileName();
    if (!name) return;

    const fileId = await findFile(name);
    if (!fileId) { showBadge('云端暂无数据，本地数据将在下次操作后上传'); return; }
    cachedFileId = fileId;

    const remote = await readFile(fileId);
    if (!remote || typeof remote !== 'object') return;

    const u = Auth.currentUser();
    const kKey = `viu_known:${u}`;
    const nKey = `viu_notes:${u}`;

    // known：本地 ∪ 云端（两端都认识的才算认识）
    const local  = new Set(JSON.parse(localStorage.getItem(kKey) || '[]'));
    const cloud  = new Set(remote.known || []);
    const merged = [...new Set([...local, ...cloud])];
    localStorage.setItem(kKey, JSON.stringify(merged));

    // notes：云端覆盖本地
    const lNotes = JSON.parse(localStorage.getItem(nKey) || '{}');
    const cNotes = remote.notes || {};
    localStorage.setItem(nKey, JSON.stringify({ ...lNotes, ...cNotes }));

    showBadge(`已同步 ↓ · ${merged.length} 词已知`);

    // 通知 app.js / study.js 刷新展示
    window.dispatchEvent(new CustomEvent('viu:synced'));
  }

  // ── Push：本地 → 云端（每次数据变更后防抖 2s 触发）─────────────────────
  let pushTimer = null;
  function push() {
    if (!accessToken) return;
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
        if (!cachedFileId) cachedFileId = await findFile(name);
        if (cachedFileId) await updateFile(cachedFileId, content);
        else cachedFileId = await createFile(name, content);
        showBadge(`已同步 ↑ · ${content.known.length} 词已知`);
      } catch (e) {
        console.warn('[Sync] push 失败:', e);
        showBadge('推送失败: ' + e.message, true);
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
        padding: 4px 14px; opacity: 0;
        transition: opacity 0.3s; pointer-events: none;
      }
      #syncBadge.visible { opacity: 1; }
      #syncBadge.err { color: var(--accent); border-color: var(--accent); }
    `;
    document.head.appendChild(s);
  }

  let badgeTimer = null;
  function showBadge(text, isErr = false) {
    injectStyles();
    let el = document.getElementById('syncBadge');
    if (!el) { el = document.createElement('div'); el.id = 'syncBadge'; document.body.appendChild(el); }
    el.textContent = text;
    el.className = 'visible' + (isErr ? ' err' : '');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { el.className = ''; }, 3500);
  }

  // ── 绑定 dropdown 里的同步按钮（auth.js 已渲染 id="hdSyncBtn"）────────────
  function bindSyncButton() {
    const btn = document.getElementById('hdSyncBtn');
    if (!btn || btn.dataset.syncBound) return;
    btn.dataset.syncBound = '1';

    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (btn.classList.contains('sync-connected')) return;
      btn.disabled = true;
      btn.textContent = '授权中…';
      try {
        await authorize();
        btn.textContent = '同步中…';
        await pull();
        btn.textContent = '已同步 ✓';
        btn.classList.add('sync-connected');
        btn.disabled = false;
      } catch (err) {
        btn.textContent = '连接同步';
        btn.disabled = false;
        showBadge('失败: ' + err.message, true);
        console.error('[Sync]', err);
      }
    });
  }

  const obs = new MutationObserver(() => {
    if (document.getElementById('hdSyncBtn')) bindSyncButton();
  });
  function startObs() { obs.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObs);
  else startObs();

  return { authorize, pull, push };
})();
