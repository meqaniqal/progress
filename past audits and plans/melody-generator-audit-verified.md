# Progress Melody Generator Audit (Verified)

## Executive Summary
All three melody generators (legacy, pro, mgen) share underlying pitch/timing/envelope systems but handle them inconsistently — legacy and pro pass `gapAfter` to `getEnvelopeTimes()` while mgen omits it entirely, causing different clamping behavior for identical slider settings. Foreshadowing and cluster logic produce musically interesting but occasionally off-key notes, while aggressive envelope clamping makes sliders non-functional for fast passages. Professional mode sounds better because it avoids cluster creation and post-processing pitch overwrites, not because it has fewer underlying issues.

---

## 1. ENVELOPE SYSTEM (synthEngines.js)

### Issue 1.1: User ADSR Sliders Overridden by `getEnvelopeTimes()` Clamping
**Category:** DESIGN CHOICE
**Location:** `synthEngines.js:3-45`
**Verified:** Yes — read synthEngines.js lines 1-45

**Current behavior:** `getEnvelopeTimes(duration, adsr, gapAfter)` reads user slider values from `adsr` (derived from `state.melodyAdsr`), then clamps them based on `duration` and `gapAfter`:
- Short notes (< 0.15s) with no space after (`gapAfter < 0.05`): attack forced to 0.002, decay to 0, sustain to 1.0, release to 0.008 (lines 12-19)
- Notes with space after: attack/decay capped at 25% of duration (lines 23-24)
- Notes without space after: release capped at 50% of duration (line 34)

**Intended benefit:** Prevents click artifacts on very short notes by forcing minimal attack/release times that fit within the available duration.

**What undermines it:** Clamping is so aggressive that sliders have no effect even on long notes when `gapAfter` is small. The user hears timing variations (when notes happen) but interprets them as envelope issues (how notes sound). Short notes get no decay phase (attack → sustain immediately), producing a "punchy" or "clicky" sound especially on sine/triangle waveforms.

<!-- AUTHOR NOTE: I think this is by design, but short notes should still have some envelope shape rather than clicking. The sustain phase should be allowed to extend if there's room and if sustain is intended by the generated melody note, with minimal decay between notes. -->

**Suggested middle ground:** Allow partial envelope on notes > 50ms (instead of 150ms threshold). For notes < 50ms, clamp only attack/release to non-clicking values but preserve a minimal decay phase (e.g., 10% of duration) instead of forcing it to 0.

### Issue 1.2: `releaseStartsAtDuration` Flag Creates Audible Discontinuities
**Category:** BUG
**Location:** `synthEngines.js:92-102`
**Verified:** Yes — read synthEngines.js lines 90-102

**Current behavior:** When `releaseStartsAtDuration` is `true` (short notes, no space after), the release ramp begins at `startTime + duration - releaseTime`, but the oscillator stops at `startTime + duration + 0.05`. When `false` (normal notes), release begins at `startTime + duration` and the oscillator stops at `startTime + duration + releaseTime + 0.05`.

**Impact:** Notes close together in time have wildly different release behaviors depending on whether `gapAfter >= 0.05`. This creates the "extended vs quickly cut off" envelope inconsistency the user hears. The 0.05s padding is inconsistent — sometimes the release tail extends beyond the note duration, sometimes it doesn't.


**Fix:** Unify release behavior: always start release at `startTime + duration`, but allow a minimal release tail (e.g., `min(release, gapAfter)`) even on short notes. Never start release before the nominal note end.

### Issue 1.3: Short Notes Get Zero Decay — No Envelope Shape
**Category:** DESIGN FLAW
**Location:** `synthEngines.js:14-18`
**Verified:** Yes — read synthEngines.js lines 14-18

**Intent:** Eliminate decay on very short notes to maximize sustain time within the duration constraint.

**Why it fails:** Forcing `decay: 0` and `sustain: 1.0` means the envelope goes: attack → sustain (immediately, no decay), holds at sustain level, then releases. There is no decay phase, so the note has no "shape" — it's just an instant-on, instant-off sound with a tiny release.

**Minimal fix:** On short notes, set decay to a small fraction of duration (e.g., `duration * 0.1`) instead of 0, and reduce sustain proportionally. This preserves envelope shape without extending beyond the duration constraint.

### Issue 1.4: FM Synth Ignores User ADSR Sliders Entirely
**Category:** BUG
**Location:** `synthEngines.js:286`
**Verified:** Yes — read synthEngines.js line 286

**Current behavior:** FM synth constructs its own envelope: `{ attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime }`, completely ignoring `params.adsr`. The `attackTime` and `releaseTime` come from `params.attack` and `params.release` (mapped from `state.synthParams.fm.attack/release`), not from `state.melodyAdsr`.

**Impact:** When the user selects FM as the melody instrument, the melody ADSR sliders have **zero effect**. The user notices this as "the envelope sliders don't work for FM."

**Fix:** Pass `params.adsr` to `getEnvelopeTimes()` on line 286, using `params.adsr` (from `state.melodyAdsr`) as the primary source, falling back to `params.attack`/`params.release` only for FM-specific parameters.

### Issue 1.5: Plucked-Square Also Ignores User ADSR
**Category:** BUG
**Location:** `synthEngines.js:346`
**Verified:** Yes — read synthEngines.js line 346

**Current behavior:** Plucked-square constructs its own envelope: `{ attack: CONFIG.ATTACK_TIME * 0.5, decay: decayTime, sustain: 0.1, release: CONFIG.RELEASE_TIME }`. User's ADSR sliders are ignored.

**Impact:** Same as Issue 1.4 — envelope sliders are non-functional for plucked-square instrument.

**Fix:** Pass `params.adsr` to `getEnvelopeTimes()` on line 346, using user slider values as the base and applying plucked-specific scaling factors.

### Issue 1.6: Sample Engines Use Ratio-Based Envelope — Non-Linear Slider Mapping
**Category:** DESIGN CHOICE
**Location:** `synthEngines.js:47-67`
**Verified:** Yes — read synthEngines.js lines 47-67

**Current behavior:** `getSampleEnvelopeTimes()` computes decay/release as **ratios of sample length**:
```javascript
const decayRatio = Math.min(1.0, decayRaw / 2.0);
const releaseRatio = Math.min(1.0, releaseRaw / 2.0);
```
The decay and release are computed as ratios of `sampleLength`, not absolute times. Slider position maps to a ratio, not a time.

**Intended benefit:** Short samples get proportionally shorter decay/release, preventing release tails that extend far beyond the sample.

**What undermines it:** The same slider position produces different envelope shapes for different samples at the same pitch. The relationship between slider position and actual sound is non-linear and sample-dependent. The `/ 2.0` divisor further compresses the range (decayRaw=0.2 → decayRatio=0.1).

<!-- AUTHOR NOTE: Could be, but some samples are simply short and cannot be expected to have the same envelope shape as long samples. The point is the user can't manipulate the sound in the way they expect. -->

**Suggested middle ground:** Add a "sample-aware" mode (automatic, no ui control, activated by sample mode) where the slider maps to an absolute time capped at a fraction of sample length, rather than a ratio. This preserves the intent (short samples get shorter envelopes) while making the slider behavior predictable.

### Issue 1.7: Karplus-Strong Uses Default Envelope — User Sliders Ignored
**Category:** BUG
**Location:** `synthEngines.js:463`
**Verified:** Yes — read synthEngines.js line 463
**Note:** Karplus-Strong oscillator was previously disabled by the author. This issue is only relevant if KS is re-enabled.

**Current behavior:** KS calls `getEnvelopeTimes(duration, null, params.gapAfter)` with `null` for adsr, so it gets default values (attack=0.05, decay=0.2, sustain=0.15, release=0.1). User's ADSR sliders have no effect.

**Impact:** KS bass notes always sound the same regardless of envelope settings.

**Fix:** Pass `params.adsr` to `getEnvelopeTimes()` on line 463. Mark as **LOW PRIORITY** until KS is re-enabled.


<!-- AUTHOR NOTE: I had disabled KS because it was resulting in the same pitch for every note. I think I should remove it and re-add it at some point in the future if it can be made to work. -->

---

## 2. PITCH / OFF-KEY NOTE ISSUES

### Issue 2.1: Foreshadow Notes (`foreshadow_note`) Can Land Off-Key When Next Chord Has No Valid Octave Equivalents
**Category:** BUG
**Location:** `melodyScheduler.js:1431-1437`
**Verified:** Yes — read melodyScheduler.js lines 1431-1437

**Current behavior:** When `clusterRole === 'foreshadow_note'`, the code calls `getDistinctiveNextTone()` to get a pitch from the next chord, wraps it into melody range, then calls `findClosest(target, effectiveValidPitches)`. If the next chord's notes, when transposed into the melody range, don't exist in `effectiveValidPitches` (filtered by `isPassingContext` constraints), `findClosest()` snaps to the **nearest available pitch**, which could be a scale tone that is **not a chord tone of the next chord**.

**Impact:** Isolated notes that sound "wrong" in isolation but "correct" when the next chord arrives. This is the exact phenomenon the user described.

<!-- AUTHOR NOTE: If the code can know what the listener's ear could expect that or be rewarded soon enough by the question the note raises, then that would be good to implement, but if that is too complex to implement, then I would suggest that it would be better to just have the note land on a chord tone for the next chord as that would be more easily understood by the average listener. -->

**Fix:** When `findClosest()` returns a pitch that is not a chord tone of the next chord (distance > 2 semitones from any next-chord-note octave equivalent), fall back to the closest next-chord-note octave equivalent instead of the closest valid pitch.

### Issue 2.2: Foreshadow Glue Notes Use Next Scale, Not Next Chord — Can Be Off-Key for Current Chord
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1441-1463`
**Verified:** Yes — read melodyScheduler.js lines 1441-1463

**Current behavior:** `foreshadow_glue` notes build a scale from the **next chord's root** using the **next chord's mode** (derived from `deduceSourceMode(nextChordObj.symbol, ...)`). The resulting pitch is a scale tone of the next chord, not necessarily a chord tone or scale tone of the current chord.

**Intended benefit:** Foreshadowing notes should be notes from the upcoming chord's scale, creating anticipation.

**What undermines it:** Notes played during chord A that are actually notes from chord B's scale. These are "correct" only if the listener anticipates the chord change — otherwise they sound like wrong notes.

<!-- AUTHOR NOTE: That's what foreshadowing is supposed to be, but it has to be done intelligently...if the foreshadowing can be a scale note of both chords, then perhaps that would be ideal...if not, there are ways of justifying it via surrounding notes that show that the foreshadowing note is intentional and not a random choice by the program. If creating a cluster around it to justify it, make sure it does not introduce the timing issues that other clustering is mentioned having in other parts of this audit -->

**Suggested middle ground:** Prefer scale tones that are common to both the current and next chord's scales. If no common tone exists, use the current chord's scale tone closest to the next chord's root (stepwise approach) rather than jumping directly to a next-chord scale tone.

### Issue 2.3: Color Tone Sanitation Pass Can Create "Orphan" Notes
**Category:** BUG
**Location:** `melodyScheduler.js:1841-1860`
**Verified:** Yes — read melodyScheduler.js lines 1841-1860

**Current behavior:** The sanitation pass checks `isNextClose` (next note within 4 sixteenth steps). If the next note IS close AND is a chord tone AND is stepwise, the color tone is **preserved**. But this preserved color tone is only valid as a **passing tone** between two chord tones. If the surrounding notes are not actually chord tones (due to other generation bugs), the color tone becomes an **orphan** — a note that is neither scale nor chord tone of the current chord.

**Impact:** Isolated off-key notes that appear in places where there's no stepwise resolution to justify them.

**Fix:** After preserving a color tone, verify that both the previous and next notes are chord tones of the current chord. If not, snap the color tone to the closest chord tone.

### Issue 2.4: Post-Processing Foreshadowing Overwrites Notes with Next Chord Tones Arbitrarily
**Category:** BUG
**Location:** `melodyScheduler.js:1862-1882`
**Verified:** Yes — read melodyScheduler.js lines 1862-1882

**Current behavior:** If `silenceDuration > 0.6 * beatLen` AND `isCloseToNextChord` (time to next chord ≤ beatLen + 0.01), the note's pitch is **overwritten** with the closest octave equivalent of a next chord note. This happens **after** all pitch selection logic, meaning a note that was carefully selected as a scale tone or chord tone of the current chord can be replaced with a note from the next chord.

**Impact:** A note that should belong to the current chord is replaced with a "foreshadowing" note from the next chord. If the timing is slightly off (the silence isn't actually long enough), the note sounds like a wrong note because it's a next-chord tone played during the current chord.

<!-- AUTHOR NOTE: Converting a note that should belong to the current chord to a note of the next chord, even if it's a good foreshadowing note, can be jarring if done too aggressively or if not properly executed...the key is that the note that is used for foreshadowing should still have some melodic or rhythmic reason for existing and not just be a random note from the next chord. -->

**Fix:** Only overwrite a note with a next-chord tone if: (1) the original note was a chord tone of the current chord, (2) the next-chord tone is within 3 semitones of the original, and (3) the surrounding notes provide stepwise context. Otherwise, leave the original note unchanged. <!-- AUTHOR NOTE:If not already assumed, proximity in time to next chord should be considered a factor in determining how strong the foreshadowing should be ->

### Issue 2.5: `findClosest()` Has No Tolerance — Snaps to Farthest Available Pitch
**Category:** BUG
**Location:** `melodyTuning.js:82-85`
**Verified:** Yes — read melodyTuning.js lines 82-85

**Current behavior:** `findClosest()` returns the array element with the minimum absolute difference to the input value. It has **no tolerance threshold** — if the closest pitch is 5 semitones away, it still returns that. Compare this to `findScaleIndex()` which has a tolerance of 45% of one step (line 64).

**Impact:** When the valid pitch pool is small (e.g., after aggressive filtering by cluster role, isolation, or color tone constraints), `findClosest()` can return a pitch that is several semitones away from the intended pitch, producing an "off-key" note.

**Fix:** Add a tolerance parameter to `findClosest()` (e.g., `maxSemitoneDistance = 3`). If no pitch within tolerance exists, return the original `val` (unpitched) or the closest pitch class of the current chord instead of the closest pitch in the pool.

### Issue 2.6: Voice-Leading Collision Prevention Can Push Notes to Adjacent Scale Degrees That Are Off-Key
**Category:** BUG
**Location:** `melodyScheduler.js:1612-1634`
**Verified:** Yes — read melodyScheduler.js lines 1612-1634

**Current behavior:** When two consecutive notes are within `0.99 * edoStep` of each other (essentially unison or microtonal clash), the code nudges the second note to the adjacent scale degree. But if the adjacent scale degree is **not a chord tone or scale tone of the current chord** (it's a scale tone of a different mode due to local scale switching), the nudged note is off-key.

**Impact:** Notes that are "corrected" for voice-leading reasons end up being off-key for the current harmony.

**Fix:** After nudging, verify the nudged pitch is a valid pitch in `effectiveValidPitches`. If not, keep the original pitch (unison is acceptable) rather than introducing an off-key note. <!-- AUTHOR NOTE: Unison is allowable if it does not result in lots of repeated notes of the same pitch in a sequence. I also don't want constant alternation between 2 notes to be the alternative to this.>

### Issue 2.7: MGEN Harmonic Snapping Can Change Structural Notes to Non-Chord Tones
**Category:** BUG
**Location:** `mgen/src/orchestrator.js:626-644`
**Verified:** Yes — read mgen/src/orchestrator.js lines 626-644

**Current behavior:** Chord intervals are derived from the chord's `quality` field using hardcoded mappings. If the chord symbol is non-standard (e.g., "Csus4" or "Cadd9"), the quality parsing fails, defaulting to major chord intervals [0, 4, 7] instead of the correct intervals.

**Impact:** Structural notes that should be chord tones get snapped to wrong pitches when chord symbols are ambiguous.

**Fix:** Add parsing for common non-standard qualities (sus4, sus2, add9, maj7, min7, dim7, aug7). If quality is unparseable, fall back to `activeChord.notes` (if available) rather than hardcoded intervals.

### Issue 2.8: Professional Engine's Blue Note Handling Can Produce Off-Key Notes Without Stepwise Support
**Category:** DESIGN FLAW
**Location:** `professionalMelodyScheduler.js:366-389`
**Verified:** Yes — read professionalMelodyScheduler.js lines 366-389

**Intent:** Blue notes (b3, b5) are only applied when `hasStepwiseSupport` is true (both previous and next grid steps are active), ensuring blues notes are contextually justified.

**Why it fails:** The `stepPlaysMap` is modified by the "Chromatic Support Gate" (lines 208-219) which **forces** surrounding notes to be active for weak beats. This creates a situation where blue notes are applied, but the surrounding "forced" notes may not actually be generated (if they fail other filters), leaving the blue note isolated and off-key.

**Minimal fix:** Check whether the surrounding "forced" notes actually exist in the final output before applying blue notes. If the surrounding notes are filtered out, don't apply the blue note.

### Issue 2.9: MGEN Deduplication Can Discard the "Correct" Note and Keep an "Off-Key" One
**Category:** DESIGN FLAW
**Location:** `mgen/src/orchestrator.js:454-489`
**Verified:** Yes — read mgen/src/orchestrator.js lines 454-489

**Intent:** When multiple passes generate notes at the same start time, keep only the highest-priority role (structural > cadence > connector > ornament > expectation).

**Why it fails:** If an ornament pass generates a grace note that's "correct" but a connector pass generates a note that's "off-key" for the current chord, the ornament wins by role priority — but if the roles are reversed (connector has higher priority than ornament in some edge cases), the off-key note survives.

**Minimal fix:** When deduplicating, prefer the note that is closer to a chord tone of the current harmony, even if it has a lower role priority. Add a harmonic correctness tiebreaker.

---

## 3. TIMING / CLOSE-PROXIMITY NOTE ISSUES

### Issue 3.1: Cluster Creation Creates Notes Very Close Together (2-3 Steps Apart)
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1184-1243`
**Verified:** Yes — read melodyScheduler.js lines 1184-1243

**Current behavior:** When an isolated note is detected (space before and after ≥ `beatDuration * 0.95`), there's a 75% chance to create a "cluster" by activating neighboring grid steps. Neighbors are **adjacent grid steps**, which can be as close as `subStepDuration` (beatDuration / subdivision). At high subdivision (16th notes at 120 BPM), this is ~0.031 seconds.

**Intended benefit:** Creates rhythmic interest by grouping isolated notes into clusters, mimicking human performance nuances.

**What undermines it:** Two notes 0.031 seconds apart are essentially "thrown together" — they sound like a single articulated note with an irregular envelope. The user hears this as "strange timing variations where isolated pairs of notes seem thrown together very close together."

**Suggested middle ground:** Enforce a minimum separation between clustered notes (e.g., `subStepDuration * 2` instead of `subStepDuration`). Or reduce the cluster probability for notes at high subdivision levels.

### Issue 3.2: Cluster Role Assignment Creates "Backwards Foreshadowing"
**Category:** BUG
**Location:** `melodyScheduler.js:1218-1230`
**Verified:** Yes — read melodyScheduler.js lines 1218-1230

**Current behavior:** For backward-neighbor clusters (lines 1207-1209), the foreshadow note comes **first** in time, followed by the reinforce note. This means a next-chord tone is played **before** the current chord tone, which is the opposite of the intended "foreshadowing" direction.

**Impact:** Notes that sound like they're "backwards foreshadowing" — the next chord's note is played first, then the current chord's note. This creates the "off-key" sensation because the harmony hasn't changed yet.

**Fix:** For backward-neighbor clusters, swap the role assignment: the earlier note gets `reinforce` (current chord tone), the later note gets `foreshadow_note` (next chord tone), regardless of whether forward or backward neighbors are used.

### Issue 3.3: Rubato Timing Warp Creates Non-Uniform Note Spacing
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1283-1312`
**Verified:** Yes — read melodyScheduler.js lines 1283-1312

**Current behavior:** Flourish runs apply timing warps (arch, accelerando, decelerando) to notes within a run:
```javascript
runSteps[i].stepTime = t_start + D * warpFn(x);
```
The warp functions modify `stepTime` **in place**, creating non-uniform spacing that doesn't correspond to any musical rhythm.

**Intended benefit:** Creates expressive timing variations that mimic human performance (rushing/dragging within a flourish).

**What undermines it:** The warps are applied to `stepTime` in place, modifying the original grid step times. This means notes within a flourish run have **non-uniform spacing** that doesn't correspond to any musical rhythm. The notes are still quantized to grid positions, but their timing is stretched/compressed non-linearly.

**Suggested middle ground:** Apply warps to a copy of `stepTime` for playback only, not to the grid step's `stepTime` property. This preserves the expressive timing without breaking cluster detection and overlap prevention logic.

### Issue 3.4: Legato Duration Scaling Creates Variable Note Lengths
**Category:** DESIGN CHOICE
**Location:** `melodyScheduler.js:1314-1321`
**Verified:** Yes — read melodyScheduler.js lines 1314-1321

**Current behavior:** Note durations are scaled based on the gap to the next note:
```javascript
current.noteDuration = gap * mult;
```
where `mult = Math.max(0.4, 0.9 - (settings.rests || 0.1) * 0.5)`.

**Intended benefit:** Notes close together get shorter durations to prevent overlap; isolated notes get longer durations for a more legato feel.

**What undermines it:** A note's duration is **not fixed** at generation time but depends on the gap to the next note. If the next note is far away, the current note is long. If the next note is close, the current note is short. The `mult` factor depends on `settings.rests`, which is a global setting, not a per-note setting.

**Suggested middle ground:** Allow a minimum duration floor (e.g., `max(minDuration, gap * mult)`) where `minDuration` is at least one sixteenth note. This prevents notes from becoming arbitrarily short.

### Issue 3.5: Overlap Prevention Truncates Notes Arbitrarily
**Category:** BUG
**Location:** `melodyScheduler.js:1833-1836`
**Verified:** Yes — read melodyScheduler.js lines 1833-1836

**Current behavior:** If a note's `stepTime + noteDuration > nextTime` (the next note's start time), the note's duration is truncated to `Math.max(0.01, nextTime - n.stepTime)`.

**Impact:** Notes are abruptly cut short when they overlap with the next note, creating the "quickly cut off" sound. This is triggered by cluster creation, rubato warps, or post-processing pitch changes that shift timing.

**Fix:** Instead of hard truncation, apply a smooth release tail: if `noteDuration > nextTime - stepTime`, set `noteDuration = nextTime - stepTime` but ensure a minimum release time (e.g., `max(0.015, min(release, nextTime - stepTime))`) is preserved in the envelope.

### Issue 3.6: MGEN Duration Clamping Creates Artificial Note Boundaries
**Category:** BUG
**Location:** `mgen/src/orchestrator.js:162-169`
**Verified:** Yes — read mgen/src/orchestrator.js lines 162-169

**Current behavior:** After deduplication and snapping, durations are clamped:
```javascript
if (currentNote.duration > timeToNext) {
    currentNote.duration = timeToNext;
}
```

**Impact:** Notes that should sustain are abruptly terminated by the clamping logic. A structural note that "wants" to be a half note may be clamped to 0.05 seconds if the next note is 0.05 seconds away.

**Fix:** Allow a minimum sustain time (e.g., `max(timeToNext, minSustainDuration)`) where `minSustainDuration` is at least one sixteenth note. This prevents notes from being clamped to near-zero durations.

---

## 4. ARCHITECTURAL / CROSS-ENGINE ISSUES

### Issue 4.1: Three Engines Handle `gapAfter` Inconsistently
**Category:** BUG
**Location:** `melodyScheduler.js:1931` vs `mgenEngine.js:389-394`
**Verified:** Yes — read melodyScheduler.js line 1931 and mgenEngine.js lines 389-394

**Current behavior:** 
- Legacy engine passes `gapAfter` to `playToneFn()` (line 1931): `playToneFn(..., { gapAfter, step: n.step, ... })`
- MGEN engine does NOT pass `gapAfter` (lines 389-394): `playToneFn(..., { isAnchor1Step: ..., isAnchor2Step: ..., clusterRole: ... })`

Without `gapAfter`, `getEnvelopeTimes()` defaults to `gapAfter = 999`, which means `hasSpace = true` (line 10: `gapAfter >= 0.05`). This takes the "has space" branch, which caps attack/decay at 25% of duration.

**Impact:** MGEN notes get different envelope behavior than legacy/pro notes for identical slider settings. MGEN notes always have shorter attack/decay than legacy/pro notes because they always take the "has space" branch.

**Fix:** Pass `gapAfter` from MGEN scheduler to `playToneFn()`. Compute `gapAfter` as `nextNoteStartTime - (currentNoteStartTime + currentNoteDuration)` and pass it in the params object.

### Issue 4.2: `clearMelodyMemory()` Doesn't Clear Professional Engine State
**Category:** BUG
**Location:** `melodyGenerator.js:14-17`
**Verified:** Yes — read melodyGenerator.js lines 14-17

**Current behavior:** `clearMelodyMemory()` clears `melodyScheduled` and `mgenCachedNotes` but does NOT clear professional engine state: `context.proPhraseArch`, `context.proTensionTracker`, `context.proRegisterTracker`, `context.proRhythmicCohesion`.

**Impact:** Switching from legacy/MGEN to professional mode may leave stale state from the previous engine, causing incorrect pitch/timing decisions.

**Fix:** Add clearing of `context.proPhraseArch`, `context.proTensionTracker`, `context.proRegisterTracker`, and `context.proRhythmicCohesion` to `clearMelodyMemory()`.

### Issue 4.3: No Shared Pre/Post-Processing Between Engines
**Category:** DESIGN CHOICE
**Location:** Multiple files
**Verified:** Yes — confirmed by reading all three scheduler files

**Current behavior:** The three engines (legacy, pro, mgen) have **no shared pre or post-processing**. Each engine builds its own pitch pools, plans its own anchors/climax, applies its own genre rules, and applies its own ornaments. The only shared code is `playTone()` (synth.js) and `getEnvelopeTimes()` (synthEngines.js).

**Intended benefit:** Each engine can be optimized for its specific use case without being constrained by the others.

**What undermines it:** There is no "global" correction pass that could catch off-key notes or timing issues across all engines. Each engine must independently handle every edge case, leading to duplicated bugs (e.g., `findClosest()` tolerance issues appear in all three engines).

**Suggested middle ground:** Add a shared post-processing hook that all engines can optionally use for a final pitch-correctness pass. This doesn't require shared generation logic — just a shared "sanity check" at the end.

### Issue 4.4: Local Scale Mode Switching Creates Pitch Discontinuities
**Category:** DESIGN FLAW
**Location:** `melodyScheduler.js:285-308`
**Verified:** Yes — confirmed by reading melodyScheduler.js lines 285-308

**Intent:** Switch between global scale and local chord-scale based on `getLocalScaleMode()` to respect chord changes (e.g., dorian for minor7, mixolydian for dominant).

**Why it fails:** When switching from major to dorian (for a minor7 chord) or major to mixolydian (for a dominant chord), the scale intervals change. For example, dorian has b3 (interval 3) while major has natural 3 (interval 4). If the previous note was based on the major scale and the next note is based on the dorian scale, the note may jump by a semitone to a pitch that is **valid in dorian but not in major**.

**Minimal fix:** When switching scales, check if the previous note's pitch class is valid in the new scale. If not, snap it to the closest valid pitch class in the new scale before continuing.

### Issue 4.5: Pitch Class Rounding Creates Inconsistencies
**Category:** BUG
**Location:** Multiple locations (e.g., `melodyScheduler.js:283`, `melodyScheduler.js:479`)

**Current behavior:** Pitch classes are rounded to 2 decimal places: `Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100`. This rounding can cause pitch classes that are very close (e.g., 4.999999 and 5.0) to be treated as different.

**Impact:** Notes that should be valid are filtered out, forcing `findClosest()` to return a more distant (potentially off-key) pitch.

**Fix:** Use a tolerance-based comparison for pitch class matching (e.g., `Math.abs(pc1 - pc2) < 0.01`) instead of exact equality checks.

### Issue 4.6: `validPitches` Pool Can Become Empty After Aggressive Filtering
**Category:** BUG
**Location:** `melodyScheduler.js:339`, `melodyScheduler.js:1401-1406`

**Current behavior:** The `validPitches` pool is constructed as `prunedScalePitches + activeChordTones`. But when additional filtering is applied (cluster role, isolation, color tone constraints), the pool can become empty. The fallback is to use `validPitches` (unfiltered), but this fallback may still not contain the intended pitch if the unfiltered pool is narrow.

**Impact:** When the pool is empty or very narrow, `findClosest()` returns whatever is available, which may be several semitones away from the intended pitch.

**Fix:** Add a minimum pool size check. If the filtered pool has fewer than 3 pitches, fall back to the unfiltered `validPitches` instead of the filtered pool.

---

## 5. PROFESSIONAL ENGINE SPECIFIC ISSUES

### Issue 5.1: Isolated Note Detection Uses Adjacent Grid Steps, Not Actual Notes
**Category:** BUG
**Location:** `professionalMelodyScheduler.js:263-264`
**Verified:** Yes — read professionalMelodyScheduler.js lines 263-264

**Current behavior:** `isIsolated` is determined by checking if the **previous and next grid steps** are not active:
```javascript
const isIsolated = (gIndex > 0 && !stepPlaysMap[gridSteps[gIndex - 1].step]) && 
                   (gIndex < gridSteps.length - 1 && !stepPlaysMap[gridSteps[gIndex + 1].step]);
```

**Impact:** This checks grid step activity, not actual note activity. If a grid step is "masked" (rest) but the note duration from the previous note extends into this step, the note is still audible. The isolation check doesn't account for note duration overlap.

**Fix:** Check actual note end times (`prevNote.stepTime + prevNote.noteDuration`) instead of grid step activity.

### Issue 5.2: Professional Engine Doesn't Apply Post-Processing Foreshadowing
**Category:** DESIGN CHOICE
**Location:** `professionalMelodyScheduler.js` (no equivalent to melodyScheduler.js:1862-1882)
**Verified:** Yes — confirmed by searching professionalMelodyScheduler.js for "foreshadow", "sanitation", "postProcess", "post.process" — no matches found.

**Current behavior:** The professional engine does not have the post-processing foreshadowing/resolution pass that the legacy engine has.

**Intended benefit:** This is actually **better** for pitch correctness — it avoids the buggy pitch-overwrite pass that replaces notes with next-chord tones.

**What undermines it:** The professional engine may produce more "off-key" notes that aren't justified by foreshadowing, since there's no post-processing pass to catch and correct them.

**Suggested middle ground:** Add a lightweight post-processing pass to the professional engine that catches notes clearly off-key for the current chord (distance > 4 semitones from any chord/scale tone) and offers to resolve them stepwise.

### Issue 5.3: Professional Engine's Cadence Resolution Can Force Off-Key Notes
**Category:** BUG
**Location:** `professionalMelodyScheduler.js:402-409`
**Verified:** Yes — read professionalMelodyScheduler.js lines 402-409

**Current behavior:** At the end of a phrase (within 2 steps of the end), the pitch is forced to:
- Authentic cadence: `findClosest(chordRoot, effectiveValidPitches)`
- Half cadence: `findClosest(chordRoot + 7, effectiveValidPitches)`

If `effectiveValidPitches` has been narrowed by NCT taxonomy or blue note handling, `findClosest()` may return a pitch that is not the actual chord root or fifth, but the closest available pitch (which could be several semitones away).

**Impact:** Cadential resolution notes that are "off" by a semitone or more.

**Fix:** When cadence forcing, use the unfiltered `validPitches` (not the narrowed `effectiveValidPitches`) to ensure the cadence note lands on the correct chord root or fifth.

---

## 6. COUNTMELODY-SPECIFIC ISSUES

### Issue 6.1: Countermelody Can Play Notes Within 1 EDO Step of Melody (Dissonant Clashes)
**Category:** BUG
**Location:** `melodyCountermelody.js:197-218`
**Verified:** Yes — read melodyCountermelody.js lines 197-218

**Current behavior:** The polyphonic collision check nudges the countermelody if it's within `1.0 * edoStep` of the melody pitch. But the nudge only moves to the **adjacent** scale degree, which may still be within 1 EDO step of the melody pitch (e.g., a minor second). The check `Math.abs(nudgedPitch - pitch) > 0.01` allows unison (0 difference) but not necessarily consonance.

**Impact:** Countermelody notes that create dissonant intervals (minor seconds, tritones) with melody notes.

**Fix:** After nudging, verify the resulting interval is consonant (major/minor third, perfect fourth/fifth, octave). If not, nudge again or skip the countermelody note at that position.

### Issue 6.2: Countermelody Uses `findClosest()` Without Tolerance
**Category:** BUG
**Location:** `melodyCountermelody.js:154`

**Current behavior:** `counterPitch = findClosest(counterPitch, counterValidPitches)` has no tolerance. If `counterValidPitches` is narrow (due to range limits or filtering), the closest pitch may be far from the intended pitch.

**Impact:** Countermelody notes that are off-key for the current harmony.

**Fix:** Use the same tolerance-based `findClosest()` fix as Issue 2.5 (add maxSemitoneDistance parameter).

### Issue 6.3: Countermelody Duration Minimum Creates Inconsistent Spacing
**Category:** DESIGN CHOICE
**Location:** `melodyCountermelody.js:221-226`
**Verified:** Yes — read melodyCountermelody.js lines 221-226

**Current behavior:** Countermelody notes have a minimum duration of `beatDuration * 0.5` (half a beat), multiplied by a random factor of 0.8-1.2.

**Intended benefit:** Prevents "machine-gun" effect of very short countermelody notes.

**What undermines it:** Countermelody notes are always at least 0.5 beats long, regardless of the melody's rhythm. If the melody has fast notes (16th notes) and the countermelody has long sustained notes, the countermelody notes will **ring through** multiple melody notes, creating a dense texture that may clash harmonically.

**Suggested middle ground:** Make the minimum duration adaptive: `max(beatDuration * 0.25, beatDuration * 0.5 * densityFactor)`. This allows shorter countermelody notes when density is low, reducing harmonic density clashes.

---

## Summary of Root Causes

**Pitch Issues:**
1. Foreshadowing logic selects next-chord tones played during current chord, creating notes that are "correct" only if the listener anticipates the chord change
2. `findClosest()` has no tolerance — when pitch pools are narrow, it returns distant (off-key) pitches
3. Post-processing foreshadowing overwrites carefully selected notes with next-chord tones based on timing heuristics
4. Color tone sanitation preserves passing tones that become orphans when surrounding notes aren't chord tones
5. MGEN harmonic snapping defaults to major chord intervals when chord symbols are non-standard

**Timing Issues:**
6. Cluster creation throws notes very close together (2-3 grid steps apart), creating "thrown together" sensation
7. Rubato warps modify `stepTime` in place, breaking cluster detection and overlap prevention logic
8. Overlap prevention truncates notes abruptly without preserving envelope release tails

**Envelope Issues:**
9. Aggressive envelope clamping overrides user slider settings for fast passages, making sliders non-functional
10. FM and plucked-square instruments ignore user ADSR sliders entirely
11. Inconsistent `gapAfter` handling across engines (MGEN doesn't pass it) causes different envelope behavior for identical settings

**Architectural Issues:**
12. No shared post-processing pass across engines — each engine must independently handle every edge case
13. `clearMelodyMemory()` doesn't clear professional engine state, causing stale state on engine switch

---

## Priority Matrix

| Priority | Issue | Category | File | Lines | Impact |
|---|---|---|---|---|---|
| P0 | Envelope clamping overrides sliders | DESIGN CHOICE | synthEngines.js | 3-45 | High — users can't control envelopes on fast passages |
| P0 | FM/plucked ignore ADSR | BUG | synthEngines.js | 286, 346 | High — sliders don't work for these instruments |
| P0 | MGEN doesn't pass gapAfter | BUG | mgenEngine.js | 389-394 | High — inconsistent envelope behavior across engines |
| P1 | Foreshadow notes land off-key | BUG | melodyScheduler.js | 1431-1437 | High — causes "wrong" isolated notes |
| P1 | Post-processing foreshadowing overwrites notes | BUG | melodyScheduler.js | 1862-1882 | High — replaces correct notes with next-chord tones |
| P1 | Cluster creation throws notes close together | DESIGN CHOICE | melodyScheduler.js | 1184-1243 | High — causes "thrown together" notes |
| P1 | Backwards foreshadowing in clusters | BUG | melodyScheduler.js | 1218-1230 | Medium — next-chord tone played before current chord |
| P1 | `findClosest()` no tolerance | BUG | melodyTuning.js | 82-85 | High — causes off-key notes when pools are narrow |
| P2 | ReleaseStartsAtDuration discontinuity | BUG | synthEngines.js | 92-102 | Medium — inconsistent release behavior |
| P2 | Rubato warps modify stepTime in place | DESIGN CHOICE | melodyScheduler.js | 1283-1312 | Medium — breaks cluster detection |
| P2 | Overlap prevention truncates notes | BUG | melodyScheduler.js | 1833-1836 | Medium — causes "cut off" sounds |
| P2 | Color tone orphan notes | BUG | melodyScheduler.js | 1841-1860 | Medium — isolated off-key notes |
| P2 | Voice-leading collision pushes off-key | BUG | melodyScheduler.js | 1612-1634 | Medium — "corrected" notes are off-key |
| P2 | MGEN harmonic snapping defaults to major | BUG | mgen/src/orchestrator.js | 626-644 | Medium — wrong pitches for non-standard chords |
| P2 | Professional cadence forcing off-key | BUG | professionalMelodyScheduler.js | 402-409 | Medium — cadential "off" notes |
| P2 | Countermelody dissonant clashes | BUG | melodyCountermelody.js | 197-218 | Medium — minor seconds/tritones with melody |
| P3 | Sample envelope ratio mapping | DESIGN CHOICE | synthEngines.js | 47-67 | Low — non-linear slider behavior |
| P3 | Karplus-Strong ignores ADSR (DISABLED) | BUG | synthEngines.js | 463 | Low — KS is currently disabled |
| P3 | clearMelodyMemory doesn't clear pro state | BUG | melodyGenerator.js | 14-17 | Low — stale state on engine switch |
| P3 | Local scale switching discontinuities | DESIGN FLAW | melodyScheduler.js | 285-308 | Low — musically defensible but jarring |
| P3 | Pitch class rounding inconsistencies | BUG | Multiple | varies | Low — notes filtered out incorrectly |
| P3 | Empty/narrow pitch pools | BUG | melodyScheduler.js | 339, 1401-1406 | Medium — fallback returns distant pitches |
| P3 | Professional isolation uses grid steps | BUG | professionalMelodyScheduler.js | 263-264 | Low — doesn't account for note duration overlap |
| P3 | MGEN deduplication discards correct notes | DESIGN FLAW | mgen/src/orchestrator.js | 454-489 | Low — role priority overrides harmonic correctness |
| P3 | Blue note handling without stepwise support | DESIGN FLAW | professionalMelodyScheduler.js | 366-389 | Low — isolated blue notes sound wrong |
| P3 | Countermelody duration minimum | DESIGN CHOICE | melodyCountermelody.js | 221-226 | Low — rings through melody notes |

---

## Why Professional Mode Sounds Better

The professional mode produces better results because:

1. **No post-processing foreshadowing** — it doesn't have the buggy pitch-overwrite pass (melodyScheduler.js:1862-1882) that replaces notes with next-chord tones.

2. **Stricter isolation handling** — isolated notes are constrained to chord tones only (professionalMelodyScheduler.js:269-270), not the full valid pitch pool.

3. **No cluster creation** — the professional engine doesn't have the cluster creation logic that throws notes close together (melodyScheduler.js:1184-1243).

4. **No rubato warps** — the professional engine uses uniform grid timing, not non-linear warps.

5. **NCT taxonomy pre-gating** — non-chord tones are explicitly categorized and constrained, reducing the chance of orphan notes.

However, the professional mode still suffers from envelope clamping (Issue 1.1), `findClosest()` tolerance issues (Issue 2.5), and cadence forcing (Issue 5.3).
