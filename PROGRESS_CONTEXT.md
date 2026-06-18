# PROGRESS APP CONTEXT

## ROLE & TECH

ROLE: Senior Audio / Frontend Engineer

TECH:

* Vanilla JavaScript (ES6 Strict)
* MidiWriterJS
* Web Audio API
* Static Hosting (GitHub Pages / Cloudflare Pages)
* Jest

---

## ARCHITECTURE & STATE

### State Management

* SSOT via pure JS `AppState`.
* UI reads state only.
* State changes occur through dispatched intents.
* Never read state from DOM during performance-critical operations.

### UI

* Pure rendering layer.
* No music theory or mathematical logic inside UI components.

### Audio & MIDI

* Chords: Track 1
* Bass: Track 2 (roots -2 octaves)
* Route all audio through Master Bus/Compressor.
* Prevent digital clipping.

### Music Theory

* Roman Numeral → MIDI Pitch Array (`[60,64,67]`)
* Voice-leading and theory functions remain pure.

### Constants

* No magic numbers.
* All configuration belongs in top-level `CONFIG`.

### Mobile Drag & Drop

* Never use `e.dataTransfer.getData()`.
* Use module-scoped drag state variables.

### Styling

* Keep non-critical CSS out of `index.html`.
* Only FOUC-prevention CSS may be inline.

### Persistence

* State initialization, migrations, and storage sanitization belong in `storePersistence.js`.

### Suggestions & Analysis

* Suggestions: `progressionSuggestions.js`
* Analysis: `chordAnalyzer.js`

### Responsive Design

* Explicitly support viewports below 450px.
* Use compact controls and mobile-first alternatives.

---

## CURRENT STATE & ROADMAP

### Active Work

* Current sprint goals and immediate priorities live in `CURRENT_FOCUS.md`.

### Long-Term Vision

* Historical milestones, future features, and theory pillars live in `PROGRESS_VISION.md`.

---

## PROJECT SHORTHANDS

### fix_diff

Fix the diff, then generate a fresh session prompt.

### move_protocol

Relocate code using:

1. Delete diff
2. Insert diff

Never combine relocation operations into a single diff.

### land_the_plane

1. Remove temporary logs
2. Update vision/history documents
3. Refactor cleanup
4. Write commit message
