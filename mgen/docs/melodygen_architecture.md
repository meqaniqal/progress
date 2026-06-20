# Melody Generator v2 Architecture Specification
This document defines architecture.

The original Melody Generator roadmap in melodygen_design_patterns remains the authoritative source for musical behaviors, compositional heuristics, listener-psychology concepts, and future quality improvements. Other future-related research and ideas are in the document: melodygen_future_melody_options_and_bibliography.md

When implementing individual engines, consult both documents.

## Core Objective

The purpose of melody generation is not to generate notes.

The purpose of melody generation is to manage listener expectations across multiple hierarchical time scales.

Notes are the surface realization of deeper musical structures.

The generator should therefore operate on musical intent rather than local note selection.

---

# Architectural Principles

## 1. Hierarchical Generation

Generation proceeds from high-level musical meaning toward low-level realization.

```text
Narrative Intent
    ↓
Phrase Structure
    ↓
Motif Development
    ↓
Expectation Planning
    ↓
Structural Notes
    ↓
Connective Notes
    ↓
Ornaments
```

Each layer constrains the layers below it.

Lower layers may not violate higher-level decisions.

---

## 2. Composable Task Architecture

Every major subsystem is implemented as an independent task.

Each task exposes:

```text
Inputs
Parameters
Outputs
Evaluation Metrics
```

Tasks may be evaluated independently.

Tasks may be regenerated independently.

Tasks communicate through explicit outputs rather than hidden state.

---

## 3. Iterative Refinement

Generation is not a single-pass process.

The architecture supports:

```text
Generate
Evaluate
Refine
Re-evaluate
```

Only failing subsystems should be regenerated.

Successful subsystems should be preserved.

---

# Core System Model

The generator consists of six musical engines coordinated by a central orchestrator.

```text
CompositionOrchestrator

    ├── PhraseEngine
    ├── MotifEngine
    ├── ExpectationEngine
    ├── VoiceLeadingEngine
    ├── StyleEngine
    └── MicrotonalEngine
```

The orchestrator manages execution order, evaluation metrics, and selective regeneration.

---

# Phrase Engine

## Responsibility

Generate large-scale phrase structure.

Outputs:

```text
Phrase Roles
Tension Curve
Register Curve
Cadence Plan
Climax Plan
```

Phrase roles include:

```text
Statement
Build
Climax
Release
Resolution
```

The phrase engine determines:

* where the climax occurs
* how tension evolves
* register trajectory
* cadence behavior

before any pitches are selected.

---

# Motif Engine

## Responsibility

Maintain melodic identity.

The motif engine generates and manages motif families.

Motifs are never discarded.

They are transformed.

Supported transformations:

```text
Transposition
Sequence
Inversion
Retrograde
Augmentation
Diminution
Expansion
Compression
Fragmentation
Ornamentation
Combination
```

Motif development should follow developing-variation principles:

```text
recognizable
but never static
```

The listener should perceive continuity across phrases.

---

# Expectation Engine

## Responsibility

Model listener predictions.

The generator tracks expectations at multiple scales.

```text
Pitch Expectation
Motif Expectation
Phrase Expectation
Form Expectation
Style Expectation
```

Expectation operations:

```text
Confirmation
Delay
Deflection
Payoff
```

Musical interest emerges from controlled management of expectations.

The objective is neither complete predictability nor complete surprise.

The objective is meaningful anticipation and resolution.

---

# Voice-Leading Engine

## Responsibility

Maintain perceptually coherent motion.

Voice leading operates on trajectories rather than isolated intervals.

Interval classes:

```text
Step
Skip
Leap
```

Large motions generate compensatory expectations.

Examples:

```text
Leap Up
    → Step Down

Leap Down
    → Step Up
```

Momentum tracking prevents runaway motion.

Voice leading should support phrase goals rather than compete with them.

---

# Style Engine

## Responsibility

Apply stylistic behavior.

Style does not control composition.

Style modifies realization.

Style may influence:

```text
Motif Vocabulary
Phrase Grammar
Ornament Vocabulary
Rhythmic Language
Contour Preferences
Cadence Preferences
```

Core composition logic remains genre-independent.

Genre systems operate as overlays.

---

# Microtonal Engine

## Responsibility

Maintain tuning-system correctness.

All pitch logic must be tuning-independent.

No assumptions about:

```text
12 EDO
7-note scales
12-semitone octaves
```

Core abstractions:

```text
periodSize
divisions
scaleDegrees
stepSize
```

All pitch operations must derive from these abstractions.

Microtonality is a foundational capability rather than a special case.

---

# Five-Pass Generation Pipeline

Generation proceeds through five strictly separated passes.

## Pass A — Structural Skeleton

Generate primary structural notes.

This defines melodic identity.

---

## Pass B — Cadence Layer

Generate phrase endings and structural resolutions.

---

## Pass C — Connector Layer

Generate connective motion between structural points.

---

## Pass D — Ornament Layer

Generate stylistic decoration.

Ornaments may not alter structure.

---

## Pass E — Expectation Refinement

Evaluate expectation behavior.

Correct:

* unresolved leaps
* weak payoffs
* excessive predictability
* excessive randomness

---

# Evaluation Framework

Every subsystem exposes evaluation metrics.

Categories:

```text
Narrative Quality
Motif Coherence
Expectation Management
Voice-Leading Quality
Genre Authenticity
Microtonal Correctness
Global Coherence
```

Metrics are used for:

```text
Candidate Selection
Selective Regeneration
Adaptive Optimization
Future Learning Systems
```

Evaluation exists to improve musical outcomes.

Evaluation is not the objective.

---

# Musical Success Criteria

A successful melody demonstrates:

## Structural Coherence

The melody feels intentionally shaped.

## Motivic Coherence

Ideas are remembered and developed.

## Expectation Management

Predictions are created and meaningfully resolved.

## Voice-Leading Coherence

Motion feels natural and connected.

## Stylistic Authenticity

The melody reflects the intended musical language.

## Microtonal Integrity

The melody behaves correctly in arbitrary tuning systems.

## Narrative Satisfaction

The melody feels like a musical story rather than a sequence of notes.

---

# Future Extensions

Future systems should integrate through existing architectural boundaries.

Examples:

```text
Statistical Expectation Models
IDyOM
Music Transformer Components
Schenkerian Planning
Emotional Trajectory Planning
Adaptive Tension Models
Microtiming Systems
```

These should extend existing engines rather than introduce parallel architectures.

---

# Final Design Principle

The generator should not ask:

"What note comes next?"

It should ask:

"What is the listener expecting now?"

And ultimately:

"What musical story is the listener beginning to believe?"

---

# Implementation Notes (Phase 10)

The following engines have been implemented as of 2026-06-19. This section documents what was built, how it differs from the original design, and why.

## PhraseEngine — Rewritten (Not Extended)

**Original design (above, lines 107-142):** PhraseEngine was described as a high-level phrase structure generator that outputs phrase roles, tension curve, register curve, cadence plan, and climax plan *before* any pitches are selected. The description was abstract — it did not specify how phrase roles were determined, how climax position was computed, or how register constraints were enforced.

**What was built:** PhraseEngine was completely rewritten (~600 lines) to be a PhraseArcPlanner + PhraseGrammar combined engine. Key changes:

1. **Phrase roles are no longer assigned by index position.** The original design implied roles (statement, build, climax, release, resolution) would be assigned sequentially. The implementation computes climax position per `macroContourArchetype` (6 archetypes: classical, popLate, jazz, progressive, ambient, valley), then assigns roles based on distance to climax. This matches the design's intent but makes it operational.

2. **Register envelope constraints per slot.** The implementation computes `registerFloor` and `registerCeiling` per chord slot based on the PhraseArcPlanner's `registers[]` array. This enforces the "single highest note at climax" principle — a hallmark of professional melody writing — by constraining pitch selection within each slot's register envelope.

3. **PhraseGrammar system integrated.** The implementation includes a PhraseGrammar subsystem that selects structural relationship types (call/response, question/answer, statement/expansion, contrast/return, developing variation) based on genre and phrase count. This was described in `melodygen_design_patterns.md` Phase 2.2 as a separate file (`melodyPhraseGrammar.js`) but was merged into PhraseEngine for cohesion.

4. **Antecedent-consequent fixed.** The original design (Phase 2) mentioned antecedent-consequent phrase pairs but did not specify how consequent phrases should be generated. The implementation uses actual musical transformations (transposition, interval compression, resolution to tonic) rather than arbitrary ±2/-1 pitch shifts.

5. **Climax archetypes (6 types) integrated.** The design docs (Phase 6) described 6 climax archetypes as a separate phase. The implementation integrates them directly into PhraseEngine's `computePhraseArc()` method, as they are fundamental to phrase structure, not a separate concern.

## ExpectationEngine — Implemented as Post-Processing Engine

**Original design (above, lines 183-213):** ExpectationEngine was described as modeling listener predictions at multiple scales (pitch, motif, phrase, form, style) with four operations (confirmation, delay, deflection, payoff). The design placed it as "Pass 5" after the 5 passes.

**What was built:** ExpectationEngine (~350 lines) was implemented as a **post-processing engine** that runs after all 5 passes + Pass E, not as Pass 5 itself. Key changes:

1. **Not a pass — an engine.** The design placed ExpectationEngine as "Pass 5" (after Pass D ornaments). The implementation registers it as a post-processing engine (like StyleEngine, MotifEngine, etc.) that reviews the complete melody after all structural passes are done. This is because expectation analysis requires the *complete* melody context, not just the output of Pass D.

2. **ListenerExpectation state object.** The implementation includes a `ListenerExpectation` state object tracking: `expectedPitch`, `expectedRhythm`, `expectedRegister`, `expectedResolution`, `expectationStrength`, and `priorContour` (last 4 pitch directions). This matches the design's `melodyExpectation.js` concept from `melodygen_design_patterns.md` Phase 3.5.

3. **Four operations implemented.** `confirmation`, `delay`, `deflection`, and `payoff` are all implemented as pitch adjustment operations. The implementation adds `refineForExpectation()` which scans for unresolved promises (big leaps with no step-back), ensures phrase-final notes are payoffs, and prevents 3+ consecutive confirmations without a delay/deflection.

4. **Returns all notes, not just changed ones.** Unlike the current Pass E (which returns only modified notes), ExpectationEngine returns the full note set with modified notes marked in metadata. This is critical for pipeline integrity — downstream passes need to see all notes, not a subset.

## VoiceLeadingEngine — Implemented as Post-Processing Engine

**Original design (above, lines 216-247):** VoiceLeadingEngine was described as maintaining perceptually coherent motion through trajectories, with interval classes (step, skip, leap), compensatory expectations (leap up → step down), and momentum tracking. The design placed it as "Phase 5" — a separate phase after the five-pass pipeline.

**What was built:** VoiceLeadingEngine (~300 lines) was implemented as a **post-processing engine** that runs after all 5 passes + Pass E + ExpectationEngine. Key changes:

1. **Not Phase 5 — a post-processing engine.** The design placed VoiceLeadingEngine as "Phase 5" (a later priority). The implementation registers it as a post-processing engine that reviews the complete melody and adjusts pitches where voice-leading rules are violated. This is because voice-leading analysis requires the *complete* melody context, not just the output of earlier passes.

2. **Interval classification.** `classifyInterval(fromPitch, toPitch, stepSize)` returns `{ dir, size: 'step'|'skip'|'leap', semitones }`. This matches the design's interval classes.

3. **Trajectory rules.** `TRAJECTORY_RULES` maps interval direction to preferred counter-direction: leap up → step down (weight 0.75), leap down → step up (weight 0.75), skip up → step down (weight 0.60), skip down → step up (weight 0.60), step same → step (weight 0.50). This matches the design's `TRAJECTORY_RULES` from `melodygen_design_patterns.md` Phase 5.

4. **Momentum tracking.** If the last 4 steps all move in the same direction, the engine forces a turn. This prevents runaway motion.

5. **Leap compensation.** Large leaps (>7 semitones) must be followed by counter-directional stepwise motion. This is the core voice-leading rule from the design.

6. **Also fixes StyleEngine.** The implementation fixes `StyleEngine._findPreviousNote()` to actually find the previous note from the sorted notes array (passed via context). This was a bug — the method always returned null, meaning StyleEngine's interval constraints were never applied.

## Pass E — Fixed to Return All Notes

**Original design (lines 15-137, current Pass E):** Pass E (ExpectationRefiner) was a lightweight call-response checker that only returns notes with pitch changes. This means downstream passes see an incomplete note list.

**What was changed:** Pass E now returns **all notes** (not just changed ones). Modified notes are marked with `metadata.passEAdjusted = true`. This is critical for pipeline integrity — the deduplication step in the orchestrator needs to see all notes to resolve conflicts correctly.

## RhythmEngine — Determinism Fix

**Bug fixed:** `_regenerateProfileForGenre()` was called on every execution, producing different subdivision profiles each time for the same genre. The fix caches the profile per genre and only regenerates when the genre changes.

## Integration Summary

| Engine | Original Plan | Implementation | Registered As |
|--------|---|---|---|
| PhraseEngine | Abstract "phrase structure" | Rewritten as PhraseArcPlanner + PhraseGrammar | Pass (via registerPass) |
| ExpectationEngine | "Pass 5" after Pass D | Post-processing engine (after all passes) | Engine (via registerPass) |
| VoiceLeadingEngine | "Phase 5" (later priority) | Post-processing engine (after all passes) | Engine (via registerPass) |
| Pass E | "Changed notes only" | Returns all notes (modified ones marked) | Pass (unchanged registration) |
| StyleEngine | Interval constraints | Fixed `_findPreviousNote()` to work | Pass (unchanged) |
| RhythmEngine | Subdivision profiles | Cached per genre for determinism | Pass (unchanged) |

The original design descriptions above this section remain the authoritative vision. The implementation notes below document what was actually built and why it diverged.
