# Legacy Melody Generator Rules & Implementation Reference

This document provides a concise rundown of the rules, processing stages, and core logic of the legacy melody generator in `melodyScheduler.js`. It includes structured pseudocode designed for evaluation and optimization by other LLMs.

---

## 🎹 Melody Generation Process Stages

The legacy melody generator works on a grid-based step scheduling model (typically 16 steps per phrase/bar). The process executes in 5 main stages:

### Stage 1: Rhythmic Density & Rest Masking
- **Rules**:
  - The rhythm is derived from a seed template.
  - Active steps are determined by scaling the density setting against a randomized threshold.
  - User-controlled `restProbability` masks notes out to introduce space.
- **Code Reference**:
  ```javascript
  const playProb = 0.25 + density * 0.2;
  const isPlaying = rng.next() < playProb && rng.next() >= restProbability;
  ```

### Stage 2: Pitch Context & Pre-gating (Harmonic Constraints)
- **Rules**:
  - **Isolated Notes**: If a note is surrounded by silence (rests), it must snap strictly to stable chord tones (Root, 3rd, 5th).
  - **Color/Passing Notes**: Non-chord tones are only allowed in a passing context (step is adjacent to active notes on both sides) and not on downbeats (beats 0 and 2).
  - **Cluster Roles**: Filters the valid pitches based on motivic transition roles:
    - `reinforce`: Chord tones only.
    - `foreshadow_note` / `foreshadow_glue`: Blends in pitches from the upcoming chord.
    - `commontone`: Intersecting chord tones between current and next chord.

### Stage 3: Step-by-Step Pitch Selection (Voice Leading)
- **Rules**:
  - **Conjunct Motion**: Prefers step-wise movement (interval $\le 2$ semitones) over leaps.
  - **Leap Resolution**: If the melody leaps by $\ge 4$ semitones, the next note must resolve in the contrary direction.
  - **Collision Prevention**: If consecutive notes are closer than a semitone (in microtonal context), nudge them apart to prevent overlapping synth cutoffs.

### Stage 4: Genre-Specific Chromatic Inflections (Blues/Jazz Rules)
- **Rules**:
  - **Flat 5th ($\flat5$)**: Relative pitch class 6. Only allowed in the middle of a chromatic run (e.g. 4 $\to$ $\flat5$ $\to$ 5 or 5 $\to$ $\flat5$ $\to$ 4).
  - **Flat 3rd ($\flat3$)**: Relative pitch class 3. Acts as an approach note that must resolve a half-step up to the major 3rd (pc = 4) on the next played step.
  - **No Consecutive Blue Notes**: Prevents consecutive chromatic alterations to avoid key drift.

### Stage 5: Ornaments & Motivic Flexing (Post-processing)
- **Rules**:
  - **Grace Notes**: Classical/Baroque mode schedules a short preceding grace note if there is at least 0.08s of space before the main note.
  - **Motivic Flexing**: Splits whole-step intervals into passing half-steps (fills) or shifts note starts slightly to add expression.

---

## 📝 Structured Pseudocode (Professional Reference)

```pascal
// Standard structured pseudocode for LLM evaluation & optimization

PROCEDURE GenerateMelodyStep(step, prevPitch, activeChord, nextChord, settings)
    semitone := 12 / settings.divisions
    chordRoot := activeChord.key
    
    // Stage 1: Rhythm Check
    IF NOT StepShouldPlay(step, settings.density, settings.restProbability) THEN
        RETURN Rest()
    ENDIF

    // Stage 2: Harmonic Pre-gating
    validPitches := GetScalePitches(settings.scale, settings.range)
    effectivePitches := validPitches

    isIsolated := IsStepIsolated(step)
    IF isIsolated THEN
        // Snap isolated notes to stable chord tones
        effectivePitches := FilterToChordTones(validPitches, activeChord)
    ELSEIF NOT IsPassingContext(step) AND (step.beat == 0 OR step.beat == 2) THEN
        // Restrict color tones on strong beats unless passing
        effectivePitches := FilterToInScaleAndChordTones(validPitches, activeChord)
    ENDIF

    // Stage 3: Pitch Selection
    pitch := prevPitch
    
    IF HasForcedResolution() THEN
        pitch := GetForcedResolutionPitch()
    ELSE
        // Apply Conjunct Motion: Find closest pitch in effective list
        targetPitch := SelectTargetPitch(prevPitch, settings.contour)
        pitch := FindClosest(targetPitch, effectivePitches)
        
        // Leap contrary resolution constraint
        IF Absolute(pitch - prevPitch) >= 4 * semitone THEN
            SetForcedResolutionDirection(-Sign(pitch - prevPitch))
        ENDIF
    ENDIF

    // Stage 4: Blues Genre Chromatic Alterations
    IF settings.genre == "blues" AND NOT prevNoteWasBlue THEN
        proposedBluePitch := pitch - semitone
        proposedPc := (proposedBluePitch - chordRoot) MOD 12
        
        isB5 := (proposedPc == 6)
        isB3 := (proposedPc == 3)
        
        IF isB5 AND prevPitch != null THEN
            // Only allow b5 in chromatic runs
            IF Absolute(prevPitch - proposedBluePitch) == semitone THEN
                pitch := proposedBluePitch
                SetForcedResolutionPitch(proposedBluePitch + (proposedBluePitch - prevPitch))
                prevNoteWasBlue := TRUE
            ENDIF
        ELSEIF isB3 THEN
            // b3 resolves a half-step up
            pitch := proposedBluePitch
            SetForcedResolutionPitch(proposedBluePitch + semitone)
            prevNoteWasBlue := TRUE
        ENDIF
    ELSE
        prevNoteWasBlue := FALSE
    ENDIF

    // Stage 5: Ornaments
    IF settings.genre == "classical" AND HasSpaceBefore(step, 0.08) THEN
        ScheduleGraceNote(pitch - semitone, step.time - 0.05)
    ENDIF

    RETURN Note(pitch, step.time, step.duration)
ENDPROC
```
