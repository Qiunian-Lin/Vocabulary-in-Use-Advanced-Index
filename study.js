/**
 * study.js — 翻卡背词
 */
(function () {
  let deck = [], pos = 0, flipped = false;

  const flashcard    = document.getElementById('flashcard');
  const cardTermEl   = document.getElementById('cardTerm');
  const cardTermSm   = document.getElementById('cardTermSm');
  const cardPhonetic = document.getElementById('cardPhonetic');
  const cardPages    = document.getElementById('cardPages');
  const cardNote     = document.getElementById('cardNote');
  const cardEmpty    = document.getElementById('cardEmpty');
  const cardControls = document.getElementById('cardControls');
  const ctrlFlip     = document.getElementById('ctrlFlip');
  const ctrlKnown    = document.getElementById('ctrlKnown');
  const ctrlUnknown  = document.getElementById('ctrlUnknown');
  const btnReset     = document.getElementById('btnReset');
  const statRemaining = document.getElementById('statRemaining');
  const statKnown    = document.getElementById('statKnown');
  const statTotal    = document.getElementById('statTotal');
  const progressBar  = document.getElementById('progressBar');

  function buildDeck() {
    deck = vocabData.filter(e => !Store.isKnown(e.term));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    pos = 0;
  }

  function updateStats() {
    const s = Store.getStats();
    statRemaining.textContent = s.remaining;
    statKnown.textContent     = s.known;
    statTotal.textContent     = s.total;
    progressBar.style.width   = Math.round((s.known / s.total) * 100) + '%';
  }

  function showCard() {
    if (pos >= deck.length) {
      flashcard.style.display  = 'none';
      cardControls.style.display = 'none';
      cardEmpty.style.display  = '';
      return;
    }
    flashcard.style.display  = '';
    cardControls.style.display = '';
    cardEmpty.style.display  = 'none';

    const entry = deck[pos];
    flipped = false;
    flashcard.classList.remove('flipped');

    cardTermEl.textContent   = entry.term;
    cardTermSm.textContent   = entry.term;
    cardPhonetic.textContent = entry.phonetic || '';
    cardPhonetic.style.display = entry.phonetic ? '' : 'none';
    cardPages.textContent = entry.pages.length
      ? `Cambridge VIU Advanced · p.${entry.pages.join(', ')}` : '';
    const note = Store.getNote(entry.term);
    cardNote.textContent   = note || '';
    cardNote.style.display = note ? '' : 'none';

    updateStats();
  }

  function flip() {
    flipped = !flipped;
    flashcard.classList.toggle('flipped', flipped);
  }

  function markKnown() {
    if (pos >= deck.length) return;
    Store.markKnown(deck[pos].term);
    pos++; showCard(); updateStats();
  }

  function keepUnknown() {
    if (pos >= deck.length) return;
    pos++; showCard();
  }

  // ── Touch 处理：tap = 翻牌，左右滑 = 操作 ────────────────────────────────
  // 用 touchend 的 preventDefault 阻止后续合成 click，避免 flip 调用两次
  let txStart = 0, tyStart = 0;

  flashcard.addEventListener('touchstart', e => {
    txStart = e.changedTouches[0].clientX;
    tyStart = e.changedTouches[0].clientY;
  }, { passive: true });

  flashcard.addEventListener('touchend', e => {
    // 阻止合成 click，防止下面的 click 监听器再次调用 flip
    e.preventDefault();

    const dx = e.changedTouches[0].clientX - txStart;
    const dy = e.changedTouches[0].clientY - tyStart;
    const dist = Math.hypot(dx, dy);

    if (dist < 10) {
      // 点击（未移动）→ 翻牌
      flip();
    } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // 水平滑动 → 标记
      dx > 0 ? markKnown() : keepUnknown();
    }
    // 纵向滑动：页面滚动，不处理
  });

  // ── 桌面 click：只响应真实鼠标点击，不响应 touch 产生的合成 click ─────────
  flashcard.addEventListener('click', e => {
    // pointerType === 'touch' 时跳过（touch 已由 touchend 处理）
    if (e.pointerType === 'touch') return;
    flip();
  });

  // ── 底部按钮 ──────────────────────────────────────────────────────────────
  ctrlFlip.addEventListener('click',    () => flip());
  ctrlKnown.addEventListener('click',   () => markKnown());
  ctrlUnknown.addEventListener('click', () => keepUnknown());
  btnReset.addEventListener('click',    () => { buildDeck(); showCard(); updateStats(); });

  // ── 键盘 ──────────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight') markKnown();
    if (e.key === 'ArrowLeft')  keepUnknown();
  });

  // ── 同步后刷新 ────────────────────────────────────────────────────────────
  window.addEventListener('viu:synced', () => { buildDeck(); showCard(); updateStats(); });

  // Init
  buildDeck(); showCard(); updateStats();
})();
