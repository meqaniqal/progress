import { state } from './store.js';

const MICROTONAL_SCALE_OVERRIDES = {
    19: { major: [0, 3, 6, 8, 11, 14, 17], minor: [0, 3, 5, 8, 11, 13, 16] },
    22: { major: [0, 4, 7, 9, 13, 17, 20], minor: [0, 4, 6, 9, 13, 15, 18] },
    31: { major: [0, 5, 10, 13, 18, 23, 28], minor: [0, 5, 8, 13, 18, 21, 26] }
};

export function getScaleIntervals(mode, genre = 'none', divisions = 12) {
    if (MICROTONAL_SCALE_OVERRIDES[divisions] && MICROTONAL_SCALE_OVERRIDES[divisions][mode]) {
        return MICROTONAL_SCALE_OVERRIDES[divisions][mode];
    }
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
        altered: [0, 1, 3, 4, 6, 8, 10],
        harmonicMajor:    [0, 2, 4, 5, 7, 8, 11],
        doubleHarmonic:   [0, 1, 4, 5, 7, 8, 11],  // Byzantine/Arabic
        hungarianMinor:   [0, 2, 3, 6, 7, 8, 11],
        phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
        enigmaticScale:   [0, 1, 4, 6, 8, 10, 11],
        ultraLocrian:     [0, 1, 3, 4, 6, 8, 9],
        octatonic:        [0, 2, 3, 5, 6, 8, 9, 11],
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

export function findScaleIndex(pitch, scalePitches, divisions = 12) {
    const tolerance = (12.0 / divisions) * 0.45; // 45% of one step
    for (let i = 0; i < scalePitches.length; i++) {
        if (Math.abs(scalePitches[i] - pitch) < tolerance) {
            return i;
        }
    }
    return -1;
}

export function isLeadingTone(pitch, keyRoot, periodSize, divisions = 12) {
    const stepSize = 12.0 / divisions;
    const pc = (pitch % periodSize + periodSize) % periodSize;
    const keyPc = (keyRoot % periodSize + periodSize) % periodSize;
    const diff = (pc - keyPc + periodSize) % periodSize;
    const leadingToneDiff = periodSize - stepSize;
    return Math.abs(diff - leadingToneDiff) < stepSize * 0.4;
}

export function findClosest(val, array) {
    if (array.length === 0) return val;
    return array.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
}

export function findClosestStep(prev, scalePitches, divisions, directionBias = 0, rng = null) {
    if (scalePitches.length === 0) return prev;
    const idx = findScaleIndex(prev, scalePitches, divisions);
    if (idx !== -1) {
        const dir = directionBias !== 0
            ? Math.sign(directionBias)
            : ((rng ? rng.next() : Math.random()) > 0.5 ? 1 : -1);
        let nextIdx = idx + dir;
        if (nextIdx < 0 || nextIdx >= scalePitches.length) {
            nextIdx = idx - dir;
        }
        return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, nextIdx))];
    }
    return findClosest(prev, scalePitches);
}

/**
 * Stepwise movement with direction memory and no-return guard.
 *
 * @param {number}  prev          - The current pitch to move from.
 * @param {number[]} scalePitches - The available pitch pool.
 * @param {number}  directionBias - +1 (ascending), -1 (descending), 0 (free).
 * @param {number|null} lastPitch - The pitch before `prev`; prevents
 *                                  immediately reversing to it.
 * @param {number}  divisions     - The EDO divisions.
 * @param {object|null} rng       - Optional seeded random number generator.
 * @returns {number} The next pitch.
 */
export function findDirectedStep(prev, scalePitches, directionBias, lastPitch = null, divisions = 12, rng = null) {
    if (scalePitches.length === 0) return prev;

    const idx = findScaleIndex(prev, scalePitches, divisions);
    const anchorIdx = idx !== -1 ? idx : (() => {
        const closest = findClosest(prev, scalePitches);
        return findScaleIndex(closest, scalePitches, divisions);
    })();

    if (anchorIdx === -1) return findClosest(prev, scalePitches);

    // Resolve direction: use bias if provided, else choose randomly.
    let dir = directionBias !== 0 ? directionBias : ((rng ? rng.next() : Math.random()) > 0.5 ? 1 : -1);

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

export function isDominantChord(chordObj) {
    if (!chordObj || !chordObj.symbol) return false;
    const sym = chordObj.symbol;
    return sym.includes('7') || sym.includes('9') || sym.includes('11') || sym.includes('13') || sym.includes('alt');
}

export function selectWeightedPitch(candidates, weights, rng = null) {
    if (candidates.length === 0) return 0;
    let sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) {
        return candidates[Math.floor((rng ? rng.next() : Math.random()) * candidates.length)];
    }
    let r = (rng ? rng.next() : Math.random()) * sum;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

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

export function isChordTonePC(pitch, stableTones, periodSize, divisions = 12) {
    const tolerance = (12.0 / divisions) * 0.45;
    const pc = ((pitch % periodSize) + periodSize) % periodSize;
    return stableTones.some(t => {
        const tpc = ((t % periodSize) + periodSize) % periodSize;
        return Math.abs(pc - tpc) < tolerance;
    });
}

export function enforceChordToneOnDownbeat(anchor, activeChordTones, validPitches, periodSize, divisions = 12, chordObj = null) {
    if (activeChordTones.length === 0) return anchor;
    let targetTones = activeChordTones;
    if (chordObj && chordObj.customNotes) {
        const microtonalTones = activeChordTones.filter(ct => {
            const pc = (ct % periodSize + periodSize) % periodSize;
            return chordObj.customNotes.some(cn => {
                const isMicro = typeof cn === 'number' ? cn % 1 !== 0 : (cn && cn.isMicrotonal);
                if (!isMicro) return false;
                const cnPitch = typeof cn === 'number' ? cn : cn.pitch;
                const cnPc = (cnPitch % periodSize + periodSize) % periodSize;
                return Math.abs(pc - cnPc) < 0.05;
            });
        });
        if (microtonalTones.length > 0) {
            targetTones = microtonalTones;
        }
    }
    if (isChordTonePC(anchor, targetTones, periodSize, divisions)) return anchor;
    return findClosest(anchor, targetTones);
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
        
        let skeletonPitch = getConstrainedAnchorGlobal(lastAnchor, targetPitchRaw, limit, globalScalePitches, validPitchesAtStart, activeChordTones, 12, null, periodSize);
        skeleton.push({ pitch: skeletonPitch, role: slotRole });
        lastAnchor = skeletonPitch;
    }
    return skeleton;
}

export function getConstrainedAnchor(fromPitch, targetRaw, maxOffset, validPitches, chordTones, divisions = 12) {
    const fromIdx = findScaleIndex(fromPitch, validPitches, divisions);
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

export function getConstrainedAnchorGlobal(fromPitch, targetRaw, maxOffset, globalScalePitches, validPitches, chordTones, divisions = 12, chordObj = null, periodSize = 12) {
    const fromIdx = findScaleIndex(fromPitch, globalScalePitches, divisions);
    
    let targetTones = chordTones;
    if (chordObj && chordObj.customNotes) {
        const microtonalTones = chordTones.filter(ct => {
            const pc = (ct % periodSize + periodSize) % periodSize;
            return chordObj.customNotes.some(cn => {
                const isMicro = typeof cn === 'number' ? cn % 1 !== 0 : (cn && cn.isMicrotonal);
                if (!isMicro) return false;
                const cnPitch = typeof cn === 'number' ? cn : cn.pitch;
                const cnPc = (cnPitch % periodSize + periodSize) % periodSize;
                return Math.abs(pc - cnPc) < 0.05;
            });
        });
        if (microtonalTones.length > 0) {
            targetTones = microtonalTones;
        }
    }

    if (fromIdx === -1) {
        return targetTones.length > 0 ? findClosest(targetRaw, targetTones) : findClosest(targetRaw, validPitches);
    }
    const minIdx = Math.max(0, fromIdx - maxOffset);
    const maxIdx = Math.min(globalScalePitches.length - 1, fromIdx + maxOffset);
    const allowedGlobalPitches = globalScalePitches.slice(minIdx, maxIdx + 1);
    
    const allowedLocalPitches = validPitches.filter(lp => {
        return allowedGlobalPitches.some(gp => Math.abs(lp - gp) < 0.01);
    });
    
    const candidatePool = allowedLocalPitches.length > 0 ? allowedLocalPitches : validPitches;
    const allowedChordTones = candidatePool.filter(p => targetTones.includes(p));
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
        
        const DEGREE_INDICES = {
            'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6,
            'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6
        };
        const scaleIntervals = getScaleIntervals(state.mode || 'major', 'none', divisions);
        const degreeIndex = DEGREE_INDICES[numeral];
        const rootOffset = (degreeIndex !== undefined && degreeIndex < scaleIntervals.length
            ? scaleIntervals[degreeIndex] * (12.0 / divisions) : 0) + accidental;
        
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
        if (quality === 'diminished') return 'diminishedWH';
        if (quality === 'augmented') return 'wholeTone';
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

export function planMacroMelodyTargets(totalChords, keyRoot, divisions, stateMode, settings) {
    const plan = [];
    const scaleIntervals = getScaleIntervals(stateMode, settings.genre, divisions);
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
