/**
 * app.js — Index page: search, filter, alphabet nav, entry modal
 */

(function () {
  // ── State ────────────────────────────────────────────────────────────────
  let query = '';
  let filter = 'all';
  let currentEntry = null;
  let currentIndex = -1;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const searchInput  = document.getElementById('searchInput');
  const vocabList    = document.getElementById('vocabList');
  const resultCount  = document.getElementById('resultCount');
  const alphaNav     = document.getElementById('alphaNav');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose   = document.getElementById('modalClose');
  const modalTerm    = document.getElementById('modalTerm');
  const modalPhonetic= document.getElementById('modalPhonetic');
  const modalPages   = document.getElementById('modalPages');
  const modalStatus  = document.getElementById('modalStatus');
  const noteInput    = document.getElementById('noteInput');
  const btnKnown     = document.getElementById('btnKnown');
  const btnUnknown   = document.getElementById('btnUnknown');
  const btnSave      = document.getElementById('btnSave');
  const btnExport    = document.getElementById('btnExport');
  const importFile   = document.getElementById('importFile');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function normalise(str) {
    return str.toLowerCase().replace(/[\/\[\]ˌˈ]/g, '');
  }

  function getFiltered() {
    const known = Store.getKnown();
    const notes = Store.exportData().notes;
    const q = normalise(query);

    return vocabData.filter(entry => {
      const matchQ = !q ||
        normalise(entry.term).includes(q) ||
        normalise(entry.phonetic).includes(q) ||
        (notes[entry.term] && normalise(notes[entry.term]).includes(q));

      let matchF = true;
      if (filter === 'known')   matchF = known.has(entry.term);
      if (filter === 'unknown') matchF = !known.has(entry.term);
      if (filter === 'notes')   matchF = !!notes[entry.term];

      return matchQ && matchF;
    });
  }

  // ── Alphabet nav ─────────────────────────────────────────────────────────
  function buildAlphaNav() {
    const letters = new Set(vocabData.map(e => {
      const c = e.term.replace(/^[-]/, '')[0]?.toUpperCase();
      return /[A-Z]/.test(c) ? c : '#';
    }));
    const sorted = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(l => letters.has(l));
    sorted.forEach(l => {
      const btn = document.createElement('button');
      btn.className = 'alpha-btn';
      btn.textContent = l;
      btn.addEventListener('click', () => {
        const el = document.querySelector(`.alpha-anchor[data-letter="${l}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      alphaNav.appendChild(btn);
    });
  }

  // ── Render list ───────────────────────────────────────────────────────────
  function render() {
    const filtered = getFiltered();
    resultCount.textContent = `${filtered.length} / ${vocabData.length}`;

    vocabList.innerHTML = '';

    let lastLetter = null;

    filtered.forEach((entry, i) => {
      const letter = (() => {
        const c = entry.term.replace(/^[-]/, '')[0]?.toUpperCase();
        return /[A-Z]/.test(c) ? c : '#';
      })();

      if (letter !== lastLetter && !query) {
        const anchor = document.createElement('div');
        anchor.className = 'alpha-anchor';
        anchor.dataset.letter = letter;
        anchor.textContent = letter;
        vocabList.appendChild(anchor);
        lastLetter = letter;
      }

      const isKnown = Store.isKnown(entry.term);
      const note = Store.getNote(entry.term);
      const row = document.createElement('div');
      row.className = 'entry-row' + (isKnown ? ' is-known' : '');
      row.dataset.term = entry.term;

      row.innerHTML = `
        <div class="entry-term">${highlight(entry.term, query)}</div>
        <div class="entry-meta">
          ${entry.phonetic ? `<span class="entry-phonetic">${entry.phonetic}</span>` : ''}
          ${entry.pages.length ? `<span class="entry-pages">p.${entry.pages.join(', ')}</span>` : ''}
          ${note ? '<span class="entry-has-note" title="Has note">✎</span>' : ''}
          ${isKnown ? '<span class="entry-known-badge">✓</span>' : ''}
        </div>
      `;

      row.addEventListener('click', () => openModal(entry));
      vocabList.appendChild(row);
    });

    if (filtered.length === 0) {
      vocabList.innerHTML = '<div class="empty-state">No entries match.</div>';
    }
  }

  function highlight(text, q) {
    if (!q) return escHtml(text);
    const re = new RegExp(`(${escRe(q)})`, 'gi');
    return escHtml(text).replace(re, '<mark>$1</mark>');
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(entry) {
    currentEntry = entry;
    modalTerm.textContent = entry.term;
    modalPhonetic.textContent = entry.phonetic || '';
    modalPhonetic.style.display = entry.phonetic ? '' : 'none';
    modalPages.textContent = entry.pages.length ? `Cambridge VIU Advanced — p.${entry.pages.join(', ')}` : '';
    noteInput.value = Store.getNote(entry.term);
    updateModalStatus();
    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    currentEntry = null;
  }

  function updateModalStatus() {
    if (!currentEntry) return;
    const known = Store.isKnown(currentEntry.term);
    modalStatus.textContent = known ? '✓ Known' : '↺ To Study';
    modalStatus.className = 'modal-status ' + (known ? 'status-known' : 'status-unknown');
    btnKnown.style.display = known ? 'none' : '';
    btnUnknown.style.display = known ? '' : 'none';
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  searchInput.addEventListener('input', e => {
    query = e.target.value.trim();
    render();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filter = btn.dataset.filter;
      render();
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });

  btnKnown.addEventListener('click', () => {
    if (!currentEntry) return;
    Store.markKnown(currentEntry.term);
    updateModalStatus();
    render();
  });

  btnUnknown.addEventListener('click', () => {
    if (!currentEntry) return;
    Store.markUnknown(currentEntry.term);
    updateModalStatus();
    render();
  });

  btnSave.addEventListener('click', () => {
    if (!currentEntry) return;
    Store.setNote(currentEntry.term, noteInput.value);
    btnSave.textContent = 'Saved ✓';
    setTimeout(() => { btnSave.textContent = 'Save Note'; }, 1200);
    render();
  });

  btnExport.addEventListener('click', () => {
    const data = JSON.stringify(Store.exportData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viu-notes-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importFile.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Store.importData(JSON.parse(ev.target.result));
        render();
        alert('Imported successfully.');
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  buildAlphaNav();
  render();
})();
