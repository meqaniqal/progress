import { CHORD_INTERVALS } from './chordDictionary.js';

export const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor: [0, 2, 3, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    // --- Symmetric & Exotic Scales ---
    wholeTone: [0, 2, 4, 6, 8, 10],
    diminishedWH: [0, 2, 3, 5, 6, 8, 9, 11], // Whole-Half Octatonic
    altered: [0, 1, 3, 4, 6, 8, 10] // Super Locrian
};

// Short-hand prefixes for scales that do not fit Roman Numerals
export const SCALE_PREFIXES = {
    wholeTone: 'WT',
    diminishedWH: 'Dim',
    altered: 'Alt'
};

// Psychoacoustic dissonance weights for interval pairs (0.0 to 1.0)
export const INTERVAL_WEIGHTS = {
    0: 0.0, 1: 1.0, 2: 0.6, 3: 0.3, 
    4: 0.2, 5: 0.4, 6: 0.9, 7: 0.1, 
    8: 0.6, 9: 0.3, 10: 0.5, 11: 0.9
};

export function getChordNotes(symbol, baseKey) {
    if (!symbol || typeof symbol !== 'string') return null;

    let intervals = CHORD_INTERVALS[symbol];
    
    // Fallback: Mathematical Roman Numeral Parser for omni-scale generated chords
    if (!intervals) {
        let accidental = 0;
        let stripped = symbol;
        
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
            let thirdOffset = numeral === numeral.toLowerCase() ? 3 : 4;
            let fifthOffset = 7;
            
            if (remainder.includes('sus4')) thirdOffset = 5;
            else if (remainder.includes('sus2')) thirdOffset = 2;

            if (remainder.includes('+') || remainder.includes('aug')) fifthOffset = 8;
            if (remainder.includes('°') || remainder.includes('dim')) fifthOffset = 6;
            
            intervals = [rootOffset, rootOffset + thirdOffset, rootOffset + fifthOffset];
            
            let has7 = remainder.includes('7') || remainder.includes('9') || remainder.includes('11') || remainder.includes('13');

            if (remainder.includes('maj7') || remainder.includes('maj9')) intervals.push(rootOffset + 11);
            else if (has7) {
                if (fifthOffset === 6 && !remainder.includes('°7')) intervals.push(rootOffset + 10);
                else if (remainder.includes('°7')) intervals.push(rootOffset + 9);
                else intervals.push(rootOffset + 10);
            }
            
            if (remainder.includes('9')) {
                if (remainder.includes('b9')) intervals.push(rootOffset + 13);
                else if (remainder.includes('#9')) intervals.push(rootOffset + 15);
                else intervals.push(rootOffset + 14); // Major 9th
            }
            if (remainder.includes('11')) {
                if (remainder.includes('#11')) intervals.push(rootOffset + 18);
                else intervals.push(rootOffset + 17); // Perfect 11th
            }
            if (remainder.includes('13')) {
                if (remainder.includes('b13')) intervals.push(rootOffset + 20);
                else intervals.push(rootOffset + 21); // Major 13th
            }
        }
        
        // Fallback 2: Algorithmic Exotic Scale Parser (e.g., WT1, Dim3)
        const exoticMatch = stripped.match(/^([A-Z][a-z]*|WT|Dim|Alt)(\d+)$/);
        if (!intervals && exoticMatch) {
            const prefix = exoticMatch[1];
            const degree = parseInt(exoticMatch[2], 10) - 1; // 1-indexed to 0-indexed
            const scaleType = Object.keys(SCALE_PREFIXES).find(k => SCALE_PREFIXES[k] === prefix) || 'wholeTone';
            intervals = buildChordByScaleSteps(scaleType, degree, 3, 2);
        }
    }
    
    if (!intervals) return null;
    return intervals.map(interval => baseKey + interval);
}

// --- Harmonic Function Alternatives ---
// Returns chords that share a similar harmonic function for contextual swapping
// Calculates shared tones purely by modulo interval mapping, making it key-agnostic.
export function getAlternatives(chordSymbol, baseKey = 60, mode = 'major') {
    const sourceNotes = getChordNotes(chordSymbol, baseKey);
    if (!sourceNotes) return [];
    
    const sourcePcs = sourceNotes.map(n => n % 12);
    
    // Build candidate pool: All standard dictionary chords + current scale's native chords
    const candidates = Array.from(new Set([
        ...Object.keys(CHORD_INTERVALS),
        ...getDiatonicChords(mode)
    ]));
    
    const scoredAlternatives = [];

    for (const targetSymbol of candidates) {
        if (targetSymbol === chordSymbol) continue;

        const targetNotes = getChordNotes(targetSymbol, baseKey);
        if (!targetNotes) continue;

        const targetPcs = targetNotes.map(n => n % 12);
        const sharedNotes = sourcePcs.filter(note => targetPcs.includes(note));
        
        // Only suggest chords with significant overlap (at least 2 shared notes for triads/7ths)
        if (sharedNotes.length >= 2) {
            const prefix = SCALE_PREFIXES[mode];
            const isNative = prefix && targetSymbol.startsWith(prefix);
            scoredAlternatives.push({
                symbol: targetSymbol,
                score: sharedNotes.length + (isNative ? 0.5 : 0) // Slight bias to native chords
            });
        }
    }

    // Sort by the number of shared tones (descending) and return the top 4 for a clean UI
    return scoredAlternatives.sort((a, b) => b.score - a.score)
                             .map(alt => alt.symbol)
                             .slice(0, 4);
}

// --- Omni-Scale Generation & Mathematics ---
export function getDiatonicChords(scaleType = 'major') {
    const prefix = SCALE_PREFIXES[scaleType];
    if (prefix) {
        // Exotic scales naming convention: Prefix + 1-indexed degree (e.g. WT1, Oct2)
        return SCALES[scaleType].map((_, i) => `${prefix}${i + 1}`);
    }

    const scale = SCALES[scaleType] || SCALES['major'];
    const majorScale = SCALES['major'];
    const numeralsLower = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
    const numeralsUpper = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const results = [];
    
    for (let i = 0; i < 7; i++) {
        const root = scale[i];
        const third = scale[(i + 2) % 7] + (i + 2 >= 7 ? 12 : 0);
        const fifth = scale[(i + 4) % 7] + (i + 4 >= 7 ? 12 : 0);
        
        const thirdInt = third - root;
        const fifthInt = fifth - root;
        
        let symbol = thirdInt === 4 ? numeralsUpper[i] : numeralsLower[i];
        
        if (thirdInt === 4 && fifthInt === 8) symbol += '+'; // Augmented
        if (thirdInt === 3 && fifthInt === 6) symbol += '°'; // Diminished
        
        // Accidental prefixing relative to major scale absolute intervals
        if (scale[i] < majorScale[i]) {
            symbol = 'b' + symbol;
        } else if (scale[i] > majorScale[i]) {
            symbol = '#' + symbol;
        }
        
        results.push(symbol);
    }
    return results;
}

/**
 * Generates a chord mathematically by skipping degrees within an arbitrary scale.
 * This supports whole-tone (6 notes), diminished (8 notes), and prepares for microtonal scales.
 * @param {string} scaleType - The scale array key in SCALES.
 * @param {number} rootDegree - The 0-indexed starting note in the scale.
 * @param {number} numNotes - Number of notes in the chord (e.g., 3 for triad, 4 for 7th).
 * @param {number} step - The index jump (default 2 for standard tertian harmony).
 * @returns {number[]} Array of semitone intervals from the tonic.
 */
export function buildChordByScaleSteps(scaleType = 'major', rootDegree = 0, numNotes = 3, step = 2) {
    const scale = SCALES[scaleType] || SCALES['major'];
    const chordIntervals = [];
    const scaleLength = scale.length;

    for (let i = 0; i < numNotes; i++) {
        const scaleIndex = (rootDegree + (i * step)) % scaleLength;
        const octaveShift = Math.floor((rootDegree + (i * step)) / scaleLength) * 12;
        chordIntervals.push(scale[scaleIndex] + octaveShift);
    }
    return chordIntervals;
}

export function calculateChordTension(midiNotes) {
    if (!midiNotes || midiNotes.length < 2) return -1.0;
    let dissonance = 0;
    let pairs = 0;
    for (let i = 0; i < midiNotes.length; i++) {
        for (let j = i + 1; j < midiNotes.length; j++) {
            const interval = Math.abs(midiNotes[i] - midiNotes[j]) % 12;
            dissonance += INTERVAL_WEIGHTS[interval];
            pairs++;
        }
    }
    const avg = dissonance / pairs;
    // Map average dissonance (typically 0.2 to 0.7) to a -1.0 to 1.0 tension UI scale
    let tension = ((avg - 0.2) / 0.4) * 2 - 1.0;
    return Math.max(-1.0, Math.min(1.0, tension));
}

// --- Synesthetic Color Mapping ---
export function getHarmonicProfile(symbol, mode = 'major', baseKey = 60) {
    const chordNotes = getChordNotes(symbol, baseKey);
    
    let tension = -1.0;
    let isBorrowed = false;
    let fifthsFromTonic = 0;
    
    if (chordNotes) {
        // 1. Mathematically evaluate structural tension
        tension = calculateChordTension(chordNotes);
        
        // 2. Mathematically evaluate if chord contains out-of-scale tones (Borrowed)
        const scaleIntervals = SCALES[mode] || SCALES['major'];
        const scalePitchClasses = scaleIntervals.map(interval => (baseKey + interval) % 12);
        const chordPitchClasses = chordNotes.map(n => n % 12);
        isBorrowed = !chordPitchClasses.every(pc => scalePitchClasses.includes(pc));
        
        // 3. Approximate Circle of Fifths distance for Hue coloring
        const rootPc = chordPitchClasses[0];
        const intervalFromTonic = (rootPc - (baseKey % 12) + 12) % 12;
        const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
        fifthsFromTonic = circleOfFifths.indexOf(intervalFromTonic);
        if (fifthsFromTonic > 6) fifthsFromTonic -= 12;
    }

    return { fifthsFromTonic, isBorrowed, tension };
}

// --- Modulation & Pivot Chords ---
export function getTransitionSuggestions(fromKey, toKey, mode = 'major') {
    if (fromKey === toKey) return [];
    
    // Now automatically Omni-Scale compliant!
    const diatonic = getDiatonicChords(mode);
    
    const suggestions = [];

    // 1. Find Pivot Chords (Exact mathematical match in both keys)
    for (const symA of diatonic) {
        const notesA = getChordNotes(symA, fromKey).map(n => n % 12).sort((a,b)=>a-b).join(',');
        for (const symB of diatonic) {
            const notesB = getChordNotes(symB, toKey).map(n => n % 12).sort((a,b)=>a-b).join(',');
            if (notesA === notesB) {
                suggestions.push({
                    type: 'pivot',
                    symbol: symB,
                    key: toKey,
                    description: `Pivot Chord: Acts as ${symA} in the old key, and ${symB} in the new key.`
                });
            }
        }
    }

    // 2. Direct Dominant (V of the new key)
    // Ensure we don't duplicate if V is already a pivot (rare but possible depending on scales)
    if (!suggestions.find(s => s.symbol === 'V')) {
        suggestions.push({
            type: 'dominant',
            symbol: 'V',
            key: toKey,
            description: `Direct Modulation: The V chord perfectly sets up the new key.`
        });
    }

    return suggestions;
}

// --- Turnaround Chords ---
// Suggests chords that strongly lead into the given target chord
export function getTurnaroundSuggestions(targetSymbol, mode = 'major', baseKey = 60) {
    // 1. Algorithmic Discovery for Exotic/Symmetric Scales
    if (SCALE_PREFIXES[mode]) {
        const targetNotes = getChordNotes(targetSymbol, baseKey);
        if (!targetNotes) return [];

        const prefix = SCALE_PREFIXES[mode];
        const candidates = [];

        // Build mixed candidate pool: Traditional + Native
        const pool = Array.from(new Set([
            ...Object.keys(CHORD_INTERVALS),
            ...SCALES[mode].map((_, i) => `${prefix}${i + 1}`)
        ]));

        for (const sym of pool) {
            if (sym === targetSymbol) continue; // Skip self

            const candidateNotes = getChordNotes(sym, baseKey);
            if (!candidateNotes) continue;

            const tension = calculateChordTension(candidateNotes);
            const vlDist = calculateDistance(candidateNotes, targetNotes);
            
            // Cost function: Maximize tension (suspense) while Minimizing voice leading distance (smooth resolution)
            const isNative = sym.startsWith(prefix);
            const score = (tension * 20) - vlDist + (isNative ? 5 : 0); // Ground the turnaround with a native bias
            candidates.push({ symbol: sym, score });
        }
        return candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(c => c.symbol);
    }

    // 2. Traditional Stylistic Fallbacks
    const baseFunc = targetSymbol.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7|°/g, '');
    
    if (mode === 'minor') {
        switch(baseFunc) {
            case 'i': return ['V', 'V7', 'v', 'VII', 'iv'];
            case 'iv': return ['i', 'I', 'VII'];
            case 'v': return ['iv', 'VI', 'i'];
            case 'V': return ['iv', 'ii°', 'VI'];
            case 'VI': return ['III', 'VII', 'i'];
            case 'III': return ['VII', 'VI'];
            case 'VII': return ['iv', 'VI'];
            default: return ['V', 'iv'];
        }
    } else {
        switch(baseFunc) {
            case 'I': return ['V', 'V7', 'Vsus4', 'bVII', 'iv'];
            case 'ii': return ['vi', 'I', 'V'];
            case 'iii': return ['V', 'ii'];
            case 'IV': return ['I', 'V', 'Imaj7'];
            case 'V': return ['ii', 'IV', 'Vsus4'];
            case 'vi': return ['iii', 'V', 'I'];
            case 'iv': return ['I', 'bVI'];
            case 'bVI': return ['bVII', 'iv'];
            case 'bVII': return ['iv', 'V'];
            default: return ['V', 'IV'];
        }
    }
}

// --- Voicing Optimization ---
// Cleans up muddy extended chords by dropping non-essential notes
export function optimizeVoicing(notes) {
    if (notes.length < 5) return notes; // Triads and standard 7ths remain intact
    
    const root = notes[0];
    // Remove the Perfect 5th (+7 semitones) to clear up midrange mud
    let voiced = notes.filter(n => n !== root + 7);
    
    // If it's still massive (like an 11th chord), drop the root too!
    // The dedicated bass synth already plays the root 2 octaves down.
    if (voiced.length >= 5) {
        voiced = voiced.filter(n => n !== root);
    }
    return voiced;
}

// --- Core Algorithm: Voice Leading ---
// Calculates the inversion of a target chord that has the shortest 
// total melodic distance from the previous chord.
export function applyVoiceLeading(progression, globalOptions = {}) {
    const validProgression = progression.filter(chord => getChordNotes(chord.symbol, chord.key));
    if (validProgression.length === 0) return [];
    
    // Dynamic voicing extraction to support future global or per-chord overrides
    const getOptions = (chord) => ({
        centerGravity: globalOptions.centerGravity ?? 54,
        gravityWeight: globalOptions.gravityWeight ?? 0.5,
        extremeHigh: globalOptions.extremeHigh ?? 72,
        extremeLow: globalOptions.extremeLow ?? 42,
        extremeWeight: globalOptions.extremeWeight ?? 5,
        voicingType: chord.voicingType && chord.voicingType !== 'global' ? chord.voicingType : (globalOptions.globalVoicing ?? 'auto')
    });

    // 1. Smart Anchoring for the First Chord
    const firstOpts = getOptions(validProgression[0]);
    let firstTarget = optimizeVoicing(getChordNotes(validProgression[0].symbol, validProgression[0].key));
    
    // Generate inversions dynamically based on the requested Voicing Type
    let firstInversions = generateInversions(firstTarget, firstOpts.voicingType);
    
    let bestFirst = firstInversions[0];
    let bestFirstCost = Infinity;
    
    firstInversions.forEach(inv => {
        let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
        let gravityCost = Math.abs(avgPitch - firstOpts.centerGravity) * (firstOpts.gravityWeight * 2); // Anchor start point
        
        let extremePenalty = 0;
        if (inv[0] < firstOpts.extremeLow) extremePenalty += (firstOpts.extremeLow - inv[0]) * firstOpts.extremeWeight;
        if (inv[inv.length - 1] > firstOpts.extremeHigh) extremePenalty += (inv[inv.length - 1] - firstOpts.extremeHigh) * firstOpts.extremeWeight;
        
        let rootPenalty = 0;
        if ((firstOpts.voicingType === 'auto' || firstOpts.voicingType === 'close') && (inv[0] % 12 !== firstTarget[0] % 12)) {
            rootPenalty = 15; // Strongly bias towards root position for the opening chord stability
        }

        let totalCost = gravityCost + extremePenalty + rootPenalty;
        if (totalCost < bestFirstCost) {
            bestFirstCost = totalCost;
            bestFirst = inv;
        }
    });

    let processed = [bestFirst]; 

    // 2. Voice Lead Subsequent Chords with Gravity Penalties
    for (let i = 1; i < validProgression.length; i++) {
        let prevChord = processed[i - 1];
        let opts = getOptions(validProgression[i]);
        let targetNotes = getChordNotes(validProgression[i].symbol, validProgression[i].key);
        targetNotes = optimizeVoicing(targetNotes);
        
        let inversions = generateInversions(targetNotes, opts.voicingType);
        
        let bestInversion = inversions[0];
        let smallestCost = Infinity;

        inversions.forEach(inv => {
            let distance = calculateDistance(prevChord, inv);
            
            let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
            let gravityPenalty = Math.abs(avgPitch - opts.centerGravity) * opts.gravityWeight;
            
            let extremePenalty = 0;
            if (inv[0] < opts.extremeLow) extremePenalty += (opts.extremeLow - inv[0]) * opts.extremeWeight;
            if (inv[inv.length - 1] > opts.extremeHigh) extremePenalty += (inv[inv.length - 1] - opts.extremeHigh) * opts.extremeWeight;
            
            let totalCost = distance + gravityPenalty + extremePenalty;

            if (totalCost < smallestCost) {
                smallestCost = totalCost;
                bestInversion = inv;
            }
        });

        processed.push(bestInversion);
    }
    return processed;
}

/**
 * The new master function for getting final notes. It runs the voice leading
 * algorithm first, then applies any manual inversion offsets as a final step.
 */
export function getPlayableNotes(progression, globalOptions = {}) {
    if (!progression || progression.length === 0) return [];

    // 1. Get the smoothest voice-led progression first.
    const voiceLedProgression = applyVoiceLeading(progression, globalOptions);

    // 2. Apply manual inversion offsets post-math.
    const finalProgression = voiceLedProgression.map((notes, index) => {
        const chord = progression[index];
        const offset = chord.inversionOffset;

        if (typeof offset === 'number' && offset !== 0) {
            return applyInversion(notes, offset);
        }
        return notes;
    });

    return finalProgression;
}

export function applyInversion(notes, offset = 0) {
    if (offset === 0 || !notes || notes.length === 0) return notes;

    const numNotes = notes.length;
    const effectiveOffset = ((offset % numNotes) + numNotes) % numNotes;
    const octaveShift = Math.floor(offset / numNotes);

    let inverted = [...notes].sort((a, b) => a - b);

    for (let i = 0; i < effectiveOffset; i++) {
        inverted.push(inverted.shift() + 12);
    }
    
    return inverted.map(n => n + (octaveShift * 12)).sort((a, b) => a - b);
}

export function generateInversions(chord, voicingType = 'auto') {
    const inversions = [];
    
    for (let oct of [-24, -12, 0, 12]) {
        const base = chord.map(n => n + oct);
        
        if (voicingType === 'quartal') {
            inversions.push(_buildQuartalVoicing(base));
            continue; // Quartal is a strict mathematical layout, skip standard inversions
        }

        if (voicingType === 'close' || voicingType === 'auto') {
            inversions.push([...base]); // Root Position Close
        }
        
        // Generate Drop 2 for root position (Spread voicings)
        if (base.length >= 4 && (voicingType === 'spread' || voicingType === 'auto')) {
            const drop2 = [...base];
            const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
            drop2.unshift(secondFromTop - 12);
            inversions.push(drop2);
        }
        
        // Dynamically generate inversions for N-length chords (7ths, 9ths, etc.)
        for (let i = 1; i < chord.length; i++) {
            const inv = [...base];
            for (let j = 0; j < i; j++) {
                inv[j] += 12; // Shift bottom notes up an octave
            }
            const sortedInv = inv.sort((a, b) => a - b);
            
            if (voicingType === 'close' || voicingType === 'auto') {
                inversions.push([...sortedInv]);
            }
            
            if (sortedInv.length >= 4 && (voicingType === 'spread' || voicingType === 'auto')) {
                const drop2 = [...sortedInv];
                const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
                drop2.unshift(secondFromTop - 12); // Drop the 2nd highest note an octave
                inversions.push(drop2);
            }
        }

        if (base.length === 3 && voicingType === 'spread') {
            // Open triad (Drop 1) for massive spread 3-note chords
            for (let i = 0; i < 3; i++) {
                const inv = [...base];
                for (let j = 0; j < i; j++) inv[j] += 12;
                const sortedInv = inv.sort((a,b)=>a-b);
                const openTriad = [...sortedInv];
                const mid = openTriad.splice(1, 1)[0];
                openTriad.unshift(mid - 12);
                inversions.push(openTriad);
            }
        }
    }
    
    return inversions;
}

function _buildQuartalVoicing(notes) {
    // Finds the permutation of notes that maximizes Perfect 4ths and 5ths between adjacent voices
    let sorted = [...notes].sort((a,b)=>a-b);
    let quartal = [sorted[0]];
    let remaining = sorted.slice(1);
    while(remaining.length > 0) {
        let lastNote = quartal[quartal.length - 1];
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i=0; i<remaining.length; i++) {
            let interval = (remaining[i] - lastNote) % 12;
            if (interval < 0) interval += 12;
            let score = Math.min(Math.abs(interval - 5), Math.abs(interval - 7));
            if (score < bestScore) { bestScore = score; bestIdx = i; }
        }
        let nextNote = remaining.splice(bestIdx, 1)[0];
        while (nextNote <= lastNote) nextNote += 12; // Force upward stacking
        quartal.push(nextNote);
    }
    return quartal;
}

export function calculateDistance(chordA, chordB) {
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