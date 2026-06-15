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

These are future enhancement directions grounded in current research. Each is a potential major feature with its own implementation cycle.

### 9.1 — Statistical Expectation Model (IDyOM)

Marcus Pearce's IDyOM (Information Dynamics of Music) model learns melodic expectation statistically from a corpus of melodies. It outputs a surprise value (information content in bits) for each note. This is the most empirically validated model of melodic expectation in cognitive musicology.

Implementation path: train a simple n-gram model on a curated corpus (Bach chorales, jazz standards, folk melodies segmented by genre). Use it to weight pitch selection toward statistically expected continuations, with a "surprise budget" per phrase that controls how often the generator deflects expectations. High surprise budget → more interesting but riskier; low budget → more predictable but safer.

*Reference: Pearce & Wiggins (2006). "Expectation in Melody." Music Perception 22(2). Pearce (2005). "The Construction and Evaluation of Statistical Models of Melodic Structure." PhD thesis, City University London.*

### 9.2 — Tonal Pitch Space Tension Curves

Fred Lerdahl's Tonal Pitch Space model quantifies the psychological distance between any two pitch classes or chords, producing a precise tension value at every moment in a piece. Implementing even a simplified version would allow the generator to compute melodic tension more precisely than the current heuristic `tension * 0.4 + tcVal * 0.6` formula.

Implementation path: implement the basic pitch-class hierarchy (tonic → fifth → diatonic → chromatic) as a lookup table, compute distance from current melodic pitch to tonic, and use that as the primary tension value driving the arc planner.

*Reference: Lerdahl, F. (2001). Tonal Pitch Space. Oxford University Press. Lerdahl, F. & Krumhansl, C. (2007). "Modeling Tonal Tension." Music Perception 24(4).*

### 9.3 — Hierarchical Motif Trees (Schenkerian Structure)

Heinrich Schenker's analytical theory proposes that tonal music has a hierarchical structure — at the deepest level, every tonal melody is a stepwise descent from the 3rd, 5th, or 8th degree to the tonic (the Urlinie). Above this background structure sits a middleground of prolongation and embellishment, and above that the foreground surface melody.

Implementation path: pre-plan the deepest structural skeleton (e.g., `5̂–4̂–3̂–2̂–1̂`) before any other generation, then generate foreground detail that elaborates this skeleton. Every note in the foreground should either be a structural note (part of the Urlinie) or an embellishment of one. This produces the large-scale coherence that characterizes the most enduring tonal melodies.

*Reference: Schenker, H. (1935/1979). Free Composition. Longman. Cadwallader, A. & Gagné, D. (2010). Analysis of Tonal Music: A Schenkerian Approach. Oxford University Press.*

### 9.4 — Embodied Cognition and Groove

Vijay Iyer's embodied music cognition research proposes that rhythmic experience is fundamentally physical — we feel music in our bodies before we analyze it in our minds. Groove emerges from micro-timing deviations that suggest physical gesture. The generator currently produces grid-quantized rhythms; adding controlled micro-timing would make phrases feel inhabited rather than mechanical.

Implementation path: add a `microTimingProfile` parameter to `scheduleMelody()` that offsets note onset times by genre-specific amounts (jazz: anticipate beats 2 and 4 by ~20ms; blues: push beat 4; bossa nova: specific syncopation patterns). This requires timing offsets rather than grid changes.

*Reference: Iyer, V. (2002). "Embodied Mind, Situated Cognition, and Expressive Microtiming in African-American Music." Music Perception 19(3). Keil, C. (1987). "Participatory Discrepancies and the Power of Music." Cultural Anthropology 2(3).*

### 9.5 — Cross-Cultural Melodic Universals

Savage et al. (2015) and Mehr et al. (2019) identified statistical universals across 304 and 86 world societies respectively: melodies in all cultures use a small number of pitch classes (5–7 per octave), tend to use conjunct motion, have a predominant rhythmic pulse, and show arch-shaped contours. These universals can inform defaults — the generator's baseline behavior should be consistent with cross-cultural melodic intuition, with genre deviations building on top.

The most actionable universal: **arch-shaped contour with a climax at ~60–75% of phrase length** appears in folk song across all sampled cultures. The `classical` archetype in Phase 6 reflects this, and it should be the generator's true default.

*Reference: Savage, P.E., Brown, S., Sakai, E. & Currie, T.E. (2015). "Statistical universals reveal the structures and functions of human music." PNAS 112(29). Mehr, S.A. et al. (2019). "Universality and diversity in human song." Science 366(6468).*

### 9.6 — Musical Frisson and Dopamine Triggers

Valorie Salimpoor's neuroimaging research (2011) showed that musical chills (frisson) — the physical response to particularly moving musical moments — are associated with dopamine release in the nucleus accumbens, and that dopamine release peaks *before* the emotional climax (during anticipation), not at it. This is direct neuroscientific evidence for the importance of expectation management: the pleasure is in the anticipation, not just the delivery.

Compositional implications: the most emotionally powerful moments are those where expectation has been maximally built and then precisely fulfilled. The `ListenerExpectation` system's `payoff` operation corresponds directly to the conditions that trigger frisson: accumulated expectation, slight delay, then fulfillment on a rhythmically strong position.

*Reference: Salimpoor, V.N., Benovoy, M., Larcher, K., Dagher, A. & Zatorre, R.J. (2011). "Anatomically distinct dopamine release during anticipation and experience of peak emotion to music." Nature Neuroscience 14, 257–262.*

### 9.7 — Working Memory and Phrase Length

Bob Snyder's music and memory research (2000) proposes three timescales of musical processing: echoic memory (~250ms), short-term melodic memory (~8 seconds), and long-term musical memory. Phrases longer than 8 seconds are processed as multiple chunks rather than single events, which is why most melodic phrases in all cultures are 2–8 seconds long.

Implementation: add a `phraseCoherence` check that warns (or adjusts density) when a phrase at the current tempo would exceed 8 seconds, suggesting subdivision into shorter call/response units.

*Reference: Snyder, B. (2000). Music and Memory: An Introduction. MIT Press.*

### 9.8 — Music Transformer and Relative Attention

Huang et al.'s Music Transformer (2018) applied relative self-attention to symbolic music generation, enabling the model to learn long-range dependencies between musical events (motif recall across 8+ bars) that prior RNN-based models couldn't capture. The key insight was that music is fundamentally *relational* — events matter in relation to other events, not in isolation.

This research validates the MotifRecaller approach architecturally: what the Music Transformer learned statistically, the MotifRecaller implements deterministically. A future direction would be using a lightweight Music Transformer to dynamically weight which transformation to apply at each phrase boundary, informed by what has been generated so far.

*Reference: Huang, C.A. et al. (2018). "Music Transformer: Generating Music with Long-Term Structure." ICLR 2019. arXiv:1809.04281.*

### 9.9 — Adaptive Tension Curves and Emotional Trajectory

Klaus Scherer's research on music and emotion proposes that melodies communicate emotion through a combination of structural cues (tempo, mode, register, contour) and the history of those cues over time. A slow descent in minor mode following a rapid ascent in major has a different emotional character than the reverse — even if the notes are identical.

Implementation path: add a `EmotionalTrajectoryPlanner` that sequences aesthetic modes (cantabile → declamatory → sighs → cantabile) according to a target emotional arc (e.g., hope → urgency → grief → acceptance), rather than deriving modes purely from chord quality and tension values.

*Reference: Scherer, K.R. & Zentner, M.R. (2001). "Emotional effects of music: Production rules." In P.N. Juslin & J.A. Sloboda (Eds.), Music and Emotion. Oxford University Press.*

### 9.10 — Insights from the Most Enduring Works

The following compositional principles, extracted from analytical study of the most enduring works in Western and world music history, can each be implemented as generator behaviors:

**Bach (chorales, inventions, fugues):**
- Every phrase serves a harmonic function (tonic prolongation, dominant preparation, or cadential confirmation). Map phrase roles to harmonic function explicitly.
- Melodic sequences (the same motif repeated at a different pitch level) provide both variety and coherence simultaneously. The `applySequence` transform already exists; ensure it's used at `build` phrase roles.
- Affektenlehre: specific musical gestures reliably evoke specific affects (rising major sixth = joy; falling minor second = grief). Consider adding an `affekt` parameter to the aesthetic mode system.

**Beethoven (symphonies, piano sonatas):**
- Motivic economy: the entire first movement of the 5th Symphony derives from a 4-note cell. The generator's motif family is already this concept; reinforce by ensuring `fragmentMotif` (using only 2–3 notes) is used aggressively at `build` and `climax` roles.
- Surprising harmonizations of a simple melodic line create more interest than complex melodies over static harmony.
- Sketchbooks show iterative refinement — always trying simpler alternatives first. The generator should generate 2–3 candidates for structural skeleton and pick the one with the best voice-leading score.

**Schubert (Lieder, string quartets):**
- Phrase asymmetry (5-bar phrases, 7-bar phrases) creates a sense of genuine expressive searching rather than mechanical regularity. Add a `phraseAsymmetry` parameter that allows 5- and 7-step phrase structures.
- Chromatic mediant relationships (moving to a chord a major third away) sound more inevitable than they are. These are natural neighbors in `deduceChordRootAndQuality`.

**Brahms (symphonies, chamber music):**
- Developing variation means no two appearances of a motif are identical. The `mutateMotifFamily` function implements this; ensure mutation rate is always > 0 even at `statement` roles.
- Hemiola (3+3 against 2+2+2) creates rhythmic ambiguity that sounds searching. Consider adding hemiola as a rhythmic template option in `melodyRhythm.js`.

**Debussy (Préludes, La Mer):**
- Non-functional harmony means melodic notes don't need to resolve in traditional ways — they can float above static harmonic surfaces. This is the natural mode for `genre === 'ambient'` and certain microtonal tunings.
- Color over motion: sometimes staying on the same pitch with subtle ornament is more expressive than moving. Add a `pedal` option to the motif library where `directions` stays at 0 for multiple steps.

**Charlie Parker / Bebop:**
- The guide-tone line (Phase 7) is the core. Layer chromatic approach notes and enclosures above it.
- "Playing changes" means outlining each chord's specific identity rather than staying in a key. The `stableTones`-based generation already points this direction; bebop vocabulary pushes further.
- Rhythmic displacement: starting a phrase on beat 2 or the and-of-1 rather than the downbeat. Add this as an option in `generateRhythmTemplate`.

**Miles Davis (Kind of Blue, Sketches of Spain):**
- Negative space: what you don't play. The generator currently fills gaps; jazz phrasing often lets silence be expressive. Weight gaps more heavily in jazz mode, especially in `sighs` aesthetic mode.
- Modal not functional: melody doesn't need to "go somewhere" in a tonal sense. Over static Dorian or Mixolydian, melody explores the color of the mode rather than creating harmonic motion.

**Coltrane (A Love Supreme, Giant Steps):**
- "Sheets of sound": rapid scalar passages that imply multiple harmonies simultaneously. In generator terms: at high density in `virtuoso` mode, allow the scale pool to draw from both the current chord and the next chord simultaneously.
- Giant Steps uses II-V-I cycles in three tonal centers simultaneously. This is already a chord progression concern, but the melody needs to trace each tonal center's guide tones rapidly.

**The Beatles (Revolver, Abbey Road):**
- Single highest note: statistical analysis of Beatles melodies confirms that the highest note in a song almost always appears exactly once, creating a moment of maximum intensity. The register ceiling in Phase 4 enforces this directly.
- Surprising chord tones: landing on a 9th or 13th on a downbeat instead of the root creates freshness without dissonance. Weight `stableTones` to occasionally include tensions as structural notes.

**Stevie Wonder (Songs in the Key of Life, Innervisions):**
- Rhythmic displacement of melody against the beat — the melody's natural accent falls against the harmonic rhythm. Use `applyRhythmicVariation`'s shift feature to displace phrase starts by one or two steps.
- Modal mixture: freely drawing from parallel major and minor scales. Support this in `getLocalScaleMode` by allowing a `modalMixture` flag.

**Arvo Pärt (Spiegel im Spiegel, Für Alina):**
- Tintinnabuli method: one voice traces the tonic triad (the tintinnabuli voice), while another moves stepwise above or below. This is a specific two-voice texture where the melody is always triadic, never dissonant. Relevant for `genre === 'none'` ambient implementations.

**Harry Partch / Ben Johnston / La Monte Young (microtonal composers):**
- Partch's 43-tone system was built around just intonation harmonics. His melodies are inseparable from the tuning — each scale step has a specific consonant or dissonant identity relative to the harmonic series. The generator's `divisions` system supports this in principle; a future direction would be adding `justIntonation` as a mode where interval sizes are rational ratios rather than equal divisions.
- Ben Johnston's extended just intonation uses prime-limit ratios up to the 31-limit. The `buildScalePitches` function's `periodSize` parameter could support non-octave period sizes (Bohlen-Pierce uses 3:1, for example).

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

## Research Reference Library

This section is a permanent reference for future enhancement ideas. Every entry below has direct implications for melody generation that have not yet been fully exploited.

### Music Cognition and Psychology

- **Huron, D. (2006). *Sweet Anticipation: Music and the Psychology of Expectation.* MIT Press.** — The foundational text for Phase 3.5. ITPRA model. Essential.
- **Meyer, L.B. (1956). *Emotion and Meaning in Music.* University of Chicago Press.** — Emotional meaning arises from expectation and its manipulation. Grandfather of all expectation models.
- **Narmour, E. (1990). *The Analysis and Cognition of Basic Melodic Structures.* University of Chicago Press.** — Implication-Realization model: specific melodic intervals imply specific continuations. Drives the voice-leading bias system.
- **Lerdahl, F. & Jackendoff, R. (1983). *A Generative Theory of Tonal Music.* MIT Press.** — Hierarchical phrase structure, grouping, and metrical theory. Basis for phrase grammar.
- **Snyder, B. (2000). *Music and Memory: An Introduction.* MIT Press.** — Working memory constraints on phrase length and musical chunking.
- **London, J. (2004). *Hearing in Time: Psychological Aspects of Musical Meter.* Oxford University Press.** — Rhythmic expectation and meter perception.
- **Krumhansl, C.L. (1990). *Cognitive Foundations of Musical Pitch.* Oxford University Press.** — Tonal hierarchy and key-finding. The empirical basis for weighting stable tones.
- **Deutsch, D. (Ed.) (2013). *The Psychology of Music.* 3rd ed. Academic Press.** — Comprehensive reference across all areas of music cognition.
- **Sloboda, J. (1985). *The Musical Mind: The Cognitive Psychology of Music.* Oxford University Press.** — How musicians conceptualize and produce music.
- **Bregman, A.S. (1990). *Auditory Scene Analysis: The Perceptual Organization of Sound.* MIT Press.** — Auditory streaming and Gestalt principles. Why voice-leading rules exist perceptually.
- **Clarke, E.F. (2005). *Ways of Listening: An Ecological Approach to the Perception of Musical Meaning.* Oxford University Press.** — Listening as active perception, not passive reception.
- **Zbikowski, L. (2002). *Conceptualizing Music: Cognitive Structure, Theory, and Analysis.* Oxford University Press.** — Conceptual blending and image schemas in music.

### Psychoacoustics and Neuroscience

- **Salimpoor, V.N. et al. (2011). "Anatomically distinct dopamine release during anticipation and experience of peak emotion to music." *Nature Neuroscience* 14, 257–262.** — Neuroimaging evidence that expectation, not mere stimulus, drives musical pleasure. Core justification for Phase 3.5.
- **Koelsch, S. (2011). *Brain and Music.* Wiley-Blackwell.** — Comprehensive neuroscience of music processing.
- **Zatorre, R.J. & Salimpoor, V.N. (2013). "From perception to pleasure: Music and its neural substrates." *PNAS* 110(Suppl. 2), 10430–10437.** — The pleasure circuit in musical experience.
- **Peretz, I. & Coltheart, M. (2003). "Modularity of music processing." *Nature Neuroscience* 6, 688–691.** — Pitch and rhythm are processed by separable cognitive modules.

### Information Theory and Probabilistic Models

- **Temperley, D. (2007). *Music and Probability.* MIT Press.** — Bayesian models of music perception and cognition.
- **Pearce, M.T. & Wiggins, G.A. (2006). "Expectation in Melody: The Influence of Context and Learning." *Music Perception* 22(2), 5–33.** — Empirical validation of IDyOM expectation model.
- **Pearce, M.T. (2005). *The Construction and Evaluation of Statistical Models of Melodic Structure in Music Perception and Composition.* PhD thesis, City University London.** — Full IDyOM specification.
- **Conklin, D. & Witten, I.H. (1995). "Multiple viewpoint systems for music prediction." *Journal of New Music Research* 24(1), 51–73.** — Multiple viewpoint framework for melodic prediction.
- **Shannon, C.E. (1951). "Prediction and entropy of printed English." *Bell System Technical Journal* 30(1), 50–64.** — Information theory applied to sequences; the intellectual ancestor of all statistical music models.

### Voice Leading and Music Theory

- **Tymoczko, D. (2011). *A Geometry of Music: Harmony and Counterpoint in the Extended Common Practice.* Oxford University Press.** — Voice leading as movement through pitch-class space. Geometric framework for Phase 5.
- **Lerdahl, F. (2001). *Tonal Pitch Space.* Oxford University Press.** — Quantifies psychological distance between pitches and chords. Basis for Phase 9.2.
- **Huron, D. (2001). "Tone and Voice: A Derivation of the Rules of Voice-Leading from Perceptual Principles." *Music Perception* 19(1), 1–64.** — Every classical voice-leading rule has a perceptual explanation. Essential for Phase 5.
- **Schoenberg, A. (1967). *Fundamentals of Musical Composition.* Faber & Faber.** — Developing variation as compositional method.
- **Cadwallader, A. & Gagné, D. (2010). *Analysis of Tonal Music: A Schenkerian Approach.* Oxford University Press.** — Accessible introduction to hierarchical melodic structure for Phase 9.3.

### Cross-Cultural Research

- **Savage, P.E., Brown, S., Sakai, E. & Currie, T.E. (2015). "Statistical universals reveal the structures and functions of human music." *PNAS* 112(29), 8987–8992.** — Universals across 304 world societies. Informs defaults.
- **Mehr, S.A. et al. (2019). "Universality and diversity in human song." *Science* 366(6468).** — 86-society study. Confirms arch contour and small pitch sets as universal.
- **Lomax, A. (1968). *Folk Song Style and Culture.* American Association for the Advancement of Science.** — Cantometrics: cross-cultural analysis of folk song style.
- **Nettl, B. (1983). *The Study of Ethnomusicology.* University of Illinois Press.** — Foundational ethnomusicology; non-Western melodic systems.

### Embodied Cognition and Groove

- **Iyer, V. (2002). "Embodied Mind, Situated Cognition, and Expressive Microtiming in African-American Music." *Music Perception* 19(3), 387–414.** — Groove as physical gesture. Basis for Phase 9.4.
- **Keil, C. (1987). "Participatory Discrepancies and the Power of Music." *Cultural Anthropology* 2(3), 275–283.** — Micro-timing deviations ("discrepancies") as the source of groove.
- **Pressing, J. (2002). "Black Atlantic Rhythm: Its Computational and Transcultural Foundations." *Music Perception* 19(3), 285–310.** — Rhythmic structures in African diaspora music.

### AI and Computational Music

- **Huang, C.A. et al. (2018). "Music Transformer: Generating Music with Long-Term Structure." *ICLR 2019.* arXiv:1809.04281.** — Relative self-attention for musical sequences. Validates and informs Phase 9.8.
- **Briot, J.P., Hadjeres, G. & Pachet, F.D. (2020). *Deep Learning Techniques for Music Generation.* Springer.** — Comprehensive survey of neural music generation.
- **Thickstun, J., Hall, D., Donahue, C. & Liang, P. (2023). "Anticipatory Music Transformer." arXiv:2306.08620.** — Infilling and anticipation in symbolic music generation.
- **Pachet, F. (2003). "The Continuator: Musical Interaction with Style." *Journal of New Music Research* 32(3), 333–341.** — Markov-based style continuation; Band-in-a-Box's intellectual cousin.
- **Fernández, J.D. & Vico, F. (2013). "AI Methods in Algorithmic Composition: A Comprehensive Survey." *Journal of Artificial Intelligence Research* 48, 513–582.** — Survey of all major algorithmic composition approaches.

### Microtonal Music

- **Partch, H. (1949/1974). *Genesis of a Music.* Da Capo Press.** — 43-tone just intonation system; philosophical and practical foundation for microtonal melody.
- **Johnston, B. (2006). *"Maximum Clarity" and Other Writings on Music.* University of Illinois Press.** — Extended just intonation up to 31-limit primes.
- **Helmholtz, H. (1877/1954). *On the Sensations of Tone.* Dover.** — The original scientific study of tuning, consonance, and dissonance. Still relevant.
- **Sethares, W.A. (1998). *Tuning, Timbre, Spectrum, Scale.* Springer.** — The relationship between timbre and tuning: consonance depends on which overtones are present, not just interval ratios. Directly relevant to microtonal melody with microtonal timbres.
- **Milne, A., Sethares, W. & Plamondon, J. (2007). "Isomorphic Controllers and Dynamic Tuning." *Computer Music Journal* 31(4).** — Generalizing scale theory to arbitrary tuning systems.

### Compositional Psychology

- **Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row.** — The psychological state of creative absorption; relevant to composing tool design.
- **Weisberg, R.W. (2006). *Creativity: Understanding Innovation in Problem Solving, Science, Invention, and the Arts.* Wiley.** — Beethoven's sketchbooks analyzed as evidence of iterative compositional process.
- **Sloboda, J. (2005). *Exploring the Musical Mind.* Oxford University Press.** — Essays on musical ability, development, and expertise.

### Emotion and Expression

- **Juslin, P.N. & Sloboda, J.A. (Eds.) (2010). *Handbook of Music and Emotion.* Oxford University Press.** — Comprehensive reference on music and emotion mechanisms.
- **Scherer, K.R. & Zentner, M.R. (2001). "Emotional effects of music: Production rules." In Juslin & Sloboda (Eds.), *Music and Emotion.*** — Structural cues that reliably evoke specific emotions.
- **Gabrielsson, A. (2011). "The relationship between musical structure and perceived expression." In Juslin & Sloboda (Eds.)** — How structural features map to expressive content.



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