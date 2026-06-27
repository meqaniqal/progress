# Critical Regressions & Fixes for All 3 Melody Engines

## The Problem

Gemini introduced a `baseRegister` bug that causes off-key notes in mgen's PassA and PassB. The benchmark test computes off-key note counts per chord slot but **does not penalize them in the `scoreNotes()` scoring function** (which only scores pitch diversity, leap compensation, and motivic coherence).

---

## Fix 1: `_getChordTones()` in PassA and PassB — `baseRegister` causes wrong octaves

**Root cause:** When `chord.notes` exists (e.g., `[60, 64, 67]` for C major), the code extracts pitch classes `[0, 4, 7]` and adds `this.baseRegister` (default 60) to each. This works when the chord's root IS 60, but fails for any other chord because the pitch classes are anchored to C4 instead of the chord's actual root position.

Example: G major chord with `notes: [67, 71, 74]` (G4, B4, D5) has pitch classes `[7, 11, 2]`. With `baseRegister = 60`, this produces `[67, 71, 62]` — which is **G4, B4, D4** instead of **G4, B4, D5**. The pitch classes are correct but the D is transposed down an octave. For chords whose notes span multiple octaves, this produces wrong-octave notes that break melodic voice leading.

**File:** `mgen/src/passes/passA_structural.js`, lines 173-181
**Replace lines 173-181 with:**

```javascript
  _getChordTones(chord) {
    // If chord has explicit notes, use them as absolute MIDI pitches (no baseRegister adjustment)
    if (chord.notes && chord.notes.length > 0) {
      return [...chord.notes];
    }
    // Fallback: derive from chord symbol using baseRegister
    const rootMidi = this._noteNameToMidi(chord.root);
    const intervals = this._getChordIntervals(chord.quality);
    return intervals.map((interval) => rootMidi + interval);
  }
```

**File:** `mgen/src/passes/passB_cadence.js`, lines 172-180
**Replace lines 172-180 with:**

```javascript
  _getChordTones(chord) {
    // If chord has explicit notes, use them as absolute MIDI pitches (no baseRegister adjustment)
    if (chord.notes && chord.notes.length > 0) {
      return [...chord.notes];
    }
    const rootMidi = this._noteNameToMidi(chord.root);
    const intervals = this._getChordIntervals(chord.quality);
    return intervals.map((interval) => rootMidi + interval);
  }
```

---

## Fix 2: Remove `baseRegister` from `progressBridge.js` options

**File:** `mgen/src/progressBridge.js`, line 230
**Change line 230 from:**

```javascript
    baseRegister: state.baseKey,
```

**To:**

```javascript
    baseRegister: undefined,
```

This prevents the global base key from being passed to passes that should derive register from each chord's actual notes. Note: `passA_structural.js:27` uses `options.baseRegister || 60` — passing `undefined` (not `null`) allows the fallback to 60 while not forcing a specific register onto chords that provide their own `notes` array.

---

## Fix 3: Add harmonic correctness check to `benchmark.test.js`

**File:** `benchmark.test.js` (create if not exists, or add to existing)

Add this function and integrate it into the scoring:

```javascript
// Check if structural/cadence notes land on the active chord's notes
function checkHarmonicCorrectness(notes, chords) {
  if (!notes || !chords || notes.length === 0) return { score: 0, issues: ['no-data'] };
  let correctCount = 0;
  let totalStructural = 0;

  notes.forEach(note => {
    if (note.role !== 'structural' && note.role !== 'cadence') return;
    totalStructural++;
    // Find active chord at note.startTime
    let activeChord = chords[0];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const nextC = chords[i + 1];
      const chordDuration = c.duration || 2;
      const nextStart = nextC ? nextC.beatStart : c.beatStart + chordDuration;
      if (note.startTime >= c.beatStart && note.startTime < nextStart) {
        activeChord = c;
        break;
      }
    }
    // Check if note pitch matches any of the active chord's notes
    if (activeChord.notes && activeChord.notes.length > 0) {
      const isChordTone = activeChord.notes.some(n => Math.abs(n - note.pitch) < 0.5);
      if (isChordTone) correctCount++;
    }
  });

  if (totalStructural === 0) return { score: 1.0, issues: [] };
  const ratio = correctCount / totalStructural;
  const issues = ratio < 0.5 ? ['low-harmonic-correctness'] : [];
  return { score: ratio, issues, correctCount, totalStructural };
}
```

Integrate into `scoreNotes()` by adding:

```javascript
  // 5. Harmonic correctness (structural/cadence notes should be chord tones)
  const harmonic = checkHarmonicCorrectness(notes, config?.chords || []);
  if (harmonic.score < 0.5) { issues.push(...harmonic.issues); score -= 0.3; }
```

And pass `chords` from the benchmark into `scoreNotes()`.

---

## Fix 4: Add local chord-scale selection to mgen (highest impact)

**Gap:** Progress has "dynamic scale center" (local chord-scale selection). mgen has none. This is the single most important missing feature.

**What it does:** For each chord, determine its scale mode based on quality (Dorian for minor7, Mixolydian for dominant, etc.) using `getLocalScaleMode()` from `melodyTuning.js` (line 364), then build a local scale for each chord.

**Where to implement:** As a new pass (e.g., `PassF_localScale.js`) or as an enhancement to PassA/PassC.

**Key reference:** `melodyTuning.js` line 364-381 defines `getLocalScaleMode()` which maps chord quality to scale mode. The Progress engine uses this to build a local scale per chord. mgen should do the same.

**Implementation approach:**
1. For each chord in the progression, call `getLocalScaleMode(chord.quality, genre)` to get the scale mode
2. Build a local scale for each chord using the scale intervals for that mode
3. When selecting connector/ornament notes (PassC/PassD), use the local scale of the active chord instead of a global scale
4. Consider overlap: if two adjacent chords share scale degrees, prefer notes that work in both

This brings mgen to parity with Progress's "dynamic scale center" feature, which is listed as a Progress advantage in the comparison document.

---

## Verification

After implementing all 4 fixes:

1. Run `npx jest benchmark.test.js` — harmonic correctness score should be high (structural/cadence notes on chord tones)
2. Run `npx jest` (all tests) — all 45+ tests should still pass
3. Listen test — melodies should sound in-key for the underlying chords

---

## Summary: What Gemini Should Do

| # | Fix | Files | Lines | Risk |
|---|-----|-------|-------|------|
| 1 | Fix `_getChordTones()` in PassA | `mgen/src/passes/passA_structural.js` | 173-181 | Low — direct replacement |
| 2 | Fix `_getChordTones()` in PassB | `mgen/src/passes/passB_cadence.js` | 172-180 | Low — direct replacement |
| 3 | Remove `baseRegister` from options | `mgen/src/progressBridge.js` | 230 | Low — single line change |
| 4 | Add harmonic correctness to benchmark | `benchmark.test.js` | ~30 lines | Low — pure function |
| 5 | Add local chord-scale selection | New pass or PassA/PassC enhancement | ~100-150 lines | Medium — new feature |

Total: ~200 lines of changes. Fixes the off-key notes bug, adds missing harmonic correctness to the benchmark, and adds the missing local chord-scale feature that Progress already has.
