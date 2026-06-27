# MelodyGen Architecture Audit — Alignment with Linear Composable Model

## Executive Summary

MelodyGen's architecture is **already well-aligned** with your friend's linear composable model: it has distinct subcomponents (Pass A-E + 5 engines), each with Inputs/Parameters/Outputs/Evaluation Metrics, orchestrated by a central `CompositionOrchestrator` that evaluates results and selectively regenerates failing components. The core design philosophy matches — hierarchical generation from high-level intent to low-level realization, with iterative refinement based on evaluative differential error metrics. However, there are **three structural gaps** that prevent the model from fully realizing the friend's vision: (1) the post-processing engines run sequentially rather than as a coordinated feedback loop, (2) the evaluation metrics are pass-local rather than truly global, and (3) the "iterative looping mixture" concept is only partially implemented (feedback iterations exist but the differential error metrics between subcomponents are not computed). Below I detail what fits, what doesn't, and what could be improved.

---

## 1. WHAT FITS THE FRIEND'S MODEL

### 1.1 Distinct Subcomponents with Independent Processing

**Verified:** `orchestrator.js:38-49` (registerPass), `interfaces.js:145-156` (MelodyTask), all engine files.

Each pass and engine is a self-contained computational block with:
- **Inputs:** `config` (GenerationConfig), `previousNotes` (MelodyNote[])
- **Parameters:** Engine-specific options (density, leapThreshold, etc.)
- **Outputs:** `PassResult` with notes, metrics, context
- **Evaluation Metrics:** `EvaluationMetrics` with score, issues, passesThreshold

This directly implements the friend's requirement: *"you define the tasks and provide result evaluation metric tests that are part of the task definition model."*

### 1.2 Linear Sequential Execution

**Verified:** `orchestrator.js:96-147` (sequential pass loop).

The pipeline executes passes in a fixed order: PassA → PassB → PassC → PassD → PassE → RhythmEngine → PhraseEngine → ExpectationEngine → VoiceLeadingEngine. This is the "linear_engine that supports computation of distinct tasks" the friend describes.

### 1.3 Selective Regeneration Based on Evaluation

**Verified:** `orchestrator.js:116-126` (backtracking), `orchestrator.js:335-373` (_executePassWithRegeneration).

Each pass is evaluated against a threshold. If it fails, it can be regenerated up to `maxRegenerations` times. This implements the friend's concept: *"subcomponent related tasks should be re-evaluated with adjusted parameters."*

### 1.4 Feedback-Driven Parameter Adjustment

**Verified:** `orchestrator.js:304-325` (_applyFeedbackAdjustments).

When global evaluation detects issues (low pitch diversity, excessive leaps, weak harmonic responsiveness), the orchestrator adjusts config parameters and re-runs the pipeline. This implements the friend's "iterative looping mixture of computing various subcomponent tasks based on evaluative differential error metrics."

---

## 2. WHAT DOESN'T FULLY FIT — AND WHY IT MATTERS

### 2.1 Post-Processing Engines Run Sequentially, Not as a Coordinated Feedback Loop

**Verified:** `app.js:142-148` (PhraseEngine, ExpectationEngine, VoiceLeadingEngine registered as sequential passes).

**Current behavior:** PhraseEngine, ExpectationEngine, and VoiceLeadingEngine are registered as sequential passes in the orchestrator. They execute one after another in a single forward pass. If VoiceLeadingEngine adjusts a note, ExpectationEngine has already finished and won't re-evaluate.

**Why this undermines the model:** The friend's model envisions an "iterative looping mixture" where subcomponents can re-evaluate each other. Currently, once ExpectationEngine runs, its work is done — VoiceLeadingEngine can undo it. The friend's model would have these engines participate in a shared feedback loop where each engine's output is re-evaluated by the others.

**Suggested alignment:** Convert the post-processing engines from sequential passes into a **coordinated refinement loop** that runs 2-3 iterations, where each iteration has all three engines review and adjust the complete melody. This would implement the friend's "test parameter metric to evaluate the product produced by computing a task for relevant parameters to consider the goals of your intended result and the optimal compatibility with other task computed sub-results."

<!-- AUTHOR NOTE: I'm not sure I want a feedback loop between post-processing engines. The sequential order (Expectation → VoiceLeading) is intentional — expectation modeling should happen before voice-leading correction. But I see the value in having voice-leading adjustments feed back into expectation re-evaluation. Consider: run ExpectationEngine once, then loop VoiceLeadingEngine + ExpectationEngine together for 2 iterations. -->

### 2.2 Evaluation Metrics Are Pass-Local, Not Truly Global

**Verified:** `orchestrator.js:382-426` (_evaluatePass), `orchestrator.js:211-296` (_evaluateMelodyGlobally).

**Current behavior:** Each pass has its own evaluation (`_evaluatePass`), but the global evaluation (`_evaluateMelodyGlobally`) only checks 4 things: pitch diversity, uncompensated leaps, harmonic responsiveness, and motivic coherence. It does NOT evaluate:
- Whether PhraseEngine's register constraints are satisfied
- Whether MotifEngine's transformations preserved motivic identity
- Whether StyleEngine's genre rules are followed
- Whether RhythmEngine's density targets were met
- Cross-engine compatibility (e.g., does the rhythm template conflict with the phrase arc?)

**Why this undermines the model:** The friend's model requires that "the entire composed set of all tasks for evaluating the end result" be considered. Currently, the global evaluation is too shallow to drive meaningful parameter adjustments. The feedback loop in `_applyFeedbackAdjustments` only adjusts 5 parameters (pitchDiversityWeight, maxLeap, strictChordTones, density, pitchDiversityWeight) — it doesn't adjust phrase arc parameters, motif transformation probabilities, style weights, or rhythm template selections.

**Suggested alignment:** Expand the global evaluation to include per-engine compliance checks. For each engine, compute a subcomponent score that measures how well that engine's output satisfies its own design intent. Then the feedback loop can adjust parameters for the specific engine that's underperforming, not just generic melody-level parameters.

### 2.3 No Explicit "Composition of Subcomponents" Evaluation

**Verified:** `orchestrator.js:154-186` (assemble candidate melody).

**Current behavior:** After all passes complete, the orchestrator accumulates notes, deduplicates overlapping notes (keeping highest-priority role), snaps pitches to harmonic context, clamps durations, and evaluates globally. The "composition" step is essentially a merge + snap — there's no evaluation of whether the subcomponents *mesh well together* as the friend describes: *"if each subcomponent optimally meshes well with the other subcomponents in terms of frequency characteristics, key, and harmonic flow, then you have beautiful music."*

**Why this undermines the model:** The friend emphasizes that the value is in the **composition** of subcomponents, not just their individual quality. Currently, a pass can score 1.0 individually but produce notes that conflict with another pass's output (e.g., RhythmEngine drops a structural note that PassB_Cadence placed on the same beat). The deduplication step resolves this, but there's no evaluation of whether the resolution was musically satisfactory.

**Suggested alignment:** Add a "compatibility score" that measures how well the final composed melody satisfies cross-engine constraints. For example: do the rhythm-adjusted notes still land on structurally important beats? Do the voice-leading-adjusted pitches still satisfy the phrase arc's register constraints? This would be the "test metric results" the friend says should "decide which subcomponent related tasks should be re-evaluated with adjusted parameters."

---

## 3. WHAT COULD BE IMPROVED — SPECIFIC RECOMMENDATIONS

### 3.1 Add Per-Engine Subcomponent Evaluation

**File:** `orchestrator.js`

Add a `_evaluateSubcomponents(passResults)` method that computes:
- **PhraseEngine score:** Does the melody have a clear climax? Are register constraints satisfied?
- **MotifEngine score:** What percentage of notes are motif-identified? Are transformations musically valid?
- **StyleEngine score:** Are interval constraints respected? Are ornaments stylistically appropriate?
- **RhythmEngine score:** Does the actual density match the target? Are rhythm templates followed?
- **ExpectationEngine score:** Are unresolved leaps compensated? Are payoffs enforced?
- **VoiceLeadingEngine score:** Are leaps compensated? Is momentum tracked correctly?

This gives the feedback loop granular information about which subcomponents need rework.

### 3.2 Convert Post-Processing Engines to Iterative Refinement Loop

**File:** `orchestrator.js`

Instead of registering PhraseEngine, ExpectationEngine, and VoiceLeadingEngine as sequential passes, register them as a **refinement group** that loops:

```
Iteration 1: PhraseEngine → ExpectationEngine → VoiceLeadingEngine
Iteration 2: ExpectationEngine → VoiceLeadingEngine (PhraseEngine fixed)
Iteration 3: ExpectationEngine → VoiceLeadingEngine (if scores improved)
```

This implements the friend's "iteratively learn how to structure the flow of processing the tasks."

### 3.3 Add Cross-Engine Compatibility Metrics

**File:** `orchestrator.js`

Add a `_evaluateCompatibility(snappedNotes, passResults, config)` method that checks:
- Do rhythm-adjusted notes still align with phrase arc roles?
- Do voice-leading adjustments preserve motif identity?
- Do expectation adjustments respect style constraints?
- Are ornament notes rhythmically consistent with the template?

These metrics would drive more targeted parameter adjustments in the feedback loop.

### 3.4 Make the Feedback Loop Truly Differential

**File:** `orchestrator.js:304-325`

Currently `_applyFeedbackAdjustments` adjusts parameters in isolation. The friend's model envisions that the differential error between subcomponents drives the adjustment. For example:
- If PhraseEngine's register constraints conflict with VoiceLeadingEngine's leap compensation, the adjustment should resolve the conflict, not just reduce density.
- If MotifEngine's transformations create voice-leading violations, the adjustment should reduce transformation probability, not just increase pitch diversity.

This requires the per-engine subcomponent scores from 3.1.

---

## 4. WHAT'S ALREADY CORRECT — NO CHANGES NEEDED

### 4.1 Hierarchical Generation Order

PassA (structural) → PassB (cadence) → PassC (connector) → PassD (ornament) → PassE (expectation) correctly implements the friend's "high-level musical meaning toward low-level realization." Lower passes constrain upper passes.

### 4.2 Role Priority System

`orchestrator.js:455` (structural > cadence > connector > ornament > expectation) correctly implements the hierarchical constraint: *"Lower layers may not violate higher-level decisions."*

### 4.3 Evaluation Framework Structure

The EvaluationMetrics class (`interfaces.js:76-89`) with score, issues, and passesThreshold correctly implements the friend's requirement for evaluation metrics as part of the task definition model.

### 4.4 Time Budget and Safe Mode

`orchestrator.js:99-111` correctly implements pragmatic constraints: when time is running low, preserve real-time playback by skipping expensive operations. This is a practical consideration that doesn't conflict with the friend's model.

---

## Summary of Root Causes

1. **Post-processing engines are sequential, not iterative** — ExpectationEngine and VoiceLeadingEngine run once in fixed order, preventing the "iterative looping mixture" the friend describes.
2. **Global evaluation is too shallow** — Only 4 metrics check the final melody; per-engine subcomponent scores are missing.
3. **No cross-engine compatibility evaluation** — The model evaluates subcomponents individually but not how well they "mesh" as the friend emphasizes.
4. **Feedback adjustments are generic, not differential** — Parameter adjustments don't consider which specific subcomponents conflict with each other.

## Priority Matrix

| Priority | Issue | Category | File | Lines | Impact |
|---|---|---|---|---|---|
| P1 | Post-processing engines should be iterative, not sequential | DESIGN FLAW | `orchestrator.js` | 137-148 | VoiceLeading can undo Expectation work; no true feedback loop |
| P2 | Global evaluation lacks per-engine subcomponent scores | DESIGN FLAW | `orchestrator.js` | 211-296 | Feedback loop can't target specific underperforming engines |
| P2 | No cross-engine compatibility metrics | DESIGN FLAW | `orchestrator.js` | 154-186 | Can't detect when subcomponents "don't mesh" despite individual success |
| P3 | Feedback adjustments are generic, not differential | DESIGN CHOICE | `orchestrator.js` | 304-325 | Parameter adjustments don't resolve specific inter-engine conflicts |
| P3 | Duplicate scale/snap logic in Pass C and Pass D | BUG | `passC_connector.js`, `passD_ornament.js` | 19-134, 19-134 | Same function implemented twice; bug fixes must be applied to both |

## Why This Matters for Your Friend's Model

Your friend's model has three key principles that MelodyGen partially implements:

1. **"Distinct subcomponents that can be processed independently"** — YES. Each pass/engine is a self-contained task with Inputs/Parameters/Outputs/Metrics.

2. **"If each subcomponent optimally meshes well with the other subcomponents... then you have beautiful music"** — PARTIALLY. Subcomponents are evaluated individually, but there's no evaluation of how well they mesh. The deduplication step resolves conflicts, but doesn't evaluate whether the resolution was musically satisfactory.

3. **"Iterative looping mixture of computing various subcomponent tasks based on evaluative differential error metrics"** — PARTIALLY. The feedback loop exists (maxFeedbackIterations), but it's a single-level loop that adjusts generic parameters. It doesn't have the per-subcomponent differential metrics that would allow targeted re-evaluation of specific subcomponents.

The gap between "partially" and "fully" is the **coordinated refinement loop** — where post-processing engines iterate together, evaluating each other's outputs, with differential metrics driving targeted parameter adjustments. This is what would transform MelodyGen from a "linear pipeline with feedback" into the "hierarchical composable modeling" your friend describes.

## What to Tell Your Friend

MelodyGen already implements the core of her model: distinct subcomponents with evaluation metrics, sequential linear execution, and feedback-driven regeneration. The architecture is sound. The improvements needed are:

1. **Make post-processing engines iterative** — Have ExpectationEngine and VoiceLeadingEngine loop together for 2-3 iterations instead of running once sequentially.

2. **Add per-engine subcomponent scores** — Evaluate each engine's output against its own design intent, not just the global melody.

3. **Add cross-engine compatibility metrics** — Measure how well subcomponents mesh, not just how well each performs individually.

4. **Make feedback adjustments differential** — Use the subcomponent scores to target specific engines that need rework, rather than adjusting generic melody parameters.

These changes would align MelodyGen more closely with her vision of a "hierarchical composable modeling" system where the whole is greater than the sum of its parts. The current architecture provides the foundation; these changes would add the coordination layer that makes it truly composable.
