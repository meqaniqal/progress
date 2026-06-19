# Melody Generator Comparison: Progress (Current) vs. mgen (Planned Replacement)

## 1. Executive Summary

This document compares two melody generation systems within the Progress ecosystem:

- **Progress (Current)** — The real-time, beat-by-beat stochastic generator used in the live application (`melodyGenerator.js`, ~2195 lines). It generates melody slot-by-slot as the sequencer plays, maintaining mutable module-level state across iterations.

- **mgen (Planned)** — An isolated, hierarchical, 5-pass compositional pipeline (`mgen/src/`, ~3000+ lines across 15+ files). It is designed to eventually replace the current generator with a top-down, pass-based architecture.

Both systems share the same core philosophy: *"The purpose of melody generation is not to generate notes. The purpose of melody generation is to manage listener expectations across multiple hierarchical time scales."*

---

## 2. Architectural Comparison

### 2.1 Generation Model

| Aspect | Progress (Current) | mgen (Planned) |
|--------|-------------------|----------------|
| **Model** | Bottom-up, slot-by-slot, stochastic | Top-down, 5-pass pipeline, deterministic skeleton |
| **Entry Point** | `scheduleMelody()` called per chord slot | `CompositionOrchestrator.execute(config)` called once per progression |
| **State Management** | Mutable module-level variables (20+ global state variables) | Immutable `GenerationConfig` → `MelodyResult` pipeline |
| **Execution** | Real-time, called during playback | Batch, called once, results cached |
| **Passes** | Single monolithic function with ~20 internal phases | 5 distinct passes + 5 post-processing engines |
| **Regeneration** | N/A (single pass, no retry) | Up to 3 regeneration attempts per pass on failure |

### 2.2 Code Organization

**Progress (Current):**
```
melodyGenerator.js        (~2195 lines, single function)
melodyTuning.js           (~389 lines, scale/pitch logic)
melodyMotifs.js           (~293 lines, motif families)
melodyRhythm.js           (~69 lines, rhythm templates)
melodyGenreRules.js       (~67 lines, genre/ornament rules)
```

**mgen:**
```
src/interfaces.js         (163 lines, 8 data classes)
src/orchestrator.js       (291 lines, pipeline coordinator)
src/progressBridge.js     (565 lines, Progress app bridge)
src/passes/passA_structural.js  (368 lines)
src/passes/passB_cadence.js     (265 lines)
src/passes/passC_connector.js   (152 lines)
src/passes/passD_ornament.js    (216 lines)
src/passes/passE_expectation.js (137 lines)
src/engines/RhythmEngine.js   (528 lines)
src/engines/MotifEngine.js    (476 lines)
src/engines/StyleEngine.js    (427 lines)
src/engines/PhraseEngine.js   (393 lines)
src/engines/MicrotonalEngine.js (373 lines)
```

### 2.3 Data Flow

**Progress (Current):**
```
Chord slot → scheduleMelody() → [20+ internal phases] → playToneFn()
                    ↑
            Mutable global state (motifCache, macroTargetPlan,
            songFormSection, narrativeState, etc.)
```

**mgen:**
```
GenerationConfig (chords + phraseContext + options)
    │
    ├─ PassA: StructuralPlanner  → structural skeleton notes
    ├─ PassB: CadencePlanner     → cadence/phrase endings
    ├─ PassC: ConnectorPlanner   → connective motion
    ├─ PassD: OrnamentPlanner    → grace notes, trills, turns
    ├─ PassE: ExpectationRefiner → call-response refinement
    │
    ├─ RhythmEngine   (density, subdivision)
    ├─ MotifEngine    (transformations)
    ├─ StyleEngine    (genre rules)
    ├─ PhraseEngine   (phrase grouping)
    ├─ MicrotonalEngine (tuning conversion)
    │
    └─ MelodyResult (allNotes + metadata)
```

---

## 3. Generation Method Analysis

### 3.1 Progress (Current) — Slot-by-Slot Stochastic Generation

**How it works:**
`scheduleMelody()` is called for each chord slot during playback. Within a single invocation (~2000 lines of code), it executes approximately 20 internal phases:

1. **Settings check** — enabled, behavior during arpeggiator/transitions
2. **Tuning resolution** — EDO divisions, periodSize, keyRoot
3. **Macro contour planning** — arch/valley/staircase targets (optional)
4. **Phrase-level aesthetic mode selection** — cantabile/declamatory/sighs/virtuoso
5. **Countermelody direction planning** — contrary/harmonize/call-response
6. **Multi-parameter tension curve automation** — density, ornament probability, rest probability
7. **Scale construction** — global scale + dynamic local chord-scale selection
8. **Pitch pool building** — pruned for chromatic clashes
9. **SongFormCoordinator** — A/B/A' section management with motif recall
10. **Motif family generation/caching** — hook, connector, cadence cells
11. **Anchor planning (Phase A)** — bar-by-bar constrained pitch targets
12. **Rhythm template generation (Phase B)** — 16-step sixteenth-note grid
13. **Grid generation (beat-by-beat subdivision)**
14. **Pitch selection per grid step (Phase C)** — anchor snapping, foreshadowing, connective fill, genre rules, leap resolution, downbeat enforcement, isolated note snapping
15. **Countermelody generation** — contrary/harmonize/call-response modes
16. **Motivic flexing** — passing tone insertion
17. **Empty slot mitigation** — fallback notes
18. **Resolution rules** — consequent phrase ends on root/3rd
19. **Playback** — via `playToneFn`

**Strengths:**
- **Real-time ready** — Called per-slot during playback, no batch overhead
- **Context-aware per-slot** — Has access to `prevChordObj`, `nextChordObj`, `voiceEvents`, `chordPattern` instances/transitions
- **Rich countermelody system** — Three modes (contrary, harmonize, call-response) with direction memory and no-return guards
- **Song form coordination** — A/B/A' section management with motif recall and transposition
- **Dynamic scale center** — Local chord-scale selection with overlap compatibility checking
- **Microtonal support** — 12, 19, 22, 31, 72 EDO divisions with custom scale overrides
- **Genre-specific behavior** — Jazz/blues chromaticism, 4 aesthetic modes (cantabile, declamatory, sighs, virtuoso)
- **Rich ornamentation** — Grace notes, bends, motivic flexing (passing tone insertion)
- **Evolutionary rhythm** — Templates evolve across phrases (15% full regenerate, 45% evolve, 40% stable)
- **Surprise system** — Configurable surprise probability for unexpected events
- **Mature and tested** — 12 passing unit tests, used in production

**Weaknesses:**
- **Monolithic function** — ~2195 lines in a single function, extremely difficult to modify or extend
- **Mutable global state** — 20+ module-level variables (`motifCache`, `macroTargetPlan`, `songFormSection`, `narrativeState`, etc.) create hidden coupling and make testing/debugging difficult
- **No regeneration/retry** — Single pass; if a slot produces poor output, there is no retry mechanism
- **Hard to reason about** — The interaction between 20+ phases within a single function makes it difficult to predict or control output
- **No evaluation metrics** — No quality scoring or pass/fail thresholds
- **Tight coupling to Progress app** — Direct imports from `./store.js`, `./theory.js`, `./synth.js`; cannot be used standalone
- **No composability** — Cannot reuse individual passes or engines independently
- **Debugging difficulty** — Tracing why a specific note was chosen requires understanding the entire 2000-line function

### 3.2 mgen — Hierarchical 5-Pass Pipeline

**How it works:**
`CompositionOrchestrator.execute(config)` receives a `GenerationConfig` and runs 5 sequential passes, each building on accumulated notes from previous passes:

1. **PassA — StructuralPlanner** — Selects chord tones (root, 3rd, 5th, 7th) based on phrase role (statement→root/3rd, build→5th/7th, climax→highest, release→tonic approach, resolution→tonic). Applies voice-leading constraints (maxLeap default 12 semitones).

2. **PassB — CadencePlanner** — Identifies cadence points (last chord, dominant chords for half-cadences). Generates phrase endings: antecedent phrases end on dominant, consequent phrases resolve to tonic.

3. **PassC — ConnectorPlanner** — Fills gaps between structural/cadence notes using stepwise (70%), skip (20%), or leap (10%) motion. Generates 0-4 connector notes per gap.

4. **PassD — OrnamentPlanner** — With `ornamentDensity` (default 0.3) probability, generates grace notes, trills (4 notes), turns (4 notes), or appoggiaturas (2 notes). Skips connectors.

5. **PassE — ExpectationRefiner** — Analyzes call-response pairs (structural/cadence notes within windowSize default 32). If response pitch is >12 semitones from call, adjusts response to stay within range. Only returns notes that were actually modified.

**Post-processing engines (optional, applied after pipeline):**
- **RhythmEngine** — 16-step sixteenth-note grid templates, subdivision profiles, density control, 4 aesthetic modes
- **MotifEngine** — Motif family extraction, 6 transformation types (transposition, sequence, inversion, retrograde, augmentation, diminution)
- **StyleEngine** — 4 style profiles (baroque, classical, jazz, pop) with genre-specific rules
- **PhraseEngine** — Phrase grouping, antecedent-consequent patterns, role assignment
- **MicrotonalEngine** — 4 tuning systems (12tet, quartertone, just intonation, pythagorean)

**Strengths:**
- **Composable architecture** — Each pass is an independent class with explicit Inputs, Parameters, Outputs, and Evaluation Metrics
- **Selective regeneration** — Failed passes (score < 0.5 threshold) trigger up to 3 regeneration attempts
- **Evaluation metrics** — Every pass returns a score (0.0-1.0) with issue descriptions
- **Role-based priority** — Deduplication by startTime with priority: structural(5) > cadence(4) > connector(3) > ornament(2) > expectation(1)
- **Tuning independence** — Core generation is 12-EDO-agnostic; microtonality is a post-processing layer
- **Performance** — Full pipeline ~2-4ms end-to-end (6 chords → ~97 sliced chords → ~34 accumulated notes → ~11 final melody), well under 16ms/frame realtime budget
- **No external dependencies** — Beyond Jest for testing
- **361 passing Jest tests** — Comprehensive test coverage across all passes and engines
- **Explicit data model** — 8 well-defined classes (`MelodyNote`, `Chord`, `PhraseContext`, `EvaluationMetrics`, `PassResult`, `MelodyResult`, `GenerationConfig`, `MelodyTask`)
- **Bridge layer** — `progressBridge.js` converts Progress app multi-track data to/from MelodyGen format
- **Extensible** — New passes can be registered via `orchestrator.registerPass(task)`

**Weaknesses:**
- **Not integrated with Progress app** — Currently standalone; no connection to `store.js`, `theory.js`, or `synth.js`
- **PassE produces very few notes** — Only returns notes with pitch changes; often produces 0-2 notes, making it nearly useless in practice
- **Regeneration almost never fires** — Score threshold is 0.5, every pass produces notes (score stays 0.7-1.0); the 3x regeneration loop is effectively dead code
- **No countermelody system** — Countermelody generation is not implemented
- **No song form coordination** — A/B/A' section management with motif recall is not implemented
- **No dynamic scale center** — Local chord-scale selection with overlap checking is not implemented
- **No evolutionary rhythm** — Templates do not evolve across phrases
- **No surprise system** — No configurable surprise probability
- **Pre-processing is the primary bottleneck** — `preprocessProgressData` slices 6 chords into ~97 event-boundary chords (from bass/drum pattern hits), taking ~1-2ms. Caching recommended.
- **All async execute() methods are synchronous internally** — The `await` wrappers add micro-overhead but no actual async I/O
- **Less musical nuance** — The current generator has ~20 phases of musical nuance (foreshadowing, isolated note snapping, bass note doubling avoidance, dialogue split boundaries, etc.) that mgen does not yet replicate
- **No genre-specific ornament vocabulary** — Jazz/blues chromaticism, bends, and genre-specific ornamentation are not implemented in mgen passes

---

## 4. Feature-by-Feature Comparison

| Feature | Progress (Current) | mgen (Planned) | Notes |
|---------|-------------------|----------------|-------|
| **5-pass pipeline** | No (single function) | Yes (5 passes) | mgen's core architectural advantage |
| **Selective regeneration** | No | Yes (3 attempts) | Currently dead code (scores always pass) |
| **Evaluation metrics** | No | Yes (score 0-1, issues) | mgen advantage |
| **Role-based deduplication** | No | Yes (5 priority levels) | mgen advantage |
| **Tuning independence** | Partial (12-EDO assumptions) | Yes (12/19/24/31/72 EDO) | mgen advantage |
| **4 tuning systems** | 12/19/24/31/72 EDO | 12tet/quartertone/just/pythagorean | Both support multi-EDO |
| **4 aesthetic modes** | Yes (cantabile/declamatory/sighs/virtuoso) | Yes (RhythmEngine) | Feature parity |
| **4 style profiles** | No | Yes (baroque/classical/jazz/pop) | mgen advantage |
| **Motif families** | Yes (hook/connector/cadence) | Yes (MotifEngine) | Different implementation |
| **Motif transformations** | 3 (inversion/retrograde/sequence) | 6 (transposition/sequence/inversion/retrograde/augmentation/diminution) | mgen advantage |
| **Motif caching** | Yes (motifCache by keyString) | No | Progress advantage |
| **Song form (A/B/A')** | Yes (full section management) | No | Progress advantage |
| **Countermelody** | Yes (3 modes, direction memory) | No | Progress advantage |
| **Dynamic scale center** | Yes (local chord-scale) | No | Progress advantage |
| **Microtonal support** | Yes (12/19/22/31/72 EDO) | Yes (4 tuning systems) | Feature parity |
| **Genre rules** | Yes (jazz/blues chromaticism) | Partial (StyleEngine rules) | Progress more nuanced |
| **Ornamentation** | Grace notes, bends, flexing | Grace notes, trills, turns, appoggiaturas | Different ornament vocabularies |
| **Evolutionary rhythm** | Yes (15/45/40% regenerate/evolve/stable) | No (static templates) | Progress advantage |
| **Surprise system** | Yes (configurable probability) | No | Progress advantage |
| **Foreshadowing** | Yes (next chord targeting) | No | Progress advantage |
| **Isolated note snapping** | Yes | No | Progress advantage |
| **Bass note doubling avoidance** | Yes | No | Progress advantage |
| **Dialogue split boundaries** | Yes (from chordPattern) | No | Progress advantage |
| **Macro contour planning** | Yes (arch/valley/staircase/launch) | Partial (PhraseContext.tensionLevel) | Progress more detailed |
| **Phrase roles** | statement/build/climax/release/resolution | statement/build/climax/release/resolution | Feature parity |
| **Real-time ready** | Yes (per-slot) | Yes (batch, ~2-4ms) | Both viable |
| **Integration with Progress** | Full (store.js, theory.js, synth.js) | Bridge layer only | Progress advantage |
| **Test coverage** | 12 tests | 361 tests | mgen advantage |
| **Code maintainability** | Poor (2195-line function) | Good (modular classes) | mgen advantage |
| **Extensibility** | Poor (monolithic) | Good (registerPass) | mgen advantage |

---

## 5. Strengths and Weaknesses Summary

### Progress (Current) — Strengths
1. **Production-ready** — Used in the live application, handles real-world chord progressions
2. **Rich musical nuance** — ~20 phases of musical decision-making with genre-specific behavior
3. **Countermelody system** — Three modes with direction memory, no-return guards, register separation
4. **Song form coordination** — A/B/A' section management with motif recall and transposition
5. **Dynamic scale center** — Local chord-scale selection with overlap compatibility checking
6. **Evolutionary rhythm** — Templates evolve across phrases for natural-sounding variation
7. **Surprise system** — Configurable probability for unexpected musical events
8. **Full Progress integration** — Direct access to store, theory, and synth modules
9. **Microtonal correctness** — Supports 12, 19, 22, 31, 72 EDO with custom scale overrides

### Progress (Current) — Weaknesses
1. **Monolithic function** — ~2195 lines, extremely difficult to modify
2. **Mutable global state** — 20+ module-level variables create hidden coupling
3. **No regeneration** — Single pass, no retry mechanism
4. **No evaluation metrics** — No quality scoring
5. **Tight coupling** — Cannot be used standalone or reused independently
6. **Debugging difficulty** — Tracing note selection requires understanding entire function

### mgen — Strengths
1. **Composable architecture** — Each pass is independent with explicit I/O contracts
2. **Evaluation metrics** — Every pass returns quality scores and issue descriptions
3. **Selective regeneration** — Failed passes trigger retry (though rarely needed in practice)
4. **Role-based priority** — Clean deduplication with 5 priority levels
5. **Tuning independence** — Core generation is 12-EDO-agnostic
6. **Performance** — ~2-4ms end-to-end, well under realtime budget
7. **No external dependencies** — Standalone, testable, reusable
8. **361 passing tests** — Comprehensive test coverage
9. **Explicit data model** — 8 well-defined classes with clear responsibilities
10. **Extensible** — New passes registered via `registerPass()`

### mgen — Weaknesses
1. **Not integrated with Progress** — No connection to store.js, theory.js, or synth.js
2. **PassE nearly useless** — Only returns modified notes (often 0-2)
3. **Regeneration dead code** — Scores always pass threshold; retry never fires
4. **No countermelody** — Missing one of Progress's key features
5. **No song form** — No A/B/A' section management
6. **No dynamic scale center** — No local chord-scale selection
7. **No evolutionary rhythm** — Static templates only
8. **No surprise system** — No unexpected musical events
9. **Less musical nuance** — Missing foreshadowing, isolated note snapping, bass doubling avoidance, dialogue splits
10. **Pre-processing bottleneck** — `preprocessProgressData` takes ~1-2ms; caching recommended

---

## 6. Recommendations for Improving Both Engines

### 6.1 Improving Progress (Current)

1. **Extract passes from the monolithic function** — Break `scheduleMelody()` into independent pass classes matching mgen's architecture. This would preserve real-time capability while improving maintainability.

2. **Replace mutable global state with explicit state objects** — Instead of 20+ module-level variables, pass state explicitly between passes. This would eliminate hidden coupling and make testing feasible.

3. **Add evaluation metrics** — Implement quality scoring for each slot's output. This would enable self-correction and quality monitoring.

4. **Add regeneration/retry** — If a slot's output scores below a threshold, regenerate with different parameters. This would improve output quality.

5. **Document the 20 internal phases** — The current generator has extensive undocumented logic. Documenting each phase would make maintenance and extension feasible.

6. **Reduce coupling to Progress app** — Extract music theory logic into standalone modules (as mgen's `interfaces.js` does) to enable testing and reuse.

### 6.2 Improving mgen

1. **Integrate Progress's countermelody system** — Port the countermelody generation (3 modes, direction memory, no-return guards) as a new pass or post-processing engine.

2. **Integrate song form coordination** — Port A/B/A' section management with motif recall and transposition as a PhraseEngine enhancement.

3. **Add dynamic scale center** — Implement local chord-scale selection with overlap compatibility checking as a pre-processing step.

4. **Add evolutionary rhythm** — Implement template evolution (15% regenerate, 45% evolve, 40% stable) in RhythmEngine.

5. **Add surprise system** — Implement configurable surprise probability as a post-processing pass.

6. **Fix PassE** — Instead of only returning modified notes, return all notes with refinement metadata. Or repurpose PassE for a different function (e.g., global coherence check).

7. **Fix regeneration** — Lower the score threshold or add more meaningful quality criteria so regeneration actually fires when needed.

8. **Add Progress's musical nuances** — Port foreshadowing, isolated note snapping, bass note doubling avoidance, and dialogue split boundaries as new passes or enhancements.

9. **Cache sliced chords** — Implement caching in `preprocessProgressData` to eliminate the ~1-2ms pre-processing bottleneck.

10. **Remove async wrappers** — All `async execute()` methods are synchronous internally. Removing `await` wrappers would eliminate micro-overhead.

11. **Add genre-specific ornament vocabulary** — Port jazz/blues chromaticism, bends, and genre-specific ornamentation from Progress's `melodyGenreRules.js`.

### 6.3 Hybrid Approach (Recommended)

The optimal path forward is a **hybrid integration** that combines Progress's musical richness with mgen's architectural cleanliness:

1. **Extract Progress's musical logic into pass classes** — Create `StructuralPass`, `CadencePass`, `ConnectorPass`, etc. from the existing `scheduleMelody()` phases. This preserves all current musical behavior while gaining composability.

2. **Use mgen's orchestrator as the coordination layer** — Replace the monolithic function with `CompositionOrchestrator` that registers Progress-derived passes.

3. **Keep Progress's real-time calling pattern** — Instead of batch generation, call the orchestrator per-slot (or per-phrase) during playback, maintaining real-time capability.

4. **Replace mutable global state with explicit state objects** — Pass state between passes rather than using module-level variables.

5. **Add evaluation metrics and regeneration** — Use mgen's existing infrastructure to score and retry poor outputs.

6. **Maintain Progress's integration** — Keep the bridge to `store.js`, `theory.js`, and `synth.js` for live application use.

This approach would give the best of both worlds: Progress's musical depth and real-time capability, combined with mgen's composability, testability, and maintainability.

---

## 7. Decision Framework: Should You Continue mgen?

### Continue mgen if:
- You value **code maintainability** and **extensibility** over immediate feature parity
- You want to build a **long-term replacement** for the current generator
- You prefer **architectural cleanliness** and **testability**
- You are willing to invest time porting Progress's musical features into mgen's pass architecture
- You want a system that is **easy for other developers (or LLMs) to understand and modify**

### Continue with Progress (current) if:
- You need **immediate feature parity** with all current musical behaviors
- You prioritize **musical richness** over code architecture
- You do not want to invest in porting ~20 phases of musical logic into mgen
- You are satisfied with the current generator's output quality
- You do not plan to add new musical features frequently

### Recommended Path:
**Continue mgen with hybrid integration.** Port Progress's most important musical features (countermelody, song form, dynamic scale center, evolutionary rhythm) into mgen as new passes. Use mgen's architecture as the target state, but preserve Progress's musical behavior during the transition. This gives you a maintainable, extensible system that eventually replaces the current generator without losing any musical capability.

---

## 8. Implementation Priority for mgen Improvements

| Priority | Feature | Estimated Effort | Source (Progress) |
|----------|---------|-----------------|-------------------|
| P0 | Fix PassE (return all notes, not just modified) | Low | mgen/src/passes/passE_expectation.js |
| P0 | Lower score threshold / add meaningful criteria | Low | mgen/src/orchestrator.js |
| P1 | Countermelody pass | Medium | melodyGenerator.js (countermelody section) |
| P1 | Song form coordination | Medium | melodyGenerator.js (SongFormCoordinator) |
| P1 | Dynamic scale center | Medium | melodyTuning.js (getLocalScaleMode) |
| P2 | Evolutionary rhythm | Medium | melodyGenerator.js (rhythm evolution) |
| P2 | Surprise system | Low-Medium | melodyGenerator.js (surprise logic) |
| P2 | Foreshadowing | Low | melodyGenerator.js (getDistinctiveNextTone) |
| P3 | Bass note doubling avoidance | Low | melodyGenerator.js (activeBassMidi) |
| P3 | Genre-specific ornamentation | Medium | melodyGenreRules.js |
| P3 | Isolated note snapping | Low | melodyGenerator.js |
| P3 | Dialogue split boundaries | Low | melodyGenerator.js |
| P3 | Macro contour planning | Low-Medium | melodyTuning.js (planMacroMelodyTargets) |
| P4 | Cache sliced chords | Low | mgen/src/progressBridge.js |
| P4 | Remove async wrappers | Low | mgen/src/passes/*.js |

---

## 9. Appendix: Key File References

### Progress (Current)
- `melodyGenerator.js` — Main entry point, ~2195 lines
- `melodyTuning.js` — Scale construction, pitch selection, microtonal support, ~389 lines
- `melodyMotifs.js` — Motif family generation, transformations, ~293 lines
- `melodyRhythm.js` — Rhythm templates, subdivision profiles, ~69 lines
- `melodyGenreRules.js` — Genre-specific rules, ornaments, ~67 lines
- `melodyGenerator.test.js` — Unit tests, ~295 lines

### mgen
- `src/interfaces.js` — Core data model (8 classes), 163 lines
- `src/orchestrator.js` — CompositionOrchestrator, 291 lines
- `src/progressBridge.js` — Progress app bridge, 565 lines
- `src/passes/passA_structural.js` — StructuralPlanner, 368 lines
- `src/passes/passB_cadence.js` — CadencePlanner, 265 lines
- `src/passes/passC_connector.js` — ConnectorPlanner, 152 lines
- `src/passes/passD_ornament.js` — OrnamentPlanner, 216 lines
- `src/passes/passE_expectation.js` — ExpectationRefiner, 137 lines
- `src/engines/RhythmEngine.js` — RhythmEngine, 528 lines
- `src/engines/MotifEngine.js` — MotifEngine, 476 lines
- `src/engines/StyleEngine.js` — StyleEngine, 427 lines
- `src/engines/PhraseEngine.js` — PhraseEngine, 393 lines
- `src/engines/MicrotonalEngine.js` — MicrotonalEngine, 373 lines
- `tests/` — 361 Jest tests (all passing)

### Documentation
- `melodygen_architecture.md` — Core architecture spec (450 lines)
- `melodygen_design_patterns.md` — Master upgrade plan (1236 lines)
- `melodygen_current_implementation.md` — Implementation reference (988 lines)
- `melodygen_future_melody_options_and_bibliography.md` — Future research (214 lines)
- `mgen/AGENTS.md` — mgen architecture summary and gotchas
- `mgen/PROGRESS_DATA_ANALYSIS.md` — Progress-to-mgen data bridge (632 lines)
- `mgen/melodygen_progress_bridge.md` — Bridge documentation (507 lines)
