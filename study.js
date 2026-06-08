/**
 * study.js — Flashcard study mode
 * Shows only entries not yet marked as known.
 * Flip to reveal phonetic + page. Mark known / keep.
 */

(function () {
  let deck = [];
  let pos = 0;
  let flipped = false;

  const flashcard   = document.getElementById('flashcard');
  const cardFront   = document.getElementById('cardFront');
  const cardBack    = document.getElementById('cardBack');
  const cardTerm    = document.getElementById('cardTerm');
  const cardTermSm  = document.getElementById('cardTermSm');
  const cardPhonetic= document.getElementById('cardPhonetic');
  const cardPages   = document.getElementById('cardPages');
  const cardNote    = document.getElementById('cardNote');
  const cardArea    = document.getElementById('cardArea');
  const cardEmpty   = document.getElementById('cardEmpty');
  const cardControls= document.getElementById('cardControls');
  const ctrlFlip    = document.getElementById('ctrlFlip');
  const ctrlKnown   = document.getElementById('ctrlKnown');
  const ctrlUnknown = document.getElementById('ctrlUnknown');
  const btnReset    = document.getElementById('btnReset');
  const statRemaining = document.getElementById('statRemaining');
  const statKnown   = document.getElementById('statKnown');
  const statTotal   = document.getElementById('statTotal');
  const progressBar = document.getElementById('progressBar');

  function buildDeck() {
    deck = vocabData.filter(e => !Store.isKnown(e.term));
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    pos = 0;
  }

  function updateStats() {
    const stats = Store.getStats();
    statRemaining.textContent = stats.remaining;
    statKnown.textContent = stats.known;
    statTotal.textContent = stats.total;
    const pct = Math.round((stats.known / stats.total) * 100);
    progressBar.style.width = pct + '%';
  }

  function showCard() {
    if (pos >= deck.length) {
      // Done
      flashcard.style.display = 'none';
      cardControls.style.display = 'none';
      cardEmpty.style.display = '';
      return;
    }

    flashcard.style.display = '';
    cardControls.style.display = '';
    cardEmpty.style.display = 'none';

    const entry = deck[pos];
    flipped = false;
    flashcard.classList.remove('flipped');

    cardTerm.textContent = entry.term;
    cardTermSm.textContent = entry.term;
    cardPhonetic.textContent = entry.phonetic || '';
    cardPhonetic.style.display = entry.phonetic ? '' : 'none';
    cardPages.textContent = entry.pages.length ? `Cambridge VIU Advanced · p.${entry.pages.join(', ')}` : '';
    const note = Store.getNote(entry.term);
    cardNote.textContent = note || '';
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
    pos++;
    showCard();
    updateStats();
  }

  function keepUnknown() {
    if (pos >= deck.length) return;
    pos++;
    showCard();
  }

  // Touch swipe support
  let touchStartX = 0;
  flashcard.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  flashcard.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(dx) < 40) {
      flip();
    } else if (dx > 80) {
      markKnown();
    } else if (dx < -80) {
      keepUnknown();
    }
  });

  flashcard.addEventListener('click', flip);
  ctrlFlip.addEventListener('click', flip);
  ctrlKnown.addEventListener('click', markKnown);
  ctrlUnknown.addEventListener('click', keepUnknown);

  btnReset.addEventListener('click', () => {
    buildDeck();
    showCard();
    updateStats();
  });

  document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); flip();
    }
    if (e.key === 'ArrowRight') markKnown();
    if (e.key === 'ArrowLeft') keepUnknown();
  });

  // Init
  buildDeck();
  showCard();
  updateStats();
})();
