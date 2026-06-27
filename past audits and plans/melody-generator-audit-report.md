# Melody Generator Audit Report. by Qwen3.6 35b a3b

## Executive Summary

A thorough analysis of all three melody generators (legacy `progress`, `pro`, and `mgen`), the envelope system (`synthEngines.js`), the pitch selection logic, timing/duration calculations, and pre/post-processing shared across engines reveals **47 distinct issues** spanning pitch correctness, timing anomalies, envelope misbehavior, and architectural inconsistencies. The "professional" mode does produce better results because it has stricter isolation handling and fewer fallback paths, but it is not immune to the underlying problems.

---

## 1. ENVELOPE SYSTEM ISSUES (synthEngines.js)

### Issue 1.1: Slider Values Are Overridden by `getEnvelopeTimes()` — Users See No Effect
**Note:** I think this is by design, but it's worth noting that the envelope sliders are not being used as expected. I would suggest that perhaps rather than cutting off notes that are close together in time, the envelope should be allowed to continue so that the notes can at least be heard rather than sounding like clicks.

**Location:** `synthEngines.js:3-45`

**Problem:** The ADSR sliders read from `state.melodyAdsr` (attack, decay, sustain, release) are passed to `getEnvelopeTimes()`, which **aggressively clamps** them based on note duration and `gapAfter`. The user's slider settings are effectively ignored for:
- Any note shorter than 0.15s with no space after it → attack is forced to 0.002, decay to 0, sustain to 1.0, release to 0.008 (lines 12-19)
- Any note with space after it → attack/decay are capped at 25% of duration (lines 23-24)
- Any note without space after it → release is capped at 50% of duration (line 34)

**Impact:** A user setting attack=0.1, decay=0.3, sustain=0.7, release=0.5 on a 0.08s note will see attack forced to 0.002 and release forced to 0.008. The sliders appear to do nothing for fast passages (**Note** This does not explain the lack of expected effect of the decay, sustain, and release sliders on long notes, though, which is an issue that should be discovered and addressed), which is exactly where the "strange timing variations" and "quickly cut off" notes are heard. **Note:** The timing variations are actually when the note happens, not how long it lasts, which is a separate issue, and one that should be discovered and addressed. 


### Issue 1.2: `releaseStartsAtDuration` Flag Causes Inconsistent Release Behavior

**Location:** `synthEngines.js:93-102` (and repeated for every synth type)

**Problem:** When `releaseStartsAtDuration` is `true` (short notes, no space after), the release ramp begins at `startTime + duration - releaseTime`, but the oscillator stops at `startTime + duration + 0.05`. When `false` (normal notes), the release begins at `startTime + duration` and the oscillator stops at `startTime + duration + releaseTime + 0.05`.

This creates an audible discontinuity: short notes have their release **truncated** (starting before the nominal end), while long notes get a **full release tail**. The 0.05s padding is inconsistent — sometimes the release tail extends beyond the note duration, sometimes it doesn't. **note** the issue I am actually noticing is an appearance of an extended sustain phase of some notes. I had not considered implementing sustain differences between notes except when there is no room between notes, and for now, I'd like notes to have the same duration where possible, if they do not as a result overlap, and there should be some minimal decay if there is room for it. 

**Impact:** Notes that are close together in time (the "isolated pairs thrown very close together") will have wildly different release behaviors depending on whether `gapAfter >= 0.05`. This creates the "extended vs quickly cut off" envelope inconsistency the user hears. <- I can see where that might be related to what I am hearing.

### Issue 1.3: No Gap Between Decay and Release for Short Notes

**Location:** `synthEngines.js:14-18`

**Problem:** For short notes (< 0.15s, no space after), decay is forced to 0 and sustain is forced to 1.0. This means the envelope goes: attack → sustain (immediately, no decay), holds at sustain level, then releases. There is no decay phase, so the note has no "shape" — it's just an instant-on, instant-off sound with a tiny release.

**Impact:** Fast melodic notes sound "clicky" or "punchy" rather than having a natural envelope. This is especially noticeable on sine/triangle waveforms where there's no filter smoothing.

### Issue 1.4: FM Synth Ignores User ADSR Sliders Entirely

**Location:** `synthEngines.js:286`

**Problem:** The FM synth engine constructs its own envelope object: `{ attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime }`, completely ignoring `params.adsr`. The `attackTime` and `releaseTime` come from `params.attack` and `params.release` (which map to `state.synthParams.fm.attack/release`), not from `state.melodyAdsr`.

**Impact:** When the user selects FM as the melody instrument, the melody ADSR sliders have **zero effect**. The user would notice this as "the envelope sliders don't work for FM."

### Issue 1.5: Plucked-Square Also Ignores User ADSR

**Location:** `synthEngines.js:346`

**Problem:** Similar to FM, the plucked-square engine constructs its own envelope: `{ attack: CONFIG.ATTACK_TIME * 0.5, decay: decayTime, sustain: 0.1, release: CONFIG.RELEASE_TIME }`. The user's ADSR sliders are ignored.

**Impact:** Same as Issue 1.4 — envelope sliders are non-functional for plucked-square instrument.

### Issue 1.6: Sample Engines Have Separate `getSampleEnvelopeTimes()` With Different Logic

**Location:** `synthEngines.js:47-67`

**Problem:** Sample-based engines (sample-bass, sample-chords, sample-melody, sample-countermelody) use `getSampleEnvelopeTimes()` which computes decay/release as **ratios of sample length**, not absolute times. The decay and release are computed as:
```javascript
const decayRatio = Math.min(1.0, decayRaw / 2.0);
const releaseRatio = Math.min(1.0, releaseRaw / 2.0);
```

This means the user's decay=0.2 slider becomes `decayRatio = 0.1`, and the actual decay time is `0.1 * (availableTime - releaseTime)`. The relationship between slider position and actual sound is non-linear and sample-dependent.

**Impact:** The same slider position produces different envelope shapes for different samples, even at the same pitch. This is confusing and inconsistent. <-could be, but some samples are simply short and cannot be expected to have the same envelope shape as long samples. The point is the user can't manipulate the sound in the way they expect. 

### Issue 1.7: No Envelope for Karplus-Strong <-I had problems with the Karplus Strong oscilator not working and disabled it, so this may not be an issue to resolve yet. It would be curious if what you suggest as the issue was precisely why it seemed to not work when I had it activated, though>

**Location:** `synthEngines.js:463-472`

**Problem:** The Karplus-Strong engine calls `getEnvelopeTimes(duration, null, params.gapAfter)` with `null` for the adsr parameter, so it gets default values (attack=0.05, decay=0.2, sustain=0.15, release=0.1). The user's ADSR sliders have no effect on KS synthesis.

**Impact:** KS bass notes always sound the same regardless of envelope settings.

---

## 2. PITCH / OFF-KEY NOTE ISSUES

### Issue 2.1: Foreshadow Notes Can Land Off-Key When Next Chord Has No Valid Octave Equivalents

**Location:** `melodyScheduler.js:1431-1440`

**Problem:** When a note has `clusterRole === 'foreshadow_note'`, the code calls `getDistinctiveNextTone()` to get a pitch from the next chord, then wraps it into the melody range:
```javascript
while (target < melodyRangeStart) target += periodSize;
while (target > melodyRangeEnd) target -= periodSize;
pitch = findClosest(target, effectiveValidPitches);
```

If the next chord's notes, when transposed into the melody range, don't exist in `effectiveValidPitches` (which may have been filtered by `isPassingContext` constraints), `findClosest()` will snap to the **nearest available pitch**, which could be a scale tone that is **not a chord tone of the next chord**. This creates an "off-key" note that only makes sense if the listener's ear foreshadows the upcoming chord — but the note itself is not actually a chord tone. <-If the code can know what the listener's ear could expect that or be rewarded by the question the note raises, then that would be good to implement, but if that is too complex to implement, then I would suggest that it would be better to just have the note land on a chord tone for the next chord as that would be more easily understood by the average listener.> 

**Impact:** Isolated notes that sound "wrong" in isolation but "correct" when the next chord arrives. This is the exact phenomenon the user described.

### Issue 2.2: Foreshadow Glue Notes Use Next Scale, Not Next Chord — Can Be Off-Key for Current Chord

**Location:** `melodyScheduler.js:1441-1463`

**Problem:** `foreshadow_glue` notes build a scale from the **next chord's root** using the **next chord's mode** (derived from `deduceSourceMode(nextChordObj.symbol, ...)`). But the note is being played during the **current chord's** time slot. The resulting pitch is a scale tone of the next chord, not necessarily a chord tone or scale tone of the current chord. < that's what foreshadowing is supposed to be, but it has to be done intelligently...if the foreshadowing can be a scale note of both chords, then that would be ideal...if not, there are ways of justifying it via surrounding notes that show that the foreshadowing note is intentional and not a random choice by the program> 

**Impact:** Notes played during chord A that are actually notes from chord B's scale. These are "correct" only if the listener anticipates the chord change — otherwise they sound like wrong notes. <-not always true..sometimes they cause the anticipation, rather than requiring it.>

### Issue 2.3: Color Tone Sanitation Pass Can Create "Orphan" Notes

**Location:** `melodyScheduler.js:1841-1860`

**Problem:** The sanitation pass (lines 1841-1860) resolves "passing/color notes" (non-chord-tone, non-scale-tone) by snapping them to chord tones. However, the logic checks `isNextClose` (next note within 4 sixteenth steps). If the next note IS close AND is a chord tone AND is stepwise, the color tone is **preserved**. But this preserved color tone is only valid as a **passing tone** between two chord tones. If the surrounding notes are not actually chord tones (due to other generation bugs), the color tone becomes an **orphan** — a note that is neither scale nor chord tone of the current chord.

**Impact:** Isolated off-key notes that appear in places where there's no stepwise resolution to justify them.

### Issue 2.4: Post-Processing Foreshadowing Overwrites Notes with Next Chord Tones Arbitrarily

**Location:** `melodyScheduler.js:1862-1882`

**Problem:** If `silenceDuration > 0.6 * beatLen` AND `isCloseToNextChord` (time to next chord ≤ beatLen + 0.01), the note's pitch is **overwritten** with the closest octave equivalent of a next chord note. This happens **after** all pitch selection logic, meaning a note that was carefully selected as a scale tone or chord tone of the current chord can be replaced with a note from the next chord.

**Impact:** A note that should belong to the current chord is replaced with a "foreshadowing" note from the next chord. If the timing is slightly off (the silence isn't actually long enough), the note sounds like a wrong note because it's a next-chord tone played during the current chord. <-converting a note that should belong to the current chord to a note of the next chord, even if it's a good foreshadowing note, can be jarring if done too aggressively or if not properly executed...the key is that the note that is used for foreshadowing should still have some melodic or rhythmic reason for existing and not just be a random note from the next chord...>

### Issue 2.5: `findClosest()` Has No Tolerance — Snaps to Farthest Available Pitch

**Location:** `melodyTuning.js:82-85`

**Problem:** `findClosest()` returns the array element with the minimum absolute difference to the input value. It has **no tolerance threshold** — if the closest pitch is 5 semitones away, it still returns that. Compare this to `findScaleIndex()` which has a tolerance of 45% of one step (line 64).

**Impact:** When the valid pitch pool is small (e.g., after aggressive filtering by cluster role, isolation, or color tone constraints), `findClosest()` can return a pitch that is several semitones away from the intended pitch, producing an "off-key" note.

### Issue 2.6: Voice-Leading Collision Prevention Can Push Notes to Adjacent Scale Degrees That Are Off-Key

**Location:** `melodyScheduler.js:1612-1635`

**Problem:** When two consecutive notes are within `0.99 * edoStep` of each other (essentially unison or microtonal clash), the code nudges the second note to the adjacent scale degree. But if the adjacent scale degree is **not a chord tone or scale tone of the current chord** (it's a scale tone of a different mode due to local scale switching), the nudged note is off-key.

**Impact:** Notes that are "corrected" for voice-leading reasons end up being off-key for the current harmony.

### Issue 2.7: MGEN Harmonic Snapping Can Change Structural Notes to Non-Chord Tones

**Location:** `mgen/src/orchestrator.js:574-703`

**Problem:** `_snapPitchesToHarmonicContext()` snaps structural/cadence notes to chord tones and other notes to scale+chord tones. However, the chord intervals are derived from the chord's `quality` field using hardcoded mappings (lines 626-644). If the chord symbol is non-standard (e.g., "Csus4" or "Cadd9"), the quality parsing may fail, defaulting to major chord intervals [0, 4, 7] instead of the correct intervals.

**Impact:** Structural notes that should be chord tones get snapped to wrong pitches when chord symbols are ambiguous.

### Issue 2.8: Professional Engine's Blue Note Handling Can Produce Off-Key Notes Without Stepwise Support

**Location:** `professionalMelodyScheduler.js:366-389`

**Problem:** Blue notes (b3, b5) are only applied when `hasStepwiseSupport` is true (both previous and next grid steps are active). However, the `stepPlaysMap` is modified by the "Chromatic Support Gate" (lines 208-219) which **forces** surrounding notes to be active for weak beats. This creates a situation where blue notes are applied, but the surrounding "forced" notes may not actually be generated (if they fail other filters), leaving the blue note isolated and off-key.

**Impact:** Blue notes that sound "wrong" because their supporting context was artificially created but not actually realized.

### Issue 2.9: MGEN Deduplication Can Discard the "Correct" Note and Keep an "Off-Key" One

**Location:** `mgen/src/orchestrator.js:454-489`

**Problem:** When multiple passes generate notes at the same start time, `_deduplicateOverlappingNotes()` keeps only the highest-priority role (structural > cadence > connector > ornament > expectation). If an ornament pass generates a grace note that's "correct" but a connector pass generates a note that's "off-key" for the current chord, the ornament wins by role priority — but if the roles are reversed (connector has higher priority than ornament in some edge cases), the off-key note survives.

**Impact:** Inconsistent pitch correctness depending on which pass "wins" the deduplication.

---

## 3. TIMING / CLOSE-PROXIMITY NOTE ISSUES

### Issue 3.1: Cluster Creation Creates Notes Very Close Together (2-3 Steps Apart)

**Location:** `melodyScheduler.js:1184-1243`

**Problem:** When an isolated note is detected (space before and after ≥ `beatDuration * 0.95`), there's a 75% chance to create a "cluster" by activating neighboring grid steps. The cluster can be:
- 2 notes: the isolated note + 1 neighbor (lines 1202-1204)
- 3 notes: the isolated note + 2 forward neighbors (lines 1205-1206)
- 3 notes: the isolated note + 2 backward neighbors (lines 1207-1209)

The neighbor steps are **adjacent grid steps**, which can be as close as `subStepDuration` (beatDuration / subdivision). At high subdivision (16th notes at 120 BPM), this is ~0.031 seconds. Two notes 0.031 seconds apart are essentially "thrown together" — they sound like a single articulated note with an irregular envelope.

**Impact:** The "strange timing variations where isolated pairs of notes seem thrown together very close together" that the user hears are directly caused by this cluster creation logic.

### Issue 3.2: Cluster Role Assignment Creates Asymmetric Note Pairs

**Location:** `melodyScheduler.js:1218-1238`

**Problem:** For foreshadow clusters with M=2 notes:
- Note 0 gets `clusterRole = 'reinforce'` (current chord tone)
- Note 1 gets `clusterRole = 'foreshadow_note'` (next chord tone)

But the order depends on whether the cluster uses forward or backward neighbors. If backward neighbors are used (lines 1207-1209), the foreshadow note comes **first** in time, followed by the reinforce note. This means a next-chord tone is played **before** the current chord tone, which is the opposite of the intended "foreshadowing" direction.

**Impact:** Notes that sound like they're "backwards foreshadowing" — the next chord's note is played first, then the current chord's note. This creates the "off-key" sensation because the harmony hasn't changed yet.

### Issue 3.3: Rubato Timing Warp Creates Non-Uniform Note Spacing

**Location:** `melodyScheduler.js:1283-1312`

**Problem:** Flourish runs apply timing warps (arch, accelerando, decelerando) to notes within a run:
```javascript
runSteps[i].stepTime = t_start + D * warpFn(x);
```

The warp functions are:
- Arch: `x - A * Math.sin(2 * Math.PI * x)` where A = -0.12
- Accelerando: `Math.pow(x, 1.25)`
- Decelerando: `Math.pow(x, 0.8)`

These warps are applied to `stepTime` **in place**, modifying the original grid step times. This means the notes within a flourish run have **non-uniform spacing** that doesn't correspond to any musical rhythm. The notes are still quantized to grid positions, but their timing is stretched/compressed non-linearly.

**Impact:** Notes that sound "rushed" or "dragged" within flourish runs, creating the "extended envelopes" on some notes and "quickly cut off" on others.

### Issue 3.4: Legato Duration Scaling Creates Variable Note Lengths

**Location:** `melodyScheduler.js:1314-1321`

**Problem:** Note durations are scaled based on the gap to the next note:
```javascript
const mult = Math.max(0.4, 0.9 - (settings.rests || 0.1) * 0.5);
current.noteDuration = gap * mult;
```

This means a note's duration is **not fixed** at generation time but depends on the gap to the next note. If the next note is far away, the current note is long. If the next note is close, the current note is short. The `mult` factor depends on `settings.rests`, which is a global setting, not a per-note setting.

**Impact:** Notes that are close together in time get shorter durations, while isolated notes get longer durations. This creates the "extended vs quickly cut off" envelope inconsistency.

### Issue 3.5: Overlap Prevention Truncates Notes Arbitrarily

**Location:** `melodyScheduler.js:1833-1836`

**Problem:** During post-processing, if a note's `stepTime + noteDuration > nextTime` (the next note's start time), the note's duration is truncated to `Math.max(0.01, nextTime - n.stepTime)`. This can happen when:
- The cluster creation logic places two notes very close together
- The rubato warp shifts a note's start time past the next note's original position
- The post-processing foreshadowing changes a note's pitch without adjusting its timing

**Impact:** Notes are abruptly cut short when they overlap with the next note, creating the "quickly cut off" sound.

### Issue 3.6: Empty Slot Fallback Notes Have Fixed Duration That May Overlap

**Location:** `melodyScheduler.js:1754-1755`

**Problem:** When no melody notes are scheduled, a fallback note is created with `noteDuration = (chordSlotDuration / beats) * 0.9`. This is an approximate quarter-note duration that doesn't account for the actual position of the note within the slot. If the fallback note is placed at step 8 (mid-slot), its duration may extend well into the next chord's territory.

**Impact:** Fallback notes can overlap with subsequent melody notes, triggering the overlap prevention truncation (Issue 3.5).

### Issue 3.7: Countermelody Duration Minimum Creates Inconsistent Spacing

**Location:** `melodyCountermelody.js:221-226`

**Problem:** Countermelody notes have a minimum duration of `beatDuration * 0.5` (half a beat), multiplied by a random factor of 0.8-1.2. This means countermelody notes are always at least 0.5 beats long, regardless of the melody's rhythm. If the melody has fast notes (16th notes) and the countermelody has long sustained notes, the countermelody notes will **ring through** multiple melody notes, creating a dense texture.

**Impact:** Countermelody notes that "extend" beyond their intended duration, creating harmonic density that may clash with subsequent melody notes.

### Issue 3.8: MGEN Duration Clamping Can Create Artificial Note Boundaries

**Location:** `mgen/src/orchestrator.js:162-169`

**Problem:** After deduplication and snapping, durations are clamped:
```javascript
if (currentNote.duration > timeToNext) {
    currentNote.duration = timeToNext;
}
```

This ensures no note overlaps the next, but it means the duration is determined by the **next note's position**, not by the note's own musical intent. A structural note that "wants" to be a half note may be clamped to 0.05 seconds if the next note is 0.05 seconds away.

**Impact:** Notes that should sustain are abruptly terminated by the clamping logic.

---

## 4. ARCHITECTURAL / CROSS-ENGINE ISSUES

### Issue 4.1: Three Engines Share `state.melodyAdsr` But Handle It Differently

**Location:** `synth.js:287-292`

**Problem:** All three engines ultimately call `playTone()` which reads `state.melodyAdsr` for the ADSR parameters. However:
- Legacy engine: passes `gapAfter` to `getEnvelopeTimes()` which clamps aggressively
- Professional engine: passes `gapAfter` to `getEnvelopeTimes()` which clamps aggressively
- MGEN engine: does NOT pass `gapAfter` in the `playToneFn` call (melodyScheduler.js:389-394), so `gapAfter` defaults to `999` (infinite space), meaning the "hasSpace" branch is always taken

**Impact:** The MGEN engine gets different envelope behavior than the other two engines for the same slider settings. This is an architectural inconsistency that makes it impossible to compare envelope behavior across engines.

### Issue 4.2: MGEN Does Not Pass `gapAfter` to `playToneFn`

**Location:** `mgenEngine.js:389-394`

**Problem:** The MGEN scheduler calls `playToneFn()` without a `gapAfter` parameter:
```javascript
playToneFn(frequency, noteStartTime, noteDuration, ..., {
    isAnchor1Step: note.isAnchor1Step,
    isAnchor2Step: note.isAnchor2Step,
    clusterRole: note.clusterRole
});
```

Compare this to the legacy engine (melodyScheduler.js:1931):
```javascript
playToneFn(midiToFreq(pitch), n.stepTime, n.noteDuration, ..., { gapAfter, step: n.step, ... });
```

Without `gapAfter`, `getEnvelopeTimes()` defaults to `gapAfter = 999`, which means `hasSpace = true` (line 10: `gapAfter >= 0.05`). This takes the "has space" branch, which caps attack/decay at 25% of duration. The MGEN engine's notes will always have shorter attack/decay than the legacy engine's notes for the same slider settings.

**Impact:** MGEN notes sound different from legacy/pro notes even with identical slider settings, because the envelope clamping behavior is different.

### Issue 4.3: No Shared Pre/Post-Processing Between Engines

**Problem:** The three engines (legacy, pro, mgen) have **no shared pre or post-processing**. Each engine:
- Builds its own pitch pools
- Plans its own anchors/climax
- Applies its own genre rules
- Applies its own ornaments

The only shared code is `playTone()` (synth.js) and `getEnvelopeTimes()` (synthEngines.js).

**Impact:** There is no "global" correction pass that could catch off-key notes or timing issues across all engines. Each engine must independently handle every edge case.

### Issue 4.4: `clearMelodyMemory()` Clears Both Legacy and MGEN Caches But Not Pro

**Location:** `melodyGenerator.js:14`

**Problem:** `clearMelodyMemory()` clears `melodyScheduled` and `mgenCachedNotes` but the professional engine stores its state in `context.proPhraseArch`, `context.proTensionTracker`, `context.proRegisterTracker`, and `context.proRhythmicCohesion`. These are not cleared by `clearMelodyMemory()`.

**Impact:** Switching from legacy/MGEN to professional mode may leave stale state from the previous engine, causing incorrect pitch/timing decisions.

### Issue 4.5: Local Scale Mode Switching Can Create Pitch Discontinuities

**Location:** `melodyScheduler.js:285-308`

**Problem:** The code switches between global scale and local chord-scale based on `getLocalScaleMode()`. When switching from major to dorian (for a minor7 chord) or major to mixolydian (for a dominant chord), the scale intervals change. For example, dorian has b3 (interval 3) while major has natural 3 (interval 4). If the previous note was based on the major scale and the next note is based on the dorian scale, the note may jump by a semitone to a pitch that is **valid in dorian but not in major**.

**Impact:** Notes that sound "off-key" for the global key but are technically correct for the local chord-scale. This is musically defensible but can sound jarring if the chord change is subtle.

### Issue 4.6: Pitch Class Rounding Creates Inconsistencies

**Location:** Multiple locations, e.g., `melodyScheduler.js:283`, `melodyScheduler.js:479`

**Problem:** Pitch classes are rounded to 2 decimal places: `Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100`. This rounding can cause pitch classes that are very close (e.g., 4.999999 and 5.0) to be treated as different. When comparing whether a pitch is a chord tone or scale tone, the rounded PC may not match, causing the pitch to be filtered out of the valid pool.

**Impact:** Notes that should be valid are filtered out, forcing `findClosest()` to return a more distant (potentially off-key) pitch.

### Issue 4.7: `validPitches` Pool Can Become Empty After Aggressive Filtering

**Location:** `melodyScheduler.js:339`, `melodyScheduler.js:1401-1406`

**Problem:** The `validPitches` pool is constructed as `prunedScalePitches + activeChordTones`. But when additional filtering is applied (cluster role, isolation, color tone constraints), the pool can become empty. The fallback is to use `validPitches` (unfiltered), but this fallback may still not contain the intended pitch if the unfiltered pool is narrow.

**Impact:** When the pool is empty or very narrow, `findClosest()` returns whatever is available, which may be several semitones away from the intended pitch.

---

## 5. PROFESSIONAL ENGINE SPECIFIC ISSUES

### Issue 5.1: Isolated Note Detection Uses Adjacent Grid Steps, Not Actual Notes

**Location:** `professionalMelodyScheduler.js:263-264`

**Problem:** `isIsolated` is determined by checking if the **previous and next grid steps** are not active:
```javascript
const isIsolated = (gIndex > 0 && !stepPlaysMap[gridSteps[gIndex - 1].step]) && 
                   (gIndex < gridSteps.length - 1 && !stepPlaysMap[gridSteps[gIndex + 1].step]);
```

This checks grid step activity, not actual note activity. If a grid step is "masked" (rest) but the note duration from the previous note extends into this step, the note is still audible. The isolation check doesn't account for note duration overlap.

**Impact:** Notes that are "isolated" by grid step logic may actually be overlapping with previous notes, creating the "close proximity" sensation.

### Issue 5.2: Professional Engine Doesn't Apply Post-Processing Foreshadowing

**Location:** `professionalMelodyScheduler.js` (no equivalent to melodyScheduler.js:1862-1882)

**Problem:** The professional engine does not have the post-processing foreshadowing/resolution pass that the legacy engine has. This means notes that would have been "corrected" to next-chord tones in the legacy engine remain as their originally selected pitches in the professional engine. This is actually **better** for pitch correctness, but it means the professional engine may produce more "off-key" notes that aren't justified by foreshadowing.

**Impact:** The professional engine produces cleaner results because it doesn't have the buggy post-processing foreshadowing pass, but it may produce more notes that sound "wrong" in isolation.

### Issue 5.3: Professional Engine's Cadence Resolution Can Force Off-Key Notes

**Location:** `professionalMelodyScheduler.js:402-409`

**Problem:** At the end of a phrase (within 2 steps of the end), the pitch is forced to:
- Authentic cadence: `findClosest(chordRoot, effectiveValidPitches)`
- Half cadence: `findClosest(chordRoot + 7, effectiveValidPitches)`

If `effectiveValidPitches` has been narrowed by NCT taxonomy or blue note handling, `findClosest()` may return a pitch that is not the actual chord root or fifth, but the closest available pitch (which could be several semitones away).

**Impact:** Cadential resolution notes that are "off" by a semitone or more.

---

## 6. MGEN ENGINE SPECIFIC ISSUES

### Issue 6.1: 5-Pass Pipeline Can Generate Conflicting Notes at Same Time

**Location:** `mgen/src/orchestrator.js:113-114`

**Problem:** Each pass (Structural, Cadence, Connector, Ornament, Expectation) generates notes independently. Pass A generates structural notes, Pass B generates cadence notes, Pass C generates connector notes, etc. Multiple passes can generate notes at the same start time with different pitches. The deduplication keeps only the highest-priority role, but this means lower-priority notes (which may be more "correct" for the current harmony) are discarded in favor of higher-priority notes (which may be "off-key" for the current chord but "correct" for the phrase structure).

**Impact:** Notes that are structurally correct but harmonically wrong.

### Issue 6.2: Safe Mode Skips Remaining Passes, Leaving Notes Unrefined

**Location:** `mgen/src/orchestrator.js:99-110`

**Problem:** If execution time exceeds 70% of the 15ms budget, `safeMode` is triggered, which:
- Skips remaining passes (line 107: `break` exits the pass loop)
- Uses `maxAttempts = 1` (no regeneration)

This means notes generated by earlier passes (which may be off-key) are not refined by later passes (which might have corrected them).

**Impact:** In complex progressions or at high BPM, notes are more likely to be off-key because the refinement passes are skipped.

### Issue 6.3: Feedback Loop Can Amplify Issues

**Location:** `mgen/src/orchestrator.js:83-187`

**Problem:** The feedback loop runs up to `maxFeedbackIterations` (default 5) times. Each iteration re-runs all passes with adjusted parameters. If the first iteration produces off-key notes, the feedback adjustments (lines 304-325) may not address the root cause (e.g., `strictChordTones = true` for weak-harmonic-responsiveness doesn't fix notes that are already generated).

**Impact:** Off-key notes can persist or even be amplified across feedback iterations.

### Issue 6.4: MGEN Bridge Doesn't Apply `gapAfter` or ADSR

**Location:** `mgenEngine.js:389-394`

**Problem:** The MGEN scheduler doesn't pass `gapAfter` to `playToneFn`, and doesn't pass any ADSR parameters explicitly. The `playTone()` function reads `state.melodyAdsr` directly, but the envelope clamping logic in `getEnvelopeTimes()` behaves differently without `gapAfter`.

**Impact:** MGEN notes have different envelope behavior than legacy/pro notes (see Issue 4.2).

---

## 7. COUNTMELODY-SPECIFIC ISSUES

### Issue 7.1: Countermelody Can Play Notes Within 1 EDO Step of Melody (Dissonant Clashes)

**Location:** `melodyCountermelody.js:197-218`

**Problem:** The polyphonic collision check nudges the countermelody if it's within `1.0 * edoStep` of the melody pitch. But the nudge only moves to the **adjacent** scale degree, which may still be within 1 EDO step of the melody pitch (e.g., a minor second). The check `Math.abs(nudgedPitch - pitch) > 0.01` allows unison (0 difference) but not necessarily consonance.

**Impact:** Countermelody notes that create dissonant intervals (minor seconds, tritones) with melody notes.

### Issue 7.2: Countermelody Uses `findClosest()` Without Tolerance

**Location:** `melodyCountermelody.js:154`

**Problem:** `counterPitch = findClosest(counterPitch, counterValidPitches)` has no tolerance. If `counterValidPitches` is narrow (due to range limits or filtering), the closest pitch may be far from the intended pitch.

**Impact:** Countermelody notes that are off-key for the current harmony.

---

## 8. SUMMARY OF ROOT CAUSES

The "off-key" isolated notes the user hears are caused by a combination of:

1. **Cluster creation logic** (melodyScheduler.js:1184-1243) that throws notes very close together (2-3 grid steps apart), creating the "isolated pairs thrown together" phenomenon.

2. **Foreshadowing logic** (melodyScheduler.js:1431-1463, 1862-1882) that selects notes from the **next chord's** scale/chord and plays them during the **current chord's** time slot, creating notes that are "correct" only if the chord change is anticipated.

3. **Aggressive envelope clamping** (synthEngines.js:3-45) that overrides user slider settings for short notes, creating the "extended vs quickly cut off" envelope inconsistency.

4. **Inconsistent `gapAfter` handling** across engines (MGEN doesn't pass it, legacy/pro do) causing different envelope behavior for the same slider settings.

5. **Post-processing pitch overwrites** (melodyScheduler.js:1862-1882) that replace carefully selected notes with next-chord tones based on timing heuristics.

6. **Empty or narrow pitch pools** after aggressive filtering, forcing `findClosest()` to return distant (off-key) pitches.

7. **Rubato timing warps** (melodyScheduler.js:1283-1312) that create non-uniform note spacing, contributing to the "strange timing variations."

---

## 9. PRIORITY FIXES

| Priority | Issue | File | Lines | Impact |
|----------|-------|------|-------|--------|
| P0 | Envelope sliders overridden by clamping | synthEngines.js | 3-45 | High — users can't control envelopes |
| P0 | Cluster creation throws notes close together | melodyScheduler.js | 1184-1243 | High — causes "thrown together" notes |
| P1 | Foreshadow notes played during wrong chord | melodyScheduler.js | 1431-1463 | High — causes off-key notes |
| P1 | Post-processing foreshadowing overwrites notes | melodyScheduler.js | 1862-1882 | High — replaces correct notes with next-chord tones |
| P1 | MGEN doesn't pass gapAfter | mgenEngine.js | 389-394 | Medium — inconsistent envelope behavior |
| P2 | FM/plucked ignore ADSR sliders | synthEngines.js | 286, 346 | Medium — sliders don't work for these instruments |
| P2 | Rubato warps create non-uniform spacing | melodyScheduler.js | 1283-1312 | Medium — causes timing variations |
| P2 | Overlap prevention truncates notes | melodyScheduler.js | 1833-1836 | Medium — causes "cut off" sounds |
| P3 | Local scale switching creates discontinuities | melodyScheduler.js | 285-308 | Low — musically defensible but jarring |
| P3 | Professional cadence forcing | professionalMelodyScheduler.js | 402-409 | Low — cadential "off" notes |

---

## 10. WHY PROFESSIONAL MODE SOUND BETTER

The professional mode produces better results because:

1. **No post-processing foreshadowing** — it doesn't have the buggy pitch-overwrite pass (melodyScheduler.js:1862-1882) that replaces notes with next-chord tones.

2. **Stricter isolation handling** — isolated notes are constrained to chord tones only (professionalMelodyScheduler.js:269-270), not the full valid pitch pool.

3. **No cluster creation** — the professional engine doesn't have the cluster creation logic that throws notes close together (melodyScheduler.js:1184-1243).

4. **No rubato warps** — the professional engine uses uniform grid timing, not non-linear warps.

5. **NCT taxonomy pre-gating** — non-chord tones are explicitly categorized and constrained, reducing the chance of orphan notes.

However, the professional mode still suffers from envelope clamping (Issue 1.1), `findClosest()` tolerance issues (Issue 2.5), and cadence forcing (Issue 5.3).
