import { getChordNotes, getEffectiveTuning } from './theory.js';
import { CONFIG } from './config.js';

// --- Voicing Optimization ---
// Cleans up muddy extended chords by dropping non-essential notes
export function optimizeVoicing(notes) {
    if (notes.length < 5) return notes; // Triads and standard 7ths remain intact
    
    const root = notes[0];
    // Remove the Perfect 5th (approx +7 semitones). Use a small tolerance for float MIDI pitches (EDO support)
    let voiced = notes.filter(n => Math.abs(n - (root + 7)) > 0.15);
    
    // If it's still massive (like an 11th chord), drop the root too!
    // The dedicated bass synth already plays the root 2 octaves down.
    if (voiced.length >= 5) {
        voiced = voiced.filter(n => Math.abs(n - root) > 0.15);
    }
    return voiced;
}

// --- Core Algorithm: Voice Leading ---
// Calculates the inversion of a target chord that has the shortest 
// total melodic distance from the previous chord.
export function applyVoiceLeading(progression, globalOptions = {}) {
    if (!progression || progression.length === 0) return [];
    
    const divisions = globalOptions.divisions || 12;
    const getDivisions = (chord) => chord.divisions || divisions;
    
    const processed = [];
    let prevValidNotes = null;
    let prevTuning = null;

    const getOptions = (chord) => ({
        centerGravity: globalOptions.centerGravity ?? CONFIG.VL_CENTER_GRAVITY,
        gravityWeight: globalOptions.gravityWeight ?? CONFIG.VL_GRAVITY_WEIGHT,
        extremeHigh: globalOptions.extremeHigh ?? CONFIG.VL_EXTREME_HIGH,
        extremeLow: globalOptions.extremeLow ?? CONFIG.VL_EXTREME_LOW,
        extremeWeight: globalOptions.extremeWeight ?? CONFIG.VL_EXTREME_WEIGHT,
        voicingType: chord.voicingType && chord.voicingType !== 'global' ? chord.voicingType : (globalOptions.globalVoicing ?? 'auto')
    });

    for (let i = 0; i < progression.length; i++) {
        const chord = progression[i];
        const chordNotes = getChordNotes(chord, chord.key, getDivisions(chord));

        if (!chordNotes || chordNotes.length === 0) {
            processed.push([]);
            continue;
        }

        const opts = getOptions(chord);
        const tuning = getEffectiveTuning(chord.symbol, getDivisions(chord));
        const targetNotes = optimizeVoicing(chordNotes);
        const inversions = generateInversions(targetNotes, opts.voicingType, tuning.periodSize, chord.inversionOffset || 0);

        let bestInversion = inversions[0];
        let smallestCost = Infinity;

        inversions.forEach(inv => {
            let cost = 0;
            if (prevValidNotes) {
                cost += calculateDistance(prevValidNotes, inv);
                
                let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
                let gravityPenalty = Math.abs(avgPitch - opts.centerGravity) * opts.gravityWeight;
                
                if (prevTuning && Math.abs(tuning.periodSize - prevTuning.periodSize) > 0.1) {
                    let prevAvg = prevValidNotes.reduce((sum, val) => sum + val, 0) / prevValidNotes.length;
                    gravityPenalty += Math.abs(avgPitch - prevAvg) * CONFIG.VL_CROSS_TETHER_WEIGHT;
                }
                cost += gravityPenalty;
            } else {
                let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
                cost += Math.abs(avgPitch - opts.centerGravity) * (opts.gravityWeight * 2);
                
                let rootPenalty = 0;
                const invMod = ((inv[0] % tuning.periodSize) + tuning.periodSize) % tuning.periodSize;
                const tgtMod = ((targetNotes[0] % tuning.periodSize) + tuning.periodSize) % tuning.periodSize;
                const isRootMismatch = Math.abs(invMod - tgtMod) > 0.15 && Math.abs(invMod - tgtMod) < tuning.periodSize - 0.15;
                if ((opts.voicingType === 'auto' || opts.voicingType === 'close') && isRootMismatch) {
                    rootPenalty = CONFIG.VL_ROOT_PENALTY;
                }
                cost += rootPenalty;
            }

            let extremePenalty = 0;
            if (inv[0] < opts.extremeLow) extremePenalty += (opts.extremeLow - inv[0]) * opts.extremeWeight;
            if (inv[inv.length - 1] > opts.extremeHigh) extremePenalty += (inv[inv.length - 1] - opts.extremeHigh) * opts.extremeWeight;
            cost += extremePenalty;

            if (cost < smallestCost) {
                smallestCost = cost;
                bestInversion = inv;
            }
        });

        processed.push(bestInversion);
        prevValidNotes = bestInversion;
        prevTuning = tuning;
    }
    return processed;
}

/**
 * The new master function for getting final notes. It runs the voice leading
 * algorithm first, then applies any manual inversion offsets as a final step.
 */
export function getPlayableNotes(progression, globalOptions = {}) {
    if (!progression || progression.length === 0) return [];

    let baseProgression;
    
    if (globalOptions.useVoiceLeading !== false) {
        // 1. Get the smoothest voice-led progression first.
        baseProgression = applyVoiceLeading(progression, globalOptions);
    } else {
        // 1b. Just use root position (dropped one period for warmth)
        baseProgression = progression.map(chord => {
            const tuning = getEffectiveTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);
            const notes = getChordNotes(chord, chord.key, tuning.divisions);
            const dropSize = tuning.periodSize > 14 ? CONFIG.VL_OCTAVE_SHIFT : tuning.periodSize;
            return notes ? notes.map(n => n - dropSize) : [];
        });
    }

    // 2. Apply manual inversion offsets post-math.
    const finalProgression = baseProgression.map((notes, index) => {
        const chord = progression[index];
        const offset = chord.inversionOffset;
        const tuning = getEffectiveTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);

        let finalNotes = notes;

        if (globalOptions.useVoiceLeading === false && typeof offset === 'number' && offset !== 0) {
            finalNotes = applyInversion(notes, offset, tuning.periodSize);
        }
        
        return finalNotes;
    });

    return finalProgression;
}

export function applyInversion(notes, offset = 0, periodSize = CONFIG.VL_OCTAVE_SHIFT) {
    if (offset === 0 || !notes || notes.length === 0) return notes;

    const isMacrotonal = periodSize > 14;
    const numNotes = notes.length;

    if (isMacrotonal) {
        // Macrotonal protection: shift note-by-note inversions and complete block transpositions
        // by a standard octave (12.0) to preserve register alignment from previous projects.
        const effectiveOffset = ((offset % numNotes) + numNotes) % numNotes;
        const octaveShift = Math.floor(offset / numNotes);
        
        let inverted = [...notes].sort((a, b) => a - b);
        for (let i = 0; i < effectiveOffset; i++) {
            inverted.push(inverted.shift() + CONFIG.VL_OCTAVE_SHIFT);
        }
        return inverted.map(n => n + (octaveShift * CONFIG.VL_OCTAVE_SHIFT)).sort((a, b) => a - b);
    }

    const effectiveOffset = ((offset % numNotes) + numNotes) % numNotes;
    const octaveShift = Math.floor(offset / numNotes);

    let inverted = [...notes].sort((a, b) => a - b);

    for (let i = 0; i < effectiveOffset; i++) {
        inverted.push(inverted.shift() + periodSize);
    }
    
    return inverted.map(n => n + (octaveShift * periodSize)).sort((a, b) => a - b);
}

export function generateInversions(chord, voicingType = 'auto', periodSize = CONFIG.VL_OCTAVE_SHIFT, inversionOffset = 0) {
    const inversions = [];
    const isMacrotonal = periodSize > 14;
    
    // Macrotonal protection: internal inversions and spread voicings shatter wide-period chords.
    // Force 'close' voicing to preserve the tight microtonal cluster identity.
    const safeVoicingType = isMacrotonal ? 'close' : voicingType;
    const shiftPeriod = isMacrotonal ? CONFIG.VL_OCTAVE_SHIFT : periodSize;

    const numNotes = chord.length;
    const hasOffset = typeof inversionOffset === 'number' && inversionOffset !== 0;
    const effectiveOffset = numNotes ? (((inversionOffset % numNotes) + numNotes) % numNotes) : 0;
    const extraOctaveShift = numNotes ? Math.floor(inversionOffset / numNotes) : 0;

    for (let oct of [-3, -2, -1, 0, 1, 2]) { // Expanded search space to prevent boundary trapping
        const shift = (oct + (hasOffset ? extraOctaveShift : 0)) * shiftPeriod;
        const base = chord.map(n => n + shift);
        
        if (safeVoicingType === 'quartal') {
            const qVoicing = _buildQuartalVoicing(base, periodSize);
            if (hasOffset) {
                inversions.push(applyInversion(qVoicing, effectiveOffset, periodSize));
            } else {
                inversions.push(qVoicing);
            }
            continue; // Quartal is a strict mathematical layout, skip standard inversions
        }

        if (hasOffset) {
            // Generate ONLY the requested inversion offset candidate
            // 1. Close/Auto
            if (safeVoicingType === 'close' || safeVoicingType === 'auto') {
                const inv = [...base];
                for (let j = 0; j < effectiveOffset; j++) {
                    inv[j] += shiftPeriod;
                }
                inversions.push(inv.sort((a, b) => a - b));
            }

            // 2. Spread (length >= 4)
            if (base.length >= 4 && (safeVoicingType === 'spread' || safeVoicingType === 'auto')) {
                const inv = [...base];
                for (let j = 0; j < effectiveOffset; j++) {
                    inv[j] += shiftPeriod;
                }
                const sortedInv = inv.sort((a, b) => a - b);
                const drop2 = [...sortedInv];
                const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
                drop2.unshift(secondFromTop - periodSize);
                inversions.push(drop2);
            }

            // 3. Spread (length === 3)
            if (base.length === 3 && safeVoicingType === 'spread') {
                const inv = [...base];
                for (let j = 0; j < effectiveOffset; j++) {
                    inv[j] += shiftPeriod;
                }
                const sortedInv = inv.sort((a, b) => a - b);
                const openTriad = [...sortedInv];
                const mid = openTriad.splice(1, 1)[0];
                openTriad.unshift(mid - periodSize);
                inversions.push(openTriad);
            }
        } else {
            // Original logic for all candidates
            if (safeVoicingType === 'close' || safeVoicingType === 'auto') {
                inversions.push([...base]); // Root Position Close
            }
            
            // For macrotonal scales (BP), generate in-between inversions using octave shifts (12)
            if (isMacrotonal) {
                for (let i = 1; i < chord.length; i++) {
                    const inv = [...base];
                    for (let j = 0; j < i; j++) {
                        inv[j] += CONFIG.VL_OCTAVE_SHIFT;
                    }
                    inversions.push(inv.sort((a, b) => a - b));
                }
                continue;
            }
            
            // Generate Drop 2 for root position (Spread voicings)
            if (base.length >= 4 && (safeVoicingType === 'spread' || safeVoicingType === 'auto')) {
                const drop2 = [...base];
                const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
                drop2.unshift(secondFromTop - periodSize);
                inversions.push(drop2);
            }
            
            // Dynamically generate inversions for N-length chords (7ths, 9ths, etc.)
            for (let i = 1; i < chord.length; i++) {
                const inv = [...base];
                for (let j = 0; j < i; j++) {
                    inv[j] += periodSize; // Shift bottom notes up a period
                }
                const sortedInv = inv.sort((a, b) => a - b);
                
                if (safeVoicingType === 'close' || safeVoicingType === 'auto') {
                    inversions.push([...sortedInv]);
                }
                
                if (sortedInv.length >= 4 && (safeVoicingType === 'spread' || safeVoicingType === 'auto')) {
                    const drop2 = [...sortedInv];
                    const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
                    drop2.unshift(secondFromTop - periodSize); // Drop the 2nd highest note a period
                    inversions.push(drop2);
                }
            }

            if (base.length === 3 && safeVoicingType === 'spread') {
                // Open triad (Drop 1) for massive spread 3-note chords
                for (let i = 0; i < 3; i++) {
                    const inv = [...base];
                    for (let j = 0; j < i; j++) inv[j] += periodSize;
                    const sortedInv = inv.sort((a,b)=>a-b);
                    const openTriad = [...sortedInv];
                    const mid = openTriad.splice(1, 1)[0];
                    openTriad.unshift(mid - periodSize);
                    inversions.push(openTriad);
                }
            }
        }
    }
    
    return inversions;
}

function _buildQuartalVoicing(notes, periodSize = CONFIG.VL_OCTAVE_SHIFT) {
    // Finds the permutation of notes that maximizes Perfect 4ths and 5ths between adjacent voices
    let sorted = [...notes].sort((a,b)=>a-b);
    let quartal = [sorted[0]];
    let remaining = sorted.slice(1);
    while(remaining.length > 0) {
        let lastNote = quartal[quartal.length - 1];
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i=0; i<remaining.length; i++) {
            let interval = (remaining[i] - lastNote) % periodSize;
            if (interval < 0) interval += periodSize;
            let score = Math.min(Math.abs(interval - (periodSize * 5/12)), Math.abs(interval - (periodSize * 7/12)));
            if (score < bestScore) { bestScore = score; bestIdx = i; }
        }
        let nextNote = remaining.splice(bestIdx, 1)[0];
        while (nextNote <= lastNote) nextNote += periodSize; // Force upward stacking
        quartal.push(nextNote);
    }
    return quartal;
}

export function calculateDistance(chordA, chordB) {
    const len = chordA.length;
    if (len === chordB.length) {
        let dist = 0;
        for (let i = 0; i < len; i++) {
            dist += Math.abs(chordA[i] - chordB[i]);
        }
        return dist;
    }
    
    let sortedA = [...chordA].sort((a,b)=>a-b);
    let sortedB = [...chordB].sort((a,b)=>a-b);
    
    // Normalize lengths by intelligently duplicating notes in the smaller chord 
    // to find the absolute minimum mathematical voice-leading distance.
    while (sortedA.length < sortedB.length) {
        sortedA = _insertBestPad(sortedA, sortedB);
    }
    while (sortedB.length < sortedA.length) {
        sortedB = _insertBestPad(sortedB, sortedA);
    }

    let dist = 0;
    for (let i = 0; i < sortedA.length; i++) {
        dist += Math.abs(sortedA[i] - sortedB[i]);
    }
    
    return dist;
}

function _insertBestPad(smaller, larger) {
    let bestArr = [];
    let bestDist = Infinity;
    
    // Test duplicating each note to find which split requires the least melodic movement
    for (let i = 0; i < smaller.length; i++) {
        let testArr = [...smaller];
        testArr.push(smaller[i]);
        testArr.sort((a,b) => a-b);
        
        let dist = 0;
        for (let j = 0; j < testArr.length; j++) {
            dist += Math.abs(testArr[j] - larger[j]);
        }
        if (dist < bestDist) {
            bestDist = dist;
            bestArr = testArr;
        }
    }
    return bestArr;
}
