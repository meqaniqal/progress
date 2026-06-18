# AGENTS.md - MelodyGen Isolated

## Project Overview
6-pass hierarchical melody generator. Vanilla JS (ES6, Strict), Node.js only (no browser deps).

## Commands
```bash
npm test                    # Run all tests (Jest with --experimental-vm-modules)
npm start                   # Start server (server.js)
```

## Architecture

### Pipeline (6 passes, sequential)
PassA (structural) → PassB (cadence) → PassC (connector) → PassD (ornament) → PassE (expectation) → RhythmEngine (rhythm/density)

**Role priority for deduplication** (same start time): `structural(5) > cadence(4) > connector(3) > ornament(2) > expectation(1)`

### Key Files
- `src/interfaces.js` - All data structures: `MelodyNote`, `Chord`, `PassResult`, `EvaluationMetrics`, `GenerationConfig`, etc.
- `src/orchestrator.js` - `CompositionOrchestrator` with `registerPass()`, `execute()`, `getPassOutput()`, `getAllPassOutputs()`, `reset()`
- `src/passes/passA_structural.js` through `passE_expectation.js` - Individual pass implementations
- `src/engines/` - MotifEngine, StyleEngine, MicrotonalEngine, PhraseEngine, RhythmEngine (5 engines)
- `src/microtonalSuggestions.js` - **MOVED FROM PROGRESS**: Continuous float-based (cents) harmonic substitutions and turnarounds. Can be moved back to progress directory when work resumes on the main app.
- `src/progressionSuggestions.js` - **MOVED FROM PROGRESS**: Emotional/harmonic chord progression suggestions (18 categories). Can be moved back to progress directory when work resumes on the main app.

### Testing
- 361 tests total (all passing), all passing
- Tests live in `tests/` directory
- Import paths: use `../src/engines/` (NOT `../../src/engines/`)

## Gotchas
- **PassResult fields**: `passName` (NOT `engineName`), `metrics` (NOT `evaluation`)
- **PassResult constructor**: `(passName, notes, metrics, context)` - context becomes `metadata`
- **Test command**: requires `--experimental-vm-modules` flag (in `package.json` scripts)
- **PassE (expectation)**: returns only notes with pitch changes, not all notes
- **PassA error**: `TypeError: Cannot destructure property 'chords' of 'config'` if config is undefined
- **`runAllTests()` must be async** or `allNotes` will be undefined

## TODO
- **theory.test.js uniqueness check**: The main progress app's `theory.test.js` has a test ("has zero duplicate chord symbols across all categories") that checks for cross-category chord symbol uniqueness. This test was silently failing before because `progressionSuggestions.js` and `microtonalSuggestions.js` no longer exist in the progress directory (moved to mgen). **When you resume work on the progress app, you must remove this uniqueness check from `theory.test.js`** - uniqueness is a UI convenience feature, not a musical requirement. Making chord symbols unique across categories would break the rest of the app (ui.js, inspectorController.js, store.js, sequencer.js, midi.js, etc. all depend on standard chord symbol names). Removing the check will allow the test to actually run and verify that the theory module still works correctly.

## Performance Notes (Pipeline Realtime Readiness)

The full pipeline (PassA → PassB → PassC → PassD → PassE → RhythmEngine → MicrotonalEngine) takes **~2-4ms** end-to-end with typical inputs (6 chords → ~97 sliced chords → ~34 accumulated notes → ~11 final melody). This is well under the 16ms/frame budget for realtime audio.

**Key findings:**
- **Regeneration almost never fires** — the score threshold is 0.5, every pass produces notes, so the score stays 0.7-1.0. The 3x regeneration loop is effectively dead code in practice.
- **All `async execute()` methods are synchronous internally** — the `await` wrappers add micro-overhead but no actual async I/O. Safe to remove if profiling shows it matters.
- **Pre-processing is the primary bottleneck** — `preprocessProgressData` slices 6 chords into ~97 event-boundary chords (from bass/drum pattern hits), taking ~1-2ms. Cache the sliced chord array and only re-slice when the underlying progression changes.

**Future optimizations (if realtime becomes a concern):**
1. **Cache sliced chords** — eliminates ~1-2ms pre-processing cost. Only re-slice when the progression changes.
2. **Incremental passes** — instead of re-running all passes from scratch, track which notes changed and only re-process affected notes. Reduces Pass C from O(N log N) to O(k log k) where k = changed notes.
3. **Pass E optimization** — replace `refined.findIndex()` (O(N)) with a Map lookup by `startTime` (O(1)). Reduces Pass E from O(N × P) to O(N + P).
4. **Integer-rounded dedup keys** — use `Math.round(startTime * 100)` as Map keys instead of raw floats to avoid a floating-point grouping bug (correctness, not perf).
5. **Skip post-processing in realtime** — RhythmEngine and MicrotonalEngine are post-processing passes that can be deferred or batched if per-frame generation is needed.

## Constraints
- No external dependencies beyond Jest
- All passes must accept `(config, previousNotes, context)` signature
- Each pass returns `PassResult` with `notes[]`, `metrics`, `context`
- Orchestrator handles deduplication and regeneration (max 3 attempts per pass)
