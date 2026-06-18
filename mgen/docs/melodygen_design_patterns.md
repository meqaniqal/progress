# Melody Generator — Master Upgrade Plan
### From Note Picker to Narrative Composer

---

## Core Thesis

The current generator has working microtonal infrastructure, a motif system, a macro planner, and aesthetic modes. But nearly every decision it makes is still fundamentally **local** — it picks the next note based on the last note and the current chord, then corrects afterward.

Great melodies don't work that way. A great melody is not a sequence of notes. It is a sequence of **expectations** — promises made and kept, deferred, or broken — unfolding across time within a memorable phrase identity.


## Meta-Principle: Hierarchical Expectation Management

Every component in this roadmap should be viewed through a single lens:

> The purpose of melody generation is not to generate notes. The purpose of melody generation is to manage listener expectations across multiple time scales.

The generator should therefore operate on a hierarchy of expectations:

```text
Pitch Expectation
    ↓
Motif Expectation
    ↓
Phrase Expectation
    ↓
Section Expectation
    ↓
Style Expectation
```

Examples:

* Pitch expectation: what note seems likely next?
* Motif expectation: will the motif repeat, vary, or disappear?
* Phrase expectation: will a musical question receive an answer?
* Section expectation: will tension continue rising or resolve?
* Style expectation: will the musical language remain consistent?

All roadmap features should be evaluated according to how effectively they create, reinforce, delay, violate, or satisfy expectations at one or more of these levels.

PhraseArcPlanner shapes phrase expectations.

MotifRecaller shapes motif expectations.

ListenerExpectation tracks local and medium-scale expectations.

Climax planning shapes section-level expectations.

Genre and style systems shape style expectations.

Voice leading shapes pitch expectations.

Future development should prioritize systems that improve expectation management across multiple hierarchical levels simultaneously.

When choosing between two possible features, prefer the feature that increases the generator's ability to create meaningful anticipation and payoff rather than merely increasing theoretical correctness or note-selection sophistication.

A useful mental model is:

```text
Generator v1:
"What note should come next?"

Generator v2:
"What is the listener expecting right now?"

Generator v3:
"What does the listener think the entire musical story is becoming?"
```

The long-term goal of the architecture is to evolve from note generation toward narrative generation, where notes become the surface realization of deeper musical expectations.


Note: chatgpt suggest multiple levels of expectation indicated in the following structure:

ExpectationStack {
    pitchExpectation,
    motifExpectation,
    phraseExpectation,
    formExpectation,
    styleExpectation
}

## Meta-Principle: Hierarchical Composable Evaluation

The musical concepts in this roadmap should be implemented as independent, composable computational subsystems rather than as tightly coupled procedural logic.

Every major subsystem should expose four elements:

```text
Inputs
Parameters
Outputs
Evaluation Metrics
```

Examples:

```text
PhraseArcPlanner

Inputs:
- phrase length
- contour archetype
- tension targets

Outputs:
- phrase roles
- tension curve
- register curve

Metrics:
- climax clarity
- contour smoothness
- narrative coherence
```

```text
MotifRecaller

Inputs:
- motif family
- phrase role
- prior transformations

Outputs:
- transformed motif

Metrics:
- recognizability
- novelty
- developmental continuity
```

```text
ListenerExpectation

Inputs:
- melodic history
- harmonic context
- phrase role

Outputs:
- predicted continuations
- expectation strengths
- resolution targets

Metrics:
- expectation clarity
- payoff quality
- surprise balance
```

```text
VoiceLeading

Inputs:
- prior intervals
- phrase arc
- harmonic targets

Outputs:
- directional biases
- interval classifications

Metrics:
- smoothness
- compensation quality
- contour stability
```

The purpose of evaluation metrics is not merely scoring. Metrics create a feedback mechanism that allows iterative refinement:

```text
Generate
    ↓
Evaluate
    ↓
Adjust Parameters
    ↓
Recompute
    ↓
Re-evaluate
```

This allows the system to improve specific musical subsystems without regenerating the entire phrase.

The long-term architecture therefore becomes both hierarchical and composable:

```text
Narrative Intent
    ↓
Composable Musical Tasks
    ↓
Evaluation Framework
    ↓
Iterative Refinement
    ↓
Final Melody
```

The expectation-management framework remains the primary musical objective. Composable evaluation exists to support expectation management, not replace it.

The generator is therefore optimized around two complementary principles:

1. Manage listener expectations across multiple hierarchical time scales.
2. Evaluate and refine each musical subsystem independently while preserving global coherence.

````

## Architectural Orchestration Layer

The generator should contain an explicit orchestration layer responsible for coordinating all major musical subsystems.

```text
CompositionOrchestrator
````

Responsibilities:

```text
1. Execute generation passes.

2. Manage subsystem dependencies.

3. Track subsystem evaluation metrics.

4. Detect conflicts between subsystem goals.

5. Request selective regeneration of failing subsystems.

6. Maintain consistency between local and global musical objectives.

7. Select the highest-scoring realization among generated candidates.
```

The orchestrator does not generate music directly.

Instead it coordinates specialized generators:

```text
PhraseArcPlanner
MotifRecaller
ListenerExpectation
PhraseGrammar
VoiceLeading
Genre Systems
Microtonal Systems
```

and combines their outputs into the generation pipeline.

Example:

```text
Phrase Arc Score:
92

Motif Development Score:
88

Expectation Score:
95

Voice Leading Score:
61
```

In this situation the orchestrator may selectively re-run VoiceLeading rather than regenerate the entire phrase.

This enables efficient iterative convergence toward the intended musical result while preserving successful components.

The orchestration layer becomes the bridge between high-level narrative intent and low-level note generation.

````

## Subsystem Evaluation Framework

Every major subsystem should define explicit evaluation metrics.

Minimum recommended metrics:

```text
Phrase Metrics
--------------
Phrase coherence
Narrative clarity
Contour quality
Climax effectiveness

Motif Metrics
-------------
Recognizability
Transformation quality
Novelty balance
Recall effectiveness

Expectation Metrics
-------------------
Prediction strength
Delay effectiveness
Payoff quality
Surprise balance

Voice-Leading Metrics
---------------------
Stepwise smoothness
Leap compensation
Directional stability

Genre Metrics
-------------
Idiomatic authenticity
Stylistic consistency

Microtonal Metrics
------------------
Scale conformity
Tuning correctness
Microtonal voice-leading quality

Global Metrics
--------------
Overall coherence
Memorability
Narrative satisfaction
Expectation-management effectiveness
````

These metrics support iterative refinement, candidate selection, future machine-learning integration, and long-term architectural scalability.

Future systems such as IDyOM-inspired expectation models, Schenkerian planning, emotional trajectory planning, and corpus-informed optimization should plug into this evaluation framework rather than introducing isolated scoring systems.

The architecture should therefore evolve toward:

```text
Composable Tasks
    ↓
Evaluation Metrics
    ↓
Selective Regeneration
    ↓
Narrative Optimization
```

where the final objective remains the creation of memorable musical narratives rather than the optimization of isolated notes.



The architectural shift this plan makes:

**From:**
```
Rhythm Grid → Pitch Selection → Corrective Rules → Final Melody
```

**To:**
```
Narrative Intent
    ↓
Phrase Arc
    ↓
Motif Identity
    ↓
Expectation Planning
    ↓
Structural Notes
    ↓
Connective Notes
    ↓
Ornaments
```

This distinction — between a sophisticated note-picker and a composer — is where every future improvement should be evaluated. An improvement that makes note selection smarter is incremental. An improvement that makes phrase narrative stronger is transformational.

---

## Failure Modes in the Current System

1. **Inverted architecture**: generation is bottom-up (stochastic step → post-hoc snapping). Professional melody is top-down (phrase arc → motif → realization → ornament).
2. **Microtonal leaks**: seven hardcoded 12-EDO assumptions silently corrupt non-12 tunings.
3. **Motif amnesia**: each chord slot regenerates independently. There is no cross-phrase memory, so nothing accumulates, and nothing is remembered.
4. **No expectation modeling**: the system never considers what the listener is predicting. It cannot confirm, delay, deflect, or pay off predictions — the four moves that create emotional movement in music.
5. **Thin vocabulary**: the motif and rhythm libraries are too small to avoid recognizable repetition at scale.
6. **Single climax assumption**: one arch-shaped climax is hardcoded. Many great musical forms use multiple local climaxes, valleys, progressive waves, or intentionally avoid climax altogether.

---

## Phase 1 — Technical Foundation and Microtonal Correctness

These are correctness bugs, not aesthetic improvements. Any work in later phases is undermined if these remain. **Keep at P0.**

### 1.1 — Chord Inversion Fix (Already Complete)

The pitch-class matching fix in `applyInstanceOffsets()` is already in place — manual inversion console logs confirm correct chord tones under inversions. This section exists as foundational context: because `scheduleMelody()` derives `stableTones` directly from `chordNotes`, every downbeat snap and isolated-note resolution depends on `applyInstanceOffsets()` being right. The fix being complete means the generator is now operating on a trustworthy harmonic foundation.

### 1.2 — `findScaleIndex` Tolerance is Too Tight

```javascript
// BEFORE (breaks for microtonal floats)
if (Math.abs(scalePitches[i] - pitch) < 0.01) ...

// AFTER (scales with tuning resolution)
export function findScaleIndex(pitch, scalePitches, divisions = 12) {
    const tolerance = (12.0 / divisions) * 0.45; // 45% of one step
    for (let i = 0; i < scalePitches.length; i++) {
        if (Math.abs(scalePitches[i] - pitch) < tolerance) return i;
    }
    return -1;
}
```

The most pervasive fix — nearly every motif and ornament function quietly fails in non-12 tunings because index lookups return `-1`. All call sites in `melodyTuning.js`, `melodyMotifs.js`, and `melodyGenreRules.js` must pass `divisions` through.

### 1.3 — `isLeadingTone` is 12-EDO Only

```javascript
// AFTER (works in any EDO — leading tone = one step below root)
export function isLeadingTone(pitch, keyRoot, periodSize, divisions) {
    const stepSize = 12.0 / divisions;
    const pc = (pitch % periodSize + periodSize) % periodSize;
    const keyPc = (keyRoot % periodSize + periodSize) % periodSize;
    const diff = (pc - keyPc + periodSize) % periodSize;
    const leadingToneDiff = periodSize - stepSize;
    return Math.abs(diff - leadingToneDiff) < stepSize * 0.4;
}
```

### 1.4 — `applyGenreRules` Hardcodes `periodSize = 12`

```javascript
export function applyGenreRules(pitch, keyRoot, chordObj, genre,
                                 periodSize = 12, divisions = 12) {
    if (genre === 'blues') {
        const stepSize = 12.0 / divisions;
        const pc = ((pitch - keyRoot) % periodSize + periodSize) % periodSize;
        const flatFifthPc  = (periodSize / 2);
        const minorThirdPc = stepSize * Math.round(3 * (divisions / 12));
        if (Math.abs(pc - flatFifthPc) < stepSize * 0.4)
            return pitch - stepSize * 0.5;
        if (Math.abs(pc - minorThirdPc) < stepSize * 0.4 && Math.random() < 0.4)
            return pitch + stepSize * 0.25;
    }
    return pitch;
}
```

### 1.5 — `findClosestStep` Direction is Random

```javascript
// AFTER — directionBias parameter eliminates unmotivated wandering
export function findClosestStep(prev, scalePitches, divisions, directionBias = 0) {
    if (scalePitches.length === 0) return prev;
    const idx = findScaleIndex(prev, scalePitches, divisions);
    if (idx !== -1) {
        const dir = directionBias !== 0
            ? Math.sign(directionBias)
            : (Math.random() > 0.5 ? 1 : -1);
        let nextIdx = idx + dir;
        if (nextIdx < 0 || nextIdx >= scalePitches.length) nextIdx = idx - dir;
        return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, nextIdx))];
    }
    return findClosest(prev, scalePitches);
}
```

### 1.6 — `generateSeedMotif` Uses Hardcoded Semitone Intervals

The `<= 4.01` and `<= 2.01` filters are 12-EDO constants that misfire in 19-EDO and 31-EDO. Replace every hardcoded interval with scaled equivalents:

```javascript
const stepSize  = 12.0 / divisions;
const wholeStep = stepSize * 2;
const thirdLeap = stepSize * (divisions >= 19 ? 5 : 4);
```

### 1.7 — `getLocalScaleMode` is Nearly Empty

```javascript
export function getLocalScaleMode(quality, settingsGenre) {
    if (settingsGenre === 'jazz' || settingsGenre === 'blues') {
        if (quality === 'minor7')     return 'dorian';
        if (quality === 'dominant')   return 'mixolydian';
        if (quality === 'diminished') return 'diminishedWH';
        if (quality === 'augmented')  return 'wholeTone';
    }
    const map = {
        'minor':      'minor',
        'minor7':     'dorian',
        'dominant':   'mixolydian',
        'diminished': 'diminishedWH',
        'augmented':  'wholeTone',
        'suspended':  'mixolydian',
        'major':      'major',
    };
    return map[quality] || 'major';
}
```

### 1.8 — Microtonal Scale Library and `deduceChordRootAndQuality`

Add named mode overrides for 19-EDO, 22-EDO, and 31-EDO as EDO-step arrays, and fix `deduceChordRootAndQuality` to map roman numerals through degree indices rather than hardcoded 12-EDO semitone offsets:

```javascript
const MICROTONAL_SCALE_OVERRIDES = {
    19: { major: [0,3,6,8,11,14,17], minor: [0,3,5,8,11,13,16] },
    22: { major: [0,4,7,9,13,17,20], minor: [0,4,6,9,13,15,18] },
    31: { major: [0,5,10,13,18,23,28], minor: [0,5,8,13,18,21,26] }
};

// In deduceChordRootAndQuality: map numeral → degree index → scale pitch
const DEGREE_INDICES = {
    'i':0,'ii':1,'iii':2,'iv':3,'v':4,'vi':5,'vii':6,
    'I':0,'II':1,'III':2,'IV':3,'V':4,'VI':5,'VII':6,
};
const scaleIntervals = getScaleIntervals(state.mode || 'major', 'none', divisions);
const degreeIndex = DEGREE_INDICES[numeral];
const rootOffset = degreeIndex < scaleIntervals.length
    ? scaleIntervals[degreeIndex] * (12.0 / divisions) : 0;
```

Also add these additional scales to `getScaleIntervals`:

```javascript
harmonicMajor:    [0, 2, 4, 5, 7, 8, 11],
doubleHarmonic:   [0, 1, 4, 5, 7, 8, 11],  // Byzantine/Arabic
hungarianMinor:   [0, 2, 3, 6, 7, 8, 11],
phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
enigmaticScale:   [0, 1, 4, 6, 8, 10, 11],
ultraLocrian:     [0, 1, 3, 4, 6, 8, 9],
octatonic:        [0, 2, 3, 5, 6, 8, 9, 11],
```

### 1.9 — Pitch-Class Comparison Tolerance

Replace the rounding-based `stablePcSet` membership check with tolerance-based comparison:

```javascript
export function isChordTonePC(pitch, stableTones, periodSize, divisions) {
    const tolerance = (12.0 / divisions) * 0.45;
    const pc = ((pitch % periodSize) + periodSize) % periodSize;
    return stableTones.some(t => {
        const tpc = ((t % periodSize) + periodSize) % periodSize;
        return Math.abs(pc - tpc) < tolerance;
    });
}
```

---

## Phase 2 — Phrase Architecture

Before a single note is chosen, the generator must plan the phrase's shape, narrative role, and emotional arc. This is what distinguishes a composition from a calculation.

### 2.1 — PhraseArcPlanner (`melodyArcPlanner.js`)

```javascript
export function computePhraseArc(totalChords, settings) {
    const arc = { climaxSlot: 0, roles: [], tensions: [], registers: [] };

    // Locate climax per archetype (see Phase 6 for full archetype system)
    const climaxPositions = {
        'arch':        0.50, 'launch':   0.75, 'valley':  0.25,
        'staircase':   0.85, 'wave':     0.60, 'ambient': 0.50,
    };
    const climaxFraction = climaxPositions[settings.macroContourArchetype] || 0.75;
    arc.climaxSlot = Math.round(totalChords * climaxFraction);

    for (let i = 0; i < totalChords; i++) {
        const distToClimax = Math.abs(i - arc.climaxSlot) / Math.max(1, totalChords);
        arc.tensions.push(1.0 - distToClimax);
        const register = i <= arc.climaxSlot
            ? (i / Math.max(1, arc.climaxSlot))
            : 1.0 - ((i - arc.climaxSlot) / Math.max(1, totalChords - 1 - arc.climaxSlot));
        arc.registers.push(Math.max(0, Math.min(1, register)));

        if      (i === 0)               arc.roles.push('statement');
        else if (i === totalChords - 1) arc.roles.push('resolution');
        else if (i === arc.climaxSlot)  arc.roles.push('climax');
        else if (i < arc.climaxSlot)    arc.roles.push('build');
        else                            arc.roles.push('release');
    }
    return arc;
}
```

The `registers[]` array drives octave selection — rising register before the climax, falling after — producing the characteristic single-apex contour of the world's most memorable melodies. The `arc` object is passed into every subsequent phase as the primary driver.

### 2.2 — Phrase Grammar (`melodyPhraseGrammar.js`)

Rather than a library of memorized phrases (which produces idiom soup), a **grammar** generates structural relationships. These are more fundamental than style — they explain *why* a phrase works, not just *what* it sounds like. Idiomatic vocabulary then layers on top.

```javascript
// Phrase grammar archetypes
const PHRASE_GRAMMAR = {
    callResponse: {
        // phrase 1 ends open (on 5th or 2nd), phrase 2 closes (on root)
        phrasePairRoles: ['call', 'response'],
        openEndDegrees: [4, 1],   // scale degrees (5th, 2nd) for call ending
        closedEndDegrees: [0],    // scale degree (root) for response ending
    },
    questionAnswer: {
        // shorter question, longer answer; answer starts where question ended
        phrasePairRoles: ['question', 'answer'],
        continuationFromLastNote: true,
    },
    statementExpansion: {
        // motif stated, then lengthened into a larger arc
        phrasePairRoles: ['statement', 'expansion'],
        expansionFactor: 1.5,  // second phrase is 1.5x longer in contour range
    },
    contrastReturn: {
        // A-B-A' structure at phrase level
        phraseTripletRoles: ['A', 'B', 'A_prime'],
        returnVariation: 'partial', // A' is decorated return, not exact
    },
    developing: {
        // Brahmsian developing variation: motif transforms continuously,
        // no exact repetition, but recognizable through all transformations
        phraseContinuation: 'develop',
        transformChain: ['sequence', 'inversion', 'augmentation', 'compression'],
    }
};

export function selectPhraseGrammar(phraseCount, genre, tensionLevel) {
    if (genre === 'blues') return PHRASE_GRAMMAR.callResponse;
    if (genre === 'jazz' && phraseCount > 4) return PHRASE_GRAMMAR.developing;
    if (tensionLevel > 0.7) return PHRASE_GRAMMAR.statementExpansion;
    return PHRASE_GRAMMAR.questionAnswer;
}
```

*Reference: this is grounded in Leonard Meyer's implication-realization theory and Narmour's implication model — the idea that melodic intervals imply continuations that the grammar either fulfills or deflects.*

---

## Phase 3 — Motif Memory System

The current system generates motifs. Professional melodies also **remember** them. These are not equivalent.

### 3.1 — MelodicMemory Object

```javascript
// Module-scope persistent state in melodyGenerator.js
let MelodicMemory = {
    family:          null,   // active motifFamily
    rhythmicMotif:   null,   // active rhythmicMotif
    lastPitch:       null,   // last sounding pitch (inter-phrase voice leading)
    transformChain:  [],     // ordered list of transforms applied so far
    phraseCount:     0,      // how many phrases generated in this session
    motifInventory:  [],     // all motif families generated (for later recall)
    importanceMap:   {},     // slot index → importance weighting
};
```

### 3.2 — MotifRecaller with Full Transformation Set

```javascript
export function recallOrRenewMotif(phraseRole, arc, validPitches, chordTones,
                                    scalePitches, tuning, aestheticMode) {
    const shouldRenew    = phraseRole === 'statement' || MelodicMemory.family === null;
    const shouldDevelop  = phraseRole === 'build';
    const shouldClimax   = phraseRole === 'climax';
    const shouldRelease  = phraseRole === 'release';
    const shouldResolve  = phraseRole === 'resolution';

    if (shouldRenew) {
        MelodicMemory.family = generateMotifFamily(validPitches, chordTones,
                                                    scalePitches, tuning);
        MelodicMemory.rhythmicMotif = generateRhythmicMotif(aestheticMode);
        MelodicMemory.motifInventory.push(MelodicMemory.family);
        MelodicMemory.transformChain = [];
    } else if (shouldDevelop) {
        // Brahms-style: transform but preserve recognizability
        const transform = ['sequence', 'extension', 'rhythmicVariation'][
            MelodicMemory.phraseCount % 3];
        MelodicMemory.family = applyTransform(transform, MelodicMemory.family,
                                               validPitches, tuning);
        MelodicMemory.transformChain.push(transform);
    } else if (shouldClimax) {
        // Invert the hook for maximum contrast; shift to virtuoso rhythm
        MelodicMemory.family.hook = applyInversion(MelodicMemory.family.hook, validPitches);
        MelodicMemory.rhythmicMotif = generateRhythmicMotif('virtuoso');
    } else if (shouldRelease) {
        // Retrograde: mirror the shape downward after peak
        MelodicMemory.family.hook = applyRetrograde(MelodicMemory.family.hook);
        MelodicMemory.rhythmicMotif = applyRhythmicVariation(MelodicMemory.rhythmicMotif);
    } else if (shouldResolve) {
        // Partial recall: 3-note fragment of original hook, resolving to tonic
        MelodicMemory.rhythmicMotif = applyPartialRecall(MelodicMemory.rhythmicMotif, 3);
    }

    MelodicMemory.phraseCount++;
    return { family: MelodicMemory.family, rhythmicMotif: MelodicMemory.rhythmicMotif };
}
```

### Available Transformations

The full transformation set should include all of the following, referenced by name in `applyTransform`:

- **Transposition** — diatonic shift up/down by N scale degrees (most natural continuation)
- **Inversion** — mirror the contour around the starting note (already implemented)
- **Retrograde** — reverse the note order (already implemented)
- **Rhythmic augmentation** — double all durations (slower, more majestic)
- **Rhythmic diminution** — halve all durations (more urgent, virtuosic)
- **Interval expansion** — scale all intervals by a factor (widens the gesture)
- **Interval compression** — reduce all intervals (more intimate, interior)
- **Sequence** — repeat the motif starting on a different scale degree (already partially implemented)
- **Ornamentation** — add grace notes, trills, or passing tones to the hook pitches
- **Fragmentation** — use only 2–3 notes of the hook (creates urgency and drive at climax approach)
- **Combination** — layer two motifs simultaneously (advanced; requires multi-voice awareness)

*Reference: Schoenberg's concept of developing variation (derived from his analysis of Brahms) — the technique of continuously transforming a motif so that each phrase is new yet recognizably derived from the same source. This is the engine of large-scale coherence in tonal music.*

---

## Phase 3.5 — Expectation Modeling

This is the most transformative addition and the deepest gap in the current system. Most melody systems generate notes. Great melodies generate **predictions in the listener's mind**, then manage those predictions.

### The Theoretical Basis

David Huron's ITPRA model (from *Sweet Anticipation*, 2006) describes the complete listener experience of any musical event:

1. **Imagination** — the listener unconsciously predicts what will come next
2. **Tension** — the body prepares for the predicted event
3. **Prediction** — a specific expectation crystallizes
4. **Reaction** — an immediate, pre-cognitive response when the event arrives
5. **Appraisal** — conscious evaluation of how well the prediction matched

A melody that only ever confirms predictions is boring. A melody that always violates them is incoherent. The art is in managing *when* to confirm, *when* to delay, and *when* to surprise — and crucially, ensuring that surprises are musically justified rather than random.

### The ListenerExpectation Object

```javascript
// New module: melodyExpectation.js
let ListenerExpectation = {
    expectedPitch:       null,   // most probable next pitch (from melodic inertia)
    expectedRhythm:      null,   // expected continuation of rhythmic pattern
    expectedRegister:    null,   // expected register trajectory (up/down/same)
    expectedResolution:  null,   // expected harmonic goal (tonic, dominant, etc.)
    expectationStrength: 0.0,    // 0.0 = ambiguous, 1.0 = very strong expectation
    priorContour:        [],     // last 4 pitch directions (for inertia calc)
};

export function updateExpectation(lastPitch, lastInterval, scalePitches, stableTones, arc, stepIndex) {
    // Melodic inertia (Narmour): after a step, expect continuation in same direction.
    // After a leap, expect reversal. This is the core of implication-realization.
    const { dir, size } = lastInterval;
    if (size === 'step') {
        ListenerExpectation.expectedPitch = scalePitches[
            Math.min(scalePitches.length - 1,
                findScaleIndex(lastPitch, scalePitches) + dir)
        ];
        ListenerExpectation.expectationStrength = 0.65; // steps imply continuation
    } else if (size === 'leap') {
        ListenerExpectation.expectedPitch = scalePitches[
            Math.max(0, findScaleIndex(lastPitch, scalePitches) - dir) // reversal
        ];
        ListenerExpectation.expectationStrength = 0.80; // leaps imply stronger reversal
    }

    // Tonal gravity: add weight toward stable tones (Krumhansl tonal hierarchy)
    const closestStable = findClosest(lastPitch, stableTones);
    if (Math.abs(closestStable - lastPitch) < 2) {
        ListenerExpectation.expectedResolution = closestStable;
        ListenerExpectation.expectationStrength = Math.min(1.0,
            ListenerExpectation.expectationStrength + 0.2);
    }

    ListenerExpectation.expectedRegister = arc.registers[stepIndex] > arc.registers[stepIndex - 1]
        ? 'ascending' : 'descending';
}
```

### The Four Expectation Operations

```javascript
export function applyExpectationOp(op, currentPitch, expectedPitch, scalePitches, stableTones) {
    switch(op) {
        case 'confirmation':
            // Give the listener exactly what they predicted — creates satisfaction
            // Use at cadence points and after tension has built
            return expectedPitch || currentPitch;

        case 'delay':
            // Defer the expected note — insert a passing tone or rest first
            // Creates momentary tension; payoff is more satisfying for the wait
            const delayStep = findClosest(
                (currentPitch + (expectedPitch || currentPitch)) / 2, scalePitches);
            return delayStep;

        case 'deflection':
            // Go somewhere unexpected but musically justified
            // Classic: expect the 3rd, get the 5th instead (both are stable)
            const unexpectedStable = stableTones.filter(p =>
                p !== expectedPitch && Math.abs(p - currentPitch) > 1);
            return unexpectedStable.length > 0
                ? unexpectedStable[Math.floor(Math.random() * unexpectedStable.length)]
                : currentPitch;

        case 'payoff':
            // After accumulated delay, deliver the expected note with rhythmic
            // emphasis (on a strong beat, with full duration)
            // This is the source of musical pleasure — Salimpoor et al. (2011)
            // showed dopamine release peaks at the moment of anticipated resolution
            return expectedPitch || findClosest(currentPitch, stableTones);
    }
    return currentPitch;
}
```

### Wiring into the Generation Pipeline

The expectation system adds a **Pass 5** after ornaments — an expectation refinement pass that reviews the generated phrase and asks:

- Are there unresolved promises? (a big leap with no step-back)
- Are there multiple consecutive confirmations? (boring)
- Does the phrase end with a payoff or just stop?
- Is the climax the most unexpected moment, or the most inevitable? (both are valid — but the choice must be explicit)

```javascript
export function refineForExpectation(lookaheadGrid, ListenerExpectation, arc, phraseRole) {
    // Scan for unresolved large leaps
    for (let i = 1; i < lookaheadGrid.length - 1; i++) {
        if (!lookaheadGrid[i].active || !lookaheadGrid[i-1].active) continue;
        const interval = lookaheadGrid[i].pitch - lookaheadGrid[i-1].pitch;
        if (Math.abs(interval) > 4 && lookaheadGrid[i+1].active) {
            // Compensate: next note should move back toward origin
            const compensated = lookaheadGrid[i].pitch - Math.sign(interval) * 1;
            lookaheadGrid[i+1].pitch = findClosest(compensated, validPitches);
        }
    }
    // Ensure phrase-final note is a payoff (chord tone or tonic)
    const lastActive = [...lookaheadGrid].reverse().find(s => s.active);
    if (lastActive && phraseRole === 'resolution') {
        lastActive.pitch = findClosest(lastActive.pitch, stableTones);
    }
    return lookaheadGrid;
}
```

---

## Phase 4 — Structural Generation (Five-Pass Pipeline)

The current three-pass approach (template → stochastic fill → downbeat snap) is replaced by a strict five-pass pipeline where each pass has a single, clear responsibility.

**Pass A — Structural Skeleton**
Place the motif hook pitches at their rhythmicMotif step positions. These are fixed anchors — nothing overrides them. This is where musical identity lives.

**Pass B — Cadence Placement**
Place cadence pitches at the phrase boundary (last 3–4 steps). The grammar type (call/response, question/answer) determines whether the cadence is open (ends on 2nd or 5th) or closed (ends on root). This must be committed before fill notes are placed.

**Pass C — Connector Fill**
Fill remaining active steps using `findDirectedStep` with direction bias derived from the `PhraseArcPlanner`'s `tension` value for this slot and the `ListenerExpectation.expectedRegister`. High tension and ascending register → bias upward. Low tension and descending register → bias downward.

**Pass D — Ornaments**
Call `applyOrnaments()` genre-specifically. This remains pass-final — ornaments are surface decoration and must never drive structural decisions.

**Pass E — Expectation Refinement**
Call `refineForExpectation()` as a review pass. Fix uncompensated leaps, ensure phrase-final notes are payoffs, check that no three consecutive confirmations appear without at least one delay or deflection.

### Register Constraints per Slot

```javascript
// In planPhraseStructuralSkeleton — add register envelope
for (let i = 0; i < totalChords; i++) {
    const registerFraction = arc.registers[i]; // from PhraseArcPlanner
    const registerCeiling = keyRoot + 12 + (registerFraction * periodSize * 0.5);
    const registerFloor   = keyRoot + (registerFraction * periodSize * 0.25);
    const slotValidPitches = validPitches.filter(
        p => p >= registerFloor && p <= registerCeiling);
    // Use slotValidPitches for skeleton pitch selection in this slot
}
```

This enforces the hallmark of professional melody writing: **a single highest note that appears exactly once, at the climax, approached and left stepwise**. This principle appears consistently across analysis of Bach chorales, Beethoven themes, Beatles songs, and jazz standards.

---

## Phase 5 — Voice Leading Evolution

Voice leading should operate on **vectors** (trajectories), not isolated intervals.

### Melodic Interval Classification

```javascript
// melodyVoiceLeading.js
export function classifyInterval(fromPitch, toPitch, stepSize) {
    const diff = toPitch - fromPitch;
    const absDiff = Math.abs(diff);
    return {
        dir:  Math.sign(diff),
        size: absDiff < stepSize * 1.5 ? 'step'
            : absDiff < stepSize * 3.5 ? 'skip'
            : 'leap',
        semitones: diff
    };
}
```

### Trajectory-Based Voice Leading

```javascript
const TRAJECTORY_RULES = {
    // Classical voice-leading rules derived from perceptual research
    // (Huron 2001: "Tone and Voice" — these rules exist because of auditory streaming)
    'leap:up':    { preferredDir: -1, preferredSize: 'step', weight: 0.75 },
    'leap:down':  { preferredDir: +1, preferredSize: 'step', weight: 0.75 },
    'step:same':  { preferredDir:  0, preferredSize: 'step', weight: 0.50 },
    // Narmour's registral direction principle:
    'skip:up':    { preferredDir: -1, preferredSize: 'step', weight: 0.60 },
    'skip:down':  { preferredDir: +1, preferredSize: 'step', weight: 0.60 },
};

export function getVoiceLeadingBias(lastInterval, phraseRole) {
    if (!lastInterval) return 0;
    const { dir, size } = lastInterval;
    const key = `${size}:${dir > 0 ? 'up' : 'down'}`;
    const rule = TRAJECTORY_RULES[key];
    if (!rule) return 0;
    // Relax at climax — allow upward continuation through the peak
    if (phraseRole === 'climax') return dir * 0.3;
    return rule.preferredDir * rule.weight;
}
```

### Momentum Tracking

Maintain a short momentum buffer to detect and prevent runaway motion:

```javascript
// If the last 4 steps have all moved in the same direction, force a turn
if (MelodicMemory.priorContour.length >= 4 &&
    MelodicMemory.priorContour.every(d => d > 0)) {
    directionBias = -1; // force descent
} else if (MelodicMemory.priorContour.every(d => d < 0)) {
    directionBias = +1; // force ascent
}
```

*Reference: Tymoczko (2011) "A Geometry of Music" — voice leading as movement through pitch-class space. Smooth voice leading corresponds to small movements in this space. The rules above are the melodic (single-voice) analogues of the harmonic voice-leading principles Tymoczko formalizes geometrically.*

---

## Phase 6 — Climax Archetypes and Narrative Control

The current system implies a single arch-shaped climax. Professional melody composition recognizes at least six distinct narrative archetypes, each appropriate to different genres and contexts.

```javascript
const CLIMAX_ARCHETYPES = {
    classical: {
        // Single dominant climax; gradual approach, immediate fall
        // Examples: Bach chorales, Mozart sonata themes, Beethoven themes
        climaxPosition: 0.75,
        approachShape:  'gradual',
        fallShape:      'sudden',
        description:    'Single apex, usually ~75% through the phrase'
    },
    popLate: {
        // Late-arriving climax after extended build; common in rock and pop
        // Examples: "Bohemian Rhapsody" operatic section, "A Day in the Life"
        climaxPosition: 0.85,
        approachShape:  'plateau_then_peak',
        fallShape:      'gradual',
        description:    'Extended build, late peak, gradual release'
    },
    jazz: {
        // Multiple local climaxes; each chorus peaks independently
        // Examples: Miles Davis solos, Coltrane "sheets of sound" builds
        climaxPositions: [0.25, 0.60, 0.90],
        shape:           'wave',
        description:     'Wave-shaped; each phrase has its own local apex'
    },
    progressive: {
        // Escalating wave structure; each cycle reaches higher than the last
        // Examples: Led Zeppelin "Stairway to Heaven", Radiohead "Paranoid Android"
        climaxPositions: [0.30, 0.55, 0.80],
        shape:           'escalating_waves',
        description:     'Each wave higher than the last; cumulative intensity'
    },
    ambient: {
        // Climax intentionally avoided; plateau of tension rather than peak
        // Examples: Brian Eno ambient works, Arvo Pärt tintinnabuli pieces
        climaxPosition:  null,
        shape:           'plateau',
        description:     'No dominant peak; sustained tension or suspended resolution'
    },
    valley: {
        // Begins high, descends to a point of stillness, then rises again
        // Examples: many folk ballads, some Schubert Lieder
        climaxPosition:  0.50,
        shape:           'valley',
        description:     'Inverted arch; stillness at center, motion at edges'
    }
};
```

The user-facing `macroContourArchetype` setting should map to these six types. Each archetype drives the `registers[]` array in `PhraseArcPlanner` differently.

---

## Phase 7 — Genre and Style Systems

Genre modules should influence motif vocabulary, ornament vocabulary, contour tendencies, phrase grammar preferences, and rhythmic language. They must not override the core composition engine — the engine produces musical logic; genre provides musical accent.

### Jazz Bebop: Guide-Tone Lines

Trace the 3rds and 7ths through the chord progression before generation. These become mandatory anchor points at strong beats — the source of the characteristic bebop sound.

```javascript
export function computeGuideToneLine(chordProgression, keyRoot, divisions, periodSize) {
    const line = [];
    let prevGuideTone = null;
    for (let i = 0; i < chordProgression.length; i++) {
        const chordTones = chordProgression[i].chordNotes;
        const third   = chordTones[1];
        const seventh = chordTones[3];
        const candidates = [third, seventh].filter(Boolean);
        if (!prevGuideTone || !candidates.length) {
            const gt = candidates[0] || chordTones[0];
            line.push({ slot: i, guideTone: gt });
            prevGuideTone = gt;
        } else {
            const best = candidates.reduce((a, b) =>
                Math.abs(a - prevGuideTone) < Math.abs(b - prevGuideTone) ? a : b);
            line.push({ slot: i, guideTone: best });
            prevGuideTone = best;
        }
    }
    return line;
}
```

The guide-tone line replaces `stableTones` at beats 1 and 3 in jazz mode.

### Blues: Call-and-Response Structure

Tag the first half of each 4-bar phrase as `call` (ascending, ending on 5th or b7th) and the second half as `response` (descending, resolving to root or 3rd). Enforce a silence gap of at least 2 beats between call and response.

```javascript
if (genre === 'blues') {
    const isCall = (absIndex % 4) < 2;
    const targetEndPitch = isCall
        ? findClosest(keyRoot + 7, validPitches)    // end on 5th
        : findClosest(keyRoot + 12, validPitches);  // resolve to root octave
    plannedAnchors.anchor2 = targetEndPitch;
    settings._bluesIsCall = isCall;
    // Force a gap: clear steps 8–11 in the grid (between call and response)
    if (isCall) forcedRestRange = [8, 11];
}
```

### Classical (Genre: 'none'): Strict Voice Leading

Repurpose as a classical strict mode: mandatory stepwise motion (leaps only by 3rd, always compensated), leading tone resolves upward, contour follows macro arc precisely, rhythm uses half and quarter notes only.

### Expanded Motif Library

Current library: 5 entries total. Minimum viable: 5 per mode (20 total). Include at minimum:

```javascript
cantabile: [
    { steps: [0,4,6,8],   directions: [0,1,2,1] },   // standard arch
    { steps: [0,2,8,12],  directions: [0,1,2,1] },   // delayed arch
    { steps: [0,3,5,9],   directions: [2,1,3,2] },   // high start
    { steps: [0,4,8,10],  directions: [0,2,1,3] },   // building
    { steps: [0,2,6,14],  directions: [1,0,2,0] },   // return-to-opening
],
declamatory: [
    { steps: [0,1,4,8],   directions: [0,0,1,-1] },
    { steps: [0,2,3,7],   directions: [2,2,3,1] },
    { steps: [0,3,6,10],  directions: [0,1,2,0] },
    { steps: [0,1,2,8],   directions: [1,2,3,1] },   // tripleted attack
    { steps: [0,4,5,12],  directions: [0,2,1,-1] },
],
sighs: [
    { steps: [0,6],       directions: [0,3] },
    { steps: [0,5],       directions: [2,0] },        // downward sigh
    { steps: [0,3,8],     directions: [1,3,0] },
    { steps: [0,8,12],    directions: [0,2,1] },
    { steps: [0,4,15],    directions: [3,1,0] },      // long resolution
],
virtuoso: [
    { steps:[0,1,2,3,4,5,6,7], directions:[0,1,2,3,4,3,2,1] },
    { steps:[0,1,2,3,4,5,6,7], directions:[4,3,2,1,0,1,2,3] }, // descend first
    { steps:[0,1,2,4,5,6,8,9], directions:[0,2,4,3,2,4,5,3] }, // skips
    { steps:[0,1,3,4,6,7,9,10],directions:[0,1,2,3,2,1,0,1] }, // alternating
    { steps:[0,2,3,4,6,7,8,9], directions:[2,3,4,3,2,3,4,3] }, // high plateau
],
```

### Idiomatic Phrase Vocabulary (Complement to Grammar)

A small curated vocabulary of genre-idiomatic contours layers on top of the grammar system. Unlike a phrase library that replaces the engine, this vocabulary provides *surface character* while the grammar maintains *structural logic*:

```javascript
const IDIOMATIC_VOCABULARY = {
    jazz: {
        // Charlie Parker-style: land on chord tone beat 1, approach with chromatic enclosure
        bebopLandingPattern: { approach: 'chromatic_enclosure', landingDegree: 'third' },
        // Bill Evans: inner voice emphasis, avoid tonic in upper register
        innerVoiceStyle: { emphasize: ['third', 'seventh'], avoidInRegister: ['root'] },
    },
    blues: {
        // BB King-style: bend to the blue note, hold, release
        blueNoteBend: { targetPc: 'minor_third', microtonalOffset: 0.25, holdDuration: 2 },
    },
    // These apply as probability modifiers on pitch selection, not hard rules
};
```

---

## Phase 8 — Microtonal Excellence

The permanent competitive moat against Band-in-a-Box and Synfire Pro is native microtonality. Phase 1 makes it correct; Phase 8 makes it expert.

### Microtonal Ornaments

The jazz enclosure system's beat-detection must use proportional indices, not hardcoded step numbers:

```javascript
const halfPoint = Math.floor(totalSteps / 2);
const isStructural = step.sixteenthStep === 0 || step.sixteenthStep === halfPoint;
```

Add a microtonal glide ornament — a grace note at `stepSize * 0.5` offset from the target, snapped to nearest valid pitch:

```javascript
if (genre === 'blues' || genre === 'jazz') {
    const stepSize = 12.0 / divisions;
    const glide = findClosest(step.pitch - stepSize * 0.5, validPitches);
    if (glide !== step.pitch && i > 0 && !lookaheadGrid[i - 1].active) {
        lookaheadGrid[i - 1] = { pitch: glide, active: true, isGlide: true, volume: 0.65 };
    }
}
```

---

## Phase 9 — Advanced Research Frontiers



---

## Implementation Priority Order (Revised)

| Priority | Phase | Task | Effort | Impact |
|:---|:---|:---|:---|:---|
| **P0** | 1 | Chord inversion fix (complete) | — | Foundation confirmed |
| **P0** | 1 | `findScaleIndex` tolerance (1.2) | Small | Fixes microtonal lookups globally |
| **P0** | 1 | Remaining Phase 1 fixes (1.3–1.9) | Small–Med | Correctness throughout |
| **P1** | 2 | PhraseArcPlanner | Medium | Eliminates wandering feel |
| **P1** | 3 | MelodicMemory + MotifRecaller | Medium | Eliminates phrase amnesia |
| **P1** | 3.5 | ListenerExpectation object | Medium | Adds emotional payoff logic |
| **P1** | 4 | Five-pass generation pipeline | Large | Core pipeline overhaul |
| **P2** | 5 | Vector voice leading | Medium | Eliminates uncompensated leaps |
| **P2** | 6 | Climax archetypes (6 types) | Small | Genre-appropriate narrative shapes |
| **P2** | 2 | Phrase grammar system | Medium | Structural relationships over memorized licks |
| **P2** | 3.5 | Pass E — expectation refinement | Small | Fixes unresolved promises in phrases |
| **P3** | 8 | Microtonal ornaments + glides | Small | Microtonal surface excellence |
| **P3** | 7 | Jazz guide-tone lines | Medium | Bebop authenticity |
| **P3** | 7 | Blues call-and-response planner | Medium | Blues idiom authenticity |
| **P3** | 7 | Expanded motif library (20 entries) | Small | Reduces repetition |
| **P4** | 7 | Idiomatic phrase vocabulary | Medium | Genre surface character |
| **P4** | 9.1 | IDyOM-style statistical expectation | Large | Learned melodic intuition |
| **P4** | 9.3 | Schenkerian background structure | Large | Long-range coherence |
| **P5** | 9.4 | Micro-timing / groove offsets | Medium | Physical, inhabitated feel |
| **P5** | 9.7 | Phrase length coherence check | Small | Working memory alignment |
| **P5** | 9.9 | Emotional trajectory planner | Medium | Sequencing of aesthetic modes |

---

## Competitive Position

| Software | Their Strength | Your Position After This Plan |
|:---|:---|:---|
| **Band-in-a-Box** | 30 years of idiomatic phrase vocabulary | Phrase grammar (more generative) + idiomatic vocabulary + microtonal adaptation |
| **Synfire Pro** | Vector voice leading, modulation coherence | Vector voice leading + expectation modeling + native microtonality |
| **Music Transformer / AI** | Statistical long-range structure from corpus | Deterministic long-range structure via MotifRecaller + Schenkerian skeleton (Phase 9.3) |

The two permanent differentiators that none of these can replicate are **native microtonality** (making the system equally expert in 31-EDO as in 12-EDO) and **expectation modeling as a first-class architectural primitive** — the `ListenerExpectation` system treats the listener's cognitive state as an explicit variable in generation. That is not in BiaB, not in Synfire, and not yet standard in AI music generation.

---




******** Qwen 3.6 evaluatin of the plan and suggestions:

Strengths
The plan is exceptionally well-researched. The core thesis — shifting from "what note next" to "what is the listener expecting" — is the right architectural insight. The music cognition references (Huron, Narmour, Lerdahl, Pearce) are precisely the right ones. The six climax archetypes are a practical, genre-aware improvement over the current single-arch assumption.
Issues & Suggestions
1. Priority Order: Five-Pass Pipeline Should Be P0
The plan puts PhraseArcPlanner (P1) before the five-pass pipeline (P1), but the pipeline is the architectural container that all other phases plug into. Without it, nothing else has a place to live. I'd reorder:
P0: Five-pass pipeline skeleton (Phase 4)
P1: PhraseArcPlanner (Phase 2.1)
P1: ListenerExpectation (Phase 3.5)
P1: MelodicMemory + MotifRecaller (Phase 3)
P2: Everything else
The pipeline is the plumbing. Everything else is a fixture.
2. Missing: Integration Points
The plan describes new modules but doesn't specify where they connect to melodyGenerator.js. For example:
- Where does PhraseArcPlanner.computePhraseArc() get called? (presumably at the start of scheduleMelody())
- Where does ListenerExpectation state get reset? (per phrase? per chord slot?)
- How does MotifRecaller replace the current motif generation in the existing pipeline?
Each new module needs explicit "wiring notes" — which existing function calls it, which variables it reads/writes, and what it replaces.
3. Pseudocode Gaps in Phase 3.5
The updateExpectation function uses size === 'step' as a string comparison, but classifyInterval (Phase 5) returns { dir, size, semitones } as an object. The integration between these phases isn't shown. Also, refineForExpectation references validPitches which isn't in its parameter list.
4. Missing: Quality Assessment Framework
The plan has no way to verify that upgrades actually produce better melodies. I'd suggest adding a Phase 0.5: Evaluation Criteria that defines:
- A set of test chord progressions (standard jazz, blues, pop, modal)
- Manual listening criteria (memorable? coherent? genre-appropriate?)
- Automated metrics (leap compensation rate, cadence accuracy, climax placement accuracy)
- A "before/after" comparison protocol
Without this, you'll never know if Phase 2 actually improved anything.
5. Missing: Backward Compatibility Strategy
The plan describes replacing the current system but doesn't address how to do this incrementally. Suggestion: add a pipelineVersion flag to state.melodySettings that lets you run either the old or new pipeline, so you can A/B test as you build.
6. Register Constraints Bug (Phase 4)
The registerCeiling / registerFloor calculation uses periodSize * 0.5 and periodSize * 0.25 as multipliers. In 31-EDO (periodSize = 31), this gives a ceiling of keyRoot + 15.5 — barely more than an octave. The formula should scale with divisions, not periodSize.
7. Missing: Performance Considerations
The five-pass pipeline with expectation tracking, motif memory, and arc planning will be significantly more computationally expensive. The current system is essentially O(n) per phrase. The new system is more like O(n × m) where m is the motif inventory size. A rough complexity estimate and optimization notes would help.
8. Missing: User-Facing Changes
The plan mentions macroContourArchetype as a user setting but doesn't discuss what UI changes are needed. If users can now choose between 6 climax archetypes, the UI needs to expose that. Same for any new settings (surprise budget, phrase asymmetry, emotional trajectory).
9. Phase 3.5 vs Phase 5 Integration
The plan describes ListenerExpectation (Phase 3.5) and TRAJECTORY_RULES (Phase 5) as separate systems, but they're tightly coupled — the expectation system needs voice-leading bias to make pitch decisions, and the voice-leading system needs expectation state to know when to relax rules (e.g., "Relax at climax"). These should be designed as a single integrated module, not two separate phases.
10. Suggestion: Add a "Minimum Viable Upgrade" Path
The plan is 1135 pages of ambition. Before tackling Phases 7–9, there's a Minimum Viable Upgrade that would produce a dramatically better result with modest effort:
MVP: Phase 1 (done) + Five-Pass Pipeline + PhraseArcPlanner + 
     ListenerExpectation (basic) + 6 Climax Archetypes
This alone would transform the output quality. The rest (IDyOM, Schenkerian, Music Transformer, micro-timing) are polish on top of a fundamentally different architecture.
Bottom line: The plan is excellent as a vision document. For implementation, I'd suggest: (a) reordering priorities to build the pipeline container first, (b) adding explicit integration points for each module, (c) adding a quality assessment framework, and (d) defining a minimum viable upgrade path before tackling the research frontiers.