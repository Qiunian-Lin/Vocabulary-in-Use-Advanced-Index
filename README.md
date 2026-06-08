# VIU Advanced Index

> Cambridge *Vocabulary in Use Advanced* — 3,301 entries with phonetics, page references, study mode, and personal notes.

---

## File Structure

```
Vocabulary-in-Use-Advanced-Index/
├── index.html       ← Entry index: search, filter, alphabet nav, modal
├── study.html       ← Flashcard study mode
├── style.css        ← All styles (one file)
├── vocab_data.js    ← Raw entries + parser → exports `vocabData[]`
├── store.js         ← localStorage: known/unknown state + notes
├── app.js           ← Index page logic
├── study.js         ← Study page logic
└── README.md
```

---

## Features

### Index page (`index.html`)
- Full-text search across terms, phonetics, and your personal notes  
- Filter: All / Known / To Study / Has Notes  
- Alphabet A–Z jump nav  
- Click any entry to open the detail modal  
- In modal: mark as Known / move back to Study, add an English note, Export / Import JSON

### Study page (`study.html`)
- Shuffled flashcard deck of all **un-known** entries  
- Click or tap to flip; swipe right → Known, swipe left → Keep  
- Keyboard: Space/↑↓ = flip · → = Known · ← = Keep  
- Progress bar shows % of total vocabulary marked known  
- Notes you've written appear on the back of each card

### Notes
- Typed directly in the modal, saved to `localStorage`  
- Export as `.json` to back up or share across devices  
- Import to restore — merges into existing data

---

## Deploy to GitHub Pages

1. Push all files to the `main` branch of your repo  
2. Go to **Settings → Pages → Source: main / root**  
3. Site live at `https://<username>.github.io/<repo>/`

No build step. No dependencies. Pure HTML + CSS + JS.

---

## vocab_data.js — Entry Format

Each parsed entry becomes:
```js
{ term: "abhor", phonetic: "/əbˈhɔː/", pages: ["14"] }
{ term: "abject poverty", phonetic: "", pages: ["45"] }
```

The `RAW_ENTRIES` string follows the same format as the original PDF index:
```
word /phonetic/ page
phrase page1,page2
```

Paste your complete 3,301 lines into `RAW_ENTRIES`; the parser handles the rest.
