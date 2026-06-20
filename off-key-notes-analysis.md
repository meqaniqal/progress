# Isolated Off-Key Notes in Melody Scheduler — Analysis

## Context

The melody scheduler generates notes per chord slot. Each chord remembers which **global scale** it was selected from. Each slot may use a **local scale** (derived from the chord's quality) when `isLocalScale` is true. The global scale is only used for chord availability — **notes should be evaluated against the active (local) scale for that slot, not the global scale.**

## Root Cause

`globalScalePcSet` (built from the global scale's pitch classes at line 282) is used in **6 places** for pitch validation, filtering, and logging. When `isLocalScale` is true, the active scale differs from the global scale, so these checks incorrectly flag valid local-scale notes as "off-key" or "color tones," causing `findClosest` to snap to chromatic chord tones that are genuinely off-key.

## Affected Locations

### Bug 1: Chromaticity check during pruning (line 327)

```js
const isChromaticChordTone = !globalScalePcSet.has(ctPc);
```

**Problem:** When `isLocalScale` is true, a chord tone that belongs to the local scale but not the global scale is incorrectly flagged as "chromatic." This causes it to be pruned from `prunedScalePitches`, creating gaps in the valid pitch pool. `findClosest` then snaps to whatever is numerically closest — often a chromatic chord tone that's off-key.

**Fix:** Build an `activeScalePcSet` after `scalePitches` is determined (line 315) and use it here.

### Bug 2: Foreshadowing distinctive tone check (line 484)

```js
return !globalScalePcSet.has(pc);
```

**Problem:** `getDistinctiveNextTone()` checks the next chord's notes against the *current slot's* global scale, not the local scale. This can cause foreshadow notes to target pitches off-key for the current local scale.

**Fix:** Use the active scale's PC set.

### Bug 3: Color tone filtering (line 1372)

```js
if (!canUseColorTone && settings.genre !== 'none') {
    effectiveValidPitches = effectiveValidPitches.filter(p => {
        const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
        return globalScalePcSet.has(pc) || chordTonePcSet.has(pc);
    });
}
```

**Problem:** When `isLocalScale` is true, notes valid in the local scale but not the global scale get filtered out as "color tones" and replaced via `findClosest` — potentially with an off-key pitch.

**Fix:** Use `activeScalePcSet` instead of `globalScalePcSet`.

### Bug 4: `prevPitchIsColor` tracking (line 1607)

```js
prevPitchIsColor = !globalScalePcSet.has(pitchPc) && !chordTonePcSet.has(pitchPc);
```

**Problem:** Feeds into `canUseColorTone` (line 1365). When `isLocalScale` is true, local-scale notes get incorrectly marked as "color" if not in the global scale, restricting valid pitch choices.

**Fix:** Use `activeScalePcSet`.

### Bug 5: Final color tracking (line 1852)

```js
globalPrevPitchIsColor = !globalScalePcSet.has(finalPc) && !chordTonePcSet.has(finalPc);
```

**Problem:** Same as Bug 4 — persists incorrect color state across slots.

**Fix:** Use `activeScalePcSet`.

### Bug 6: Debug logging (line 1910)

```js
const isScaleTone = globalScalePcSet.has(Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100);
```

**Problem:** Labels local-scale notes as "off-key" in the console because it checks against the global scale. This creates the visual impression of isolated off-key notes even when the notes are correct for the local scale.

**Fix:** Use `activeScalePcSet`.

## Where `globalScalePcSet` Should Be Kept

- **Line 298** — The overlap compatibility check (`sharedCount >= 3`) that decides whether to activate local scale. This *intentionally* compares the candidate local scale against the global scale to ensure sufficient pitch class overlap. This is correct as-is.

## Proposed Fix Pattern

After line 315 (where `scalePitches` is determined), add:

```js
const activeScalePcSet = new Set(
    scalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100)
);
```

Then replace `globalScalePcSet` with `activeScalePcSet` at the 6 locations listed above.

## Clarifying Questions for Implementation

1. **Chromaticity check (Bug 1):** When `isLocalScale` is true, should a chord tone that's in the local scale but not the global scale count as "chromatic" or "in-scale"? Currently it's treated as chromatic (outside the scale), which causes pruning. With the fix, it would be treated as in-scale — is this the desired behavior?

2. **Foreshadowing (Bug 2):** Should `getDistinctiveNextTone()` check against the *next chord's* local scale (if it has one) or the current slot's active scale?

3. **`applyMotivicFlexing` (line 1647):** Currently receives `globalScalePcSet`. Should it receive `activeScalePcSet` instead?

## Files Involved

- `/Users/sheldonlawrence/Desktop/progress/melodyScheduler.js` — lines 327, 484, 1372, 1607, 1852, 1910
- `/Users/sheldonlawrence/Desktop/progress/melodyTuning.js` — helper functions (`findClosest`, `findScaleIndex`, `getStableTones`, etc.)
