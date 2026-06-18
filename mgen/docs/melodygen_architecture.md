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
