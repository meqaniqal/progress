# Progress Melody Generator Audit (Revised — Post-Fixes)

## Executive Summary
The three melody generators (legacy, pro, mgen) have been significantly improved by prior fixes: envelope clamping was relaxed (50ms threshold, proportional values), `releaseStartsAtDuration` was unified to `false` (no more premature cutoff), FM and plucked-square now respect user ADSR sliders, MGEN now passes `gapAfter` to synthesis, and `findClosest()` now accepts a `maxDistance` parameter. The remaining unfixed issues are lower-priority pitch selection edge cases (foreshadowing role assignment, post-processing constraints, cadence forcing) and architectural gaps (state clearing, sample envelope mapping).

---

## FIXED ISSUES (Previously Reported, Now Resolved)

### Issue 1.1: Envelope Clamping Overrides Sliders — **FIXED**
**Location:** `synthEngines.js:3-38`
**Status:** ✅ Resolved in commit `89000a7`

**What was fixed:**
- Threshold relaxed from 150ms to 50ms (line 10: `isShort = duration < 0.05`)
- Short notes now get proportional attack/decay (10% of duration) instead of forced 0.002/0
- Short notes get a minimal decay phase (`Math.max(0.002, Math.min(decay, duration * 0.1))`) instead of forced 0
- Short notes get a proper release (`Math.max(0.005, Math.min(release, Math.max(0.005, gapAfter)))`) instead of forced 0.008
- `releaseStartsAtDuration` hardcoded to `false` (line 14) — release always starts at `startTime + duration`

**Before:** Short notes (< 150ms) got attack=0.002, decay=0, sustain=1.0, release=0.008, release starting before nominal note end.

**After:** Short notes (< 50ms) get proportional, musically-shaped envelopes with a minimal decay phase and release starting at the nominal note end.

---

### Issue 1.2: `releaseStartsAtDuration` Creates Discontinuities — **FIXED**
**Location:** `synthEngines.js:14`
**Status:** ✅ Resolved

**What was fixed:** `releaseStartsAtDuration` is now hardcoded to `false` (line 14). All synth types (sine, triangle, sawtooth, sawtooth-bass, fm, plucked-square, square) now use the unified "else" branch: release always starts at `startTime + duration`, oscillator stops at `startTime + duration + releaseTime + 0.05`.

**Before:** Short notes had release starting before nominal note end (`startTime + duration - releaseTime`), creating audible discontinuities.

**After:** All notes have consistent release behavior — release starts at the nominal note end regardless of duration.

---

### Issue 1.4: FM Synth Ignores User ADSR — **FIXED**
**Location:** `synthEngines.js:278-280`
**Status:** ✅ Resolved

**What was fixed:** FM synth now constructs `adsrParam` from `params.adsr` (user sliders) and passes it to `getEnvelopeTimes()`:
```javascript
const adsrParam = params.adsr || { attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime };
const env = getEnvelopeTimes(duration, adsrParam, params.gapAfter);
```

**Before:** FM constructed its own envelope `{ attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime }`, ignoring `params.adsr` entirely.

**After:** FM uses user ADSR sliders as the primary source, falling back to FM-specific defaults only if no sliders provided.

---

### Issue 1.5: Plucked-Square Ignores User ADSR — **FIXED**
**Location:** `synthEngines.js:340-341`
**Status:** ✅ Resolved

**What was fixed:** Plucked-square now constructs `adsrParam` from `params.adsr` and passes it to `getEnvelopeTimes()`:
```javascript
const adsrParam = params.adsr || { attack: CONFIG.ATTACK_TIME * 0.5, decay: decayTime, sustain: 0.1, release: CONFIG.RELEASE_TIME };
const env = getEnvelopeTimes(duration, adsrParam, params.gapAfter);
```

**Before:** Plucked-square constructed its own envelope, ignoring user ADSR sliders.

**After:** Plucked-square uses user ADSR sliders as the primary source.

---

### Issue 1.6: Sample Engines Use Ratio-Based Envelope — **FIXED**
**Location:** `synthEngines.js:41-59`
**Status:** ✅ Resolved

**What was fixed:** Sample engines now use absolute time mapping capped at a fraction of sample length:
```javascript
const safeAttack = Math.min(attack, sampleLength * 0.2);
const safeDecay = Math.min(decay, sampleLength * 0.4);
const safeRelease = Math.min(release, sampleLength * 0.4);
```

**Before:** Decay/release were computed as ratios (`decayRaw / 2.0`), producing non-linear, sample-dependent envelope shapes.

**After:** Slider maps to absolute time, capped at a fraction of sample length. Predictable behavior across samples.

---

### Issue 1.7: Karplus-Strong Ignores ADSR (DISABLED) — **NOT APPLICABLE**
**Location:** `synthEngines.js:463` (previously)
**Status:** ⏸️ Not applicable — Karplus-Strong oscillator was disabled by the author and has been removed from the codebase.

---

### Issue 2.5: `findClosest()` Has No Tolerance — **FIXED**
**Location:** `melodyTuning.js:82-89`
**Status:** ✅ Resolved

**What was fixed:** `findClosest()` now accepts an optional `maxDistance` parameter:
```javascript
export function findClosest(val, array, maxDistance = null) {
    if (array.length === 0) return val;
    const closest = array.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
    if (maxDistance !== null && Math.abs(closest - val) > maxDistance) {
        return val;
    }
    return closest;
}
```

**Before:** `findClosest()` had no tolerance — if the closest pitch was 5 semitones away, it still returned that.

**After:** Callers can pass `maxDistance` (e.g., 3 semitones). If no pitch within tolerance exists, returns the original `val` instead of a distant pitch.

---

### Issue 4.1: MGEN Doesn't Pass `gapAfter` — **FIXED**
**Location:** `mgenEngine.js:382, 397`
**Status:** ✅ Resolved

**What was fixed:** MGEN now computes and passes `gapAfter` to `playToneFn()`:
```javascript
const gapAfterSeconds = nextNote ? ((nextNote.stepTime - (note.stepTime + note.noteDuration)) * beatLen) : 999;
// ...
{ gapAfter: gapAfterSeconds }
```

**Before:** MGEN did not pass `gapAfter`, causing `getEnvelopeTimes()` to default to `gapAfter = 999` (infinite space), taking the "has space" branch with different clamping.

**After:** MGEN passes the same `gapAfter` as legacy/pro, ensuring consistent envelope behavior across all three engines.

---

## REMAINING ISSUES (Not Yet Fixed)

### Issue 2.1: Foreshadow Notes (`foreshadow_note`) Can Land Off-Key — **REMAINING**
**Category:** BUG
**Location:** `melodyScheduler.js:1431-1437`
**Verified:** Yes — code still calls `findClosest(target, effectiveValidPitches)` without checking if the result is a chord tone of the next chord.

**Current behavior:** When `clusterRole === 'foreshadow_note'`, the code calls `getDistinctiveNextTone()` to get a pitch from the next chord, wraps it into melody range, then calls `findClosest(target, effectiveValidPitches)`. If the next chord's notes, when transposed into the melody range, don't exist in `effectiveValidPitches`, `findClosest()` snaps to the nearest available pitch, which could be a scale tone that is **not a chord tone of the next chord**.

**Impact:** Isolated notes that sound "wrong" in isolation but "correct" when the next chord arrives.

**Fix:** When `findClosest()` returns a pitch that is not a chord tone of the next chord (distance > 2 semitones from any next-chord-note octave equivalent), fall back to the closest next-chord-note octave equivalent instead of the closest valid pitch.

**Risk:** Low — single conditional check, ~5 lines.

---

### Issue 2.2: Foreshadow Glue Notes Use Next Scale, Not Next Chord — **REMAINING**
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1441-1463`
**Verified:** Yes — code still builds scale from next chord's root/mode.

**Current behavior:** `foreshadow_glue` notes build a scale from the **next chord's root** using the **next chord's mode**. The resulting pitch is a scale tone of the next chord, not necessarily a chord tone or scale tone of the current chord.

**Impact:** Notes played during chord A that are actually notes from chord B's scale. "Correct" only if the listener anticipates the chord change.

**Fix:** Prefer scale tones that are common to both the current and next chord's scales. If no common tone exists, use the current chord's scale tone closest to the next chord's root (stepwise approach).

**Risk:** Low-Medium — changes foreshadowing character, could make melodies less interesting.

---

### Issue 2.3: Color Tone Sanitation — **PARTIALLY FIXED**
**Category:** BUG
**Location:** `melodyScheduler.js:1867-1889`
**Verified:** Yes — code now checks **both** previous and next notes are chord tones (line 1886: `!isPrevChordTone` added), but still preserves color tones that become orphans when surrounding notes are not chord tones.

**What was fixed:** The sanitation pass now checks that **both** the previous AND next notes are chord tones before preserving a color tone (line 1886: `!isNextChordTone || !isStepwise || !isPrevChordTone`).

**What remains:** If the surrounding notes are not chord tones (due to other generation bugs), the color tone still becomes an orphan. The fix only helps when surrounding notes happen to be chord tones.

**Fix:** After preserving a color tone, verify that both surrounding notes are actually chord tones of the current chord. If not, snap the color tone to the closest chord tone.

**Risk:** Low — single conditional check, ~3 lines.

---

### Issue 2.4: Post-Processing Foreshadowing Overwrites Notes — **PARTIALLY FIXED**
**Category:** BUG
**Location:** `melodyScheduler.js:1893-1920`
**Verified:** Yes — code now has three constraints (lines 1900-1911), but the constraints are still permissive enough to overwrite some notes.

**What was fixed:** The post-processing foreshadowing now checks:
1. Original note was a chord tone of the current chord (line 1901: `isOrigChordTone`)
2. Next-chord tone is within 3 semitones of the original (line 1911: `Math.abs(target - n.pitch) <= 3.01`)
3. The target is stepwise from the previous note (line 1909: `isStepwiseFromPrev`)

**What remains:** The constraints are still permissive enough to overwrite notes in edge cases. The `isStepwiseFromPrev` check uses `!prevActiveNote || ...` which means the first note in a phrase always passes this check.

**Fix:** Add a minimum silence duration check (e.g., `silenceDuration > 0.8 * beatLen` instead of `0.6 * beatLen`) and require that the original note was on a strong beat position (not a weak passing position).

**Risk:** Medium — changes melody character, could reduce foreshadowing interest.

---

### Issue 2.6: Voice-Leading Collision Prevention — **REMOVED FROM CODE**
**Category:** N/A
**Location:** Previously `melodyScheduler.js:1612-1634`
**Status:** ✅ Resolved — the voice-leading collision prevention block has been removed from the current code. The isolated notes safety snap (line 1614-1617) remains but only snaps to stable tones (root/third), not adjacent scale degrees.

---

### Issue 2.7: MGEN Harmonic Snapping Defaults to Major — **REMAINING**
**Category:** BUG
**Location:** `mgen/src/orchestrator.js:626-644`
**Verified:** Yes — quality parsing still only handles `min`, `min7`, `dim`, `aug`, `7`, `maj7`. Non-standard qualities (sus4, sus2, add9) default to major [0, 4, 7].

**Impact:** Structural notes that should be chord tones get snapped to wrong pitches when chord symbols are ambiguous.

**Fix:** Add parsing for common non-standard qualities (sus4, sus2, add9, maj7, min7, dim7, aug7). If quality is unparseable, fall back to `activeChord.notes` (if available) rather than hardcoded intervals.

**Risk:** Low — ~10 lines, adds quality parsing cases.

---

### Issue 2.8: Professional Engine's Blue Note Handling — **REMAINING**
**Category:** DESIGN FLAW
**Location:** `professionalMelodyScheduler.js:366-389`
**Verified:** Yes — blue notes still only applied when `hasStepwiseSupport` is true, but the "Chromatic Support Gate" forces surrounding notes that may not actually be generated.

**Impact:** Blue notes that sound "wrong" because their supporting context was artificially created but not actually realized.

**Fix:** Check whether the surrounding "forced" notes actually exist in the final output before applying blue notes.

**Risk:** Low — ~5 lines, adds a post-generation check.

---

### Issue 2.9: MGEN Deduplication Discards Correct Notes — **REMAINING**
**Category:** DESIGN FLAW
**Location:** `mgen/src/orchestrator.js:454-489`
**Verified:** Yes — deduplication still uses role priority (structural > cadence > connector > ornament > expectation) without harmonic correctness tiebreaker.

**Fix:** When deduplicating, prefer the note that is closer to a chord tone of the current harmony, even if it has a lower role priority.

**Risk:** Low-Medium — ~5 lines, adds a harmonic correctness comparison.

---

### Issue 3.1: Cluster Creation Throws Notes Close Together — **REMAINING**
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1184-1243`
**Verified:** Yes — cluster creation still activates adjacent grid steps (as close as `subStepDuration` = ~0.031s at 16th notes, 120 BPM).

**Impact:** Two notes 0.031 seconds apart sound like a single articulated note with an irregular envelope.

**Fix:** Enforce a minimum separation between clustered notes (e.g., `subStepDuration * 2` instead of `subStepDuration`). Or reduce cluster probability for notes at high subdivision levels.

**Risk:** Medium — changes rhythmic character, could make melodies less interesting.

---

### Issue 3.2: Cluster Role Assignment — **REMAINING**
**Category:** BUG
**Location:** `melodyScheduler.js:1218-1230`
**Verified:** Yes — backward-neighbor clusters still assign `foreshadow_note` to the earlier note in time (line 1220-1221), creating "backwards foreshadowing."

**Impact:** Next-chord tone played before current chord tone, creating "off-key" sensation.

**Fix:** For backward-neighbor clusters, swap role assignment: the earlier note gets `reinforce`, the later note gets `foreshadow_note`.

**Risk:** Low — ~3 lines, swaps two assignments.

---

### Issue 3.3: Rubato Warps Modify `stepTime` In Place — **REMAINING**
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1283-1312`
**Verified:** Yes — rubato warps still modify `stepTime` in place (line 1309: `runSteps[i].stepTime = t_start + D * warpFn(x)`).

**Impact:** Non-uniform spacing breaks cluster detection and overlap prevention logic.

**Fix:** Apply warps to a copy of `stepTime` for playback only, not to the grid step's `stepTime` property.

**Risk:** Medium — changes timing character, could affect musical feel.

---

### Issue 3.4: Legato Duration Scaling — **REMAINING**
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1314-1321`
**Verified:** Yes — note durations still scaled based on gap to next note (`current.noteDuration = gap * mult`).

**Fix:** Allow a minimum duration floor (e.g., `max(minDuration, gap * mult)`) where `minDuration` is at least one sixteenth note.

**Risk:** Low — ~3 lines, adds a minimum floor.

---

### Issue 3.5: Overlap Prevention Truncates Notes — **REMAINING**
**Category:** BUG
**Location:** `melodyScheduler.js:1861-1863`
**Verified:** Yes — notes are still truncated to `Math.max(0.01, nextTime - n.stepTime)` without preserving envelope release tails.

**Fix:** Instead of hard truncation, apply a smooth release tail: if `noteDuration > nextTime - stepTime`, set `noteDuration = nextTime - stepTime` but ensure a minimum release time (e.g., `max(0.015, min(release, nextTime - stepTime))`) is preserved in the envelope.

**Risk:** Low — ~5 lines, adds envelope-aware truncation.

---

### Issue 3.6: MGEN Duration Clamping — **REMAINING**
**Category:** BUG
**Location:** `mgen/src/orchestrator.js:162-169`
**Verified:** Yes — durations still clamped to `timeToNext` without a minimum sustain floor.

**Fix:** Allow a minimum sustain time (e.g., `max(timeToNext, minSustainDuration)`) where `minSustainDuration` is at least one sixteenth note.

**Risk:** Low — ~3 lines, adds a minimum floor.

---

### Issue 4.2: `clearMelodyMemory()` Doesn't Clear Professional Engine State — **REMAINING**
**Category:** BUG
**Location:** `melodyGenerator.js:14-17`
**Verified:** Yes — `clearMelodyMemory()` still only clears `activeContext = defaultContext()` and `clearMgenCache()`. Professional engine state (`context.proPhraseArch`, `context.proTensionTracker`, etc.) is not cleared.

**Fix:** Add clearing of `context.proPhraseArch`, `context.proTensionTracker`, `context.proRegisterTracker`, and `context.proRhythmicCohesion` to `clearMelodyMemory()`.

**Risk:** Low — ~5 lines, adds state clearing.

---

### Issue 4.4: Local Scale Mode Switching — **REMAINING**
**Category:** DESIGN FLAW
**Location:** `melodyScheduler.js:285-308`
**Verified:** Yes — scale switching still changes intervals when chord mode differs from global mode.

**Fix:** When switching scales, check if the previous note's pitch class is valid in the new scale. If not, snap it to the closest valid pitch class in the new scale.

**Risk:** Low-Medium — ~5 lines, could change melodic character at chord boundaries.

---

### Issue 4.5: Pitch Class Rounding — **REMAINING**
**Category:** BUG
**Location:** Multiple locations (e.g., `melodyScheduler.js:283`, `melodyScheduler.js:479`)
**Verified:** Yes — pitch classes still rounded to 2 decimal places, causing close pitches to be treated as different.

**Fix:** Use a tolerance-based comparison for pitch class matching (e.g., `Math.abs(pc1 - pc2) < 0.01`) instead of exact equality checks.

**Risk:** Low — ~5 lines across multiple locations, adds tolerance comparison.

---

### Issue 4.6: `validPitches` Pool Can Become Empty — **REMAINING**
**Category:** BUG
**Location:** `melodyScheduler.js:339`, `melodyScheduler.js:1401-1406`
**Verified:** Yes — filtered pitch pools can still become empty or very narrow after additional filtering.

**Fix:** Add a minimum pool size check. If the filtered pool has fewer than 3 pitches, fall back to the unfiltered `validPitches` instead of the filtered pool.

**Risk:** Low — ~3 lines, adds a fallback check.

---

### Issue 5.1: Professional Isolation Uses Grid Steps — **REMAINING**
**Category:** BUG
**Location:** `professionalMelodyScheduler.js:263-264`
**Verified:** Yes — `isIsolated` still checks grid step activity, not actual note end times.

**Fix:** Check actual note end times (`prevNote.stepTime + prevNote.noteDuration`) instead of grid step activity.

**Risk:** Low — ~3 lines, changes isolation detection.

---

### Issue 5.3: Professional Cadence Forcing — **REMAINING**
**Category:** BUG
**Location:** `professionalMelodyScheduler.js:402-409`
**Verified:** Yes — cadence forcing still uses `findClosest(chordRoot, effectiveValidPitches)` which may return off-key pitches when `effectiveValidPitches` is narrowed.

**Fix:** When cadence forcing, use the unfiltered `validPitches` (not the narrowed `effectiveValidPitches`) to ensure the cadence note lands on the correct chord root or fifth.

**Risk:** Low — ~3 lines, changes cadence resolution.

---

### Issue 6.1: Countermelody Dissonant Clashes — **REMAINING**
**Category:** BUG
**Location:** `melodyCountermelody.js:197-218`
**Verified:** Yes — polyphonic collision check still nudges to adjacent scale degree, which may still be within 1 EDO step (minor second).

**Fix:** After nudging, verify the resulting interval is consonant (major/minor third, perfect fourth/fifth, octave). If not, nudge again or skip the countermelody note.

**Risk:** Low-Medium — ~5 lines, could change countermelody character.

---

### Issue 6.3: Countermelody Duration Minimum — **REMAINING**
**Category:** DESIGN CHOICE
**Location:** `melodyCountermelody.js:221-226`
**Verified:** Yes — minimum duration still fixed at `beatDuration * 0.5`.

**Fix:** Make the minimum duration adaptive: `max(beatDuration * 0.25, beatDuration * 0.5 * densityFactor)`.

**Risk:** Low — ~3 lines, makes countermelody more flexible.

---

## Summary of Root Causes (Remaining)

**Pitch Issues:**
1. Foreshadowing logic selects next-chord tones played during current chord, creating notes that are "correct" only if the listener anticipates the chord change
2. Color tone sanitation preserves passing tones that become orphans when surrounding notes aren't chord tones
3. Post-processing foreshadowing still overwrites some notes despite added constraints
4. MGEN harmonic snapping defaults to major chord intervals when chord symbols are non-standard
5. Blue note handling can produce off-key notes when supporting context is filtered out

**Timing Issues:**
6. Cluster creation throws notes very close together (2-3 grid steps apart)
7. Backwards foreshadowing in clusters plays next-chord tone before current chord tone
8. Rubato warps modify `stepTime` in place, breaking cluster detection
9. Overlap prevention truncates notes without preserving envelope release tails

**Architectural Issues:**
10. `clearMelodyMemory()` doesn't clear professional engine state
11. Local scale switching creates pitch discontinuities at chord boundaries
12. Pitch class rounding causes notes to be filtered out incorrectly
13. Empty/narrow pitch pools after aggressive filtering

---

## Priority Matrix (Remaining Issues Only)

| Priority | Issue | Category | File | Lines | Impact | Risk |
|---|---|---|---|---|---|---|
| P1 | Foreshadow notes land off-key | BUG | melodyScheduler.js | 1431-1437 | High — causes "wrong" isolated notes | Low |
| P1 | Color tone orphan notes | BUG | melodyScheduler.js | 1867-1889 | Medium — isolated off-key notes | Low |
| P1 | Backwards foreshadowing in clusters | BUG | melodyScheduler.js | 1218-1230 | Medium — next-chord tone before current chord | Low |
| P1 | Overlap prevention truncates notes | BUG | melodyScheduler.js | 1861-1863 | Medium — "cut off" sounds | Low |
| P1 | MGEN harmonic snapping defaults to major | BUG | mgen/src/orchestrator.js | 626-644 | Medium — wrong pitches for non-standard chords | Low |
| P1 | `clearMelodyMemory()` doesn't clear pro state | BUG | melodyGenerator.js | 14-17 | Low — stale state on engine switch | Low |
| P1 | Professional cadence forcing off-key | BUG | professionalMelodyScheduler.js | 402-409 | Medium — cadential "off" notes | Low |
| P1 | Professional isolation uses grid steps | BUG | professionalMelodyScheduler.js | 263-264 | Low — doesn't account for note duration overlap | Low |
| P1 | Blue note handling without stepwise support | DESIGN FLAW | professionalMelodyScheduler.js | 366-389 | Low — isolated blue notes sound wrong | Low |
| P1 | MGEN deduplication discards correct notes | DESIGN FLAW | mgen/src/orchestrator.js | 454-489 | Low — role priority overrides harmonic correctness | Low-Medium |
| P2 | Foreshadow glue uses next scale | DESIGN CHOICE | melodyScheduler.js | 1441-1463 | Medium — notes from next chord's scale | Low |
| P2 | Post-processing foreshadowing still overwrites | BUG | melodyScheduler.js | 1893-1920 | Medium — some notes still overwritten | Medium |
| P2 | Cluster creation throws notes close together | DESIGN CHOICE | melodyScheduler.js | 1184-1243 | High — "thrown together" sensation | Medium |
| P2 | Rubato warps modify stepTime in place | DESIGN CHOICE | melodyScheduler.js | 1283-1312 | Medium — breaks cluster detection | Medium |
| P2 | Legato duration scaling | DESIGN CHOICE | melodyScheduler.js | 1314-1321 | Medium — variable note lengths | Low |
| P2 | MGEN duration clamping | BUG | mgen/src/orchestrator.js | 162-169 | Medium — notes clamped to near-zero | Low |
| P2 | Countermelody dissonant clashes | BUG | melodyCountermelody.js | 197-218 | Medium — minor seconds/tritones with melody | Low-Medium |
| P3 | Local scale switching discontinuities | DESIGN FLAW | melodyScheduler.js | 285-308 | Low — musically defensible but jarring | Low-Medium |
| P3 | Pitch class rounding inconsistencies | BUG | Multiple | varies | Low — notes filtered out incorrectly | Low |
| P3 | Empty/narrow pitch pools | BUG | melodyScheduler.js | 339, 1401-1406 | Medium — fallback returns distant pitches | Low |
| P3 | Countermelody duration minimum | DESIGN CHOICE | melodyCountermelody.js | 221-226 | Low — rings through melody notes | Low |

---

## Why Professional Mode Sounds Better

The professional mode produces better results because:

1. **No post-processing foreshadowing** — it doesn't have the pitch-overwrite pass (melodyScheduler.js:1893-1920) that replaces notes with next-chord tones.
2. **Stricter isolation handling** — isolated notes are constrained to chord tones only (professionalMelodyScheduler.js:269-270), not the full valid pitch pool.
3. **No cluster creation** — the professional engine doesn't have the cluster creation logic that throws notes close together (melodyScheduler.js:1184-1243).
4. **No rubato warps** — the professional engine uses uniform grid timing, not non-linear warps.
5. **NCT taxonomy pre-gating** — non-chord tones are explicitly categorized and constrained, reducing the chance of orphan notes.

However, the professional mode still suffers from cadence forcing (Issue 5.3), blue note handling (Issue 2.8), and isolation detection using grid steps (Issue 5.1).
