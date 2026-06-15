# Melody & Countermelody Generation Mechanics

This document is a comprehensive, self-contained reference detailing the internal algorithms, music theory snapping engine, and stateful lookahead planner of the **Melody Generator** in the Progress app. It contains the core codebase segments of the generator to allow external LLMs (such as Claude or ChatGPT) to analyze, troubleshoot, and generate patches without requiring full project file uploads.

---

## 1. Directory Structure of Melody Generation

The original monolithic melody generator has been refactored into the following modular files:
1. **[melodyGenerator.js](file:///Users/sheldonlawrence/Desktop/progress/melodyGenerator.js)**: The core entry point (`scheduleMelody()`), lookahead planning, performance loops, and slot boundaries.
2. **[melodyTuning.js](file:///Users/sheldonlawrence/Desktop/progress/melodyTuning.js)**: Contains EDO scale building, pitch class mapping, chord-degree resolution, anchor planning, and stability snapped chord-tone filters.
3. **[melodyRhythm.js](file:///Users/sheldonlawrence/Desktop/progress/melodyRhythm.js)**: Implements dynamic subdivision palettes, beat gating, syncopation templates, and duration solvers.
4. **[melodyMotifs.js](file:///Users/sheldonlawrence/Desktop/progress/melodyMotifs.js)**: Generates, caches, and mutates Hook, Connector, and Cadence motif cells with human-like rhythm and length variations.
5. **[melodyGenreRules.js](file:///Users/sheldonlawrence/Desktop/progress/melodyGenreRules.js)**: Applies genre-specific ornamentations (jazz enclosures, blues glides/bends) and voice leading overrides.

---

## 2. Dynamic Phrase-Level Aesthetic Modes

Every 4 chord slots (`absIndex % 4 === 0`), a phrase-wide **Aesthetic Mode** is locked in alongside a dynamic `phraseActivityCurve` based on the active chord qualities and structural roles:

* **Cantabile** (Flowing/Lyrical): Stepwise conjunct scale motion. Chosen for major chords or resolution slots.
* **Sighs & Suspensions** (Appoggiaturas): Large upward leaps resolving downward stepwise. Chosen for minor, diminished, and augmented chords.
* **Declamatory** (Rhythmic/Motivic): Short, syncopated, sync-anchored rhythmic cells. Chosen for suspended and dominant chords.
* **Virtuoso** (Technical Runs): Rapid scale sweeps and arpeggios. Triggered for climax/build slots or when density is set $>0.8$.

---

## 3. Core Entry Point Code: `scheduleMelody`

Below is the orchestration code of the entry point function inside `melodyGenerator.js`.

```javascript
// melodyGenerator.js - Core Entry Point Orchestration
export function scheduleMelody(
    time,
    chordObj,
    nextChordObj,
    prevChordObj,
    chordSlotDuration,
    beats,
    bpm,
    absIndex,
    totalChords,
    chordNotes,
    playToneFn = playTone,
    voiceEvents = []
) {
    const settings = state.melodySettings;
    if (!settings || !settings.enabled) return;

    const hasArp = chordObj.arpSettings && chordObj.arpSettings.pattern !== 'none';
    if (hasArp && settings.behaviorDuringArp === 'off') return;

    const hasTransition = chordObj.chordPattern && chordObj.chordPattern.transitions && chordObj.chordPattern.transitions.length > 0;
    if (hasTransition && settings.behaviorDuringTransitions === 'off') return;

    const tuning = getEffectiveTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const keyRoot = chordObj.key !== undefined ? Number(chordObj.key) : (Number(state.baseKey) || 60);

    // Pass 0: Lock in Aesthetic Mode and activity curves on 4-bar boundaries
    if (absIndex % 4 === 0) {
        noteCountThisPhrase = 0;
        phraseHighestPitch = null;
        peakPitchHitsCount = 0;
        narrativeState.phraseSubdivisions = generatePhraseSubdivisions(settings.genre);
        activeAestheticMode = selectAestheticMode(chordObj, absIndex, totalChords, settings);
    }

    // Determine scale pitches and apply custom microtonal chord tuning offsets
    const baseChordKey = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;
    const isTransposed = selectLocalTransposition(settings, absIndex);
    const scalePitches = buildScalePitches(keyRoot, baseChordKey, chordObj.symbol, divisions, periodSize, isTransposed);
    const microtonalOffsets = calculateMicrotonalOffsets(chordObj, baseChordKey, divisions, periodSize);
    
    const validPitches = scalePitches.map(pitch => {
        const pc = ((pitch % periodSize) + periodSize) % periodSize;
        const matchingOffset = microtonalOffsets.find(o => Math.abs(o.pc - pc) < 0.05);
        return matchingOffset ? pitch + matchingOffset.cents : pitch;
    });

    const stableTones = getStableTones(chordNotes, validPitches, periodSize);
    const totalSteps = beats * 16;
    const subdivision = selectSubdivision(activeAestheticMode, settings);
    const stepIntervalSec = chordSlotDuration / totalSteps;

    // Pass 1: Plan Structural Targets (Anchor 1 at Beat 1, Anchor 2 at Beat 3)
    const plannedAnchors = planStructuralAnchors(validPitches, stableTones, absIndex, settings);

    // Pass 2: Lookahead Grid Generation (Connective Fills & Motifs)
    const lookaheadGrid = buildLookaheadGrid(totalSteps, subdivision, plannedAnchors, validPitches, stableTones, settings);

    // Pass 3: Subdivision-Gated Snapping, Isolated Snapping & Resolutions
    const finalGrid = resolveAestheticSnapping(lookaheadGrid, stableTones, validPitches, periodSize, settings);

    // Pass 4: Performance Sorting & Overlap Clamping
    const melodyScheduled = sortAndClampMelody(finalGrid, time, stepIntervalSec);

    // Playback scheduling trigger
    melodyScheduled.forEach(note => {
        playToneFn(midiToFreq(note.pitch), note.absoluteTime, note.duration, 'melody', 'melody', 0, note.volume);
    });

    // Save history for cross-chord context tracking
    if (melodyScheduled.length > 0) {
        globalPrevPitch = melodyScheduled[melodyScheduled.length - 1].pitch;
        globalLastMelodyNoteTime = melodyScheduled[melodyScheduled.length - 1].absoluteTime;
    }
}
```

---

## 4. Stability Snap and Downbeat Snapping Code

Below is the snapping code located inside `melodyTuning.js`. It includes the structural subdivision-gated snaps and isolated note constraints:

```javascript
// melodyTuning.js - Consonance Stability & Snap Filters
export function getStableTones(voicedNotes, validPitches, periodSize = 12) {
    if (!voicedNotes || voicedNotes.length === 0) return [validPitches[0]];
    
    // CURRENT LIMITATION: All voiced notes are treated as equally stable,
    // including tense extensions (like major 7ths, suspensions, flat 5ths).
    return validPitches.filter(p => {
        const pPc = ((p % periodSize) + periodSize) % periodSize;
        return voicedNotes.some(vn => {
            const vPc = ((vn % periodSize) + periodSize) % periodSize;
            return Math.abs(pPc - vPc) < 0.05;
        });
    });
}

export function enforceChordToneOnDownbeat(pitch, stableTones, validPitches) {
    // If pitch is already a stable chord tone, return it
    if (stableTones.includes(pitch)) return pitch;
    // Otherwise, snap to the closest stable chord tone
    return findClosest(pitch, stableTones);
}

// Pass 3: Snapping and Gating Heuristic inside melodyGenerator.js
function resolveAestheticSnapping(lookaheadGrid, stableTones, validPitches, periodSize, settings) {
    return lookaheadGrid.map(step => {
        if (!step.active) return step;

        let finalPitch = step.pitch;

        // 1. Subdivision-Gated Downbeat Snapping
        const isStructuralStep = step.sixteenthStep === 0 || step.sixteenthStep === 8;
        const isStructuralDuration = step.subdivision <= 2; // Quarter or 8th notes
        if (isStructuralStep && isStructuralDuration && !step.isRun) {
            finalPitch = enforceChordToneOnDownbeat(finalPitch, stableTones, validPitches);
        }

        // 2. Isolated Note Snapping (Lonely note plucking guard)
        if (step.isIsolated) {
            finalPitch = findClosest(finalPitch, stableTones);
        }

        return { ...step, pitch: finalPitch };
    });
}
```

---

## 5. Critical Audit: The Half-Step Extension Clash

### Symptom Analysis
Listening tests reveal occasional jarring notes on structural beats. The generator schedules notes that are mathematically within the active chord voicing's scale grid, but they land a **half-step away** from a highly consonant triad tone (for example, landing on `B` (major 7th) instead of `C` (root) or `E` (third) on a downbeat resolution). Because these notes land on downbeats or resolutions, the ear hears them as exposed, clashing errors.

### Why `simulate_progression` Didn't Catch It
The progression simulation (`simulate_progression.js`) performs structure verification (like validating Bohlen-Pierce tritave mapping or loop recall indexing). It does not have an auditory aesthetic scoring model to evaluate consonance hierarchies or the tension of unresolved half-step voice leading.

### Root Cause
`getStableTones()` treats all voiced chord tones as equally stable targets. Under advanced voicings, this includes 7ths, 9ths, and suspensions. When downbeat snapping or isolated snapping triggers, the engine snaps to the *closest* chord tone, which might be a tense extension, leaving a sharp unresolved dissonance exposed in the empty space.

---

## 6. ChatGPT/Claude Refactoring Consultation Guide

When copying this file to ChatGPT or Claude to design the next phase of changes, direct the LLM's attention to the following structured prompts:

### A. Consonance Hierarchical Snapping
Modify `getStableTones()` to differentiate between primary consonant intervals and extensions:
1. Divide `voicedNotes` into **Primary Triad Tones** (Root, 3rd, 5th) and **Tense Extensions** (7ths, 9ths, 11ths, 13ths, suspensions).
2. Forces downbeats, isolated notes, and consequent phrase endings to snap *strictly* to the Primary Triad Tones.
3. Keep Tense Extensions active only for fast runs (subdivision $\ge 3$) or syncopated off-beat entries.

### B. Half-Step Resolution Guard
Implement a horizontal resolution rule:
1. If a melody note lands on a tense extension or scale degree that is exactly a half-step away from a primary consonant tone (e.g. F resolving to E, or B resolving to C), it must immediately resolve stepwise to that consonant target note in the following active step.
2. If the note is followed by silence (rests), the resolution must be scheduled *before* the rest begins (appoggiatura resolution).

---

## 7. Pitch-Class Matched Pattern Offsets (Audition Fix)

Manual chord inversions and voice-leading registers previously suffered from transposition offsets clashing with the rhythm editor. In June 2026, we resolved this by replacing the flat index-based pattern offset mapping with a **pitch-class matching algorithm**:

* **The Problem**: Voiced chords reorder their notes under inversions. A static pattern offset array (like `[0, 0, 5]` designed to shift the 5th) was applied to the voices by array index. When inverted, the offset got applied to the wrong chord tone, distorting the chord quality.
* **The Fix**: The new `applyInstanceOffsets()` function matches the pitch classes of voiced notes (modulo `periodSize`) against the original root-position chord tones. This ensures that custom pitches follow their respective chord tones under any manual inversion, voicing type, or voice-leading register.

```javascript
// transitionEvaluator.js - Pitch Class Matching
export function applyInstanceOffsets(voicedNotes, inst, chordObj, tuning) {
    if (!inst) return voicedNotes;
    const periodSize = tuning ? tuning.periodSize : 12;
    return voicedNotes.map((n, i) => {
        const offset = getMatchedOffset(n, inst, chordObj, periodSize, i);
        return n + offset;
    });
}

export function getMatchedOffset(note, inst, chordObj, periodSize = 12, fallbackIdx = -1) {
    if (!inst) return 0;
    const offset = inst.pitchOffset || 0;
    const offsets = inst.pitchOffsets;
    if (!offsets || offsets.length === 0) return offset;
    
    if (chordObj && chordObj.symbol) {
        const divisions = chordObj.divisions || (state && state.divisions) || 12;
        const rootNotes = chordObj.customNotes || getChordNotes(chordObj.symbol, chordObj.key !== undefined ? chordObj.key : 60, divisions);
        if (rootNotes && rootNotes.length > 0) {
            const nPc = ((note % periodSize) + periodSize) % periodSize;
            let bestIdx = -1;
            let minDiff = Infinity;
            for (let j = 0; j < rootNotes.length; j++) {
                const rPc = ((rootNotes[j] % periodSize) + periodSize) % periodSize;
                let diff = Math.abs(nPc - rPc);
                diff = Math.min(diff, periodSize - diff);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdx = j;
                }
            }
            if (bestIdx !== -1 && offsets[bestIdx] !== undefined) {
                return offsets[bestIdx];
            }
        }
    }
    
    if (fallbackIdx !== -1 && offsets[fallbackIdx] !== undefined) {
        return offsets[fallbackIdx];
    }
    return offset;
}
```

---

## 8. Suggested Commit Message

Use this git commit message to commit this stable build containing unified voice leading manual inversions, pitch isolation, and pitch-class matched pattern offsets:

```text
feat: native voice-led manual inversions & pitch-class matched pattern offsets

- Integrate `inversionOffset` natively into `generateInversions` search space to allow the voice-leading engine to optimize octave registers for manual inversions.
- Isolate the chord ADSR pitch shift parameter in `synth.js` and `wavExport.js` so it only affects sample-based chord engines, preventing sawpad and other chord synths from drifting in register.
- Implement pitch-class matching in `applyInstanceOffsets` inside `transitionEvaluator.js` to ensure pattern pitch offsets dynamically track their respective chord tones under inversions.
- Align `getAuditionNotes` and `getAuditionNotesForSeq` with the new pattern offset mapping.
- Add console debug logs for step inversion audition monitoring.
- Add unit test coverage in `voiceLeading.test.js` and `transitionEvaluator.test.js`.
```