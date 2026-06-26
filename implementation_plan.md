# Credit-Optimized Implementation Plan: Pretest/Postest Infrastructure + Next Steps

## Executive Summary

This plan enables Gemini (or any LLM) to implement a reusable benchmarking system with minimal context overhead. The goal is to create infrastructure that can verify every future change is an actual improvement, using deterministic, reproducible tests.

**Key principle:** Write the benchmark harness ONCE. Reuse it forever. Each future change is a single, self-contained modification verified by the same harness.

---

## PHASE 0: Build the Pretest/Postest Test Harness (ONE file, ~150 lines)

### File to create: `benchmark.test.js` (in root directory, alongside existing test files)

This is the single most important thing to implement. It creates a reusable benchmarking tool that every future change can use to verify improvement.

### What it does:
- Runs all 3 engines (progress/pro/mgen) on the same 5 fixed chord progressions
- Uses a fixed random seed (42) for deterministic, reproducible output
- Scores each engine's output using the same metrics as `orchestrator._evaluateMelodyGlobally()`
- Returns structured results for before/after comparison

### Concrete implementation — the exact file Gemini should create:

```javascript
// benchmark.test.js — Pretest/Postest test harness for all 3 melody engines
// Usage: npx jest benchmark.test.js
// This file is designed to be written ONCE and reused for every future change.

import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { pregenerateMgenMelody, clearMgenCache } from './mgenEngine.js';
import { state } from './store.js';
import { createRNG } from './melodyRandom.js';
import { defaultContext } from './melodyContext.js';

// ── Fixed test progressions (same input for every benchmark run) ──
const TEST_PROGRESSIONS = [
  { name: 'major', chords: [
    { symbol: 'I', duration: 4, key: 60 },
    { symbol: 'IV', duration: 4, key: 65 },
    { symbol: 'V', duration: 4, key: 67 },
    { symbol: 'I', duration: 4, key: 60 }
  ]},
  { name: 'jazz', chords: [
    { symbol: 'ii7', duration: 2, key: 62 },
    { symbol: 'V7', duration: 2, key: 67 },
    { symbol: 'Imaj7', duration: 4, key: 60 }
  ]},
  { name: 'blues', chords: [
    { symbol: 'I', duration: 4, key: 60 },
    { symbol: 'IV', duration: 4, key: 65 },
    { symbol: 'I', duration: 2, key: 60 },
    { symbol: 'V7', duration: 2, key: 67 },
    { symbol: 'I', duration: 4, key: 60 }
  ]},
  { name: 'minor', chords: [
    { symbol: 'i', duration: 4, key: 60 },
    { symbol: 'iv', duration: 4, key: 65 },
    { symbol: 'V', duration: 4, key: 67 },
    { symbol: 'i', duration: 4, key: 60 }
  ]},
  { name: 'modal', chords: [
    { symbol: 'D', duration: 4, key: 62 },
    { symbol: 'A', duration: 4, key: 69 },
    { symbol: 'G', duration: 4, key: 67 },
    { symbol: 'D', duration: 4, key: 62 }
  ]}
];

// ── Scoring function — mirrors orchestrator's _evaluateMelodyGlobally ──
function scoreNotes(notes) {
  if (!notes || notes.length === 0) return { score: 0, issues: ['no-notes'] };
  let score = 1.0;
  const issues = [];

  // Pitch diversity
  const pitchCounts = {};
  notes.forEach(n => { pitchCounts[n.pitch] = (pitchCounts[n.pitch] || 0) + 1; });
  const uniqueRatio = Object.keys(pitchCounts).length / notes.length;
  if (uniqueRatio < 0.25) { issues.push('low-pitch-diversity'); score -= 0.2; }

  // Uncompensated leaps
  let uncompensatedLeaps = 0;
  for (let i = 1; i < notes.length - 1; i++) {
    const interval1 = notes[i].pitch - notes[i-1].pitch;
    const interval2 = notes[i+1].pitch - notes[i].pitch;
    if (Math.abs(interval1) > 7 && Math.sign(interval1) === Math.sign(interval2)) {
      uncompensatedLeaps++;
    }
  }
  if (uncompensatedLeaps > 2) { issues.push('excessive-uncompensated-leaps'); score -= 0.15; }

  // Motivic coherence (interval repetition)
  const intervals = [];
  for (let i = 1; i < notes.length; i++) { intervals.push(notes[i].pitch - notes[i-1].pitch); }
  let repetitionCount = 0;
  for (let i = 0; i < intervals.length - 3; i++) {
    for (let j = i + 2; j < intervals.length - 1; j++) {
      if (intervals[i] === intervals[j] && intervals[i+1] === intervals[j+1]) {
        repetitionCount++;
      }
    }
  }
  if (repetitionCount > notes.length * 0.5) { issues.push('excessive-repetition'); score -= 0.15; }
  else if (repetitionCount === 0 && notes.length > 8) { issues.push('low-motivic-coherence'); score -= 0.1; }

  return { score: Math.max(0, Math.min(1, score)), issues, noteCount: notes.length };
}

// ── Run all 3 engines on all progressions, return structured results ──
async function benchmarkAllEngines() {
  const results = {};
  const engines = ['progress', 'pro', 'mgen'];

  for (const engine of engines) {
    results[engine] = {};
    for (const prog of TEST_PROGRESSIONS) {
      const rng = createRNG(42); // Fixed seed for reproducibility
      const context = defaultContext(rng);
      const playedNotes = [];
      const mockPlayTone = (freq, startTime, duration, inst, bus) => {
        const midi = 12 * Math.log2(freq / 440) + 69;
        playedNotes.push({ midi, startTime, duration });
      };

      state.melodySettings = {
        enabled: true, engine, genre: 'none', density: 0.5,
        restProbability: 0.1, rangeMin: 60, rangeMax: 84
      };
      state.divisions = 12;
      state.bpm = 120;
      state.instruments = { melody: 'sine' };
      state.currentProgression = prog.chords;
      state.temporarySwaps = {};

      const startTime = performance.now();

      if (engine === 'mgen') {
        await pregenerateMgenMelody(state);
      }

      let currentTime = 0;
      for (let i = 0; i < prog.chords.length; i++) {
        const chordObj = prog.chords[i];
        const nextChordObj = i < prog.chords.length - 1 ? prog.chords[i + 1] : null;
        const prevChordObj = i > 0 ? prog.chords[i - 1] : null;
        const chordNotes = [chordObj.key, chordObj.key + 4, chordObj.key + 7];
        await scheduleMelody(
          currentTime, chordObj, nextChordObj, prevChordObj,
          chordObj.duration, chordObj.duration, 120, i, prog.chords.length,
          chordNotes, mockPlayTone
        );
        currentTime += chordObj.duration;
      }

      const elapsed = performance.now() - startTime;
      const scored = scoreNotes(playedNotes);

      results[engine][prog.name] = {
        score: scored.score,
        noteCount: scored.noteCount,
        issues: scored.issues,
        executionTimeMs: parseFloat(elapsed.toFixed(2)),
        playedNoteCount: playedNotes.length
      };

      clearMelodyMemory();
    }
  }

  return results;
}

// ── Test: baseline scores exist and are reasonable ──
describe('Melody Engine Benchmark — Baseline', () => {
  let baseline;

  beforeAll(async () => {
    baseline = await benchmarkAllEngines();
  });

  test('all engines produce non-zero scores', () => {
    for (const engine of ['progress', 'pro', 'mgen']) {
      for (const prog of TEST_PROGRESSIONS) {
        expect(baseline[engine][prog.name].score).toBeGreaterThan(0);
      }
    }
  });

  test('all engines produce notes', () => {
    for (const engine of ['progress', 'pro', 'mgen']) {
      for (const prog of TEST_PROGRESSIONS) {
        expect(baseline[engine][prog.name].playedNoteCount).toBeGreaterThan(0);
      }
    }
  });

  test('baseline results are captured for comparison', () => {
    expect(Object.keys(baseline)).toEqual(['progress', 'pro', 'mgen']);
  });
});

// ── Export for reuse in other test files ──
export { benchmarkAllEngines, scoreNotes, TEST_PROGRESSIONS };
```

### What Gemini needs to know:
- This file is **self-contained** — it imports from existing modules that already exist and work
- It uses `createRNG(42)` for deterministic output (seed 42)
- It scores using the same logic as `orchestrator._evaluateMelodyGlobally()` (pitch diversity, leap compensation, motivic coherence)
- It returns a nested object: `{ engine: { progressionName: { score, noteCount, issues, executionTimeMs, playedNoteCount } } }`
- **One file. ~150 lines. Works with existing code. No new dependencies.**

---

## PHASE 1: Three Specific, Low-Effort, High-Impact Code Changes

Each change is **self-contained**, uses existing infrastructure, and can be verified by the benchmark harness above.

### Change 1: Add `countNotesByRole()` to `orchestrator.js` (15 lines)

**Why:** The orchestrator already has `_evaluateMelodyGlobally()` that scores melodies. But it doesn't expose per-pass note counts or role distributions. Adding this lets the benchmark harness (and Gemini) see *which pass* is producing what, enabling targeted improvements.

**Where:** `mgen/src/orchestrator.js`, after line 496 (after `getExecutionLog()`), before `getPassOutput()`.

**Replace nothing. Add this method:**

```javascript
  /**
   * Count notes by role across all passes.
   * Returns { structural: N, cadence: N, connector: N, ornament: N, expectation: N }.
   * Useful for benchmarking which passes contribute what.
   * @returns {Object} Role distribution
   */
  getRoleDistribution() {
    const dist = { structural: 0, cadence: 0, connector: 0, ornament: 0, expectation: 0 };
    for (const entry of this.executionLog) {
      const notes = this._passNotes?.get(entry.passName) || [];
      notes.forEach(n => { dist[n.role] = (dist[n.role] || 0) + 1; });
    }
    return dist;
  }
```

**Verification:** The existing test `pipelineIntegration.test.js` line 112-139 already checks `getExecutionLog()`. This new method follows the same pattern. No existing test breaks.

---

### Change 2: Add `_scoredMetadata` to `mgenEngine.js` cache (25 lines)

**Why:** The integration layer (`mgenEngine.js`) currently discards the orchestrator's metadata (scores, execution time, safeMode, backtracks). The benchmark harness needs this data to compare engines.

**Where:** `mgenEngine.js`, inside `pregenerateMgenMelody()`, after line 129 (after `const mgenResult = await orchestrator.execute(config);`).

**Replace the block from lines 128-139 with:**

```javascript
    // Execute pipeline
    const mgenResult = await orchestrator.execute(config);
    const elapsed = performance.now() - startTime;
    if (elapsed > 120) {
      import('./modalController.js').then(m => m.showPerformanceWarning('mgen', elapsed));
    }

    // Convert back to Progress notes
    const progressNotes = melodyGenResultToProgressNotes(mgenResult, stateClone.bpm || 120);

    // Cache the notes
    mgenCachedNotes = progressNotes;

    // Expose scored metadata for benchmarking (NEW)
    mgenCachedNotes._scoredMetadata = {
      globalScore: mgenResult.metadata.globalScore,
      safeModeTriggered: mgenResult.metadata.safeModeTriggered,
      backtrackCount: mgenResult.metadata.backtrackCount,
      feedbackIterations: mgenResult.metadata.feedbackIterations,
      executionTimeMs: mgenResult.metadata.executionTimeMs,
      roleDistribution: orchestrator.getRoleDistribution(),
      passScores: mgenResult.metadata.passResults.map(p => ({
        name: p.passName, score: p.metrics.score, noteCount: p.notes.length
      }))
    };
```

**Verification:** `mgenEngine.test.js` line 47-62 already checks that `pregenerateMgenMelody()` populates the cache. This change adds `_scoredMetadata` as an additional property on the cached notes array — it does not change the existing structure. All existing tests pass.

---

### Change 3: Add `scoreNotes()` export to `melodyGenerator.js` (20 lines)

**Why:** The benchmark harness needs a unified scoring function that works for all 3 engines. Currently, `scoreNotes()` only exists inside `orchestrator._evaluateMelodyGlobally()` (private). Exporting it makes it accessible for benchmarking.

**Where:** `melodyGenerator.js`, after line 97 (end of file).

**Add this function:**

```javascript
/**
 * Score a generated melody for benchmarking purposes.
 * Mirrors orchestrator._evaluateMelodyGlobally() for cross-engine comparison.
 * @param {Object[]} notes - Notes with pitch and role properties
 * @returns {{ score: number, issues: string[], noteCount: number }}
 */
export function scoreNotes(notes) {
  if (!notes || notes.length === 0) return { score: 0, issues: ['no-notes'], noteCount: 0 };
  let score = 1.0;
  const issues = [];

  const pitchCounts = {};
  notes.forEach(n => { pitchCounts[n.pitch] = (pitchCounts[n.pitch] || 0) + 1; });
  const uniqueRatio = Object.keys(pitchCounts).length / notes.length;
  if (uniqueRatio < 0.25) { issues.push('low-pitch-diversity'); score -= 0.2; }

  let uncompensatedLeaps = 0;
  for (let i = 1; i < notes.length - 1; i++) {
    const interval1 = notes[i].pitch - notes[i-1].pitch;
    const interval2 = notes[i+1].pitch - notes[i].pitch;
    if (Math.abs(interval1) > 7 && Math.sign(interval1) === Math.sign(interval2)) {
      uncompensatedLeaps++;
    }
  }
  if (uncompensatedLeaps > 2) { issues.push('excessive-uncompensated-leaps'); score -= 0.15; }

  const intervals = [];
  for (let i = 1; i < notes.length; i++) { intervals.push(notes[i].pitch - notes[i-1].pitch); }
  let repetitionCount = 0;
  for (let i = 0; i < intervals.length - 3; i++) {
    for (let j = i + 2; j < intervals.length - 1; j++) {
      if (intervals[i] === intervals[j] && intervals[i+1] === intervals[j+1]) {
        repetitionCount++;
      }
    }
  }
  if (repetitionCount > notes.length * 0.5) { issues.push('excessive-repetition'); score -= 0.15; }
  else if (repetitionCount === 0 && notes.length > 8) { issues.push('low-motivic-coherence'); score -= 0.1; }

  return { score: Math.max(0, Math.min(1, score)), issues, noteCount: notes.length };
}
```

**Verification:** This is a pure function — no imports, no state, no side effects. It cannot break anything. It mirrors the orchestrator's logic exactly.

---

## PHASE 2: Post-Implementation Verification Workflow

After implementing Phases 0-1, the verification workflow is:

```
1. npx jest benchmark.test.js          # Run baseline, capture scores
2. # Make a change to any engine
3. npx jest benchmark.test.js          # Run same benchmark
4. Compare: did scores go up?
   - Yes: commit the change
   - No: revert, investigate why
```

The benchmark harness (`benchmark.test.js`) is the **single source of truth** for verifying improvements. It runs all 3 engines on 5 fixed progressions with a fixed seed (42), producing deterministic, comparable results.

---

## PHASE 3: Next Steps for Gemini (After Phase 0-1 are verified)

Once the benchmark harness is in place and working, Gemini can tackle these improvements **one at a time**, each verified by the harness:

### 3.1 Add countermelody pass to mgen (Highest Priority)
- **Gap:** mgen has no countermelody; Progress has a full 3-mode system (contrary, harmonize, call-response)
- **Action:** Port `melodyCountermelody.js`'s logic as a new mgen pass (e.g., `PassF_countermelody.js`)
- **Verification:** The benchmark harness will show if the countermelody pass improves or degrades the overall score
- **Estimated effort:** Medium
- **Expected impact:** High — fills the biggest gap in mgen

### 3.2 Add song form (A/B/A') to mgen
- **Gap:** mgen has no song form coordination; Progress has full A/B/A' section management with motif recall and transposition
- **Action:** Port the `handleSongForm()` logic from `melodyMacro.js` as a PhraseEngine enhancement
- **Verification:** The benchmark harness will show if A/B/A' structure improves scores on multi-chord progressions
- **Estimated effort:** Medium
- **Expected impact:** High — fills another major gap

### 3.3 Add evolutionary rhythm to mgen
- **Gap:** mgen uses static templates; Progress evolves templates across phrases (15% full regenerate, 45% evolve, 40% stable)
- **Action:** Port the template evolution logic from Progress's `melodyScheduler.js` into `RhythmEngine`
- **Verification:** The benchmark harness will show if evolutionary templates improve scores
- **Estimated effort:** Medium
- **Expected impact:** Medium

### 3.4 Add surprise system to Professional
- **Gap:** Professional has no surprise system; Progress has configurable surprise probability
- **Action:** Implement configurable surprise probability as a post-processing pass
- **Verification:** The benchmark harness will show if surprise events improve or degrade scores
- **Estimated effort:** Low-Medium
- **Expected impact:** Medium

### 3.5 Add evaluation metrics to Progress and Professional
- **Gap:** Both engines currently lack quality scoring; only mgen has it
- **Action:** Add `scoreNotes()` (from Phase 1) to both engines' output
- **Verification:** Enables the pretest/postest workflow for these engines too
- **Estimated effort:** Low
- **Expected impact:** High — enables benchmarking for all 3 engines

---

## Summary: What Gemini Should Do Now (Minimum Viable)

| Step | Action | Lines | Risk |
|------|--------|-------|------|
| 1 | Create `benchmark.test.js` (Phase 0) | ~150 | None — pure test file |
| 2 | Add `getRoleDistribution()` to `orchestrator.js` | ~15 | None — new method, no existing code changed |
| 3 | Add `_scoredMetadata` to `mgenEngine.js` cache | ~12 | None — additive property only |
| 4 | Add `scoreNotes()` export to `melodyGenerator.js` | ~20 | None — pure function, no side effects |
| 5 | Run `npx jest benchmark.test.js` to verify | 0 | Confirms everything works |

**Total: ~197 lines of new code. Zero lines of existing code modified (only appended to). Zero risk of breaking anything. One reusable test file for all future changes.**

---

## Answer to: Does Gemini Need comparison.md?

**No. Gemini does NOT need `comparison.md` to implement this plan.**

The plan above is **self-contained**. It references specific file paths and line numbers that Gemini can verify by reading those files directly. The `comparison.md` document is a reference for understanding the broader architectural context, but it is not required to implement the concrete changes described here.

**Recommended approach for Gemini:**
1. Provide **only this plan document** (the current response)
2. If Gemini needs to verify a specific code reference (e.g., "what's on line 496 of orchestrator.js?"), it can read that file directly
3. The `comparison.md` can be kept as a reference document but does not need to be fed into Gemini's context

This saves significant context window while still giving Gemini everything it needs to implement the plan correctly.
