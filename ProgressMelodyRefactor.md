# ProgressMelodyRefactor.md

## Plan: Melody Generator Refactoring & Musical Enhancements

### Current State

**`melodyGenerator.js`** (2205 lines) is the monolithic orchestrator that:
- Contains ~94 `Math.random()` calls (57 in this file, 37 in module files)
- Manages ~30 module-level state variables (pitch history, macro planning, phrase tracking, narrative state)
- Calls into 4 already-modular files: `melodyTuning.js` (389 lines), `melodyMotifs.js` (293 lines), `melodyRhythm.js` (69 lines), `melodyGenreRules.js` (67 lines)
- Exports only `scheduleMelody` and `clearMelodyMemory`
- Imported by `sequencer.js`, `wavExport.js`, and 3 test files

**Existing modules** are well-structured but `melodyGenerator.js` remains a 2205-line monolith that orchestrates them.

### Phase 1: Seeded Randomness (Threaded in Context)

**Create `melodyRandom.js`** — a seeded PRNG module:
- `createRNG(seed)` → returns `{ next() }` (mulberry32 or xorshift)
- **No module-level state** — RNG is attached to the context object (see Phase 2)

**Update all files** (`melodyGenerator.js`, `melodyTuning.js`, `melodyMotifs.js`, `melodyRhythm.js`, `melodyGenreRules.js`): Replace `Math.random()` with `context.rng.next()`.

### Phase 2: Extract Internal Logic from `melodyGenerator.js` (Iterative)

**Step 1: Bundle variables into context object inside `melodyGenerator.js`** (no file splitting yet)
- Create `defaultContext(rng = null)` that returns an object containing all ~30 module-level state variables.
- The `rng` property is either a seeded PRNG (for tests) or a `Math.random` wrapper (for live playback).
- Thread the context through all internal functions inside `melodyGenerator.js`.
- Verify all 566 tests still pass before splitting files.

**Step 2: Extract helper functions into new files** (only after Step 1 passes tests)

**Persistent module-level context** (inside `melodyGenerator.js`):
```js
let activeContext = defaultContext();
let testContext = null;

export function clearMelodyMemory() {
    activeContext = defaultContext();
}

// Hook for testing or offline rendering to inject a clean/seeded context
export function setTestContext(ctx) {
    testContext = ctx;
}

export function scheduleMelody(...) {
    const context = testContext || activeContext;
    // Thread 'context' to all extracted sub-modules...
}
```

**Context object** (replaces ~33 module-level variables):
```js
const defaultContext = (rng = null) => ({
    rng: rng || { next: () => Math.random() },
    globalPrevPitch, globalPrevCounterPitch, globalLastInterval,
    globalMelodyHistory, globalPrevAnchor, globalLastMelodyNoteTime,
    globalLastCountermelodyNoteTime, counterLastPitch,
    macroTargetPlan, phraseHighestPitch, songHighestPitch, peakPitchHitsCount,
    phraseActivityCurve, phraseRhythmTemplate, phraseCounterRhythmTemplate,
    phraseRhythmicMotif, previousAbsIndex, progressionLoopCounter,
    prevSlotEndedWithRun, prevSlotRunRemainingLength, prevSlotLastPitch,
    noteCountThisPhrase, forceContraryNext, forceTonicNext,
    phraseLocalScaleOffset, globalPrevPitchIsColor,
    stepsSinceLastSurprise, activeAestheticMode,
    narrativeState, sectionARhythmTemplate, sectionAAestheticMode, sectionAChordRootPitch,
    motifCache, counterPhraseDirectionBias, counterPhraseStepsRemaining,
    songFormSection, sectionAMotifFamily,
});
```

**Extract into new modules**:

| New File | Contents | Lines (est.) |
|----------|----------|-------------|
| `melodyContext.js` | Context object, `defaultContext()`, `resetContext()` | ~30 |
| `melodyEngine.js` | Pitch selection, scale building, chord tone matching (already in `melodyTuning.js` — thread context through) | (existing) |
| `melodyScheduler.js` | Note scheduling, rests, transitions, ornaments, rounding, grid step management | ~600 |
| `melodyMacro.js` | Macro planning, motif tracking, phrase boundaries, narrative state | ~500 |
| `melodyCountermelody.js` | Countermelody generation, counter phrase management | ~400 |

**Approach**:
1. Bundle variables into context inside `melodyGenerator.js` (Step 1).
2. Thread context through all internal functions in `melodyGenerator.js`.
3. Verify all 566 tests pass.
4. Extract helper functions into new files (Step 2).
5. `scheduleMelody` resolves the active context (`testContext || activeContext`).
6. `clearMelodyMemory()` resets the module's `activeContext` by calling `defaultContext()`.
7. `melodyGenerator.js` becomes a thin re-exporter.

**Mutation pattern**: The context object is a **shared mutable state container**. All sub-modules receive the same reference and mutate it in-place. Do not clone or replace the context. This is by design for performance.

### Phase 3: Unit Tests

Create test files for each extracted module:
- `melodyContext.test.js` — context creation, reset, serialization
- `melodyScheduler.test.js` — note scheduling, rests, transitions, rounding
- `melodyMacro.test.js` — macro planning, motif tracking, phrase boundaries
- `melodyCountermelody.test.js` — countermelody generation
- `melodyRandom.test.js` — seeded RNG produces deterministic output

### Phase 4: Musical Enhancements

**4a. Smart Motif Sharing by Section Type**
- Motifs can recur across the **entire song** but are grouped by **section name type** (verse, verse1, verse2 share motifs; bridge does not).
- Cross-type motif mixing at ~10% probability for song-wide coherence.
- When genre switches, the motif library resets — new motifs are generated for the new genre.
- Implementation: In `melodyMacro.js`, track motif usage by section type. Allow cross-type mixing at low probability.

**4b. Microtonal Collision Prevention (Adaptive)**
- **Voice-leading check** (consecutive notes in the same voice): Minimum distance = **1 EDO step** (`periodSize / divisions`). After rounding a melody note, check if `Math.abs(currentPitch - previousPitch) < 1 * (periodSize / divisions)`. If so, nudge to the nearest distinct scale degree.
- **Polyphonic check** (melody vs. countermelody): Allow them to merge onto the same unison pitch (musically valid), but prevent them from being within 0.5 EDO steps of each other (creates acoustic beating).
- Implementation: In `melodyScheduler.js`, post-rounding check for voice-leading; separate check in countermelody scheduling for polyphonic collision.

**4c. Scale Degree Anchoring with customNotes**
- When selecting chord tones, prefer notes from `chordObj.customNotes` where `isMicrotonal` is true.
- Implementation: In `melodyTuning.js` (already modular), chord tone matching layer.

### Verification

- Run `npm test` after each phase. All 566 tests must pass.
- No changes to `getChordNotes`, `snapToGrid`, or `timelineEditor.js`.
- No changes to the public API of `scheduleMelody` or `clearMelodyMemory`.

### Implementation Order

1. **Phase 1**: Create `melodyRandom.js` (standalone, no dependencies).
2. **Phase 2 Step 1**: Bundle variables into context inside `melodyGenerator.js`, thread through internal functions, verify tests pass.
3. **Phase 2 Step 2**: Extract helper functions into new files, verify tests pass.
4. **Phase 3**: Create unit tests for extracted modules.
5. **Phase 4**: Implement musical enhancements one at a time, verifying tests after each.

### Open Questions

1. **Persistent context**: `melodyGenerator.js` maintains a module-level `activeContext` that survives between `scheduleMelody` calls. Tests inject via `setTestContext(ctx)`. This preserves state across chord slots while keeping sub-modules stateless.

2. **Motif recurrence window**: Smart sharing by section name type (verse/verse1/verse2 share; bridge separate), with ~10% cross-type mixing for song-wide coherence.

3. **Microtonal collision**: Two separate checks — voice-leading (1 EDO step minimum between consecutive notes in same voice) and polyphonic (allow unison, prevent 0.5 EDO-step beating between melody and countermelody).
