# Melody Generator — Implementation Specification
## Four Targeted Changes (June 2026)

---

## Preamble: How to Read This Document

Each change is self-contained. The spec gives you:
- **What** to change and exactly **where** (file + line range)
- The **old code** block and the **new code** block
- The **reason** each specific line is wrong or incomplete
- **Interaction notes** where one change affects another

Work through the changes in order: 1 → 2 → 3 → 4. Changes 1–3 are
bug fixes; Change 4 is a new feature that depends on the motif cache
infrastructure already in place.

---

## Change 1: Microtonal Chord-Tone Stability Logic

### Problem Statement

User-defined `activeChordTones` (including microtonally adjusted notes)
are being filtered through hardcoded 12-EDO interval windows before they
are used as downbeat snap targets. Any chord tone that does not fall in the
root (< 0.5 semitones), third (2.5–4.5 semitones), or fifth (6.5–7.5
semitones) windows is silently excluded from `stablePcSet`, causing:

1. `enforceChordToneOnDownbeat` to treat it as a non-stable tone and
   potentially snap away from it.
2. `getStableTones` to omit it from the stable pool used for isolated-note
   snapping and countermelody downbeat snapping.

This is not a microtonal-specific bug — it also affects standard chords
with user-adjusted sevenths, ninths, or suspended fourths (e.g. the
`IIsus4` and `I7` in the test log). Any chord tone outside the root/3rd/5th
window is treated as a color tone.

**The correct mental model:** when the user provides `chordNotes` (whether
standard or microtonal), those pitches ARE the stable tones for that slot.
The system should not second-guess them by re-deriving stability from
12-EDO interval heuristics.

---

### 1A: `melodyGenerator.js` — `stablePcSet` construction (lines 715–722)

**Old code:**
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

**New code:**
```js
// Trust all user-provided chord tones as stable downbeat targets.
// 12-EDO interval filtering is removed: it was silently discarding
// user-adjusted microtonal pitches and non-root/3rd/5th chord extensions.
const stablePcSet = new Set(
    activeChordTones
        .map(ct => Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100)
);
```

---

### 1B: `melodyTuning.js` — `getStableTones()` (lines 110–129)

**Old code:**
```js
export function getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches) {
    const chordKeyPc = ((chordKey % periodSize) + periodSize) % periodSize;
    const keyRootPc  = ((keyRoot  % periodSize) + periodSize) % periodSize;
    const stable = [];

    (activeChordTones.length > 0 ? activeChordTones : validPitches).forEach(ct => {
        const relPc = (((ct % periodSize) + periodSize) % periodSize - chordKeyPc + periodSize) % periodSize;
        const isRoot  = relPc < 0.51 || relPc > periodSize - 0.51;
        const isThird = relPc > 2.49 && relPc < 4.51;
        const isFifth = relPc > 6.49 && relPc < 7.51;
        if (isRoot || isThird || isFifth) stable.push(ct);
    });

    validPitches.forEach(p => {
        const pc = ((p % periodSize) + periodSize) % periodSize;
        if (Math.abs(pc - keyRootPc) < 0.01 && !stable.includes(p)) stable.push(p);
    });

    return stable.length > 0 ? stable.sort((a, b) => a - b) : validPitches;
}
```

**New code:**
```js
export function getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches) {
    // If the caller has explicit chord tones (standard or microtonal),
    // those are definitionally the stable tones for this slot.
    // Do not re-derive stability via 12-EDO interval heuristics.
    if (activeChordTones.length > 0) {
        return activeChordTones.slice().sort((a, b) => a - b);
    }

    // Fallback: no explicit chord tones provided, derive from validPitches.
    // This path only runs for slots where chordNotes was empty or undefined.
    const keyRootPc = ((keyRoot % periodSize) + periodSize) % periodSize;
    const stable = validPitches.filter(p => {
        const pc = ((p % periodSize) + periodSize) % periodSize;
        return Math.abs(pc - keyRootPc) < 0.01;
    });
    return stable.length > 0 ? stable.sort((a, b) => a - b) : validPitches;
}
```

**Note on the fallback path:** The original fallback (key-root octaves in
`validPitches`) is preserved. If no `chordNotes` are passed, the system
falls back to key-root octaves as the safest snap targets, which is
correct behavior for unharmonized or bare slots.

---

### 1C: `melodyTuning.js` — `enforceChordToneOnDownbeat()` (lines 131–137)

**Old code:**
```js
export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, stablePcSet, periodSize) {
    if (activeChordTones.length === 0) return anchor;
    const pc = ((anchor % periodSize) + periodSize) % periodSize;
    const roundedPc = Math.round(pc * 100) / 100;
    if (stablePcSet.has(roundedPc)) return anchor;   // ← gate that lets microtonal tones slip through
    return findClosest(anchor, activeChordTones);
}
```

**New code:**
```js
export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, stablePcSet, periodSize) {
    // stablePcSet is now all activeChordTones (see Change 1A), so the
    // "already stable" check is still useful for short-circuit performance.
    if (activeChordTones.length === 0) return anchor;
    const pc = ((anchor % periodSize) + periodSize) % periodSize;
    const roundedPc = Math.round(pc * 100) / 100;
    if (stablePcSet.has(roundedPc)) return anchor;
    return findClosest(anchor, activeChordTones);
}
```

**Note:** The function body is unchanged, but with the corrected
`stablePcSet` from 1A, the `stablePcSet.has(roundedPc)` check now passes
for all user-provided chord tones (including microtonal ones), so the
function will correctly return the `anchor` unchanged when it already
lands on a valid chord tone, and snap to the nearest one when it doesn't.
No signature change is needed.

---

### 1D: `melodyGenerator.js` — Resolution Rule A (lines 1847–1854)

This block has a separate 12-EDO stability bug that is independent of
`stablePcSet`. It filters `activeChordTones` using modulo-divisions
arithmetic that doesn't correspond to actual pitch class math:

**Old code:**
```js
const stableTones = activeChordTones.filter(ct => {
    const diff = ((ct % divisions) - (chordKey % divisions) + divisions) % divisions;
    const norm = Math.round((diff / divisions) * 12);
    return [0, 3, 4].includes(norm);
});
```

**Problem:** `ct % divisions` is not pitch-class math — it's treating
the pitch value as a division count. For MIDI pitch 72 with divisions=12,
`72 % 12 = 0`, which happens to give the right pitch class by coincidence
in 12-EDO, but breaks entirely for microtonal divisions (e.g. 13-EDO:
`72 % 13 = 7`) and for any chord tone with a microtonal offset.

**New code:**
```js
// All user-provided chord tones are stable resolution targets.
// Use them directly rather than re-filtering through interval heuristics.
const stableTones = activeChordTones.length > 0
    ? activeChordTones
    : validPitches;
```

**Rationale:** Resolution Rule A fires at consequent phrase endings to
ensure the final note lands on a chord tone. Since `activeChordTones` are
already the correct stable tones (after Change 1A-1C), there is no need
to re-filter them here. If `activeChordTones` is empty, fall back to
`validPitches` (which already includes scale-tone safety nets).

---

## Change 2: Countermelody Direction Memory

### Problem Statement

`findClosestStep()` in `melodyTuning.js` (line 74) selects a random
direction (`Math.random() > 0.5 ? 1 : -1`) on every call with no memory
of previous steps. This causes the countermelody to perform a symmetric
random walk anchored at a fixed pitch, producing the oscillation seen in
the log (Slot 0: 36 notes between pitches 59, 60, 62).

The fix has three components:
1. A new `findDirectedStep()` function in `melodyTuning.js` that takes an
   explicit direction bias and a "no-return" pitch guard.
2. Two new module-level state variables in `melodyGenerator.js` to carry
   phrase-level direction across note-by-note calls.
3. Phrase-boundary logic to set the direction at the start of each
   4-bar phrase based on where the melody is going.

---

### 2A: `melodyTuning.js` — Add `findDirectedStep()`

Add this function after `findClosestStep()` (after line 88):

```js
/**
 * Stepwise movement with direction memory and no-return guard.
 *
 * @param {number}  prev          - The current pitch to move from.
 * @param {number[]} scalePitches - The available pitch pool.
 * @param {number}  directionBias - +1 (ascending), -1 (descending), 0 (free).
 * @param {number|null} lastPitch - The pitch before `prev`; prevents
 *                                  immediately reversing to it.
 * @returns {number} The next pitch.
 */
export function findDirectedStep(prev, scalePitches, directionBias, lastPitch = null) {
    if (scalePitches.length === 0) return prev;

    const idx = findScaleIndex(prev, scalePitches);
    const anchorIdx = idx !== -1 ? idx : (() => {
        const closest = findClosest(prev, scalePitches);
        return findScaleIndex(closest, scalePitches);
    })();

    if (anchorIdx === -1) return findClosest(prev, scalePitches);

    // Resolve direction: use bias if provided, else choose randomly.
    let dir = directionBias !== 0 ? directionBias : (Math.random() > 0.5 ? 1 : -1);

    // Attempt primary step in chosen direction.
    let nextIdx = anchorIdx + dir;

    // If we'd step off the edge, reverse direction.
    if (nextIdx < 0 || nextIdx >= scalePitches.length) {
        dir = -dir;
        nextIdx = anchorIdx + dir;
    }

    // No-return guard: if this step would land back on lastPitch,
    // try extending one more step in the same direction.
    if (lastPitch !== null && nextIdx >= 0 && nextIdx < scalePitches.length) {
        if (Math.abs(scalePitches[nextIdx] - lastPitch) < 0.01) {
            const extendedIdx = anchorIdx + dir * 2;
            if (extendedIdx >= 0 && extendedIdx < scalePitches.length) {
                nextIdx = extendedIdx;
            }
        }
    }

    return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, nextIdx))];
}
```

Export it by adding `findDirectedStep` to any named-export list, or
ensure the file uses individual `export function` declarations (it already
does, so no change needed to the export pattern).

---

### 2B: `melodyGenerator.js` — Add phrase-level direction state (module globals)

Add these two variables in the globals block near line 60–85, alongside
the existing `globalPrevCounterPitch` declaration:

```js
// Countermelody phrase direction memory (Change 2)
let counterPhraseDirectionBias = 0;    // +1 ascending, -1 descending, 0 neutral
let counterPhraseStepsRemaining = 0;   // steps left in the current direction commitment
let counterLastPitch = null;           // one-step-back memory for no-return guard
```

Also add `counterLastPitch = null` and `counterPhraseStepsRemaining = 0`
to the `clearMelodyMemory()` function (around line 97) so they reset with
transport stops.

---

### 2C: `melodyGenerator.js` — Set direction bias at phrase boundaries

The phrase boundary block fires when `absIndex % 4 === 0` (i.e., the
start of each 4-bar phrase). Locate the block where `phraseRhythmTemplate`
and `phraseActivityCurve` are reset (around lines 150–280). At the end of
that block, after `activeAestheticMode = mode;` (line 278), add:

```js
// ── Countermelody direction planning (Change 2) ─────────────────────────
// At the start of each phrase, decide which direction the countermelody
// should travel. Contrary motion is the default: if the melody is heading
// toward a higher anchor, the countermelody heads down, and vice versa.
if (absIndex % 4 === 0) {
    // `plannedAnchor1` for this slot is computed in Phase A below, but we
    // can use `globalPrevAnchor` as a proxy for the outgoing melodic pitch.
    const melodicOutgoing = globalPrevAnchor !== null ? globalPrevAnchor : (keyRoot + 12);
    const melodicIncoming = keyRoot + 12; // conservative: assume melody targets octave above root

    // Contrary motion: melody going up → counter goes down, and vice versa.
    if (melodicIncoming > melodicOutgoing + 1.0) {
        counterPhraseDirectionBias = -1;
    } else if (melodicIncoming < melodicOutgoing - 1.0) {
        counterPhraseDirectionBias = 1;
    } else {
        // Melody is staying level: alternate phrase-to-phrase
        counterPhraseDirectionBias = -counterPhraseDirectionBias || 1;
    }
    // Commit to this direction for at least 6 notes before reconsidering.
    counterPhraseStepsRemaining = 6;
}
```

**Note:** `plannedAnchor1` is calculated later in Phase A (line 698). If
you want more accurate foresight, move this block to after Phase A, using
the actual `plannedAnchor1` value instead of `melodicIncoming`. The key
invariant is that the direction is set once per phrase, not once per note.

---

### 2D: `melodyGenerator.js` — Replace `findClosestStep` calls in countermelody paths

Add the import at the top of `melodyGenerator.js` (update the import from
`melodyTuning.js` around line 6–23):

```js
import {
    // ... existing imports ...
    findDirectedStep,   // ← add this
} from './melodyTuning.js';
```

Then replace each `findClosestStep(prevCounterPitch, counterValidPitches, divisions)`
call in the countermelody pitch-selection block (lines ~1679–1721) with
`findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch)`.

There are four call sites to replace. Locate them by searching for
`findClosestStep(prevCounterPitch` in the file. The surrounding contexts are:

**Call site 1** — `call-response` mode fallback (line ~1679):
```js
// OLD:
counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
// NEW:
counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch);
```

**Call site 2** — `contrary` mode `else` branch (line ~1696):
```js
// OLD:
counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
// NEW:
counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch);
```

**Call site 3** — `cantabile` aesthetic mode `else` branch (line ~1709):
```js
// OLD:
counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
// NEW:
counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch);
```

**Call site 4** — `declamatory` aesthetic mode `else` branch (line ~1721):
```js
// OLD:
counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
// NEW:
counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch);
```

Also replace the stuck-pitch escape hatch at lines ~1738–1748, which also
uses a random direction coin-flip:

**Call site 5** — stuck-pitch escape (line ~1741):
```js
// OLD:
const dir = Math.random() > 0.5 ? 1 : -1;
let newIdx = idx + dir;
// NEW:
const dir = counterPhraseDirectionBias !== 0 ? counterPhraseDirectionBias : (Math.random() > 0.5 ? 1 : -1);
let newIdx = idx + dir;
```

---

### 2E: `melodyGenerator.js` — Update state after each countermelody note

After `prevCounterPitch = counterPitch;` (line ~1786), add:

```js
// Update direction memory (Change 2)
counterLastPitch = prevCounterPitch;
if (counterPhraseStepsRemaining > 0) {
    counterPhraseStepsRemaining--;
} else {
    // Direction commitment expired: check if we should reverse.
    // Reverse if we've traveled more than 5 scale steps from phrase start
    // in the committed direction (prevents runaway drift to register extremes).
    const counterIdx = findScaleIndex(counterPitch, counterValidPitches);
    const counterBottom = findScaleIndex(counterValidPitches[0], counterValidPitches);
    const counterTop = findScaleIndex(counterValidPitches[counterValidPitches.length - 1], counterValidPitches);
    if (counterIdx <= counterBottom + 1 || counterIdx >= counterTop - 1) {
        counterPhraseDirectionBias = -counterPhraseDirectionBias;
        counterPhraseStepsRemaining = 4; // brief re-commitment after reversal
    }
}
```

Also add `counterLastPitch = null` in `clearMelodyMemory()`.

---

## Change 3: Rhythm Constraint and Density Balance

### Problem Statement

Two distinct issues:

**Issue A — Melody template is soft, not hard:** After `stepPlaysMap` is
built from `slotRhythmTemplate` (line 1132–1133, a true hard constraint),
the gap-filling pass at lines 1149–1182 can add extra notes into template
silences whenever `density > 0.4`. At density 0.75, nearly every gap gets
filled, effectively erasing the template. The template produces the
rhythmic identity; the gap-filler destroys it.

**Issue B — Countermelody does not yield to melody:** The countermelody
`counterPlays` flag is set independently of `melodyPlays`. When both are
true simultaneously, the countermelody adds a note on top of the melody
note rather than filling the silence around it. This is the direct cause
of the density imbalance seen in the logs (Slot 0: 2 melody notes, 36
countermelody notes — the countermelody is not filling rests; it is
playing everywhere regardless of whether the melody is also active).

---

### 3A: `melodyGenerator.js` — Raise the gap-fill density threshold

Locate the gap-filling block starting at line 1149. Change only the guard
condition:

**Old code (line 1149):**
```js
if (settings.genre !== 'none' && settings.density > 0.4) {
```

**New code:**
```js
// Gap filling should only engage at very high density settings.
// At moderate density the template IS the rhythmic hook; don't fill it.
if (settings.genre !== 'none' && settings.density > 0.75) {
```

This preserves the gap-fill behavior (which does produce musically useful
fills during virtuoso/high-density runs) but prevents it from triggering
at typical working densities (0.4–0.75) where the template should dominate.

---

### 3B: `melodyGenerator.js` — Melody-aware countermelody gating

Locate the `counterPlays` assignment in the Phase C loop (lines 1353–1363).
Currently this block sets `counterPlays` from template or probability
with no reference to `melodyPlays`. Add the melody-awareness gate
**after** `counterPlays` is assigned and **before** the `if (counterPlays)`
block that begins at line 1637:

```js
// ── Melody-awareness gate (Change 3B) ────────────────────────────────────
// When melody is playing, sharply reduce countermelody probability.
// Exception: 'harmonize' mode is supposed to double the melody.
// Exception: 'call-response' mode manages its own split-time logic above.
if (
    counterPlays &&
    melodyPlays &&
    settings.countermelodyMode !== 'harmonize' &&
    settings.countermelodyMode !== 'call-response'
) {
    // 15% chance to keep the countermelody active when melody is playing.
    // This allows occasional harmonic touches without cluttering the texture.
    counterPlays = Math.random() < 0.15;
}
```

**Where exactly to place this:** Find the line `if (settings.countermelodyEnabled) {`
at line ~1628 and place the gate block immediately before the inner
`if (counterPlays) {` block that begins at line ~1637. The structure
becomes:

```js
if (settings.countermelodyEnabled) {
    let counterPlays = false;
    // ... existing counterPlays assignment logic ...

    // ← INSERT Change 3B gate block HERE

    if (counterPlays) {
        // ... countermelody pitch selection ...
    }
}
```

---

### 3C: Countermelody template offset — make it more complementary

The countermelody's rhythm template is currently derived from the melody
template by a random offset (lines 755–762):

```js
const counterOffset = Math.floor(Math.random() * 8);
for (let i = 0; i < 16; i++) {
    slotCounterRhythmTemplate[i] = slotRhythmTemplate[(i + counterOffset) % 16];
}
```

A random offset can accidentally produce a near-identical pattern to the
melody template, giving them the same rhythmic peaks. Replace with a
**complement** approach: the countermelody template is active where the
melody template is silent, plus a small probability of shared beats:

```js
// Build a complementary countermelody rhythm template (Change 3C).
// Primary rule: play in melody rests. Secondary rule: occasional shared beat.
const counterOverlapProb = settings.countermelodyMode === 'harmonize' ? 0.5 : 0.15;
for (let i = 0; i < 16; i++) {
    if (slotRhythmTemplate[i] === 0) {
        // Melody is silent here — countermelody has higher play probability
        slotCounterRhythmTemplate[i] = Math.random() < 0.65 ? 1 : 0;
    } else {
        // Melody is active here — countermelody plays only occasionally
        slotCounterRhythmTemplate[i] = Math.random() < counterOverlapProb ? 1 : 0;
    }
}
// Always ensure step 0 of the countermelody is active (anchor downbeat)
slotCounterRhythmTemplate[0] = 1;
```

**Interaction with Change 3B:** Change 3B is a runtime gate applied per
note in Phase C. Change 3C is a template-level decision made in Phase A.
Both are needed: 3C sets the structural intention; 3B adds runtime
flexibility so a melody note that appears on a step the counter-template
expected silence doesn't force awkward timing.

---

## Change 4: SongFormCoordinator — A-B-A Thematic Recall

### Problem Statement

The existing `motifCache` stores one motif family per key/mode string and
regenerates it stochastically on each progression loop. There is no memory
of *which* loop generated *which* material, so there is no way to
deliberately recall Section A material in a Section A' recapitulation.

The existing `originalHook` mechanism (lines 649–651, 663–665) is a
partial solution — it recapitulates the very first hook at progress > 0.9
— but it applies only within a single loop, fires too late (last 10%), and
does not control rhythm or aesthetic mode, so the recall is not audibly
recognizable.

The SongFormCoordinator replaces this with a three-section (A / B / A')
form that assigns roles across progression loops and enforces material
recall with both pitch content and rhythm template.

---

### 4A: `melodyGenerator.js` — Add SongForm module-level state (module globals)

Add these after the `motifCache` and `originalHook` declarations (around
line 53):

```js
// ── SongFormCoordinator state (Change 4) ─────────────────────────────────
let songFormSection = 'A';           // Current section: 'A', 'B', or 'A_prime'
let sectionAMotifFamily = null;      // Stored motif family from section A
let sectionARhythmTemplate = null;   // Stored rhythm template from section A
let sectionAAestheticMode = null;    // Stored aesthetic mode from section A
let sectionAChordRootPc = null;      // Pitch class of the first chord in section A
                                     // (used for transposition in A')
```

Also add resets for all five in `clearMelodyMemory()`:

```js
songFormSection = 'A';
sectionAMotifFamily = null;
sectionARhythmTemplate = null;
sectionAAestheticMode = null;
sectionAChordRootPc = null;
```

---

### 4B: `melodyGenerator.js` — Assign section at loop boundary

The loop boundary fires when `justLooped === true` (line 443 sets this).
Locate the `if (justLooped)` handling and within it (or immediately after
`progressionLoopCounter++` at line ~445), add the section assignment:

```js
// ── SongFormCoordinator: section assignment (Change 4B) ──────────────────
// Map loop count to section in a repeating A / B / A' / A / B / A' pattern.
// Loop 0 → A (generate and store)
// Loop 1 → B (generate fresh, different material)
// Loop 2 → A' (recall section A material with transposition)
const sectionCycle = progressionLoopCounter % 3;
songFormSection = ['A', 'B', 'A_prime'][sectionCycle];
```

---

### 4C: `melodyGenerator.js` — Store Section A material

Section A material must be stored after it is generated, not before. The
motif family is generated/retrieved at lines 627–647. Add a storage block
immediately after line 647 (`motifCache[motifKey] = motifFamily;`):

```js
// ── SongFormCoordinator: store Section A material (Change 4C) ─────────────
if (songFormSection === 'A' && absIndex === 0) {
    // Store on the very first slot of Section A.
    sectionAMotifFamily = {
        hook:        [...motifFamily.hook],
        connector:   [...motifFamily.connector],
        cadence:     [...motifFamily.cadence],
        hookRhythm:  [...motifFamily.hookRhythm],
    };
    sectionARhythmTemplate = phraseRhythmTemplate.length > 0
        ? [...phraseRhythmTemplate]
        : null;
    sectionAAestheticMode = activeAestheticMode;
    // Record the pitch class of the current chord root for A' transposition.
    sectionAChordRootPc = ((chordKey % periodSize) + periodSize) % periodSize;
}
```

---

### 4D: `melodyGenerator.js` — Recall Section A material in A'

Add the A' recall block immediately after the storage block in 4C (i.e.,
after the new block above, still within the motif selection section):

```js
// ── SongFormCoordinator: recall Section A in A' (Change 4D) ──────────────
if (songFormSection === 'A_prime' && sectionAMotifFamily !== null && absIndex % 4 === 0) {
    // Compute the scale-degree shift between section A's first chord root
    // and the current chord root. This transposes the motif to fit the
    // current harmony while preserving its shape.
    const currentChordRootPc = ((chordKey % periodSize) + periodSize) % periodSize;
    const pcDelta = currentChordRootPc - sectionAChordRootPc;

    // Find the shift in scale-degree steps (not semitones) within validPitches.
    // We want to move each pitch by the number of scale steps corresponding
    // to the root-to-root interval, staying diatonic to the current key.
    const referenceShiftSteps = (() => {
        // Approximate: count how many scale steps the pcDelta covers.
        const stepSize = 12.0 / divisions;
        // Find the scale index of the reference pitch (keyRoot) and of
        // (keyRoot + pcDelta) within globalScalePitches, then return the
        // difference in index.
        const refPitch = keyRoot;
        const shiftedPitch = keyRoot + pcDelta;
        const refIdx = findScaleIndex(findClosest(refPitch, globalScalePitches), globalScalePitches);
        const shiftedIdx = findScaleIndex(findClosest(shiftedPitch, globalScalePitches), globalScalePitches);
        if (refIdx === -1 || shiftedIdx === -1) return 0;
        return shiftedIdx - refIdx;
    })();

    // Transpose each motif cell by the computed scale-step shift.
    const recallHook = applySequence(sectionAMotifFamily.hook, validPitches, referenceShiftSteps);
    const recallConnector = applySequence(sectionAMotifFamily.connector, validPitches, referenceShiftSteps);
    const recallCadence = applySequence(sectionAMotifFamily.cadence, validPitches, referenceShiftSteps);

    // Override the active motif family for this phrase with the recalled material.
    motifFamily = {
        hook:       recallHook,
        connector:  recallConnector,
        cadence:    recallCadence,
        hookRhythm: [...sectionAMotifFamily.hookRhythm], // rhythm is recalled exactly
    };
    motifCache[`${state.baseKey}_${state.mode}`] = motifFamily;

    // Restore section A's rhythm template so the rhythmic shape is recognizable.
    if (sectionARhythmTemplate !== null) {
        phraseRhythmTemplate = [...sectionARhythmTemplate];
        // Counter template is rebuilt from the melody template in the existing
        // countermelody template derivation block (Change 3C), so no action needed here.
    }

    // Log the recall for diagnostics.
    if (typeof console !== 'undefined') {
        console.log(`[SongForm] A' recall at absIndex ${absIndex}: rootShift=${referenceShiftSteps} steps`);
    }
}
```

---

### 4E: `melodyGenerator.js` — Remove the old `originalHook` recapitulation

The old mechanism at lines 649–651 and 663–665 is now superseded. Remove
or comment it out to prevent it from fighting the SongFormCoordinator:

**Lines 649–651 (old):**
```js
// REMOVE:
if (originalHook === null && motifFamily && motifFamily.hook) {
    originalHook = [...motifFamily.hook];
}
```

**Lines 663–665 (old):**
```js
// REMOVE:
if (progressVal > 0.9 && originalHook && settings.genre !== 'none') {
    currentCell = originalHook;
}
```

Also remove the module-level `let originalHook = null;` declaration (line
~54) and its reset in `clearMelodyMemory()`.

**Why:** `originalHook` recapitulates within a single loop at 90% progress.
The SongFormCoordinator operates across loops and controls the full phrase,
including rhythm. Keeping both creates a conflict at the A'/end-of-loop
boundary where two different "recall" mechanisms fight for the same motif
slot.

---

## Integration Checklist

Before shipping, verify the following end-to-end behaviors:

### Change 1 verification
- [ ] Create a chord with a user-adjusted microtonal 7th (e.g. Bbm7 with
      Bb slightly flattened). Confirm the melody lands on that Bb on
      beat 1 rather than snapping to the nearest 12-EDO pitch.
- [ ] Create a `sus4` chord. Confirm the 4th is treated as a downbeat
      chord tone, not a "non-stable" color tone to be avoided.
- [ ] Run the `v°` slot from the test log. The chord `[51, 55.09, 59]`
      should have `55.09` treated as a valid downbeat pitch, and the
      melody should occasionally land on it.

### Change 2 verification
- [ ] Run Slot 0 (I, virtuoso, 8-beat duration). The countermelody should
      traverse a discernible melodic arc across the slot rather than
      oscillating between 59/60/62.
- [ ] Check that after 4–6 steps the direction does NOT reverse unless the
      register boundary is hit.
- [ ] Check that transport stop + restart resets all direction state.

### Change 3 verification
- [ ] At density 0.5, confirm the rhythm template's silent beats stay
      silent in the melody. No gap-filling should occur below density 0.75.
- [ ] Confirm countermelody notes are sparse when melody notes are dense
      (virtuoso mode) and denser when melody is resting (cantabile mode
      with only 2–3 melody notes per bar).
- [ ] Confirm 'harmonize' mode countermelody still doubles the melody
      (Change 3B's `counterOverlapProb = 0.5` path via 3C, and the
      `countermelodyMode !== 'harmonize'` gate in 3B).

### Change 4 verification
- [ ] Play through 3 full progression loops. Check console for
      `[SongForm] A' recall` message on loop 2.
- [ ] The A' loop should have a recognizable resemblance to loop A's
      melodic opening shape, even if transposed by the chord root difference.
- [ ] The B section (loop 1) should sound clearly different from A — fresh
      motif material, no recall.
- [ ] On loop 3 (which becomes section A again), fresh A material is
      generated and stored, overwriting the previous A. This is correct
      behavior for an evolving form.

---

## Known Limitations of This Implementation

**Change 4 — Transposition precision:** `applySequence()` in
`melodyMotifs.js` shifts by a fixed number of scale steps in `validPitches`.
If the A-section chord and the A'-section chord have different scale
contexts (e.g., A is over a major chord, A' is over a minor chord), the
transposition may produce scale-degree mismatches. A more robust solution
would re-derive the motif from scratch using the A-section's *interval
pattern* rather than its *absolute pitches*, but this requires refactoring
`generateSeedMotif()` to return relative intervals. That is out of scope
here; the current implementation will produce good results when the
key/mode is stable across loops.

**Change 2 — Direction planning accuracy:** The direction bias is planned
at `absIndex === 0` using `globalPrevAnchor` as the outgoing pitch proxy.
This is a best approximation available before Phase A runs. If you want
exact contrary motion against the actual `plannedAnchor1` of each slot,
move the direction planning block to after Phase A (after line ~699) and
reuse `plannedAnchor1` directly as `melodicIncoming`.

**Change 3 — Template complement may create dense countermelody on sparse
templates:** If the melody template is very sparse (e.g., only steps 0 and
8 active), the complement will make the countermelody active on the other
14 steps. The Change 3B melody-awareness gate will reduce actual output,
but the template itself will show high activity. If this causes issues at
very low density settings, add a cap: after building the complement, limit
total active steps to `Math.round(settings.density * 12)`.
