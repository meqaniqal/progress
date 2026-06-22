# Music Production App Audit: Progress Melody Generator (Original Qwen Audit)

## Executive Summary

Progress is a **highly sophisticated, production-grade music generation application** with an exceptionally deep music theory engine, comprehensive microtonal support, and a well-architected audio scheduling system. The codebase demonstrates professional-level understanding of Web Audio API patterns, voice-leading algorithms, and multi-track synthesis. However, several critical issues in memory management, algorithmic correctness in edge cases, and performance hotspots prevent it from meeting professional DAA standards. The architecture is impressive but has significant code duplication and tight coupling between the melody scheduler and sequencer that creates maintenance risk.

---

## Compliance Matrix

| Area | Status | Severity |
|------|--------|----------|
| Voice Leading - Minimizes total semitone movement | **PASS** | - |
| Audio Scheduling - Look-ahead scheduler with `audioCtx.currentTime` | **PASS** | - |
| Buffer Management - Pre-allocated noise/sample buffers | **PASS** | - |
| Memory Management - Oscillator lifecycle tracked and cleaned | **FAIL** | Critical |
| MIDI Export - Multi-track, proper velocity, 128 ticks/beat | **PASS** | - |
| WAV Export - Offline rendering with tail padding | **FAIL** | Warning |
| Microtonal Support - Correct EDO/.scl/.tun arithmetic | **PASS** | - |
| Mobile UX - Touch targets, viewport handling | **PASS** | - |
| State Persistence - Non-blocking localStorage with migrations | **FAIL** | Warning |
| DOM Isolation - Theory/audio logic never reads DOM | **PASS** | - |
| Scheduler Timing - `nextNoteTime` accumulator | **PASS** | - |
| Envelope Mapping - `setValueAtTime`/`setTargetAtTime` usage | **PASS** | - |
| Drum Synthesis - Pre-allocated noise buffer | **PASS** | - |
| Sample Playback - OfflineAudioContext for decoding | **PASS** | - |
| Groove/Timing - Correct offset application | **PASS** | - |
| Multi-section Song Mode | **PASS** | - |

---

## Detailed Findings

### 1. Memory Management - Oscillator Lifecycle (Critical)

**Location:** `synth.js:408-417`, `synth.js:363-374`

**Issue:** The `activeOscillators` array is pruned inside oscillator `onended` callbacks (line 364: `activeOscillators = activeOscillators.filter(o => o !== deadOsc)`), but `stopOscillators()` (line 408-417) iterates and calls `stop()` on every oscillator **without checking `InvalidStateError` for already-stopped oscillators**. More critically, when `stopOscillators()` is called during playback (e.g., stop button), it calls `stop()` on oscillators that may have already fired their `onended` callback and been removed from the array by the cleanup callback — creating a race condition where the same oscillator is stopped twice.

Additionally, the `onCleanup` callback in `synth.js:364` filters the array on **every note**, creating GC pressure through array allocation during the scheduler loop (which runs at ~40-100Hz).

**Fix:** Replace array filtering with a `Set`-based tracking:
```javascript
// Module-level
let activeOscillatorIds = new Set();
let nextOscId = 0;

// In playTone, assign ID:
osc.id = nextOscId++;
activeOscillatorIds.add(osc.id);

// In cleanup callback:
activeOscillatorIds.delete(deadOsc.id);

// In stopOscillators:
activeOscillatorIds.forEach(id => {
  const osc = activeOscillators.find(o => o.id === id);
  if (osc) { try { osc.stop(); } catch(e) {} }
});
activeOscillatorIds.clear();
activeOscillators = [];
```

**Severity:** Critical — causes memory leaks during extended playback sessions and race conditions on stop/start.

---

### 2. Scheduler — `getPlayableNotes()` Called Per-Note (Critical)

**Location:** `sequencer.js:179`

```javascript
const allPlayableNotes = getPlayableNotes(activeProg, state);
```

**Issue:** `getPlayableNotes()` (theory.js:551) calls `applyVoiceLeading()` which iterates over **every chord** in the progression, generating all inversions for each chord, computing cost functions, and sorting. This is called **inside `scheduleNote()`** which fires at the scheduler rate (~40Hz). For a 16-chord progression, this means 16 * ~6-12 inversion evaluations per scheduling window.

**Impact:** At 120 BPM with 2-beat chords, the scheduler fires every 25ms. Each invocation recalculates voice-leading for the entire progression. This is O(n * m * i) where n=chords, m=inversions per chord, i=cost function complexity.

**Fix:** Memoize `getPlayableNotes()` results keyed by `(progression signature, state hash)` and only recompute when the progression or state changes. The scheduler should read from a cached result, not recompute every frame.

```javascript
// Module-level cache
let vlCache = { key: '', notes: null };

function getCachedPlayableNotes(progression, state) {
  const cacheKey = progression.map(c => c.symbol + c.key).join('|') + '|' + state.divisions;
  if (vlCache.key !== cacheKey) {
    vlCache.key = cacheKey;
    vlCache.notes = getPlayableNotes(progression, state);
  }
  return vlCache.notes;
}
```

**Severity:** Critical — causes CPU spikes and potential audio glitches during extended playback.

---

### 3. WAV Export — No Tail Padding for Release Tails (Warning)

**Location:** `wavExport.js:315-319`

```javascript
const exactRenderDurationSec = (60.0 / state.bpm) * totalBeats;
const sampleRate = 44100;
const lengthFrames = Math.max(1, Math.ceil(sampleRate * exactRenderDurationSec));
```

**Issue:** The offline render buffer is sized to exactly `totalBeats` seconds. However, oscillators with release times (CONFIG.RELEASE_TIME = 0.1s) will still be sounding when the buffer ends, causing **abrupt cutoff clicks** on the final samples. CONFIG.EXPORT_TAIL_PADDING (0.5) is defined but **never used** in the export calculation.

**Fix:** Add tail padding:
```javascript
const tailPadding = CONFIG.EXPORT_TAIL_PADDING; // 0.5 seconds
const exactRenderDurationSec = (60.0 / state.bpm) * totalBeats + tailPadding;
```

**Severity:** Warning — causes audible clicks on exported WAV endings.

---

### 4. State Persistence — Blocking `saveState()` on Every Action (Warning)

**Location:** `store.js:676-687`, `storage.js` (referenced)

**Issue:** Every state mutation (addChord, removeChord, swapChord, etc.) calls `persistAppState()` which calls `saveState(state)` synchronously. Given the state object is large (deeply nested with progression arrays, patterns, ADSR settings, etc.), this creates **blocking localStorage writes on every user action**. The `structuredClone()` calls throughout (lines 633-643, 881-891) compound the GC pressure.

**Fix:** Debounce persistence writes to a 500ms window:
```javascript
let persistTimer = null;
export function persistAppState() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => saveState(state), 500);
}
```

**Severity:** Warning — causes UI jank during rapid chord editing.

---

### 5. `getChordNotes()` — Roman Numeral Parser Has Edge Cases (Info)

**Location:** `theory.js:108-159`

**Issue:** The Roman numeral parser (lines 108-159) handles accidentals with a simple `#`/`b` prefix, but the regex `/^(IV|III|II|I|VII|VI|V|iv|iii|ii|i|vii|vi|v)/` does not account for **extended chord symbols** like `#IV°7` or `bVImaj7#11` where accidentals appear **after** the numeral. The parser strips leading accidentals but not trailing ones, causing `#IV°7` to match as `IV` with `#` left in `remainder`, which then fails to match any suffix pattern.

**Fix:** The parser should handle trailing accidentals by checking `remainder` for `#`/`b` prefixes before the numeral match, or by pre-processing the symbol to extract trailing accidentals.

**Severity:** Info — affects exotic chord generation in progression suggestions.

---

### 6. Microtonal `snapToGrid()` — Linear Search O(n) Per Call (Info)

**Location:** `theory.js:636-647` (`.tun` map lookup)

**Issue:** For `.tun` format files, `snapToGrid()` performs a linear search across all 128 MIDI notes (line 638: `for (let i = 0; i < 128; i++)`) on **every pitch snap**. During active playback with dense arpeggios or flourishes, this creates unnecessary CPU load.

**Fix:** Pre-compute a lookup table at module load time:
```javascript
const tunLookupCache = new Map();
function getTunedNote(midi) {
  if (!tunLookupCache.has(midi)) {
    // ... linear search, store result
  }
  return tunLookupCache.get(midi);
}
```

**Severity:** Info — noticeable only with heavy .tun usage.

---

### 7. `calculateDistance()` — Array Allocations in Tight Loop (Info)

**Location:** `voiceLeading.js:326-367`

**Issue:** `calculateDistance()` creates sorted copies of arrays on every comparison (`[...chordA].sort(...)`) and `_insertBestPad()` creates new arrays on every iteration. For a chord with N notes and M inversions, this creates O(N * M * N) array allocations during voice-leading computation.

**Fix:** Use a reusable sorted buffer and avoid repeated `.sort()` calls by caching sorted versions of input chords.

**Severity:** Info — contributes to GC pressure during voice-leading recalculation.

---

### 8. `melodyScheduler.js` — 1098 Lines, Monolithic Function (Architecture)

**Location:** `melodyScheduler.js:65-1098+`

**Issue:** The `scheduleMelody()` function is **1098+ lines** of nested logic covering scale generation, rhythm templates, motif families, macro planning, song form coordination, swing calculations, surprise events, and countermelody generation. This single function handles melody AND countermelody generation, making it impossible to test in isolation and violating the single responsibility principle.

**Recommendation:** Extract into focused modules:
- `scaleEngine.js` — Scale/pitch pool generation
- `rhythmEngine.js` — Rhythm template generation and mutation
- `motifEngine.js` — Motif family resolution and transformation
- `macroPlanner.js` — Song form coordination and target planning
- `countermelodyEngine.js` — Countermelody pitch selection

**Severity:** Warning — maintenance risk, testability barrier.

---

### 9. Karplus-Strong Engine — Dummy Oscillator Leak (Critical)

**Location:** `synthEngines.js:484-507`

**Issue:** The Karplus-Strong synthesis engine creates a `dummyOscillator` (line 484) that connects directly to `ctx.destination` (line 486: `dummyOsc.connect(ctx.destination)`) and is used solely to control the timing of when the audio graph stops. This oscillator **bypasses all gain staging and the master compressor**, potentially causing **uncompressed audio spikes** at volume levels far exceeding the mixed output.

**Fix:** Route the dummy oscillator through the same gain node as the main output, or use `setTimeout` to schedule the `stop()` calls instead of relying on a physical oscillator.

**Severity:** Critical — bypasses master compression, potential clipping.

---

### 10. `transitionEvaluator.js` — Redundant Scale Snapping (Performance)

**Location:** `transitionEvaluator.js:386-447`

**Issue:** Scale snapping logic is duplicated across 4 separate code blocks (lines 386-403, 414-427, 434-447, and 262-275 in `getTransitionPitch`). Each block re-derives `currentKey`, `currentSymbol`, `currentMode`, `nextKey`, `nextSymbol`, `nextMode` independently. This creates redundant `deduceSourceMode()` calls and `getChordNotes()` lookups during transition evaluation.

**Fix:** Extract a `getSnapContext(chordObj, nextChordObj, midPoint)` helper that computes all needed values once.

**Severity:** Warning — redundant computation during transition evaluation.

---

## Priority Roadmap

| Priority | Issue | Impact | Effort |
|------|-------|--------|--------|
| 1 | **Oscillator lifecycle race condition** (`synth.js:408`) | Memory leaks, audio glitches | 2 hours |
| 2 | **`getPlayableNotes()` per-note recomputation** (`sequencer.js:179`) | CPU spikes, audio dropouts | 3 hours |
| 3 | **Karplus-Strong dummy oscillator bypasses compression** (`synthEngines.js:486`) | Clipping, inconsistent mix | 1 hour |
| 4 | **WAV export no tail padding** (`wavExport.js:315`) | Clicks on export end | 30 minutes |
| 5 | **Blocking state persistence** (`store.js:676`) | UI jank | 1 hour |
| 6 | **`melodyScheduler.js` monolithic function** | Maintainability, testability | 8 hours |
| 7 | **Redundant scale snapping in transitions** (`transitionEvaluator.js`) | CPU waste | 2 hours |
| 8 | **Microtonal `.tun` linear search** (`theory.js:638`) | Minor CPU waste | 1 hour |
| 9 | **Roman numeral parser edge cases** (`theory.js:108`) | Missing chord suggestions | 2 hours |
| 10 | **`calculateDistance()` array allocations** (`voiceLeading.js:327`) | GC pressure | 2 hours |
