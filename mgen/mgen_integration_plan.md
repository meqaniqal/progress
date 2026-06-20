# mgen Integration Plan — Wiring as Alternative User-Selectable Melody Engine

**Created:** 2026-06-20
**Status:** Ready for implementation — mgen is structurally ready, missing features need porting
**Reference:** `comparison.md`, `melodygen_progress_bridge.md`, `melodygen_architecture.md`, `melodygen_design_patterns.md`, `ProgressMelodyRefactor.md`, `CURRENT_FOCUS.md`

---

## Executive Summary

**mgen is ready to be wired in as an alternative user-selectable melody generator engine for Progress.** The core infrastructure is complete and functional:

- **5-pass pipeline** (PassA structural → PassB cadence → PassC connector → PassD ornament → PassE expectation) — fully implemented
- **5 post-processing engines** (Rhythm, Motif, Style, Phrase, Microtonal) — fully implemented (ExpectationEngine and VoiceLeadingEngine also implemented)
- **Progress bridge** (`progressBridge.js`) — converts Progress app data → mgen format and back, including bass track resolution, rest handling, wraparound, and event-boundary slicing
- **CompositionOrchestrator** — coordinates passes with evaluation metrics and selective regeneration
- **361 passing Jest tests** across all passes and engines
- **Performance:** ~2-4ms end-to-end, well under 16ms/frame realtime budget
- **No external dependencies** beyond Jest

**What's missing** (Progress's musical features not yet ported to mgen):
- Countermelody generation (3 modes: contrary, harmonize, call-response)
- Song form coordination (A/B/A' section management with motif recall)
- Dynamic scale center (local chord-scale selection with overlap checking)
- Evolutionary rhythm (templates evolving across phrases)
- Surprise system (configurable probability for unexpected events)
- Musical nuances (foreshadowing, isolated note snapping, bass note doubling avoidance, dialogue split boundaries)

---

## Current State Assessment

### What's Implemented and Working

| Component | Status | Lines | Notes |
|-----------|--------|-------|-------|
| `interfaces.js` | Complete | 163 | 8 data classes: MelodyNote, Chord, PhraseContext, EvaluationMetrics, PassResult, MelodyResult, GenerationConfig, MelodyTask |
| `orchestrator.js` | Complete | 291 | CompositionOrchestrator with registerPass(), execute(), deduplication, evaluation, regeneration |
| `progressBridge.js` | Complete | 565 | Full bridge: preprocessProgressData(), progressChordToMelodyGenChord(), progressStateToGenerationConfig(), melodyGenResultToProgressNotes() |
| `passA_structural.js` | Complete | 394 | StructuralPlanner — role-based chord tone selection, voice-leading constraints |
| `passB_cadence.js` | Complete | 265 | CadencePlanner — phrase endings, antecedent/consequent handling |
| `passC_connector.js` | Complete | 152 | ConnectorPlanner — stepwise/skip/leap fill between structural notes |
| `passD_ornament.js` | Complete | 216 | OrnamentPlanner — grace notes, trills, turns, appoggiaturas |
| `passE_expectation.js` | Complete | 137 | ExpectationRefiner — call-response pitch correction (fixed to return all notes) |
| `RhythmEngine.js` | Complete | 528 | 16-step grid templates, subdivision profiles, 4 aesthetic modes |
| `MotifEngine.js` | Complete | 476 | 6 transformation types (transposition, sequence, inversion, retrograde, augmentation, diminution) |
| `StyleEngine.js` | Complete | 427 | 4 style profiles (baroque, classical, jazz, pop) |
| `PhraseEngine.js` | Complete | 393 | PhraseArcPlanner (6 climax archetypes) + PhraseGrammar (call/response) |
| `MicrotonalEngine.js` | Complete | 373 | 4 tuning systems (12-TET, quartertone, just, pythagorean) |
| `ExpectationEngine.js` | Complete | ~350 | Listener expectation tracking (pitch, rhythm, register, resolution) |
| `VoiceLeadingEngine.js` | Complete | ~300 | Interval classification, leap compensation, momentum tracking |
| Tests | 361 passing | 18 files | All passes, engines, bridge, pipeline integration |

### What's Missing (Progress Features Not Ported to mgen)

| Feature | Source (Progress) | mgen Status | Priority |
|---------|------------------|-------------|----------|
| **Countermelody** | `melodyCountermelody.js` (257 lines) | Not implemented | P1 |
| **Song form (A/B/A')** | `melodyMacro.js` (229 lines) — SongFormCoordinator | Not implemented | P1 |
| **Dynamic scale center** | `melodyTuning.js` — getLocalScaleMode | Not implemented | P1 |
| **Evolutionary rhythm** | `melodyScheduler.js` — rhythm template evolution (15/45/40%) | Static templates only | P2 |
| **Surprise system** | `melodyScheduler.js` — configurable surprise probability | Not implemented | P2 |
| **Foreshadowing** | `melodyScheduler.js` — getDistinctiveNextTone | Not implemented | P2 |
| **Bass note doubling avoidance** | `melodyScheduler.js` — activeBassMidi check | Not implemented | P3 |
| **Genre-specific ornamentation** | `melodyGenreRules.js` (69 lines) — jazz/blues chromaticism, bends | Partial (StyleEngine rules) | P3 |
| **Isolated note snapping** | `melodyScheduler.js` | Not implemented | P3 |
| **Dialogue split boundaries** | `melodyScheduler.js` — chordPattern boundaries | Not implemented | P3 |
| **Macro contour planning** | `melodyTuning.js` — planMacroMelodyTargets | Partial (PhraseContext.tensionLevel) | P3 |

---

## Integration Architecture

### The Wiring Plan

The integration follows a **hybrid approach** (recommended in `comparison.md` section 6.3):

```
Progress App                          mgen Integration Layer              mgen Pipeline
────────────                            ────────────────────                ─────────────

User toggles                           New module:                        CompositionOrchestrator
"Use mgen" switch                      mgenEngine.js                      (existing)
    │                                        │
    ├─→ Check state.melodySettings.engine  ├─→ Import mgen modules         1. preprocessProgressData()
    │   === 'mgen'                           │   (orchestrator, passes,     2. progressStateToGenerationConfig()
    │                                        │    engines, bridge)          3. orchestrator.execute(config)
    ├─→ Call mgenEngine.generate()         ├─→ Call bridge                4. melodyGenResultToProgressNotes()
    │   (new function)                       │                              5. Return Progress note objects
    │                                        ├─→ Return Progress notes
    │                                        └─→ (same format as current)
    │
    └─→ Continue as normal (notes go to
        sequencer.js, wavExport.js — no
        changes needed to existing consumers)
```

### Key Design Decisions

1. **`melodyGenerator.js` becomes a router** — Currently a 48-line thin re-exporter. It will be extended to route between the existing `scheduleMelody()` (Progress's current generator) and a new `mgenGenerate()` based on `state.melodySettings.engine`.

2. **No changes to consumers** — `sequencer.js` and `wavExport.js` import `scheduleMelody` and `clearMelodyMemory` from `melodyGenerator.js`. The router pattern preserves this contract.

3. **mgen runs batch, not per-slot** — mgen's `CompositionOrchestrator.execute()` generates the entire melody for a progression in one call (batch), returning a `MelodyResult`. This is different from Progress's per-slot `scheduleMelody()` which generates notes during playback. The bridge converts mgen's batch output to Progress's per-slot format.

4. **State isolation** — mgen uses immutable `GenerationConfig` → `MelodyResult` pipeline. Progress uses mutable module-level state. The router manages this difference by converting between the two paradigms.

---

## Implementation Steps

### Phase 0: Verify mgen Tests Pass (Prerequisite)

```bash
cd mgen && npm test
```

All 361 tests must pass before integration work begins.

### Phase 1: Create Integration Router (`mgenEngine.js`)

**File:** `mgenEngine.js` (new, ~150 lines)

**Purpose:** Bridge between Progress's `scheduleMelody()` contract and mgen's batch pipeline.

**Key functions:**

```js
// Main entry — replaces/extends melodyGenerator.js routing
export function scheduleMelody(
    time, chordObj, nextChordObj, prevChordObj,
    chordSlotDuration, beats, bpm, absIndex, totalChords,
    chordNotes, playToneFn, voiceEvents
) {
    if (state.melodySettings.engine === 'mgen') {
        return mgenGenerate(
            time, chordObj, nextChordObj, prevChordObj,
            chordSlotDuration, beats, bpm, absIndex, totalChords,
            chordNotes, playToneFn, voiceEvents
        );
    }
    // Fall through to existing scheduleMelody
    return schedMelody(context, time, chordObj, ...);
}

// mgen batch generator — called once per progression, not per-slot
function mgenGenerate(
    time, chordObj, nextChordObj, prevChordObj,
    chordSlotDuration, beats, bpm, absIndex, totalChords,
    chordNotes, playToneFn, voiceEvents
) {
    // 1. Build Progress data object from current state
    const progressData = buildProgressData(chordObj, nextChordObj, prevChordObj, ...);

    // 2. Pre-process: Progress → mgen Chord[]
    const mgenChords = preprocessProgressData(progressData);

    // 3. Build GenerationConfig from Progress state
    const config = progressStateToGenerationConfig(state);

    // 4. Execute mgen pipeline
    const orchestrator = new CompositionOrchestrator();
    registerAllPasses(orchestrator);
    registerAllEngines(orchestrator);
    const mgenResult = await orchestrator.execute(config);

    // 5. Convert mgen output → Progress note objects
    const progressNotes = melodyGenResultToProgressNotes(mgenResult, bpm);

    // 6. Return notes for the current slot (filter by time)
    return progressNotes.filter(n => n.stepTime >= time && n.stepTime < time + chordSlotDuration);
}
```

**Changes to `melodyGenerator.js`:** Extend the 48-line router to check `state.melodySettings.engine` and call `mgenGenerate()` when set to `'mgen'`.

### Phase 2: Wire into Progress State

**File:** `store.js` — Add to `melodySettings`:

```js
melodySettings: {
    // ... existing fields ...
    engine: 'progress',  // 'progress' | 'mgen'
    // ... existing fields ...
}
```

**File:** `ui.js` — Add a toggle/switch in the melody settings panel:
- "Melody Engine: Progress (default) | mgen"
- When switched to mgen, show a note: "mgen uses a compositional pipeline. Some features (countermelody, song form) are not yet available."

### Phase 3: Wire into sequencer.js and wavExport.js

**No changes needed** — Both import `scheduleMelody` from `melodyGenerator.js`. The router pattern preserves the existing contract.

### Phase 4: Port Missing Features (Incremental)

Port Progress's missing musical features into mgen as new passes or engine enhancements:

| Priority | Feature | Implementation | Estimated Effort |
|----------|---------|---------------|-----------------|
| P0 | Fix regeneration scoring | Lower threshold, add meaningful criteria | Low (1-2 hours) |
| P1 | Countermelody pass | Port `melodyCountermelody.js` logic as PassF | Medium (1-2 days) |
| P1 | Song form coordination | Port `melodyMacro.js` SongFormCoordinator as PhraseEngine enhancement | Medium (1-2 days) |
| P1 | Dynamic scale center | Port `melodyTuning.js` getLocalScaleMode as pre-processing step | Medium (1-2 days) |
| P2 | Evolutionary rhythm | Port rhythm template evolution to RhythmEngine | Medium (1-2 days) |
| P2 | Surprise system | Port surprise logic as post-processing pass | Low-Medium (half day) |
| P3 | Musical nuances | Port foreshadowing, isolated snapping, bass avoidance, dialogue splits | Low (2-3 days) |

### Phase 5: Performance Optimization

Based on `mgen/AGENTS.md` performance notes:

1. **Cache sliced chords** — `preprocessProgressData` takes ~1-2ms; cache the sliced chord array and only re-slice when the progression changes
2. **Remove async wrappers** — All `async execute()` methods are synchronous internally; removing `await` wrappers eliminates micro-overhead
3. **Pass E optimization** — Replace `refined.findIndex()` (O(N)) with Map lookup by `startTime` (O(1))
4. **Skip post-processing in realtime** — RhythmEngine and MicrotonalEngine can be deferred if per-frame generation is needed

### Phase 6: A/B Testing Infrastructure

Add to `melodygen_design_patterns.md` (as suggested in the document itself):

```js
// In state.melodySettings:
pipelineVersion: 'progress' | 'mgen' | 'hybrid'
```

This enables:
- Side-by-side comparison of both generators
- User testing with both engines
- Gradual migration path (hybrid mode uses Progress for some features, mgen for others)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| mgen output quality differs significantly from Progress | High | A/B testing phase allows comparison before full switch |
| mgen batch model conflicts with Progress's per-slot playback model | Medium | Router converts batch output to per-slot format; some real-time features (context-aware per-slot decisions) will be lost until ported |
| Missing features (countermelody, song form) reduce user acceptance | High | Port P1 features before recommending mgen as default |
| Performance regression from bridge overhead | Low | Bridge is ~1-2ms; caching recommended; well under 16ms budget |
| Breaking existing Progress melody behavior | Low | Router only activates when `engine === 'mgen'`; default remains 'progress' |

---

## Decision Framework: When to Wire In

**Wire in mgen NOW if:**
- You want to test mgen's output quality with real Progress progressions
- You're comfortable with a subset of Progress's features (countermelody, song form, etc. won't be available)
- You want to evaluate mgen's compositional approach before committing to porting all features

**Wait to wire in mgen if:**
- You need full feature parity before testing
- You prefer to port all missing features first, then integrate

**Recommended:** Wire in mgen **now** with a clear feature gap notice to users. This allows:
1. Real-world testing of mgen's output quality
2. Informed decisions about which missing features to prioritize
3. User feedback on mgen's compositional approach
4. Iterative porting of missing features based on actual usage patterns

---

## Updated Implementation Priority (Incorporating mgen Readiness)

| Priority | Task | Status | Notes |
|----------|------|--------|-------|
| P0 | Verify 361 mgen tests pass | Not started | Prerequisite |
| P0 | Create `mgenEngine.js` router | Not started | ~150 lines |
| P0 | Add `engine` field to `state.melodySettings` | Not started | 1 line in store.js |
| P0 | Wire `melodyGenerator.js` to route to mgen | Not started | ~20 lines |
| P0 | Add UI toggle for melody engine | Not started | UI work |
| P1 | Port countermelody to mgen as PassF | Not started | ~257 lines from Progress |
| P1 | Port song form to mgen as PhraseEngine enhancement | Not started | ~229 lines from Progress |
| P1 | Port dynamic scale center to mgen pre-processing | Not started | From melodyTuning.js |
| P2 | Port evolutionary rhythm to RhythmEngine | Not started | From melodyScheduler.js |
| P2 | Port surprise system to mgen | Not started | From melodyScheduler.js |
| P2 | Port musical nuances (foreshadowing, etc.) | Not started | From melodyScheduler.js |
| P3 | Cache sliced chords | Not started | Performance optimization |
| P3 | Remove async wrappers | Not started | Performance optimization |
| P4 | Full feature parity milestone | Not started | All Progress features ported |

---

## Files That Need Changes

| File | Change | Lines (est.) |
|------|--------|-------------|
| `mgenEngine.js` | **NEW** — Integration router | ~150 |
| `melodyGenerator.js` | Extend router to check `state.melodySettings.engine` | ~10 |
| `store.js` | Add `engine: 'progress'` to `melodySettings` | ~1 |
| `ui.js` | Add melody engine toggle to settings panel | ~30 |
| `sequencer.js` | **No changes** — contract preserved | 0 |
| `wavExport.js` | **No changes** — contract preserved | 0 |

## Files Already Complete (No Changes Needed)

| File | Purpose |
|------|---------|
| `mgen/src/interfaces.js` | 8 data classes |
| `mgen/src/orchestrator.js` | CompositionOrchestrator |
| `mgen/src/progressBridge.js` | Full bridge (preprocess, convert, map) |
| `mgen/src/passes/passA-E.js` | 5-pass pipeline |
| `mgen/src/engines/*` | 7 engines (Rhythm, Motif, Style, Phrase, Microtonal, Expectation, VoiceLeading) |
| `mgen/tests/` | 361 passing tests |

---

## Conclusion

**mgen is ready to be wired in as an alternative user-selectable melody generator engine for Progress.** The core infrastructure is complete, tested, and performant. The missing features (countermelody, song form, dynamic scale center, evolutionary rhythm, surprise system, musical nuances) are well-documented in `comparison.md` section 8 with estimated effort for porting.

The recommended path is to wire in mgen **now** with a clear feature gap notice, enabling real-world testing and informed prioritization of which missing features matter most to users.

The existing plan (documented across `comparison.md`, `melodygen_progress_bridge.md`, `melodygen_architecture.md`, `melodygen_design_patterns.md`, `ProgressMelodyRefactor.md`, `CURRENT_FOCUS.md`, and `BRIDGE_UPDATE_PLAN.md`) was comprehensive but did not include the specific wiring steps for integrating mgen as a user-selectable alternative. This document fills that gap with concrete implementation steps, risk assessment, and a prioritized task list.
