# MelodyGen Architecture Alignment — Implementation Brief

## Context

MelodyGen (`mgen/`) is a 5-pass + 5-engine hierarchical melody generator. It already implements your friend's core concept: distinct subcomponents with Inputs/Parameters/Outputs/Evaluation Metrics, sequential linear execution, and feedback-driven regeneration. Three gaps prevent full alignment with her vision of a "hierarchical composable modeling" system where subcomponents iteratively refine each other based on differential error metrics.

## The Three Gaps

### Gap 1: Post-processing engines are sequential, not iterative

**Files:** `mgen/src/orchestrator.js:137-148` (registration), `mgen/app.js:142-148` (registration)

**Current:** PhraseEngine → ExpectationEngine → VoiceLeadingEngine execute once in fixed order. VoiceLeadingEngine can undo ExpectationEngine's adjustments.

**Required change:** Convert these three from sequential passes into a **coordinated refinement loop** that iterates 2-3 times:
- Iteration 1: PhraseEngine → ExpectationEngine → VoiceLeadingEngine
- Iteration 2+: ExpectationEngine → VoiceLeadingEngine (PhraseEngine output fixed)
- Loop until scores stabilize or max iterations reached

This implements the friend's "iterative looping mixture of computing various subcomponent tasks based on evaluative differential error metrics."

### Gap 2: No per-engine subcomponent evaluation

**Files:** `mgen/src/orchestrator.js:211-296` (_evaluateMelodyGlobally), `mgen/src/orchestrator.js:304-325` (_applyFeedbackAdjustments)

**Current:** Global evaluation checks only 4 melody-level metrics (pitch diversity, uncompensated leaps, harmonic responsiveness, motivic coherence). Feedback adjustments only tweak 5 generic parameters (pitchDiversityWeight, maxLeap, strictChordTones, density).

**Required change:** Add `_evaluateSubcomponents(passResults)` that computes per-engine scores:
- **PhraseEngine:** Does the melody have a clear climax? Are register constraints satisfied? (check `arc.climaxSlot`, `arc.registers` vs actual note pitches)
- **MotifEngine:** What % of notes have `motifId`? Are transformations musically valid? (check `note.metadata.motifTransformation`)
- **StyleEngine:** Are interval constraints respected? (check `note.metadata.styleAdjusted` ratio)
- **RhythmEngine:** Does actual density match target? Are template hits consistent? (compare `actualDensity` vs `config.options.density`)
- **ExpectationEngine:** Are unresolved leaps compensated? Are payoffs enforced? (count `adjustmentReason` types)
- **VoiceLeadingEngine:** Are leaps compensated? Is momentum tracked? (count `leapCompensation` vs total leaps)

Then expand `_applyFeedbackAdjustments` to use these scores for targeted parameter adjustments (e.g., if MotifEngine coherence is low, reduce `transformProbability`; if VoiceLeading has many uncompensated leaps, increase `leapThreshold`).

### Gap 3: No cross-engine compatibility evaluation

**Files:** `mgen/src/orchestrator.js:154-186` (assemble candidate melody), `mgen/src/orchestrator.js:447-489` (_deduplicateOverlappingNotes)

**Current:** After all passes, notes are accumulated, deduplicated (role priority), snapped to harmonic context, and clamped. No evaluation of whether the composition is musically satisfactory.

**Required change:** Add `_evaluateCompatibility(snappedNotes, passResults, config)` that checks:
- Do rhythm-adjusted notes still land on phrase arc roles? (compare `note.startTime` against `arc.roles` slot assignments)
- Do voice-leading adjustments preserve motif identity? (check if `note.metadata.motifId` is preserved after `voiceLeadingAdjusted`)
- Do expectation adjustments respect style constraints? (check if `note.metadata.expectationAdjusted` notes violate `style.rules.maxInterval`)
- Are ornament notes rhythmically consistent with the template? (check if ornament `startTime` positions align with active `RhythmTemplate` grid)

These compatibility metrics should feed into the feedback loop to drive targeted re-evaluation of specific subcomponents.

## Implementation Order

1. **Gap 2 first** — Add `_evaluateSubcomponents()` and expand `_applyFeedbackAdjustments()`. This gives the feedback loop the data it needs.
2. **Gap 3 second** — Add `_evaluateCompatibility()`. This gives the feedback loop cross-engine awareness.
3. **Gap 1 last** — Convert post-processing engines to iterative loop. This uses the metrics from gaps 2 and 3 to drive convergence.

## Files to Modify

| File | Lines | Change |
|---|---|---|
| `mgen/src/orchestrator.js` | 211-296 | Add `_evaluateSubcomponents()` method |
| `mgen/src/orchestrator.js` | 304-325 | Expand `_applyFeedbackAdjustments()` with per-engine targets |
| `mgen/src/orchestrator.js` | 154-186 | Add `_evaluateCompatibility()` method |
| `mgen/src/orchestrator.js` | 83-202 | Refactor `execute()` to use iterative refinement loop for post-processing engines |
| `mgen/app.js` | 137-148 | Update engine registration (remove individual post-processing registration, add refinement group) |

## Files to Read First

Before implementing, read these files for context:
- `mgen/src/orchestrator.js` — Full orchestrator logic
- `mgen/src/engines/PhraseEngine.js:156-213` — PhraseEngine execute method
- `mgen/src/engines/ExpectationEngine.js:253-428` — ExpectationEngine execute method
- `mgen/src/engines/VoiceLeadingEngine.js:104-228` — VoiceLeadingEngine execute method
- `mgen/src/engines/MotifEngine.js:87-109` — MotifEngine execute method
- `mgen/src/engines/StyleEngine.js:130-155` — StyleEngine execute method
- `mgen/src/engines/RhythmEngine.js:223-243` — RhythmEngine execute method
- `mgen/src/interfaces.js:76-89` — EvaluationMetrics class
- `mgen/src/interfaces.js:145-156` — MelodyTask class

## What "100% Alignment" Looks Like

After implementation, the pipeline should:
1. Execute structural passes (A-E + Rhythm) sequentially as before
2. Enter a refinement loop where Phrase/Expectation/VoiceLeading engines iterate 2-3 times
3. Each iteration computes per-engine scores and cross-engine compatibility
4. Feedback adjustments target specific underperforming engines using differential metrics
5. Loop converges when scores stabilize or max iterations reached

This implements the friend's complete vision: distinct subcomponents, iterative refinement based on evaluative differential error metrics, and a hierarchical composable model where the whole is greater than the sum of its parts.
