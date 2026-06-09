/**
 * auth.js — 多用户身份层
 * localStorage keys:
 *   viu_users        → string[]  已注册用户名
 *   viu_current_user → string    当前用户
 *
 * 加载顺序：auth.js → sync.js → store.js
 */

const Auth = (() => {
  const USERS_KEY   = 'viu_users';
  const CURRENT_KEY = 'viu_current_user';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveUsers(arr) { localStorage.setItem(USERS_KEY, JSON.stringify(arr)); }
  function currentUser() { return localStorage.getItem(CURRENT_KEY) || null; }
  function login(name)   { localStorage.setItem(CURRENT_KEY, name); }
  function logout()      { localStorage.removeItem(CURRENT_KEY); location.reload(); }

  function register(name) {
    name = name.trim();
    if (!name)            return '用户名不能为空';
    if (name.length > 24) return '用户名最多 24 个字符';
    if (!/^[\w\u4e00-\u9fa5 _-]+$/.test(name)) return '用户名含有非法字符';
    const users = getUsers();
    if (users.includes(name)) return '该用户名已被使用';
    users.push(name);
    saveUsers(users);
    login(name);
    return null;
  }

  // ── 转义 ─────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  // ── 样式（一次性注入）────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('authStyles')) return;
    const st = document.createElement('style');
    st.id = 'authStyles';
    st.textContent = `
      /* ── 登录弹层 ── */
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
      .auth-sub  { font-family: var(--mono); font-size: 0.68rem; font-weight: 300; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 24px; }
      .auth-label { display: block; font-family: var(--mono); font-size: 0.68rem; font-weight: 300; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
      .auth-input { width: 100%; padding: 11px 14px; font-family: var(--sans); font-size: 0.95rem; font-weight: 300; border: 1.5px solid var(--paper-3); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none; transition: border-color 0.15s; margin-bottom: 8px; }
      .auth-input:focus { border-color: var(--ink-2); }
      .auth-btn { width: 100%; padding: 11px; font-family: var(--sans); font-size: 0.88rem; font-weight: 400; background: var(--ink); color: #fff; border: none; border-radius: 4px; cursor: pointer; transition: background 0.12s; margin-top: 2px; }
      .auth-btn:hover { background: var(--ink-2); }
      .auth-error { font-family: var(--mono); font-size: 0.72rem; color: var(--accent); min-height: 18px; margin-bottom: 8px; }
      .auth-divider { border: none; border-top: 1px solid var(--paper-3); margin: 18px 0; }
      .auth-existing-label { font-family: var(--mono); font-size: 0.68rem; font-weight: 300; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block; }
      .auth-user-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .auth-user-chip { padding: 5px 14px; font-family: var(--sans); font-size: 0.82rem; font-weight: 400; border: 1.5px solid var(--paper-3); border-radius: 20px; background: var(--paper); color: var(--ink-2); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
      .auth-user-chip:hover { border-color: var(--ink); background: var(--ink); color: #fff; }

      /* ── Header：头像圆圈 + dropdown ── */
      #headerUserBadge { position: relative; flex-shrink: 0; }

      #hdAvatarBtn {
        width: 28px; height: 28px; border-radius: 50%;
        background: #2a2725; border: 1.5px solid #444;
        color: #ccc; font-family: var(--sans); font-size: 0.75rem; font-weight: 500;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: background 0.12s, border-color 0.12s; flex-shrink: 0;
        line-height: 1;
      }
      #hdAvatarBtn:hover { background: #3a3530; border-color: #888; color: #fff; }

      #hdDropdown {
        display: none; position: absolute; top: calc(100% + 10px); right: 0;
        background: #1a1714; border: 1px solid #2e2a26;
        border-radius: 6px; padding: 6px 0;
        min-width: 148px; z-index: 9999;
        box-shadow: 0 8px 28px rgba(0,0,0,0.55);
      }
      #hdDropdown.open { display: block; }

      .hd-name {
        padding: 6px 14px 8px;
        font-family: var(--mono); font-size: 0.65rem; font-weight: 300;
        color: #555; letter-spacing: 0.08em;
        border-bottom: 1px solid #252220; margin-bottom: 4px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        max-width: 148px;
      }
      .hd-btn {
        display: block; width: 100%; padding: 7px 14px; text-align: left;
        font-family: var(--mono); font-size: 0.7rem; font-weight: 300;
        color: #999; text-transform: uppercase; letter-spacing: 0.08em;
        background: transparent; border: none; cursor: pointer;
        transition: background 0.1s, color 0.1s;
      }
      .hd-btn:hover { background: #252220; color: #fff; }
      .hd-btn.sync-connected { color: #6dbf8a; }
      .hd-btn.sync-connected:hover { background: #252220; color: #6dbf8a; }
      .hd-btn:disabled { opacity: 0.45; cursor: wait; }
    `;
    document.head.appendChild(st);
  }

  // ── 登录弹层 ──────────────────────────────────────────────────────────────
  function showAuthUI() {
    injectStyles();
    let overlay = document.getElementById('authOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'authOverlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    const users = getUsers();
    overlay.innerHTML = `
      <div class="auth-box">
        <div class="auth-logo">VIU <em>Advanced</em></div>
        <div class="auth-sub">输入或选择用户名继续</div>
        <label class="auth-label">用户名</label>
        <input class="auth-input" id="authInput" type="text"
               placeholder="新建或已有用户名…" maxlength="24" autocomplete="off"/>
        <div class="auth-error" id="authErr"></div>
        <button class="auth-btn" id="authConfirm">进入 →</button>
        ${users.length ? `
          <hr class="auth-divider"/>
          <span class="auth-existing-label">已有用户</span>
          <div class="auth-user-list">
            ${users.map(u => `<button class="auth-user-chip" data-name="${escAttr(u)}">${escHtml(u)}</button>`).join('')}
          </div>` : ''}
      </div>`;

    const input   = overlay.querySelector('#authInput');
    const errEl   = overlay.querySelector('#authErr');
    const confirm = overlay.querySelector('#authConfirm');

    confirm.addEventListener('click', () => {
      const name = input.value.trim();
      if (getUsers().includes(name)) {
        login(name); hideAuthUI(); mountBadge();
      } else {
        const e = register(name);
        if (e) { errEl.textContent = e; return; }
        hideAuthUI(); mountBadge();
      }
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm.click(); });
    overlay.querySelectorAll('.auth-user-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        login(chip.dataset.name); hideAuthUI(); mountBadge();
      });
    });
    input.focus();
  }

  function hideAuthUI() {
    const el = document.getElementById('authOverlay');
    if (el) el.style.display = 'none';
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
        <button class="hd-btn" id="hdSwitchBtn">切换用户</button>
        <button class="hd-btn" id="hdSyncBtn">连接同步</button>
      </div>`;
    nav.appendChild(badge);

    const avatarBtn = badge.querySelector('#hdAvatarBtn');
    const dropdown  = badge.querySelector('#hdDropdown');

    avatarBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    // 点击外部关闭
    document.addEventListener('click', () => dropdown.classList.remove('open'), true);

    badge.querySelector('#hdSwitchBtn').addEventListener('click', () => {
      dropdown.classList.remove('open');
      logout();
    });

    // 登录成功后自动触发一次 pull（若 Sync 已初始化且已授权）
    // sync.js 会通过 MutationObserver 找到 #hdSyncBtn 并绑定逻辑
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    if (!currentUser()) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAuthUI);
      else showAuthUI();
    } else {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBadge);
      else mountBadge();
    }
  }

  init();
  return { currentUser, logout };
})();
