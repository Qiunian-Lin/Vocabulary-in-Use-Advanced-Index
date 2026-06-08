/**
 * auth.js — 轻量多用户身份层
 * 用 localStorage 存储：
 *   viu_users        → 已注册用户名列表 (string[])
 *   viu_current_user → 当前登录用户名 (string)
 *
 * 必须在 store.js 之前加载。
 * store.js 通过 Auth.currentUser() 获取前缀。
 */

const Auth = (() => {
  const USERS_KEY   = 'viu_users';
  const CURRENT_KEY = 'viu_current_user';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveUsers(arr) {
    localStorage.setItem(USERS_KEY, JSON.stringify(arr));
  }

  function currentUser() {
    return localStorage.getItem(CURRENT_KEY) || null;
  }

  function login(name) {
    localStorage.setItem(CURRENT_KEY, name);
  }

  function logout() {
    localStorage.removeItem(CURRENT_KEY);
    showAuthUI();
  }

  function register(name) {
    name = name.trim();
    if (!name) return '用户名不能为空';
    if (name.length > 24) return '用户名最多 24 个字符';
    if (!/^[\w\u4e00-\u9fa5 _-]+$/.test(name)) return '用户名含有非法字符';
    const users = getUsers();
    if (users.includes(name)) return '该用户名已被使用';
    users.push(name);
    saveUsers(users);
    login(name);
    return null; // null = success
  }

  /* ── UI ─────────────────────────────────────────────────────────────────── */

  const OVERLAY_ID = 'authOverlay';

  function injectStyles() {
    if (document.getElementById('authStyles')) return;
    const s = document.createElement('style');
    s.id = 'authStyles';
    s.textContent = `
      #authOverlay {
        position: fixed; inset: 0; z-index: 9000;
        background: var(--paper);
        display: flex; align-items: center; justify-content: center;
      }
      .auth-box {
        width: 100%; max-width: 360px;
        padding: 44px 36px 36px;
        background: #fff;
        border: 1.5px solid var(--paper-3);
        border-radius: 8px;
        box-shadow: 0 8px 40px rgba(26,23,20,0.12);
      }
      .auth-logo {
        font-family: var(--serif); font-size: 1.6rem; font-weight: 700;
        color: var(--ink); margin-bottom: 4px;
      }
      .auth-logo em { font-style: italic; color: var(--accent); }
      .auth-sub {
        font-family: var(--mono); font-size: 0.68rem; font-weight: 300;
        color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.12em;
        margin-bottom: 28px;
      }
      .auth-label {
        display: block;
        font-family: var(--mono); font-size: 0.7rem; font-weight: 300;
        color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em;
        margin-bottom: 6px;
      }
      .auth-input {
        width: 100%; padding: 11px 14px;
        font-family: var(--sans); font-size: 0.95rem; font-weight: 300;
        border: 1.5px solid var(--paper-3); border-radius: 4px;
        background: var(--paper); color: var(--ink);
        outline: none; transition: border-color 0.15s;
        margin-bottom: 8px;
      }
      .auth-input:focus { border-color: var(--ink-2); }
      .auth-btn {
        width: 100%; padding: 11px;
        font-family: var(--sans); font-size: 0.88rem; font-weight: 400;
        background: var(--ink); color: #fff;
        border: none; border-radius: 4px; cursor: pointer;
        transition: background 0.12s; margin-top: 4px;
      }
      .auth-btn:hover { background: var(--ink-2); }
      .auth-error {
        font-family: var(--mono); font-size: 0.72rem;
        color: var(--accent); margin-bottom: 10px; min-height: 18px;
      }
      .auth-divider {
        border: none; border-top: 1px solid var(--paper-3);
        margin: 20px 0;
      }
      .auth-existing-label {
        font-family: var(--mono); font-size: 0.68rem; font-weight: 300;
        color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em;
        margin-bottom: 8px; display: block;
      }
      .auth-user-list {
        display: flex; flex-wrap: wrap; gap: 6px;
      }
      .auth-user-chip {
        padding: 5px 14px;
        font-family: var(--sans); font-size: 0.82rem; font-weight: 400;
        border: 1.5px solid var(--paper-3); border-radius: 20px;
        background: var(--paper); color: var(--ink-2); cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
      }
      .auth-user-chip:hover {
        border-color: var(--ink); background: var(--ink); color: #fff;
      }

      /* Header user badge */
      .header-user {
        display: flex; align-items: center; gap: 8px;
      }
      .header-username {
        font-family: var(--mono); font-size: 0.72rem; font-weight: 300;
        color: #aaa; letter-spacing: 0.08em;
        max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .header-logout {
        padding: 4px 10px;
        font-family: var(--mono); font-size: 0.65rem; font-weight: 300;
        color: #888; text-transform: uppercase; letter-spacing: 0.1em;
        border: 1px solid #444; border-radius: 3px;
        background: transparent; cursor: pointer;
        transition: color 0.12s, border-color 0.12s;
      }
      .header-logout:hover { color: #fff; border-color: #888; }
    `;
    document.head.appendChild(s);
  }

  function showAuthUI() {
    injectStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    const users = getUsers();
    overlay.innerHTML = `
      <div class="auth-box">
        <div class="auth-logo">VIU <em>Advanced</em></div>
        <div class="auth-sub">请输入或选择用户名以继续</div>

        <label class="auth-label">新用户名</label>
        <input class="auth-input" id="authNameInput" type="text"
               placeholder="输入用户名…" maxlength="24" autocomplete="off" />
        <div class="auth-error" id="authError"></div>
        <button class="auth-btn" id="authEnterBtn">进入 →</button>

        ${users.length ? `
          <hr class="auth-divider"/>
          <span class="auth-existing-label">已有用户</span>
          <div class="auth-user-list" id="authUserList">
            ${users.map(u => `
              <button class="auth-user-chip" data-name="${escAttr(u)}">${escHtml(u)}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    const input = overlay.querySelector('#authNameInput');
    const errEl = overlay.querySelector('#authError');
    const btn   = overlay.querySelector('#authEnterBtn');

    btn.addEventListener('click', () => {
      const name = input.value.trim();
      const users = getUsers();
      if (users.includes(name)) {
        // existing user → just login
        login(name);
        hideAuthUI();
        mountUserBadge();
      } else {
        const err = register(name);
        if (err) { errEl.textContent = err; return; }
        hideAuthUI();
        mountUserBadge();
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') btn.click();
    });

    overlay.querySelectorAll('.auth-user-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        login(chip.dataset.name);
        hideAuthUI();
        mountUserBadge();
      });
    });

    input.focus();
  }

  function hideAuthUI() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.style.display = 'none';
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    return s.replace(/"/g, '&quot;');
  }

  function mountUserBadge() {
    const existing = document.getElementById('headerUserBadge');
    if (existing) existing.remove();

    const user = currentUser();
    if (!user) return;

    const nav = document.querySelector('.header-inner');
    if (!nav) return;

    const badge = document.createElement('div');
    badge.id = 'headerUserBadge';
    badge.className = 'header-user';
    badge.innerHTML = `
      <span class="header-username">${escHtml(user)}</span>
      <button class="header-logout" id="logoutBtn">切换</button>
    `;
    nav.appendChild(badge);
    document.getElementById('logoutBtn').addEventListener('click', logout);
  }

  /* ── Boot ────────────────────────────────────────────────────────────────── */

  function init() {
    injectStyles();
    if (!currentUser()) {
      showAuthUI();
    } else {
      // Already logged in — mount badge after DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountUserBadge);
      } else {
        mountUserBadge();
      }
    }
  }

  init();

  return { currentUser, logout };
})();
