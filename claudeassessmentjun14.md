Looking at your logs and code carefully, I can identify the core issues clearly. Let me be direct: the theory machinery is sophisticated, but several architectural problems are actively undermining it, and fixing those is more valuable than adding more complexity.

---

## Critical Bugs First (These Explain the "Simple" Sound)

### 1. The Countermelody Oscillation Bug — Your Biggest Problem

Look at Slot 0's countermelody in the log:
```
Pitch 62, 62, 60, 59, 60, 59, 60, 62, 60, 59, 60, 59, 60, 62, 60, 59, 60, 62...
```
**36 notes bouncing between three pitches.** This is coming from `findClosestStep` in `melodyTuning.js`:

```js
const dir = Math.random() > 0.5 ? 1 : -1;
```

It picks a random direction with no memory. Without a direction bias, it random-walks in place — statistically, it will oscillate. This single bug makes the countermelody sound like a CPU stuck in a loop, because it is.

**Fix:** Track a direction variable that persists across notes and only reverses when you hit a phrase boundary or a target pitch:

```js
export function findDirectedStep(prev, scalePitches, directionBias, lastPitch) {
    const idx = findScaleIndex(prev, scalePitches);
    if (idx === -1) return findClosest(prev, scalePitches);
    
    // Prevent immediate return to previous pitch
    const noReturn = lastPitch !== null 
        ? scalePitches.filter(p => Math.abs(p - lastPitch) > 0.01)
        : scalePitches;
    
    // Use direction bias: +1 ascending, -1 descending, 0 random
    const dir = directionBias !== 0 
        ? directionBias 
        : (Math.random() > 0.5 ? 1 : -1);
    
    let nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= scalePitches.length) nextIdx = idx - dir;
    
    return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, nextIdx))];
}
```

The countermelody generator needs a `phraseDirectionBias` that it commits to for 4–8 steps before reconsidering.

---

### 2. Microtonal Pitch Leaking Into Standard Slots

In the log:
```
Voiced Chord Notes passed: [51, 55.09090909090909, 59]
...
Note #2 at Step 16: Pitch 67.0909090909091
```

The value `55.09090909090909` is 12 × (6/13) × something — this looks like Bohlen-Pierce or 13-EDO math leaking into a 12-EDO slot. The countermelody then inherits the float pitch and it propagates.

The issue is that `findClosest` in `melodyTuning.js` will snap to `67.0909...` if it's in the `scalePitches` array, and microtonal chord tones are getting passed into `buildScalePitches` without being sanitized first.

**Fix:** Add a tuning context guard. Before any pitch enters the melody scheduler, quantize to the current tuning's grid:

```js
export function quantizePitchToTuning(pitch, divisions, periodSize = 12.0) {
    const stepSize = periodSize / divisions;
    return Math.round(pitch / stepSize) * stepSize;
}
```

And in your slot setup, check whether the chord voicing pitches are in the correct EDO before passing them as `scalePitches` anchors.

---

### 3. Density Imbalance (Melody 2 notes, Countermelody 36)

Slot 0: 2 melody notes vs. 36 countermelody notes. This is backwards from good counterpoint — the countermelody should *breathe in the silence* of the melody, not crowd it out.

The countermelody should probabilistically check whether the melody is currently active at a given step and reduce its note probability during melody activity:

```js
const melodyActiveAtStep = melodyScheduled.some(n => 
    n.step <= step && (n.step + n.durationSteps) > step
);
const counterProb = melodyActiveAtStep ? 0.2 : 0.8;
```

---

## Architectural Recommendations

### Thematic Repetition Across Phrases

Your `melodyMotifs.js` has `generateMotifFamily`, `applyInversion`, `applyRetrograde`, `applySequence` — these are excellent tools that aren't being wired into a higher-level coordinator. Here's the structure you're missing:

```
SongFormCoordinator
    ├── Section A (bars 1-4): Generate motifFamily, store as "theme"
    ├── Section A' (bars 5-8): Recall theme, apply light mutation or sequence
    ├── Section B (bars 9-12): Apply inversion/retrograde, new harmonic area  
    └── Section A'' (bars 13-16): Recall theme, resolve cadence
```

The key is that motif recall must be **exact enough to be recognizable** but **varied enough to feel developed**. A rule of thumb: keep the rhythm identical on recall, but allow pitch transposition by the interval between the phrase roots.

```js
// In your top-level generator, before slot generation begins:
const songForm = planSongForm(totalSlots); 
// Returns: [{role: 'A', motifPolicy: 'generate'}, {role: 'A', motifPolicy: 'recall'}, ...]

// When role === 'recall', retrieve the stored motifFamily and apply:
const recalledMotif = applySequence(storedMotifFamily.hook, currentPool, chordRootShift);
```

The `chordRootShift` is the scale-degree distance between the original phrase's root and the current chord's root — this gives you automatic tonal transposition.

---

### Countermelody as True Counterpoint

Rather than a separate generator, consider the countermelody as a **response layer** that's aware of what the melody did:

**Rule set for countermelody:**

1. **Contrary motion preference** — if melody moved up N scale steps, bias countermelody down N/2 steps
2. **Fill rests** — countermelody plays in melody rests; melody has priority on strong beats
3. **No parallel octaves/fifths** — check the interval between melody and countermelody at every simultaneous onset
4. **Answer the question** — if the melody phrase ended on a non-tonic pitch (question), the countermelody's next phrase should resolve to a stable tone (answer), and vice versa

```js
function getCountermelodyBias(melodyPhrase) {
    const melodyNetMotion = melodyPhrase[melodyPhrase.length - 1].pitch 
        - melodyPhrase[0].pitch;
    // Contrary: if melody went up, we go down
    return melodyNetMotion > 0 ? -1 : (melodyNetMotion < 0 ? 1 : 0);
}
```

The parallel interval check is critical — this is one of the most common algorithmic composition mistakes:

```js
function hasParallelFifthOrOctave(m1, m2, c1, c2, periodSize = 12) {
    const int1 = Math.abs((m1 - c1) % periodSize);
    const int2 = Math.abs((m2 - c2) % periodSize);
    const badIntervals = [0, 7]; // octave, fifth (in semitones)
    return badIntervals.includes(int1) && badIntervals.includes(int2) && int1 === int2;
}
```

---

### Microtonal Voice Leading (Bohlen-Pierce / Custom EDOs)

For non-12-EDO tuning systems, the fundamental issue is that concepts like "step," "third," and "fifth" need to be redefined in terms of the EDO's own interval taxonomy, not borrowed from 12-EDO.

For **Bohlen-Pierce** (13 steps per tritave, period = 3:1 = 1902¢):
- The "consonant" intervals are at scale steps 3, 4, 6, 7, 10 (the BP "thirds" and "fifths")
- Voice leading targets should snap to these, not to 12-EDO thirds/fifths

The cleanest approach is a **tuning-aware interval table** that replaces hardcoded semitone values:

```js
export function getTuningProfile(divisions, periodSize) {
    // For 12-EDO: stepSize=1, consonantIntervals=[0,3,4,7,8,9]
    // For BP (13-ED3): stepSize=146.3¢, consonantIntervals=[0,3,4,6,7,10]
    // For 19-EDO: stepSize=63.2¢, consonantIntervals=[0,5,6,11,14,16]
    
    const stepSize = periodSize / divisions;
    
    // These should be configured per-tuning, not derived:
    const TUNING_CONSONANCES = {
        '12_12': [0, 3, 4, 7, 8, 9],
        '13_1902': [0, 3, 4, 6, 7, 10],   // Bohlen-Pierce
        '19_12': [0, 5, 6, 11, 14, 16],
        '31_12': [0, 8, 10, 18, 23, 26],
    };
    
    const key = `${divisions}_${Math.round(periodSize)}`;
    return {
        stepSize,
        consonantSteps: TUNING_CONSONANCES[key] || [0, Math.floor(divisions/4), 
                         Math.floor(divisions/3), Math.floor(divisions/2)],
    };
}
```

Then `getStableTones`, `enforceChordToneOnDownbeat`, and all voice-leading functions take the tuning profile instead of assuming `periodSize=12` with semitone intervals.

---

## Why the C64 Sounded Better

Your instinct is right about the C64 Mozart program. Those programs typically used:

1. **Hard phrase arcs** — note 1 establishes tonic, notes 2-6 climb, note 7 is the peak, notes 8-12 descend, note 16 cadences. Non-negotiable structure.
2. **A small, curated pitch pool** — rarely more than 7 notes per phrase, always scale tones
3. **Rhythm first** — rhythm patterns were selected from a library (like your `TEMPLATES` in `melodyRhythm.js`) and pitches were fitted to them, not the reverse
4. **Simple contrary motion for the bass** — not a sophisticated countermelody, just: bass goes opposite to melody

Your system generates pitches *before* fully committing to rhythm, and the rhythm templates exist but may not be constraining generation strongly enough. The `generateRhythmTemplate` in `melodyRhythm.js` returns a 16-step array but if the actual note scheduler can override it based on density/subdivision logic, the phrase shape dissolves.

**The single highest-value fix:** Make the rhythm template a hard constraint, not a probability weight. If the template says step 3 is silent, it must be silent, regardless of density or subdivision settings. This alone will likely make phrases feel dramatically more intentional — the perceivable "shape" of a melody is mostly its rhythm, not its pitches.

---

## Priority Order

1. Fix the countermelody oscillation bug (direction memory) — biggest audible impact
2. Add rhythm template as hard constraint
3. Add the parallel-fifths/octaves check between melody and countermelody
4. Implement the SongFormCoordinator for motif recall across phrases
5. Add the tuning profile system for microtonal EDO consistency

The first three are bugs. The last two are features. Fix the bugs first — they're swamping everything else.


Me:
the app allows microtonal adjustment of chord notes by the user, as well as custom chords with microtonally adjustable notes, so some chords in the sequence I attached the log for are intentionally microtonal, and the melody generation is supposed to respect that. Was that recognized in your assessment?

You're absolutely right — I misread that. Let me re-examine with that context.Yes, I see it now. The code is handling microtonal pitches throughout — `findClosest()`, `getStableTones()`, `enforceChordToneOnDownbeat()` all work with arbitrary floats. The 0.01 tolerance in `findScaleIndex()` is appropriate for distinguishing between exact and microtonal pitches. The `periodSize` parameter is used consistently.

So the microtonal chord notes (like `55.09090909090909`) *should* be respected as valid melodic targets. That's not a bug — that's by design.

**But this actually reveals a different, more subtle problem:**

Given that you're allowing arbitrary microtonal chord inputs, the real issue is that **the voice-leading logic is still making 12-EDO assumptions about what constitutes "consonance."** Look at `getStableTones()`:

```js
const isThird = relPc > 2.49 && relPc < 4.51;   // minor or major 3rd
const isFifth = relPc > 6.49 && relPc < 7.51;   // perfect 5th (and close alterations)
```

These interval windows are hardcoded for 12-EDO. If a user creates a custom chord with a microtonal 11th or a quasi-microtonal altered 5th, those checks will either:
1. Falsely classify it as a 3rd or 5th (if it falls in those windows by accident), or
2. Not classify it as stable at all (if it's truly outside 12-EDO territory)

This means microtonal chord tones get treated as non-stable "passing tones" even when they're the *actual structural pitches of the chord.*

Then the downbeat enforcement (`enforceChordToneOnDownbeat`) uses `stablePcSet` — which comes from those flawed interval boundaries — to decide whether to snap the melody to the chord. If your microtonal pitch wasn't flagged as "stable," it won't be enforced on downbeats, and the melody might end up on an unintended pitch.

**The fix is context-aware stability:** 

Rather than deriving stability from interval windows, **pass the actual `activeChordTones` explicitly and use *membership* to define stability**:

```js
export function getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches) {
    // If user has provided explicit chord tones (including microtonal),
    // those ARE the stable tones. Don't try to infer them.
    if (activeChordTones.length > 0) {
        return activeChordTones.sort((a, b) => a - b);
    }
    
    // Only if no explicit chord tones, fall back to deriving from intervals
    // (and this should probably respect some tuning-aware interval table)
    const stable = [];
    validPitches.forEach(p => {
        const relPc = (((p % periodSize) + periodSize) % periodSize - 
                       ((chordKey % periodSize) + periodSize) % periodSize + periodSize) % periodSize;
        const isRoot  = relPc < 0.51 || relPc > periodSize - 0.51;
        const isThird = relPc > 2.49 && relPc < 4.51;
        const isFifth = relPc > 6.49 && relPc < 7.51;
        if (isRoot || isThird || isFifth) stable.push(p);
    });
    
    return stable.length > 0 ? stable.sort((a, b) => a - b) : validPitches;
}
```

And in `enforceChordToneOnDownbeat()`, change the logic:

```js
export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, periodSize) {
    if (activeChordTones.length === 0) return anchor;
    
    // User has provided explicit chord tones; enforce landing on one of them
    return findClosest(anchor, activeChordTones);
}
```

Remove the `stablePcSet` check entirely — if the user has declared chord tones (including microtonals), those are gospel.

---

**Secondary issue specific to microtonals:** The `buildScalePitches()` function assumes a regular EDO grid:

```js
const pitch = keyRoot + oct * periodSize + intervals[i] * stepSize;
```

This works fine when `intervals` are integers in the EDO. But if a user is mixing 12-EDO scale tones with microtonal chord adjustments, the melody's `validPitches` pool might include both standard scale tones *and* microtonal chord tones from `activeChordTones`. That's actually good — the melody should have access to both.

The issue is: does the rest of the code know to treat them equally? Let me check the main generator logic...The file is very long. Let me look for where `activeChordTones` is actually used in note selection:Now let me look at the critical line 727-730 where `enforceChordToneOnDownbeat` is called:**There it is.** Lines 715-722 are the problem:

```js
const stablePcSet = new Set(
    activeChordTones
        .filter(ct => {
            const relPc = ((ct - chordKey) % periodSize + periodSize) % periodSize;
            return relPc < 0.5 || (relPc > 2.5 && relPc < 4.5) || (relPc > 6.5 && relPc < 7.5);
        })
        .map(ct => Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100)
);
```

This is filtering `activeChordTones` through 12-EDO interval windows (root, 3rd, 5th). Any microtonal chord tone that doesn't fall in those ranges gets filtered out of `stablePcSet`. Then on line 727/730, `enforceChordToneOnDownbeat()` checks membership in `stablePcSet`:

```js
export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, stablePcSet, periodSize) {
    if (activeChordTones.length === 0) return anchor;
    const pc = ((anchor % periodSize) + periodSize) % periodSize;
    const roundedPc = Math.round(pc * 100) / 100;
    if (stablePcSet.has(roundedPc)) return anchor;  // <-- only enforces if in the "stable" set
    return findClosest(anchor, activeChordTones);
}
```

So if a user adds a microtonal 7th or 11th to a chord (pitches that are musically essential to that chord), they get filtered out of `stablePcSet`, and then the downbeat enforcement treats them as non-essential "color tones" and is allowed to snap away from them.

---

## The Corrected Diagnosis

**The system is NOT respecting user-provided microtonal chord tones properly on downbeats.** The fix is simple:

**In `melodyGenerator.js`, lines 715-722, remove the interval filtering:**

```js
// OLD - filters out microtonals
const stablePcSet = new Set(
    activeChordTones
        .filter(ct => {
            const relPc = ((ct - chordKey) % periodSize + periodSize) % periodSize;
            return relPc < 0.5 || (relPc > 2.5 && relPc < 4.5) || (relPc > 6.5 && relPc < 7.5);
        })
        .map(ct => Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100)
);

// NEW - trusts user input
const stablePcSet = new Set(
    activeChordTones
        .map(ct => Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100)
);
```

**And simplify `enforceChordToneOnDownbeat()` in `melodyTuning.js`:**

```js
export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, stablePcSet, periodSize) {
    if (activeChordTones.length === 0) return anchor;
    // If user provided chord tones (including any microtonals), landing on one is always preferred
    return findClosest(anchor, activeChordTones);
}
```

This removes the interval-window gatekeeping and trusts that if the user said "these pitches are in the chord," they should be honored.

---

The countermelody oscillation and rhythm template issues I mentioned earlier are still real bugs that affect the overall musicality, but **the microtonal disrespect is a genuine violation of user intent**. Fix this first.