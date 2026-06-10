/**
 * store.js — 本地缓存 + 服务器同步
 * 写操作：先存 localStorage，再防抖推送到服务器
 * 读操作：直接读 localStorage（已在登录时从服务器拉取）
 */

const Store = (() => {
  function knownKey() { return `viu_known:${Auth.currentUser()}`; }
  function notesKey() { return `viu_notes:${Auth.currentUser()}`; }

  function getKnown() {
    try { return new Set(JSON.parse(localStorage.getItem(knownKey()) || '[]')); }
    catch { return new Set(); }
  }
  function getNotes() {
    try { return JSON.parse(localStorage.getItem(notesKey()) || '{}'); }
    catch { return {}; }
  }

  // ── 防抖推送 ─────────────────────────────────────────────────────────────
  let pushTimer = null;
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushToServer, 2000);
  }

  async function pushToServer() {
    try {
      const res = await Auth.apiCall('/api/data', 'POST', {
        known: [...getKnown()],
        notes: getNotes(),
      });
      if (!res.ok) console.warn('[Store] push failed:', res.error);
    } catch (e) { console.warn('[Store] push error:', e); }
  }

  async function pullFromServer() {
    try {
      const res = await Auth.apiCall('/api/data', 'GET');
      if (!res.ok) return;
      const { known = [], notes = {} } = res.data;
      localStorage.setItem(knownKey(), JSON.stringify(known));
      localStorage.setItem(notesKey(), JSON.stringify(notes));
    } catch (e) { console.warn('[Store] pull error:', e); }
  }

  // ── 写操作（本地 + 触发推送）────────────────────────────────────────────
  function saveKnown(set) {
    localStorage.setItem(knownKey(), JSON.stringify([...set]));
    schedulePush();
  }
  function saveNotes(obj) {
    localStorage.setItem(notesKey(), JSON.stringify(obj));
    schedulePush();
  }

  // ── 公开接口（与原来完全相同）───────────────────────────────────────────
  function markKnown(term)   { const s = getKnown(); s.add(term);    saveKnown(s); }
  function markUnknown(term) { const s = getKnown(); s.delete(term); saveKnown(s); }
  function isKnown(term)     { return getKnown().has(term); }

  function setNote(term, text) {
    const notes = getNotes();
    if (text.trim()) notes[term] = text.trim();
    else delete notes[term];
    saveNotes(notes);
  }
  function getNote(term) { return getNotes()[term] || ''; }

  function exportData() {
    return { known: [...getKnown()], notes: getNotes(), exported: new Date().toISOString() };
  }
  function importData(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Invalid data');
    if (Array.isArray(obj.known))                    saveKnown(new Set(obj.known));
    if (obj.notes && typeof obj.notes === 'object')  saveNotes(obj.notes);
  }

  function getStats() {
    const known = getKnown(), notes = getNotes();
    return {
      total: vocabData.length,
      known: known.size,
      remaining: vocabData.length - known.size,
      withNotes: Object.keys(notes).length,
    };
  }

  return {
    getKnown, markKnown, markUnknown, isKnown,
    setNote, getNote,
    exportData, importData, getStats,
    pushToServer, pullFromServer,
  };
})();
