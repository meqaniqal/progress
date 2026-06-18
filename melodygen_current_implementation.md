# Melody & Countermelody Generation Mechanics

This document is a comprehensive, self-contained reference detailing the internal algorithms, music theory snapping engine, and stateful lookahead planner of the **Melody Generator** in the Progress app. It contains the complete code of the modular files to allow external LLMs (such as Claude or ChatGPT) to analyze, troubleshoot, and generate patches without requiring full project file uploads.

---

## Architectural Overview

The Melody Generator is evolving from a stochastic note-selection system into a hierarchical compositional architecture.

Current implementation components roughly correspond to the following architectural responsibilities:

CompositionOrchestrator
- coordinates generation passes
- manages phrase-level planning

PhraseEngine
- macro contour planning
- phrase role assignment
- structural anchor generation

MotifEngine
- motif family generation
- transformation
- recall

ExpectationEngine
- anchor targeting
- tension/release management
- cadence planning

VoiceLeadingEngine
- interval constraints
- directional motion
- leap compensation

StyleEngine
- rhythmic templates
- aesthetic modes
- genre rules
- ornamentation

MicrotonalEngine
- scale construction
- tuning abstraction
- pitch selection

Future versions may replace individual algorithms while preserving these architectural responsibilities.




## 1. Relevance of the Chord Inversion Mangling Bug

### How Chord Voicings Feed the Melody Generator
The melody generator's main entry point, `scheduleMelody()`, receives the array of `chordNotes` representing the currently voiced chord. The generator calls:
$$\text{stableTones} = \text{getStableTones}(\text{chordNotes}, \text{validPitches})$$
These `stableTones` are the core consonant targets (Roots, 3rds, 5ths) used in Pass 3 for:
1. **Downbeat Snapping**: Forcing structural notes on beats 0 and 2 to land on chord tones.
2. **Isolated Note Snapping**: Preventing lonely notes surrounded by rests from clashing.

### The Mangling Chain Reaction
When the inversion mangling bug was active:
1. An inverted chord like `ii` (D minor in 1st inversion: F-A-D, `[53, 57, 62]`) had the pattern offset `[0, 0, 5]` applied by flat index rather than pitch class.
2. This mangled the chord into F-A-G (`[53, 57, 67]`).
3. The melody generator was given `[53, 57, 67]` as `chordNotes`.
4. It snapped downbeats and isolated notes to `67` (G) or `57` (A) instead of resolving them to `62` (D), creating clashes with the bass and destroying key center cohesion.

*Conclusion: The chord inversion fix in `applyInstanceOffsets()` is a prerequisite for clean melody generation.*

---

## 2. Algorithmic Composition Paradigm Critique

To make the melody generator feel like an "inspiring, genius human composer" rather than a stochastic script, we must evaluate it against professional algorithmic packages:

| Software / Paradigm | Core Method | Musical Strengths | Weaknesses |
| :--- | :--- | :--- | :--- |
| **Band-in-a-Box** | Database-driven phrase templates matched to chords. | Highly idiomatic and recognizable phrases. | Lacks real-time adaptability or true intelligence; repetitive. |
| **Synfire Pro** | Vector-based transformations of structural lines. | Mathematically coherent voice leading across complex modulations. | Can sound academic or clinical without human-authored motivic seeding. |
| **Our Generator (Current)** | Stochastic beat-by-beat planning with post-hoc rules. | Highly microtonally adaptive, fits custom chord scales. | Can sound chaotic, like a "kindergartener plucking" notes randomly. |

### The Path to "Melodic Genius"
A genius composer does not roll dice step-by-step. They plan hierarchically:
1. **The Rhythmic Hook (Gesture)**: A simple, memorable rhythmic motif (e.g., *da-da-da-DUM*) is chosen and repeated.
2. **Diatonic Transposition**: The rhythmic hook is preserved while the pitches shift to trace the chord changes.
3. **Tonal Hierarchy**: Chord tones are targets; non-chord tones are tensions that resolve stepwise to the nearest target.
4. **Tension Contours**: The pitch range and density scale dynamically to outline a singular climax in the phrase.

---

## 3. Modular Code Reference

This section contains the complete codebase of the helper modules and key orchestrations from `melodyGenerator.js`.

### A. Core Entry & Scheduling (`melodyGenerator.js` excerpts)

```javascript
// melodyGenerator.js - Aesthetic Mode Selection Heuristic
function selectAestheticMode(chordObj, absIndex, totalChords, settings) {
    const keyRoot = chordObj.key !== undefined ? Number(chordObj.key) : (Number(state.baseKey) || 60);
    const parsed = deduceChordRootAndQuality(chordObj.symbol, keyRoot, state.divisions || 12);
    const quality = parsed ? parsed.quality : 'major';
    const firstProg = absIndex / Math.max(1, totalChords);
    const firstTcVal = settings.tensionCurve === 'arch' ? Math.sin(firstProg * Math.PI) : 0.5;
    const firstSlotTension = Math.max(0.0, Math.min(1.0, settings.density * 0.4 + firstTcVal * 0.6));
    const firstSlotRole = (settings.macroPlannerEnabled && macroTargetPlan && macroTargetPlan[absIndex]) ? macroTargetPlan[absIndex].role : 'statement';

    let mode = 'cantabile';
    if (quality === 'major') {
        mode = (firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
    } else if (quality === 'minor') {
        mode = (firstSlotRole === 'build' || (absIndex % 4 >= 1 && firstSlotTension > 0.6)) ? 'sighs' : 'cantabile';
    } else if (quality === 'dominant') {
        mode = (firstSlotRole === 'climax' || firstSlotTension > 0.6) ? 'virtuoso' : 'declamatory';
    } else if (quality === 'diminished') {
        mode = (firstSlotRole === 'climax' || firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'sighs';
    } else if (quality === 'suspended') {
        mode = (firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
    }

    if (settings.macroPlannerEnabled) {
        if (firstSlotRole === 'resolution') mode = 'cantabile';
        else if (firstSlotRole === 'climax') mode = (quality !== 'diminished') ? 'virtuoso' : 'sighs';
    }

    if (settings.density > 0.8 && settings.genre !== 'none') mode = 'virtuoso';
    if (settings.genre === 'none') mode = 'cantabile';

    return mode;
}

// Pass 2: Lookahead Grid Generation Loop
function buildLookaheadGrid(totalSteps, subdivision, plannedAnchors, validPitches, stableTones, settings) {
    const grid = [];
    const stepIntervalSec = chordSlotDuration / totalSteps;
    const rhythmicTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre);

    for (let step = 0; step < totalSteps; step++) {
        const beatIndex = Math.floor(step / 4);
        const subIndex = step % 4;
        const currentSubdiv = narrativeState.phraseSubdivisions[absIndex * 4 + beatIndex] || subdivision;

        // Downbeat safety and planned anchors
        const isAnchor1 = step === 0;
        const isAnchor2 = step === Math.floor(totalSteps / 2);
        
        let pitch = validPitches[Math.floor(validPitches.length / 2)];
        let active = false;

        if (isAnchor1 && plannedAnchors.anchor1 !== null) {
            pitch = plannedAnchors.anchor1;
            active = true;
        } else if (isAnchor2 && plannedAnchors.anchor2 !== null) {
            pitch = plannedAnchors.anchor2;
            active = true;
        } else {
            // Stochastic density checking based on activeAestheticMode template
            const templateHit = rhythmicTemplate[step % rhythmicTemplate.length] === 1;
            const densityRoll = Math.random() < settings.density;
            if (templateHit && densityRoll) {
                active = true;
                pitch = generateFillPitch(step, grid, validPitches, stableTones, settings);
            }
        }

        grid.push({
            sixteenthStep: step,
            pitch: pitch,
            active: active,
            subdivision: currentSubdiv,
            isAnchor: isAnchor1 || isAnchor2
        });
    }

    // Tag isolated notes
    for (let step = 0; step < totalSteps; step++) {
        if (!grid[step].active) continue;
        let leftSpace = true;
        let rightSpace = true;
        for (let j = 1; j <= 3; j++) {
            if (step - j >= 0 && grid[step - j].active) leftSpace = false;
            if (step + j < totalSteps && grid[step + j].active) rightSpace = false;
        }
        grid[step].isIsolated = leftSpace && rightSpace;
    }

    return grid;
}
```

### B. Complete `melodyTuning.js` Code

```javascript
import { state } from './store.js';

export function getScaleIntervals(mode, genre = 'none') {
    if (genre === 'jazz') {
        const BEBOP_SCALES = {
            major: [0, 2, 4, 5, 7, 8, 9, 11],
            minor: [0, 2, 3, 4, 5, 7, 9, 10],
            dorian: [0, 2, 3, 4, 5, 7, 9, 10],
            mixolydian: [0, 2, 4, 5, 7, 9, 10, 11]
        };
        if (BEBOP_SCALES[mode]) return BEBOP_SCALES[mode];
    }

    const SCALES = {
        major: [0, 2, 4, 5, 7, 9, 11],
        minor: [0, 2, 3, 5, 7, 8, 10],
        harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
        melodicMinor: [0, 2, 3, 5, 7, 9, 11],
        dorian: [0, 2, 3, 5, 7, 9, 10],
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        lydian: [0, 2, 4, 6, 7, 9, 11],
        mixolydian: [0, 2, 4, 5, 7, 9, 10],
        wholeTone: [0, 2, 4, 6, 8, 10],
        diminishedWH: [0, 2, 3, 5, 6, 8, 9, 11],
        altered: [0, 1, 3, 4, 6, 8, 10]
    };
    return SCALES[mode] || SCALES.major;
}

export function buildScalePitches(keyRoot, intervals, divisions, start, end, periodSize = 12.0) {
    const stepSize = 12.0 / divisions;
    const scalePitches = [];
    const bottomOctave = Math.floor((start - keyRoot) / periodSize) - 1;
    const topOctave = Math.ceil((end - keyRoot) / periodSize) + 1;
    
    for (let oct = bottomOctave; oct <= topOctave; oct++) {
        for (let i = 0; i < intervals.length; i++) {
            const pitch = keyRoot + oct * periodSize + intervals[i] * stepSize;
            if (pitch >= start && pitch <= end) {
                scalePitches.push(pitch);
            }
        }
    }
    return Array.from(new Set(scalePitches)).sort((a, b) => a - b);
}

export function findScaleIndex(pitch, scalePitches) {
    for (let i = 0; i < scalePitches.length; i++) {
        if (Math.abs(scalePitches[i] - pitch) < 0.01) {
            return i;
        }
    }
    return -1;
}

export function isLeadingTone(pitch, keyRoot, periodSize) {
    const pc = (pitch % periodSize + periodSize) % periodSize;
    const keyPc = (keyRoot % periodSize + periodSize) % periodSize;
    const diff = (pc - keyPc + periodSize) % periodSize;
    return Math.abs(diff - 11.0) < 0.1 || Math.abs(diff - 11.5) < 0.1;
}

export function findClosest(val, array) {
    if (array.length === 0) return val;
    return array.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
}

export function findClosestStep(prev, scalePitches, divisions) {
    if (scalePitches.length === 0) return prev;
    const idx = findScaleIndex(prev, scalePitches);
    const stepSize = 12.0 / divisions;
    
    if (idx !== -1) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        let nextIdx = idx + dir;
        if (nextIdx < 0 || nextIdx >= scalePitches.length) {
            nextIdx = idx - dir;
        }
        return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, nextIdx))];
    }
    
    const closest = findClosest(prev, scalePitches);
    const closestIdx = findScaleIndex(closest, scalePitches);
    if (closestIdx !== -1) {
        return scalePitches[closestIdx];
    }
    return prev;
}

export function findDirectedStep(prev, scalePitches, directionBias, lastPitch = null) {
    if (scalePitches.length === 0) return prev;

    const idx = findScaleIndex(prev, scalePitches);
    const anchorIdx = idx !== -1 ? idx : (() => {
        const closest = findClosest(prev, scalePitches);
        return findScaleIndex(closest, scalePitches);
    })();

    if (anchorIdx === -1) return findClosest(prev, scalePitches);

    let dir = directionBias !== 0 ? directionBias : (Math.random() > 0.5 ? 1 : -1);
    let nextIdx = anchorIdx + dir;

    if (nextIdx < 0 || nextIdx >= scalePitches.length) {
        dir = -dir;
        nextIdx = anchorIdx + dir;
    }

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

export function isDominantChord(chordObj) {
    if (!chordObj || !chordObj.symbol) return false;
    const sym = chordObj.symbol;
    return sym.includes('7') || sym.includes('9') || sym.includes('11') || sym.includes('13') || sym.includes('alt');
}

export function selectWeightedPitch(candidates, weights) {
    if (candidates.length === 0) return 0;
    let sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    let r = Math.random() * sum;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

export function getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches) {
    if (activeChordTones.length > 0) {
        return activeChordTones.slice().sort((a, b) => a - b);
    }

    const keyRootPc = ((keyRoot % periodSize) + periodSize) % periodSize;
    const stable = validPitches.filter(p => {
        const pc = ((p % periodSize) + periodSize) % periodSize;
        return Math.abs(pc - keyRootPc) < 0.01;
    });
    return stable.length > 0 ? stable.sort((a, b) => a - b) : validPitches;
}

export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, stablePcSet, periodSize) {
    if (activeChordTones.length === 0) return anchor;
    const pc = ((anchor % periodSize) + periodSize) % periodSize;
    const roundedPc = Math.round(pc * 100) / 100;
    if (stablePcSet.has(roundedPc)) return anchor;
    return findClosest(anchor, activeChordTones);
}

export function planPhraseStructuralSkeleton(phraseStartIndex, macroTargetPlan, validPitchesAtStart, activeChordTones, role, keyRoot, periodSize, globalScalePitches) {
    const skeleton = [];
    let lastAnchor = keyRoot + 12;
    for (let i = 0; i < 4; i++) {
        const slotIdx = phraseStartIndex + i;
        const slotRole = (macroTargetPlan && macroTargetPlan[slotIdx]) ? macroTargetPlan[slotIdx].role : 'statement';
        const target = (macroTargetPlan && macroTargetPlan[slotIdx]) ? macroTargetPlan[slotIdx].targetPitch : null;
        
        let targetPitchRaw = target !== null ? target : (keyRoot + 12);
        let limit = slotRole === 'climax' ? 5 : 3;
        
        let skeletonPitch = getConstrainedAnchorGlobal(lastAnchor, targetPitchRaw, limit, globalScalePitches, validPitchesAtStart, activeChordTones);
        skeleton.push({ pitch: skeletonPitch, role: slotRole });
        lastAnchor = skeletonPitch;
    }
    return skeleton;
}

export function getConstrainedAnchor(fromPitch, targetRaw, maxOffset, validPitches, chordTones) {
    const fromIdx = findScaleIndex(fromPitch, validPitches);
    if (fromIdx === -1) {
        return chordTones.length > 0 ? findClosest(targetRaw, chordTones) : findClosest(targetRaw, validPitches);
    }
    
    const minIdx = Math.max(0, fromIdx - maxOffset);
    const maxIdx = Math.min(validPitches.length - 1, fromIdx + maxOffset);
    const allowedPitches = validPitches.slice(minIdx, maxIdx + 1);
    
    if (allowedPitches.length === 0) {
        return fromPitch;
    }
    
    const allowedChordTones = allowedPitches.filter(p => chordTones.includes(p));
    if (allowedChordTones.length > 0) {
        return findClosest(targetRaw, allowedChordTones);
    }
    return findClosest(targetRaw, allowedPitches);
}

export function getConstrainedAnchorGlobal(fromPitch, targetRaw, maxOffset, globalScalePitches, validPitches, chordTones) {
    const fromIdx = findScaleIndex(fromPitch, globalScalePitches);
    if (fromIdx === -1) {
        return chordTones.length > 0 ? findClosest(targetRaw, chordTones) : findClosest(targetRaw, validPitches);
    }
    const minIdx = Math.max(0, fromIdx - maxOffset);
    const maxIdx = Math.min(globalScalePitches.length - 1, fromIdx + maxOffset);
    const allowedGlobalPitches = globalScalePitches.slice(minIdx, maxIdx + 1);
    
    const allowedLocalPitches = validPitches.filter(lp => {
        return allowedGlobalPitches.some(gp => Math.abs(lp - gp) < 0.01);
    });
    
    const candidatePool = allowedLocalPitches.length > 0 ? allowedLocalPitches : validPitches;
    const allowedChordTones = candidatePool.filter(p => chordTones.includes(p));
    if (allowedChordTones.length > 0) {
        return findClosest(targetRaw, allowedChordTones);
    }
    return findClosest(targetRaw, candidatePool);
}

export function isPassingContext(gridSteps, currentGridIndex, stepPlaysMap, activeChordTones) {
    for (let j = currentGridIndex + 1; j < gridSteps.length; j++) {
        if (stepPlaysMap[gridSteps[j].step]) {
            return activeChordTones.length > 0;
        }
    }
    return false;
}

export function getPreferredIntervalBias(phraseRole, aestheticMode) {
    if (phraseRole === 'climax') return 2;
    if (phraseRole === 'release') return -1;
    if (phraseRole === 'resolution') return -2;
    if (aestheticMode === 'sighs') return 2;
    return 0;
}

export function deduceChordRootAndQuality(symbol, baseKey, divisions) {
    if (!symbol || typeof symbol !== 'string') return null;
    let accidental = 0;
    let stripped = symbol.replace(/[+-]+$/, '');
    
    if (stripped.startsWith('b')) { accidental = -1; stripped = stripped.substring(1); }
    else if (stripped.startsWith('#')) { accidental = 1; stripped = stripped.substring(1); }
    
    const match = stripped.match(/^(IV|III|II|I|VII|VI|V|iv|iii|ii|i|vii|vi|v)/);
    
    if (match) {
        const numeral = match[1];
        const remainder = stripped.substring(numeral.length);
        
        const scaleOffsets = {
            'i': 0, 'ii': 2, 'iii': 4, 'iv': 5, 'v': 7, 'vi': 9, 'vii': 11,
            'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11
        };
        const rootOffset = scaleOffsets[numeral] + accidental;
        
        const isMinor = numeral === numeral.toLowerCase();
        let quality = isMinor ? 'minor' : 'major';
        
        if (remainder.includes('dim') || remainder.includes('°')) {
            quality = 'diminished';
        } else if (remainder.includes('aug') || remainder.includes('+')) {
            quality = 'augmented';
        } else if (remainder.includes('7') || remainder.includes('9') || remainder.includes('11') || remainder.includes('13')) {
            if (!remainder.includes('maj') && !remainder.includes('M7') && !remainder.includes('j7')) {
                quality = isMinor ? 'minor7' : 'dominant';
            }
        }
        if (remainder.includes('sus')) {
            quality = 'suspended';
        }
        const rootPitch = baseKey + rootOffset;
        return { rootPitch, quality };
    }
    return null;
}

export function getLocalScaleMode(quality, settingsGenre) {
    if (settingsGenre === 'jazz' || settingsGenre === 'blues') {
        if (quality === 'minor7') return 'dorian';
        if (quality === 'dominant') return 'mixolydian';
    }
    if (quality === 'minor' || quality === 'minor7' || quality === 'diminished') {
        return 'minor';
    }
    return 'major';
}

export function planMacroMelodyTargets(totalChords, keyRoot, divisions, stateMode, settings) {
    const plan = [];
    const rootTarget = keyRoot + 12;
    
    for (let i = 0; i < totalChords; i++) {
        const prog = i / Math.max(1, totalChords - 1);
        let contourValue = 0.5;
        
        if (settings.macroContourArchetype === 'arch') {
            contourValue = Math.sin(prog * Math.PI);
        } else if (settings.macroContourArchetype === 'valley') {
            contourValue = 1.0 - Math.sin(prog * Math.PI);
        } else if (settings.macroContourArchetype === 'staircase') {
            contourValue = Math.floor(prog * 4) / 4;
        } else if (settings.macroContourArchetype === 'launch') {
            contourValue = prog < 0.7 ? 0.25 : 0.95;
        }
        
        const maxOffsetDeg = 4;
        const degreeOffset = Math.round((contourValue - 0.5) * 2 * maxOffsetDeg);
        const pitchOffset = degreeOffset * (12 / divisions);
        const targetPitchRaw = rootTarget + pitchOffset;
        
        let role = 'statement';
        if (totalChords > 1) {
            if (i === 0) {
                role = 'statement';
            } else if (i === totalChords - 1) {
                role = 'resolution';
            } else {
                const stepIdx = i % 4;
                if (stepIdx === 1) role = 'build';
                else if (stepIdx === 2) role = 'climax';
                else role = 'release';
            }
        }
        
        plan.push({
            targetPitch: targetPitchRaw,
            role: role,
            contourValue: contourValue
        });
    }
    return plan;
}
```

### C. Complete `melodyRhythm.js` Code

```javascript
export function generatePhraseSubdivisions(genre) {
    if (genre === 'none') {
        return Array(16).fill(4);
    }
    const profiles = ['acceleration', 'deceleration', 'syncopatedAlternation', 'tripletSwing'];
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    const subs = [];
    
    for (let i = 0; i < 16; i++) {
        if (profile === 'acceleration') {
            if (i < 4) {
                subs.push(Math.random() < 0.7 ? 2 : 1);
            } else if (i < 9) {
                subs.push(Math.random() < 0.6 ? 4 : 3);
            } else if (i < 13) {
                const roll = Math.random();
                subs.push(roll < 0.3 ? 6 : (roll < 0.6 ? 8 : (roll < 0.8 ? 12 : 16)));
            } else {
                subs.push(Math.random() < 0.7 ? 2 : 1);
            }
        } else if (profile === 'deceleration') {
            if (i < 6) {
                const roll = Math.random();
                subs.push(roll < 0.3 ? 4 : (roll < 0.6 ? 6 : (roll < 0.8 ? 8 : 12)));
            } else if (i < 12) {
                subs.push(Math.random() < 0.6 ? 3 : 2);
            } else {
                subs.push(1);
            }
        } else if (profile === 'syncopatedAlternation') {
            subs.push(i % 2 === 0 ? 2 : (Math.random() < 0.35 ? 8 : 4));
        } else {
            const roll = Math.random();
            subs.push(roll < 0.5 ? 3 : (roll < 0.85 ? 6 : 12));
        }
    }
    return subs;
}

export function generateRhythmTemplate(aestheticMode, density, genre) {
    if (genre === 'none') {
        return Array(16).fill(1);
    }
    const TEMPLATES = {
        cantabile: [
            [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0],
            [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
            [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
            [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1]
        ],
        declamatory: [
            [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
            [1,1,0,1, 0,0,1,0, 1,1,0,1, 0,0,1,0],
            [1,0,1,0, 1,0,1,0, 1,1,0,1, 0,0,1,0]
        ],
        sighs: [
            [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
            [1,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0]
        ],
        virtuoso: [
            [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
            [1,1,1,0, 1,1,1,0, 1,1,1,0, 1,1,0,0],
            [1,1,0,0, 1,1,0,0, 1,1,0,0, 1,1,0,0]
        ],
    };
    const pool = TEMPLATES[aestheticMode] || TEMPLATES.cantabile;
    return pool[Math.floor(Math.random() * pool.length)];
}
```

### D. Complete `melodyMotifs.js` Code

```javascript
import { state } from './store.js';
import { getScaleIntervals, findScaleIndex, findClosest, findClosestStep } from './melodyTuning.js';

export function generateMotifFamily(pool, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const hook = generateSeedMotif(pool, 4, chordTones, scalePitches, tuning);
    
    const hookRhythm = [Math.random() < 0.75 ? 1 : 0, 0, 0, 0];
    let onesCount = hookRhythm[0];
    for (let i = 1; i < 4; i++) {
        if (Math.random() > 0.5 && onesCount < 3) {
            hookRhythm[i] = 1;
            onesCount++;
        }
    }
    if (onesCount === 0) {
        hookRhythm[Math.floor(Math.random() * 4)] = 1;
    }
    if (state.melodySettings && state.melodySettings.genre === 'none') {
        hookRhythm.fill(1);
    }

    const connector = [];
    if (hook.length >= 4) {
        connector.push(hook[2], hook[3]);
        const dir = hook[3] - hook[2];
        const stepSize = 12.0 / divisions;
        const target = hook[3] + (dir >= 0 ? 1 : -1) * stepSize * (Math.random() > 0.5 ? 2 : 1);
        connector.push(findClosest(target, scalePitches));
    } else {
        connector.push(...generateSeedMotif(pool, 3, chordTones, scalePitches, tuning));
    }

    const cadence = [];
    if (hook.length >= 4) {
        const reversed = [...hook].reverse();
        cadence.push(reversed[0]);
        for (let i = 1; i < reversed.length; i++) {
            const interval = reversed[i] - reversed[i - 1];
            const halvedTarget = cadence[i - 1] + (interval * 0.5);
            cadence.push(findClosest(halvedTarget, scalePitches));
        }
    } else {
        cadence.push(...generateSeedMotif(pool, 4, chordTones, scalePitches, tuning));
    }

    return { hook, connector, cadence, hookRhythm };
}

export function mutateMotifFamily(motifFamily, pool, tuning) {
    const mutated = {
        hook: [...motifFamily.hook],
        connector: [...motifFamily.connector],
        cadence: [...motifFamily.cadence],
        hookRhythm: [...motifFamily.hookRhythm]
    };
    
    if (mutated.hook.length > 0 && pool.length > 0) {
        const idx = Math.floor(Math.random() * mutated.hook.length);
        const pitch = mutated.hook[idx];
        const scaleIdx = findScaleIndex(pitch, pool);
        if (scaleIdx !== -1) {
            const shift = Math.random() > 0.5 ? 1 : -1;
            const targetIdx = Math.max(0, Math.min(pool.length - 1, scaleIdx + shift));
            mutated.hook[idx] = pool[targetIdx];
        }
    }
    
    const divisions = tuning.divisions;
    
    mutated.connector = [];
    if (mutated.hook.length >= 4) {
        mutated.connector.push(mutated.hook[2], mutated.hook[3]);
        const dir = mutated.hook[3] - mutated.hook[2];
        const stepSize = 12.0 / divisions;
        const target = mutated.hook[3] + (dir >= 0 ? 1 : -1) * stepSize * (Math.random() > 0.5 ? 2 : 1);
        mutated.connector.push(findClosest(target, pool));
    } else {
        mutated.connector.push(...mutated.hook);
    }
    
    mutated.cadence = [];
    if (mutated.hook.length >= 4) {
        const reversed = [...mutated.hook].reverse();
        mutated.cadence.push(reversed[0]);
        for (let i = 1; i < reversed.length; i++) {
            const interval = reversed[i] - reversed[i - 1];
            const halvedTarget = mutated.cadence[i - 1] + (interval * 0.5);
            mutated.cadence.push(findClosest(halvedTarget, pool));
        }
    } else {
        mutated.cadence.push(...mutated.hook);
    }
    
    return mutated;
}

export function generateSeedMotif(pool, size, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const motif = [];
    if (pool.length === 0) return motif;

    const keyRoot = Number(state.baseKey) || 60;
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none');
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    const chromaticChordTones = (chordTones || []).filter(ct => !isBaseScaleTone(ct));
    const isTest = state.melodySettings && state.melodySettings.genre === 'none';

    let note1;
    if (chromaticChordTones.length > 0) {
        note1 = isTest ? chromaticChordTones[0] : chromaticChordTones[Math.floor(Math.random() * chromaticChordTones.length)];
    } else {
        note1 = chordTones && chordTones.length > 0 ? 
            (isTest ? chordTones[0] : chordTones[Math.floor(Math.random() * chordTones.length)]) : 
            (isTest ? pool[0] : pool[Math.floor(Math.random() * pool.length)]);
    }
    motif.push(note1);

    const candidates2 = scalePitches.filter(p => Math.abs(p - note1) <= 4.01);
    const stepCandidates2 = candidates2.filter(p => Math.abs(p - note1) <= 2.01);
    let note2 = note1;
    if (isTest) {
        note2 = stepCandidates2.length > 0 ? stepCandidates2[0] : (candidates2.length > 0 ? candidates2[0] : note1);
    } else {
        note2 = candidates2.length > 0 ? candidates2[Math.floor(Math.random() * candidates2.length)] : note1;
        if (stepCandidates2.length > 0 && Math.random() < 0.7) {
            note2 = stepCandidates2[Math.floor(Math.random() * stepCandidates2.length)];
        }
    }
    motif.push(note2);

    const candidates3 = scalePitches.filter(p => Math.abs(p - note2) <= 5.01);
    const stepCandidates3 = candidates3.filter(p => Math.abs(p - note2) <= 2.01);
    let note3 = note2;
    if (isTest) {
        note3 = stepCandidates3.length > 0 ? stepCandidates3[0] : (candidates3.length > 0 ? candidates3[0] : note2);
    } else {
        note3 = candidates3.length > 0 ? candidates3[Math.floor(Math.random() * candidates3.length)] : note2;
        if (stepCandidates3.length > 0 && Math.random() < 0.7) {
            note3 = stepCandidates3[Math.floor(Math.random() * stepCandidates3.length)];
        }
        const isLeap = Math.abs(note3 - note2) > 2.01;
        if (isLeap) {
            const closerCandidates = candidates3.filter(p => Math.abs(p - note1) < Math.abs(note2 - note1));
            if (closerCandidates.length > 0) {
                note3 = closerCandidates[Math.floor(Math.random() * closerCandidates.length)];
            }
        }
    }
    motif.push(note3);

    const overallDirection = note3 - note1;
    let note4 = note3;
    if (overallDirection > 0) {
        const downCandidates = scalePitches.filter(p => p < note3 && p >= note3 - 2.01);
        if (downCandidates.length > 0) note4 = downCandidates[0];
    } else if (overallDirection < 0) {
        const upCandidates = scalePitches.filter(p => p > note3 && p <= note3 + 2.01);
        if (upCandidates.length > 0) note4 = upCandidates[0];
    } else {
        if (isTest) {
            const idx = findScaleIndex(note3, scalePitches);
            note4 = idx !== -1 && idx > 0 ? scalePitches[idx - 1] : note3;
        } else {
            note4 = findClosestStep(note3, scalePitches, divisions);
        }
    }
    motif.push(note4);
    return motif;
}

export function generateMotifFamilyFromUser(userMotif, pool, activeChordTones, validPitches, tuning) {
    const keyRoot = Number(state.baseKey) || 60;
    
    const sortedNotes = [...userMotif.notes]
        .filter(n => !n.voiceIndex)
        .sort((a, b) => a.time - b.time);

    const hook = sortedNotes.map(n => {
        let rawPitch = keyRoot + (n.pitchOffset || 0);
        return findClosest(rawPitch, validPitches);
    });

    const hookRhythm = Array(16).fill(0);
    sortedNotes.forEach(n => {
        const step = Math.round((n.time % 4.0) * 4) % 16;
        hookRhythm[step] = 1;
    });

    if (hookRhythm.every(r => r === 0)) {
        hookRhythm[0] = 1;
    }

    const connector = hook.map((p, idx) => {
        const shift = idx % 2 === 0 ? 2 : -2;
        return findClosest(p + shift, validPitches);
    });

    const cadence = [...hook].reverse().map((p, idx) => {
        const shift = idx % 2 === 0 ? -1 : 1;
        return findClosest(p + shift, validPitches);
    });

    return { hook, connector, cadence, hookRhythm };
}

export function applyInversion(motif, pool) {
    if (motif.length === 0) return motif;
    const center = motif[0];
    return motif.map(p => {
        const inverted = center - (p - center);
        return findClosest(inverted, pool);
    });
}

export function applyRetrograde(motif) {
    return [...motif].reverse();
}

export function applySequence(motif, pool, shiftSteps) {
    return motif.map(p => {
        const idx = findScaleIndex(p, pool);
        if (idx !== -1) {
            const nextIdx = Math.max(0, Math.min(pool.length - 1, idx + shiftSteps));
            return pool[nextIdx];
        }
        return p;
    });
}

export function generateRhythmicMotif(aestheticMode) {
    const MOTIF_LIBRARY = {
        cantabile: [
            { steps: [0, 4, 6, 8], directions: [0, 1, 2, 1] },
            { steps: [0, 2, 8, 12], directions: [0, 1, 2, 1] },
        ],
        declamatory: [
            { steps: [0, 1, 4, 8], directions: [0, 0, 1, -1] },
        ],
        sighs: [
            { steps: [0, 6], directions: [0, 3] },
        ],
        virtuoso: [
            { steps: [0, 1, 2, 3, 4, 5, 6, 7], directions: [0, 1, 2, 3, 4, 3, 2, 1] },
        ],
    };
    const pool = MOTIF_LIBRARY[aestheticMode] || MOTIF_LIBRARY.cantabile;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function realizeMotifinContext(rhythmicMotif, anchorPitch, validPitches) {
    const anchorIdx = findScaleIndex(anchorPitch, validPitches);
    if (anchorIdx === -1) return rhythmicMotif.steps.map(() => anchorPitch);
    return rhythmicMotif.directions.map(delta => {
        const idx = Math.max(0, Math.min(validPitches.length - 1, anchorIdx + delta));
        return validPitches[idx];
    });
}

export function applyRhythmicVariation(rhythmicMotif) {
    const shifted = { ...rhythmicMotif };
    shifted.steps = rhythmicMotif.steps.map(s => (s + 2) % 16);
    return shifted;
}

export function applyPartialRecall(rhythmicMotif, n = 3) {
    return {
        steps: rhythmicMotif.steps.slice(0, n),
        directions: rhythmicMotif.directions.slice(0, n),
    };
}

export function applyMotivicExtension(rhythmicMotif, lastDirection) {
    const delta = lastDirection > 0 ? 1 : -1;
    const lastStep = rhythmicMotif.steps[rhythmicMotif.steps.length - 1] || 0;
    return {
        steps: [...rhythmicMotif.steps, (lastStep + 2) % 16],
        directions: [...rhythmicMotif.directions, delta],
    };
}
```

### E. Complete `melodyGenreRules.js` Code

```javascript
import { state } from './store.js';
import { getScaleIntervals, findScaleIndex, findClosest } from './melodyTuning.js';

export function applyGenreRules(pitch, keyRoot, chordObj, genre) {
    if (genre === 'blues') {
        const periodSize = 12; // Blues is primarily EDO 12 based
        const pc = ((pitch - keyRoot) % periodSize + periodSize) % periodSize;
        
        // Add dynamic flat-fifth or minor-third blue note offsets
        if (Math.abs(pc - 6.0) < 0.1) {
            return pitch - 0.5; // Flat 5th blue note
        }
        if (Math.abs(pc - 3.0) < 0.1 && Math.random() < 0.4) {
            return pitch + 0.25; // Quarter-tone microtonal blue-glide
        }
    }
    return pitch;
}

export function applyOrnaments(lookaheadGrid, stableTones, validPitches, genre) {
    if (genre === 'none') return lookaheadGrid;

    const ornamented = [];
    const size = lookaheadGrid.length;
    
    for (let i = 0; i < size; i++) {
        const step = lookaheadGrid[i];
        if (!step.active) {
            ornamented.push(step);
            continue;
        }

        const isStructural = step.sixteenthStep === 0 || step.sixteenthStep === 8;
        
        // Jazz Enclosure: Approach strong structural downbeats from a step above/below
        if (genre === 'jazz' && isStructural && i > 1 && !lookaheadGrid[i - 1].active) {
            const pitch = step.pitch;
            const idx = findScaleIndex(pitch, validPitches);
            if (idx > 1 && idx < validPitches.length - 2) {
                // Schedule chromatic enclosure steps in the blank slots preceding the beat
                lookaheadGrid[i - 2] = {
                    sixteenthStep: i - 2,
                    pitch: validPitches[idx + 1],
                    active: true,
                    isRun: false,
                    volume: 0.7 // ghost/grace volume
                };
                lookaheadGrid[i - 1] = {
                    sixteenthStep: i - 1,
                    pitch: validPitches[idx - 1],
                    active: true,
                    isRun: false,
                    volume: 0.8
                };
            }
        }
        ornamented.push(step);
    }
    return ornamented;
}

export function applyMotivicFlexing(pitch, scalePitches, phraseRole) {
    // Under peak climax slots, flex motif steps up to build tension
    if (phraseRole === 'climax') {
        const idx = findScaleIndex(pitch, scalePitches);
        if (idx !== -1 && idx < scalePitches.length - 1) {
            return scalePitches[idx + 1];
        }
    }
    return pitch;
}
```

---

## 9. Suggested Commit Message

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