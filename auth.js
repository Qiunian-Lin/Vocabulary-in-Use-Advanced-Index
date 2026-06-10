/**
 * auth.js — 用户名 + 密码登录/注册
 * 数据存储在 Cloudflare Worker 后端，token 存 localStorage
 *
 * 加载顺序：auth.js → store.js → app/study.js
 */

const Auth = (() => {
  // ★ 替换为你的 Cloudflare Worker 地址
  const API = 'https://viu-advanced-api.3468592157.workers.dev';

  const TOKEN_KEY = 'viu_token';
  const USER_KEY  = 'viu_username';

  function currentUser() { return localStorage.getItem(USER_KEY) || null; }
  function getToken()    { return localStorage.getItem(TOKEN_KEY) || null; }

  function saveSession(username, token) {
    localStorage.setItem(USER_KEY,  username);
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearSession() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function apiCall(path, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  // ── 转义 ─────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  // ── 样式 ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('authStyles')) return;
    const st = document.createElement('style');
    st.id = 'authStyles';
    st.textContent = `
      #authOverlay {
        position: fixed; inset: 0; z-index: 9000;
        background: var(--paper);
        display: flex; align-items: center; justify-content: center;
      }
      .auth-box {
        width: 100%; max-width: 360px; margin: 0 16px;
        padding: 40px 32px 32px;
        background: #fff; border: 1.5px solid var(--paper-3);
        border-radius: 8px; box-shadow: 0 8px 40px rgba(26,23,20,0.12);
      }
      .auth-logo { font-family: var(--serif); font-size: 1.5rem; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
      .auth-logo em { font-style: italic; color: var(--accent); }
      .auth-sub { font-family: var(--mono); font-size: 0.68rem; font-weight: 300; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 24px; }
      .auth-label { display: block; font-family: var(--mono); font-size: 0.68rem; font-weight: 300; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
      .auth-input { width: 100%; padding: 11px 14px; font-family: var(--sans); font-size: 0.95rem; font-weight: 300; border: 1.5px solid var(--paper-3); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none; transition: border-color 0.15s; margin-bottom: 10px; }
      .auth-input:focus { border-color: var(--ink-2); }
      .auth-actions { display: flex; gap: 10px; margin-top: 4px; }
      .auth-btn-primary { flex: 1; padding: 11px; font-family: var(--sans); font-size: 0.88rem; font-weight: 400; background: var(--ink); color: #fff; border: none; border-radius: 4px; cursor: pointer; transition: background 0.12s; }
      .auth-btn-primary:hover { background: var(--ink-2); }
      .auth-btn-primary:disabled { opacity: 0.5; cursor: wait; }
      .auth-btn-secondary { flex: 1; padding: 11px; font-family: var(--sans); font-size: 0.88rem; font-weight: 400; background: transparent; color: var(--ink); border: 1.5px solid var(--paper-3); border-radius: 4px; cursor: pointer; transition: border-color 0.12s; }
      .auth-btn-secondary:hover { border-color: var(--ink-2); }
      .auth-btn-secondary:disabled { opacity: 0.5; cursor: wait; }
      .auth-error { font-family: var(--mono); font-size: 0.72rem; color: var(--accent); min-height: 18px; margin-bottom: 10px; }

      /* Header 头像 + dropdown */
      #headerUserBadge { position: relative; flex-shrink: 0; }
      #hdAvatarBtn {
        width: 28px; height: 28px; border-radius: 50%;
        background: #2a2725; border: 1.5px solid #444;
        color: #ccc; font-family: var(--sans); font-size: 0.75rem; font-weight: 500;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: background 0.12s, border-color 0.12s; flex-shrink: 0; line-height: 1;
      }
      #hdAvatarBtn:hover { background: #3a3530; border-color: #888; color: #fff; }
      #hdDropdown {
        display: none; position: absolute; top: calc(100% + 10px); right: 0;
        background: #1a1714; border: 1px solid #2e2a26;
        border-radius: 6px; padding: 6px 0;
        min-width: 160px; z-index: 9999;
        box-shadow: 0 8px 28px rgba(0,0,0,0.55);
      }
      #hdDropdown.open { display: block; }
      .hd-name { padding: 6px 14px 8px; font-family: var(--mono); font-size: 0.65rem; font-weight: 300; color: #555; letter-spacing: 0.08em; border-bottom: 1px solid #252220; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hd-btn { display: block; width: 100%; padding: 7px 14px; text-align: left; font-family: var(--mono); font-size: 0.7rem; font-weight: 300; color: #999; text-transform: uppercase; letter-spacing: 0.08em; background: transparent; border: none; cursor: pointer; transition: background 0.1s, color 0.1s; }
      .hd-btn:hover { background: #252220; color: #fff; }
      .hd-divider { border: none; border-top: 1px solid #252220; margin: 4px 0; }

      /* Toast */
      #authToast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 8px 20px; font-family: var(--mono); font-size: 0.72rem; font-weight: 300; background: var(--ink); color: #fff; border-radius: 20px; opacity: 0; transition: opacity 0.25s; pointer-events: none; white-space: nowrap; }
      #authToast.visible { opacity: 1; }
      #authToast.err { background: var(--accent); }
    `;
    document.head.appendChild(st);
  }

  // ── 登录/注册弹层 ─────────────────────────────────────────────────────────
  function showAuthUI() {
    injectStyles();
    let overlay = document.getElementById('authOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'authOverlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="auth-box">
        <div class="auth-logo">VIU <em>Advanced</em></div>
        <div class="auth-sub">登录后数据云端保存，换设备可继续</div>
        <label class="auth-label">用户名</label>
        <input class="auth-input" id="authUser" type="text"
               placeholder="用户名" maxlength="24" autocomplete="username"/>
        <label class="auth-label">密码</label>
        <input class="auth-input" id="authPass" type="password"
               placeholder="密码（至少 4 位）" autocomplete="current-password"/>
        <div class="auth-error" id="authErr"></div>
        <div class="auth-actions">
          <button class="auth-btn-primary"   id="authLoginBtn">登录</button>
          <button class="auth-btn-secondary" id="authRegBtn">注册</button>
        </div>
      </div>`;

    const userEl  = overlay.querySelector('#authUser');
    const passEl  = overlay.querySelector('#authPass');
    const errEl   = overlay.querySelector('#authErr');
    const loginBtn = overlay.querySelector('#authLoginBtn');
    const regBtn   = overlay.querySelector('#authRegBtn');

    function setLoading(v) {
      loginBtn.disabled = v;
      regBtn.disabled   = v;
      loginBtn.textContent = v ? '请稍候…' : '登录';
    }

    async function doLogin() {
      const username = userEl.value.trim();
      const password = passEl.value;
      if (!username || !password) { errEl.textContent = '请填写用户名和密码'; return; }
      setLoading(true); errEl.textContent = '';
      try {
        const res = await apiCall('/api/login', 'POST', { username, password });
        if (!res.ok) { errEl.textContent = res.error; return; }
        saveSession(username, res.token);
        overlay.style.display = 'none';
        mountBadge();
        // 登录后从服务器拉数据
        await Store.pullFromServer();
        window.dispatchEvent(new CustomEvent('viu:synced'));
      } catch { errEl.textContent = '网络错误，请重试'; }
      finally { setLoading(false); }
    }

    async function doRegister() {
      const username = userEl.value.trim();
      const password = passEl.value;
      if (!username || !password) { errEl.textContent = '请填写用户名和密码'; return; }
      if (password.length < 4)    { errEl.textContent = '密码至少 4 位'; return; }
      setLoading(true); errEl.textContent = '';
      try {
        const res = await apiCall('/api/register', 'POST', { username, password });
        if (!res.ok) { errEl.textContent = res.error; return; }
        saveSession(username, res.token);
        overlay.style.display = 'none';
        mountBadge();
        showToast('注册成功，欢迎！');
      } catch { errEl.textContent = '网络错误，请重试'; }
      finally { setLoading(false); }
    }

    loginBtn.addEventListener('click', doLogin);
    regBtn.addEventListener('click', doRegister);
    [userEl, passEl].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    userEl.focus();
  }

  // ── Header 头像 + dropdown ────────────────────────────────────────────────
  function mountBadge() {
    const old = document.getElementById('headerUserBadge');
    if (old) old.remove();
    const user = currentUser();
    if (!user) return;
    const nav = document.querySelector('.header-inner');
    if (!nav) return;

    const initial = (user[0] || '?').toUpperCase();
    const badge = document.createElement('div');
    badge.id = 'headerUserBadge';
    badge.innerHTML = `
      <button id="hdAvatarBtn" title="${escAttr(user)}">${escHtml(initial)}</button>
      <div id="hdDropdown">
        <div class="hd-name">${escHtml(user)}</div>
        <button class="hd-btn" id="hdExportBtn">导出数据 ↓</button>
        <label  class="hd-btn" for="hdImportFile" style="cursor:pointer">导入数据 ↑</label>
        <input type="file" id="hdImportFile" accept=".json" style="display:none"/>
        <hr class="hd-divider"/>
        <button class="hd-btn" id="hdLogoutBtn">退出登录</button>
      </div>`;
    nav.appendChild(badge);

    const dropdown = badge.querySelector('#hdDropdown');
    badge.querySelector('#hdAvatarBtn').addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'), true);

    // 导出
    badge.querySelector('#hdExportBtn').addEventListener('click', e => {
      e.stopPropagation();
      const data = JSON.stringify(Store.exportData(), null, 2);
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
        download: `viu-${user}-${new Date().toISOString().slice(0,10)}.json`
      });
      a.click(); URL.revokeObjectURL(a.href);
      dropdown.classList.remove('open');
    });

    // 导入
    badge.querySelector('#hdImportFile').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        try {
          Store.importData(JSON.parse(ev.target.result));
          await Store.pushToServer();
          window.dispatchEvent(new CustomEvent('viu:synced'));
          showToast('导入成功 ✓');
        } catch { showToast('文件格式错误', true); }
      };
      reader.readAsText(file);
      e.target.value = '';
      dropdown.classList.remove('open');
    });

    // 退出
    badge.querySelector('#hdLogoutBtn').addEventListener('click', () => {
      clearSession();
      location.reload();
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(text, isErr = false) {
    let el = document.getElementById('authToast');
    if (!el) { el = document.createElement('div'); el.id = 'authToast'; document.body.appendChild(el); }
    el.textContent = text;
    el.className = 'visible' + (isErr ? ' err' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, 2500);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    const boot = () => currentUser() ? mountBadge() : showAuthUI();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  init();
  return { currentUser, getToken, apiCall };
})();
