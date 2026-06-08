/**
 * store.js — Persistent state via localStorage
 * Manages: known words, notes per entry
 */

const Store = (() => {
  // Keys are prefixed with the current username → each user has isolated data
  function knownKey() { return `viu_known:${Auth.currentUser()}`; }
  function notesKey() { return `viu_notes:${Auth.currentUser()}`; }

  function getKnown() {
    try {
      return new Set(JSON.parse(localStorage.getItem(knownKey()) || '[]'));
    } catch { return new Set(); }
  }

  function saveKnown(set) {
    localStorage.setItem(knownKey(), JSON.stringify([...set]));
    if (typeof Sync !== 'undefined') Sync.push();
  }

  function getNotes() {
    try {
      return JSON.parse(localStorage.getItem(notesKey()) || '{}');
    } catch { return {}; }
  }

  function saveNotes(obj) {
    localStorage.setItem(notesKey(), JSON.stringify(obj));
    if (typeof Sync !== 'undefined') Sync.push();
  }

  function markKnown(term) {
    const s = getKnown();
    s.add(term);
    saveKnown(s);
  }

  function markUnknown(term) {
    const s = getKnown();
    s.delete(term);
    saveKnown(s);
  }

  function isKnown(term) {
    return getKnown().has(term);
  }

  function setNote(term, text) {
    const notes = getNotes();
    if (text.trim()) {
      notes[term] = text.trim();
    } else {
      delete notes[term];
    }
    saveNotes(notes);
  }

  function getNote(term) {
    return getNotes()[term] || '';
  }

  function exportData() {
    return {
      known: [...getKnown()],
      notes: getNotes(),
      exported: new Date().toISOString()
    };
  }

  function importData(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Invalid data');
    if (Array.isArray(obj.known)) {
      saveKnown(new Set(obj.known));
    }
    if (obj.notes && typeof obj.notes === 'object') {
      saveNotes(obj.notes);
    }
  }

  function getStats() {
    const known = getKnown();
    const notes = getNotes();
    return {
      total: vocabData.length,
      known: known.size,
      remaining: vocabData.length - known.size,
      withNotes: Object.keys(notes).length
    };
  }

  return { getKnown, markKnown, markUnknown, isKnown, setNote, getNote, exportData, importData, getStats };
})();
