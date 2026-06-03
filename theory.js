import { CHORD_INTERVALS } from './chordDictionary.js';
import { getMicrotonalChord, getMicrotonalDiatonicChords, MICRO_TUNINGS } from './microtonalDictionary.js';
import { getMicrotonalAlternatives, getMicrotonalTurnarounds } from './microtonalSuggestions.js';

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

// --- Microtonal & Alternative Tuning Core ---
export const TUNING_SYSTEMS = {
    TET12: 12, // Standard Equal Temperament
    EDO19: 19, // 19-Tone Equal Temperament
    EDO24: 24, // Quarter-tone EDO
    EDO31: 31, // 31-Tone Equal Temperament (excellent Just Intonation approx)
    EDO72: 72, // 72-Tone Equal Temperament (1/12th tones, ultra-fine resolution)
};

export function getBassNote(rootChordNotes, tuning) {
    if (!rootChordNotes || rootChordNotes.length === 0) return 0;
    let bass = rootChordNotes[0];
    
    // Normalize bass to the 36-47 range (C2 to B2) to ensure a consistent sub-bass pocket
    // and prevent macrotonal roots from overlapping with the pad register.
    while (bass >= 48) bass -= 12.0;
    while (bass < 36) bass += 12.0;
    
    return bass;
}

/**
 * Generates a unique string signature for a chord based purely on its pitch classes.
 * This allows us to detect enharmonic equivalents regardless of octave or voicing.
 */
export function getChordSignature(chordNotes, periodSize = 12.0) {
    if (!chordNotes || chordNotes.length === 0) return '';
    return chordNotes.map(n => {
        let pc = n % periodSize;
        if (pc < 0) pc += periodSize;
        return Math.round(pc * 100) / 100; // Round to avoid float math errors in EDO space
    }).sort((a, b) => a - b).join(',');
}

export function getChordNotes(symbol, baseKey, divisions = 12) {
    if (!symbol || typeof symbol !== 'string') return null;

    const tuning = getEffectiveTuning(symbol, divisions);
    const periodMidiSize = tuning.periodSize;

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
            intervals = buildChordByScaleSteps(scaleType, degree, 3, 2, divisions);
        }
    }
    
    // Fallback 3: True Microtonal Sandbox Parser (e.g., BPLambda1)
    if (!intervals) {
        const microNotes = getMicrotonalChord(symbol, baseKey);
        if (microNotes) return microNotes; // Bypasses 12-TET mapping; BP inherently locks its own tuning math
    }

    if (!intervals) return null;
    
    return intervals.map(interval => {
        if (tuning.divisions === 12) return baseKey + interval;
        // Find the absolute semitone distance from the global anchor (MIDI 60)
        const absoluteSemitones = (baseKey - 60) + interval;
        const edoStep = Math.round(absoluteSemitones * (tuning.divisions / periodMidiSize));
        return 60 + (edoStep * (periodMidiSize / tuning.divisions));
    });
}

// --- Harmonic Function Alternatives ---
// Returns chords that share a similar harmonic function for contextual swapping
// Calculates shared tones purely by modulo interval mapping, making it key-agnostic.
export function getAlternatives(chordSymbol, baseKey = 60, mode = 'major') {
    const microDiatonic = getMicrotonalDiatonicChords(mode);
    if (microDiatonic) {
        return getMicrotonalAlternatives(chordSymbol, baseKey, mode);
    }

    const sourceNotes = getChordNotes(chordSymbol, baseKey);
    if (!sourceNotes) return [];
    
    const sourcePcs = sourceNotes.map(n => n % 12);
    
    const candidates = Array.from(new Set([
        ...Object.keys(CHORD_INTERVALS),
        ...getDiatonicChords(mode)
    ]));
    
    const scoredAlternatives = [];

    // First pass: at least 2 shared notes
    for (const targetSymbol of candidates) {
        if (targetSymbol === chordSymbol) continue;

        const targetNotes = getChordNotes(targetSymbol, baseKey);
        if (!targetNotes) continue;

        const targetPcs = targetNotes.map(n => n % 12);
        const sharedNotes = sourcePcs.filter(note => targetPcs.includes(note));
        
        if (sharedNotes.length >= 2) {
            const prefix = SCALE_PREFIXES[mode];
            const isNative = prefix && targetSymbol.startsWith(prefix);
            scoredAlternatives.push({
                symbol: targetSymbol,
                score: sharedNotes.length + (isNative ? 0.5 : 0)
            });
        }
    }

    // Second pass: fallback to 1 shared note if we have fewer than 12
    if (scoredAlternatives.length < 12) {
        for (const targetSymbol of candidates) {
            if (targetSymbol === chordSymbol) continue;
            if (scoredAlternatives.some(alt => alt.symbol === targetSymbol)) continue;

            const targetNotes = getChordNotes(targetSymbol, baseKey);
            if (!targetNotes) continue;

            const targetPcs = targetNotes.map(n => n % 12);
            const sharedNotes = sourcePcs.filter(note => targetPcs.includes(note));
            
            if (sharedNotes.length === 1) {
                const prefix = SCALE_PREFIXES[mode];
                const isNative = prefix && targetSymbol.startsWith(prefix);
                scoredAlternatives.push({
                    symbol: targetSymbol,
                    score: sharedNotes.length + (isNative ? 0.3 : 0) - 1.0 // Lower priority score
                });
            }
        }
    }

    return scoredAlternatives.sort((a, b) => b.score - a.score)
                             .map(alt => alt.symbol)
                             .slice(0, 12);
}

// --- Omni-Scale Generation & Mathematics ---
export function getDiatonicChords(scaleType = 'major') {
    const microChords = getMicrotonalDiatonicChords(scaleType);
    if (microChords) return microChords;

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
 * Deduces the most likely native mode/scale for a given chord symbol.
 * Used as a fallback for legacy chords without a strict sourceMode.
 */
export function deduceSourceMode(chordSymbol, currentMode = 'major') {
    const microMatch = chordSymbol.match(/^([A-Z0-9]+?)([A-Z][a-z]+)(\d+)$/);
    if (microMatch) {
        return microMatch[1].toLowerCase() + microMatch[2];
    }

    const safeMode = currentMode.trim();
    const baseFunc = chordSymbol.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7/g, '').trim();

    const diatonicArr = getDiatonicChords(safeMode) || [];
    const currentDiatonic = diatonicArr.map(sym => sym.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7/g, '').trim());
    
    if (currentDiatonic.includes(baseFunc)) {
        return safeMode;
    }

    let fallbackModes = ['major', 'minor', 'harmonicMinor', 'dorian', 'mixolydian', 'lydian', 'phrygian', 'melodicMinor'];
    if (safeMode.toLowerCase() === 'major') fallbackModes = ['minor', 'mixolydian', 'lydian', 'dorian', 'harmonicMinor', 'phrygian', 'melodicMinor'];
    if (safeMode.toLowerCase() === 'minor') fallbackModes = ['harmonicMinor', 'dorian', 'major', 'phrygian', 'melodicMinor', 'mixolydian', 'lydian'];

    for (const mode of fallbackModes) {
        if (mode === safeMode) continue;
        const diatonicChords = getDiatonicChords(mode);
        if (!diatonicChords) continue;
        const baseDiatonic = diatonicChords.map(sym => sym.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7/g, '').trim());
        if (baseDiatonic.includes(baseFunc)) {
            return mode;
        }
    }
    
    return null;
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
export function buildChordByScaleSteps(scaleType = 'major', rootDegree = 0, numNotes = 3, step = 2, divisions = 12) {
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
            
            // Support float intervals by interpolating between nearest integer weights
            const lower = Math.floor(interval);
            const upper = (lower + 1) % 12;
            const fraction = interval - lower;
            const weight = (INTERVAL_WEIGHTS[lower] * (1 - fraction)) + (INTERVAL_WEIGHTS[upper] * fraction);
            
            dissonance += weight;
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
        const microDiatonic = getMicrotonalDiatonicChords(mode);
        if (microDiatonic) {
            // For microtonal systems, if the symbol is native to the scale, it's not borrowed
            isBorrowed = !microDiatonic.includes(symbol);
        } else {
            const scaleIntervals = SCALES[mode] || SCALES['major'];
            const scalePitchClasses = scaleIntervals.map(interval => (baseKey + interval) % 12);
            const chordPitchClasses = chordNotes.map(n => n % 12);
            // Use small tolerance for float equality just in case of EDO approximations
            isBorrowed = !chordPitchClasses.every(pc => scalePitchClasses.some(spc => Math.abs(spc - pc) < 0.1));
        }
        
        // 3. Approximate Circle of Fifths distance for Hue coloring
        const rootPc = Math.round(chordNotes[0]) % 12;
        const intervalFromTonic = (rootPc - (Math.round(baseKey) % 12) + 12) % 12;
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
    const microDiatonic = getMicrotonalDiatonicChords(mode);
    if (microDiatonic) {
        return getMicrotonalTurnarounds(targetSymbol, baseKey, mode);
    }

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
    const divisions = globalOptions.divisions || 12;
    const getDivisions = (chord) => chord.divisions || divisions;
    const validProgression = progression.filter(chord => getChordNotes(chord.symbol, chord.key, getDivisions(chord)));
    if (validProgression.length === 0) return [];
    
    // Dynamic voicing extraction to support future global or per-chord overrides
    const getOptions = (chord) => ({
        centerGravity: globalOptions.centerGravity ?? 54,
        gravityWeight: globalOptions.gravityWeight ?? 0.5,
        extremeHigh: globalOptions.extremeHigh ?? 84, // Widened to allow high exotic extensions
        extremeLow: globalOptions.extremeLow ?? 36,   // Lowered to C2 to allow wide BP roots to breathe
        extremeWeight: globalOptions.extremeWeight ?? 5,
        voicingType: chord.voicingType && chord.voicingType !== 'global' ? chord.voicingType : (globalOptions.globalVoicing ?? 'auto')
    });

    // 1. Smart Anchoring for the First Chord
    const firstOpts = getOptions(validProgression[0]);
    const firstTuning = getEffectiveTuning(validProgression[0].symbol, getDivisions(validProgression[0]));
    let firstTarget = optimizeVoicing(getChordNotes(validProgression[0].symbol, validProgression[0].key, getDivisions(validProgression[0])));
    
    // Generate inversions dynamically based on the requested Voicing Type
    let firstInversions = generateInversions(firstTarget, firstOpts.voicingType, firstTuning.periodSize);
    
    let bestFirst = firstInversions[0];
    let bestFirstCost = Infinity;
    
    firstInversions.forEach(inv => {
        let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
        let gravityCost = Math.abs(avgPitch - firstOpts.centerGravity) * (firstOpts.gravityWeight * 2); // Anchor start point
        
        let extremePenalty = 0;
        if (inv[0] < firstOpts.extremeLow) extremePenalty += (firstOpts.extremeLow - inv[0]) * firstOpts.extremeWeight;
        if (inv[inv.length - 1] > firstOpts.extremeHigh) extremePenalty += (inv[inv.length - 1] - firstOpts.extremeHigh) * firstOpts.extremeWeight;
        
        let rootPenalty = 0;
        const invMod = ((inv[0] % firstTuning.periodSize) + firstTuning.periodSize) % firstTuning.periodSize;
        const tgtMod = ((firstTarget[0] % firstTuning.periodSize) + firstTuning.periodSize) % firstTuning.periodSize;
        const isRootMismatch = Math.abs(invMod - tgtMod) > 0.15 && Math.abs(invMod - tgtMod) < firstTuning.periodSize - 0.15;
        if ((firstOpts.voicingType === 'auto' || firstOpts.voicingType === 'close') && isRootMismatch) {
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
        let prevTuning = getEffectiveTuning(validProgression[i-1].symbol, getDivisions(validProgression[i-1]));
        let tuning = getEffectiveTuning(validProgression[i].symbol, getDivisions(validProgression[i]));
        let targetNotes = getChordNotes(validProgression[i].symbol, validProgression[i].key, getDivisions(validProgression[i]));
        targetNotes = optimizeVoicing(targetNotes);
        
        let inversions = generateInversions(targetNotes, opts.voicingType, tuning.periodSize);
        
        let bestInversion = inversions[0];
        let smallestCost = Infinity;

        inversions.forEach(inv => {
            let distance = calculateDistance(prevChord, inv);
            
            let avgPitch = inv.reduce((sum, val) => sum + val, 0) / inv.length;
            let gravityPenalty = Math.abs(avgPitch - opts.centerGravity) * opts.gravityWeight;
            
            // If crossing tuning system boundaries (e.g., 12-TET to BP), strongly prioritize register matching over voice leading.
            if (Math.abs(tuning.periodSize - prevTuning.periodSize) > 0.1) {
                let prevAvg = prevChord.reduce((sum, val) => sum + val, 0) / prevChord.length;
                gravityPenalty += Math.abs(avgPitch - prevAvg) * 10; // Tether to the previous chord's register
            }
            
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

    let baseProgression;
    
    if (globalOptions.useVoiceLeading !== false) {
        // 1. Get the smoothest voice-led progression first.
        baseProgression = applyVoiceLeading(progression, globalOptions);
    } else {
        // 1b. Just use root position (dropped one period for warmth)
        baseProgression = progression.map(chord => {
            const tuning = getEffectiveTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);
            const notes = getChordNotes(chord.symbol, chord.key, tuning.divisions);
            const dropSize = tuning.periodSize > 14 ? 12.0 : tuning.periodSize;
            return notes ? notes.map(n => n - dropSize) : [];
        });
    }

    // 2. Apply manual inversion offsets post-math.
    const finalProgression = baseProgression.map((notes, index) => {
        const chord = progression[index];
        const offset = chord.inversionOffset;
        const tuning = getEffectiveTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);

        let finalNotes = notes;

        if (typeof offset === 'number' && offset !== 0) {
            finalNotes = applyInversion(notes, offset, tuning.periodSize);
        }
        
        return finalNotes;
    });

    return finalProgression;
}

export function applyInversion(notes, offset = 0, periodSize = 12.0) {
    if (offset === 0 || !notes || notes.length === 0) return notes;

    const isMacrotonal = periodSize > 14;

    // Macrotonal protection: internal inversions shatter wide-period chords.
    // We shift the entire chord block by a standard octave (12.0) instead of the Tritave.
    // This preserves the tight microtonal cluster while keeping it in a musical register.
    if (isMacrotonal) {
        return [...notes].map(n => n + (offset * 12.0)).sort((a, b) => a - b);
    }

    const numNotes = notes.length;
    const effectiveOffset = ((offset % numNotes) + numNotes) % numNotes;
    const octaveShift = Math.floor(offset / numNotes);

    let inverted = [...notes].sort((a, b) => a - b);

    for (let i = 0; i < effectiveOffset; i++) {
        inverted.push(inverted.shift() + periodSize);
    }
    
    return inverted.map(n => n + (octaveShift * periodSize)).sort((a, b) => a - b);
}

export function generateInversions(chord, voicingType = 'auto', periodSize = 12.0) {
    const inversions = [];
    const isMacrotonal = periodSize > 14;
    
    // Macrotonal protection: internal inversions and spread voicings shatter wide-period chords.
    // Force 'close' voicing to preserve the tight microtonal cluster identity.
    const safeVoicingType = isMacrotonal ? 'close' : voicingType;
    const shiftPeriod = isMacrotonal ? 12.0 : periodSize;

    for (let oct of [-3, -2, -1, 0, 1, 2]) { // Expanded search space to prevent boundary trapping
        const shift = oct * shiftPeriod;
        const base = chord.map(n => n + shift);
        
        if (safeVoicingType === 'quartal') {
            inversions.push(_buildQuartalVoicing(base, periodSize));
            continue; // Quartal is a strict mathematical layout, skip standard inversions
        }

        if (safeVoicingType === 'close' || safeVoicingType === 'auto') {
            inversions.push([...base]); // Root Position Close
        }
        
        // For macrotonal scales (BP), internal inversions shatter the chord with huge gaps.
        if (isMacrotonal) {
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
    
    return inversions;
}

function _buildQuartalVoicing(notes, periodSize = 12.0) {
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

// --- Microtonal Math & Conversion Utilities ---

export function midiToFreq(midiPitch, a4Freq = 440.0) {
    return a4Freq * Math.pow(2, (midiPitch - 69) / 12);
}

export function freqToMidi(frequency, a4Freq = 440.0) {
    return 69 + 12 * Math.log2(frequency / a4Freq);
}

/**
 * Determines the active tuning parameters (Divisions and Period Size).
 * If a chord symbol explicitly belongs to a microtonal scale (e.g., BP), it forces that native tuning.
 */
export function getEffectiveTuning(chordSymbol, globalDivisions = 12) {
    if (chordSymbol) {
        const match = chordSymbol.match(/^([A-Z0-9]+?)([A-Z][a-z]+)(\d+)$/);
        if (match) {
            const tuningKey = match[1].toUpperCase();
            const nativeTuning = MICRO_TUNINGS[tuningKey];
            if (nativeTuning) {
                return { divisions: nativeTuning.divisions, periodSize: nativeTuning.periodSize };
            }
        }
    }
    let periodSize = 12.0;
    if (globalDivisions === 13) periodSize = 12 * Math.log2(3); // Global BP Fallback
    else if (globalDivisions === 5) periodSize = 12.0;
    return { divisions: globalDivisions || 12, periodSize };
}

/**
 * Determines the tuning grid used by the Pitch Editor UI and Bass Snapping.
 * Prioritizes the Global Tuning if it is microtonal, granting the user maximum
 * resolution to interweave exotic chords into the active global grid.
 */
export function getPitchEditorTuning(chordSymbol, globalDivisions = 12) {
    if (globalDivisions && globalDivisions !== 12) {
        return getEffectiveTuning(null, globalDivisions);
    }
    return getEffectiveTuning(chordSymbol, globalDivisions);
}

export function snapToGrid(floatPitch, tuningObjOrDivisions = 12) {
    const tuning = typeof tuningObjOrDivisions === 'number' 
        ? getEffectiveTuning(null, tuningObjOrDivisions) 
        : tuningObjOrDivisions;
        
    if (tuning.divisions === 12) return Math.round(floatPitch); // Enforce rigid integer snapping for standard 12-TET
    
    const edoStep = Math.round((floatPitch - 60) * (tuning.divisions / tuning.periodSize));
    return 60 + (edoStep * (tuning.periodSize / tuning.divisions));
}

/**
 * Converts an EDO scale step into a floating-point MIDI pitch.
 * @param {number} baseMidi - The root MIDI note (e.g., 60 for C)
 * @param {number} edoSteps - Number of scale steps from the root
 * @param {number} divisions - Equal divisions of the octave (default: 12)
 * @returns {number} Floating point MIDI pitch (e.g., 60.5 for a quarter tone)
 */
export function getEdoPitch(baseMidi, edoSteps, divisions = 12) {
    const stepSize = 12.0 / divisions;
    return baseMidi + (edoSteps * stepSize);
}

/**
 * Programmatically segments a dense microtonal cluster to prevent muddiness.
 * Groups stable ratios into a core, and isolates highly dissonant intervals.
 * @param {number[]} floatMidiNotes - Array of float MIDI pitches.
 * @returns {Object} { core: [], frictionLeft: [], frictionRight: [] }
 */
export function segmentMicrotonalCluster(floatMidiNotes) {
    const core = [];
    const frictionLeft = [];
    const frictionRight = [];

    if (!floatMidiNotes || floatMidiNotes.length === 0) return { core, frictionLeft, frictionRight };

    const sorted = [...floatMidiNotes].sort((a, b) => a - b);
    core.push(sorted[0]); // The bass/root tone is always stable core

    let panLeft = true;

    for (let i = 1; i < sorted.length; i++) {
        const note = sorted[i];
        let isFriction = false;

        for (const c of core) {
            const intervalCents = Math.abs(note - c) * 100; // 1 semitone = 100 cents
            const normalizedInterval = intervalCents % 1200; // Wrap within 1 octave
            
            // Acoustic beating is highest when frequencies are ~15 to 65 cents apart
            if (normalizedInterval >= 15 && normalizedInterval <= 65) {
                isFriction = true;
                break; // Clashes heavily with a core note
            }
        }

        if (isFriction) {
            panLeft ? frictionLeft.push(note) : frictionRight.push(note);
            panLeft = !panLeft; // Alternate spatial distribution
        } else {
            core.push(note);
        }
    }

    return { core, frictionLeft, frictionRight };
}

/**
 * Hierarchical Collision Engine
 * Moving melodic notes (active transitions) actively force stationary background notes to yield and move out of the way.
 */
export function resolveHierarchicalCollisions(notesToPlay, movingVoiceIndices) {
    const resolved = [...notesToPlay];
    const len = resolved.length;
    
    let maxIterations = 3;
    while (maxIterations > 0) {
        let clashing = false;
        
        for (let i = 0; i < len; i++) {
            for (let j = i + 1; j < len; j++) {
                const diff = Math.abs(resolved[i] - resolved[j]);
                // If within a minor second, microtonal clash, or unison overlap (<= 1.5 semitones)
                if (diff <= 1.5) {
                    clashing = true;
                    const isMovingI = movingVoiceIndices.includes(i);
                    const isMovingJ = movingVoiceIndices.includes(j);
                    
                    // Priority rules: Outer voices (Soprano/Bass) have priority over inner voices
                    let priorityI = (i === 0) ? 10 : (i === len - 1 ? 9 : 5);
                    let priorityJ = (j === 0) ? 10 : (j === len - 1 ? 9 : 5);
                    
                    if (isMovingI) priorityI += 100;
                    if (isMovingJ) priorityJ += 100;
                    
                    // Break ties: lower voice index has higher priority (Soprano index 0 is higher than Alto index 1)
                    let iHasPriority = priorityI > priorityJ;
                    if (priorityI === priorityJ) {
                        iHasPriority = i < j;
                    }
                    
                    const higherIdx = iHasPriority ? i : j;
                    const lowerIdx = iHasPriority ? j : i;
                    
                    // Nudge the lower priority voice away while preserving vertical voice ordering (prevent voice crossing)
                    const nudgeDir = (lowerIdx > higherIdx) ? -1.0 : 1.0;
                    resolved[lowerIdx] += nudgeDir;
                }
            }
        }
        
        if (!clashing) break;
        maxIterations--;
    }
    
    return resolved;
}

export const HAND_CURATED_CATEGORIES = [
    { id: 'mournful', label: '😢 Mournful', description: 'Plaintive, sorrowful, minor modal relationships', color: '#6366f1' },
    { id: 'luminous', label: '✨ Luminous', description: 'Bright, shimmering, Lydian major relationships', color: '#fbbf24' },
    { id: 'heroic', label: '⚔️ Heroic', description: 'Epic, Mixolydian, triumphant progression steps', color: '#ef4444' },
    { id: 'nostalgic', label: '💕 Nostalgic', description: 'Warm, tender, romantic/plagal relationships', color: '#ec4899' },
    { id: 'mysterious', label: '🌌 Mysterious', description: 'Introspective, floating, Dorian minor steps', color: '#8b5cf6' },
    { id: 'ethereal', label: '🧚 Ethereal', description: 'Floaty, whole-tone, Lydian #11 textures', color: '#06b6d4' },
    { id: 'ominous', label: '🌋 Ominous', description: 'Heavy, Phrygian, tense diminished structures', color: '#7f1d1d' },
    { id: 'soulful', label: '🎹 Soulful', description: 'Warm, major/minor 9ths, Stevie/Wonder chords', color: '#f59e0b' },
    { id: 'exotic', label: '🏺 Exotic', description: 'Ancient, symmetric scale relationships', color: '#10b981' },
    { id: 'tension', label: '⚡ Tension', description: 'High-tension, secondary dominant vectors', color: '#d97706' },
    { id: 'dreamy', label: '💭 Dreamy', description: 'Cloud-like, floating chord substitutions', color: '#a855f7' },
    { id: 'hopeful', label: '🌅 Hopeful', description: 'Bright morning, rising diatonic lines', color: '#14b8a6' },
    { id: 'cyberpunk', label: '🤖 Cyberpunk', description: 'Neon, Phrygian dominant, synthetic grit', color: '#ec4899' },
    { id: 'alien', label: '👽 Alien', description: 'Unusual intervals, microtonal geometries', color: '#22c55e' },
    { id: 'neutral', label: '⚖️ Neutral', description: 'Balanced, structural chord relationships', color: '#64748b' },
    { id: 'spectral', label: '🔮 Spectral', description: 'Glimmering, harmonic overtone orbits', color: '#db2777' }
];

export function getProceduralCategory(categoryIndex, mode = 'major') {
    if (categoryIndex < HAND_CURATED_CATEGORIES.length) {
        return HAND_CURATED_CATEGORIES[categoryIndex];
    }
    
    const seed = categoryIndex * 12345;
    const pseudoRand = (offset) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    const prefixes = [
        "Golden-Ratio", "Fibonacci", "Symmetric", "Subharmonic", "Isomorphic", 
        "Over-tone", "Spectral", "Recursive", "Hyper-Dorian", "Chiral", 
        "Tessellated", "Logarithmic", "Geometric", "Prime-Step", "Quantum", 
        "Fractional", "Divergent", "Harmonic", "Vector", "Elliptic",
        "Algorithmic", "Matrix", "Non-Linear", "Multi-Dimensional", "Stochastic",
        "Polytopic", "Markovian", "Euclidean", "Crystalline", "Prismatic"
    ];

    const nouns = [
        "Reflection", "Orbit", "Cascade", "Matrix", "Symmetry", 
        "Lattice", "Helix", "Resonance", "Spectrum", "Continuum", 
        "Prism", "Friction", "Gravity", "Vortex", "Horizon", 
        "Ascent", "Oscillation", "Tension", "Decay", "Synthesis",
        "Entropy", "Wavefront", "Bifurcation", "Strange Attractor", "Torus",
        "Resonator", "Interference", "Splay", "Superposition", "Modulation"
    ];

    const emojis = [
        "📐", "🌀", "🧬", "🌌", "🔮", "🧪", "🧮", "🔭", "📡", "🛰", 
        "🕯", "🌊", "🌋", "☄️", "⚡", "✨", "🪐", "💎", "🧩", "⚖️"
    ];

    const colors = [
        "#6366f1", "#fbbf24", "#ef4444", "#ec4899", "#8b5cf6", 
        "#06b6d4", "#7f1d1d", "#f59e0b", "#10b981", "#d97706",
        "#a855f7", "#14b8a6", "#db2777", "#22c55e", "#64748b"
    ];

    const prefIdx = Math.floor(pseudoRand(1) * prefixes.length);
    const nounIdx = Math.floor(pseudoRand(2) * nouns.length);
    const emojiIdx = Math.floor(pseudoRand(3) * emojis.length);
    const colorIdx = Math.floor(pseudoRand(4) * colors.length);

    const label = `${emojis[emojiIdx]} ${prefixes[prefIdx]} ${nouns[nounIdx]}`;
    const description = `Procedural mathematical category exploring step ratio ${(categoryIndex % 11) + 1} skip vectors.`;

    return {
        id: `procedural-${categoryIndex}`,
        label,
        description,
        color: colors[colorIdx]
    };
}

export function getCategoryIndex(emotionId) {
    if (typeof emotionId === 'number') return emotionId;
    if (emotionId && emotionId.startsWith('procedural-')) {
        return parseInt(emotionId.replace('procedural-', ''), 10);
    }
    const idx = HAND_CURATED_CATEGORIES.findIndex(cat => cat.id === emotionId);
    return idx !== -1 ? idx : 0;
}

function getStandardSymbolForOffset(offset, mode) {
    const majorSymbols = {
        0: 'I', 1: 'bIImaj7', 2: 'ii7', 3: 'bIIImaj7', 4: 'iii7', 5: 'IVmaj7',
        6: 'bVmaj7', 7: 'V7', 8: 'bVImaj7', 9: 'vi7', 10: 'bVII7', 11: 'vii7b5'
    };
    const minorSymbols = {
        0: 'i7', 1: 'bIImaj7', 2: 'ii7b5', 3: 'bIIImaj7', 4: 'iv7', 5: 'v7',
        6: 'bVmaj7', 7: 'V7alt', 8: 'bVImaj7', 9: 'bVII7', 10: 'vii°7', 11: 'I'
    };
    const map = (mode === 'minor' || mode === 'aeolian') ? minorSymbols : majorSymbols;
    return map[offset] || 'I';
}

export function getDynamicProgSuggestions(currentChord, emotion, mode = 'major', baseKey = 60) {
    const chordSymbol = currentChord ? currentChord.symbol : 'I';
    const chordKey = currentChord ? (currentChord.key !== undefined ? currentChord.key : baseKey) : baseKey;
    const baseOctave = Math.floor(baseKey / 12) * 12;

    const suggestions = [];

    const addSug = (sym, desc, key = chordKey) => {
        const normalizedKey = baseOctave + (((key % 12) + 12) % 12);
        if (!suggestions.some(s => s.symbol === sym && s.key === normalizedKey)) {
            suggestions.push({ symbol: sym, description: desc, key: normalizedKey });
        }
    };

    // Microtonal modes get specialized degree-based maps
    const microDiatonic = getMicrotonalDiatonicChords(mode);
    if (microDiatonic) {
        if (emotion && (emotion.startsWith('procedural-') || typeof emotion === 'number')) {
            const catIndex = getCategoryIndex(emotion);
            const step = (catIndex % (microDiatonic.length - 1)) + 1;
            const activeDegree = currentChord ? (parseInt(currentChord.symbol.match(/\d+$/)?.[0], 10) || 1) : 1;
            for (let j = 0; j < 6; j++) {
                const degIndex = (activeDegree - 1 + (step * j)) % microDiatonic.length;
                const sym = microDiatonic[degIndex];
                addSug(sym, `Scale degree ${degIndex + 1} (${step}-step jump vector)`);
            }
        } else {
            const mapping = {
                mournful: [4, 6, 8, 9],
                luminous: [1, 3, 5, 7],
                heroic: [1, 4, 5, 9],
                nostalgic: [1, 3, 6, 8],
                mysterious: [2, 5, 7, 9],
                ethereal: [3, 6, 8, 9],
                ominous: [2, 4, 7, 8],
                soulful: [1, 3, 5, 8],
                exotic: [2, 5, 6, 7],
                tension: [2, 4, 8, 9],
                dreamy: [3, 5, 7, 8],
                hopeful: [1, 3, 6, 7],
                cyberpunk: [2, 4, 6, 9],
                alien: [2, 5, 8, 9],
                dissonant: [2, 4, 7, 9],
                neutral: [1, 3, 5, 6],
                spectral: [3, 5, 8, 9]
            };
            const degrees = mapping[emotion] || [1, 3, 5, 7];
            degrees.forEach(deg => {
                if (deg <= microDiatonic.length) {
                    const sym = microDiatonic[deg - 1];
                    addSug(sym, `Microtonal degree ${deg} emotional color`);
                }
            });
        }
        return suggestions;
    }

    // Procedural category index check for standard 12-EDO
    if (emotion && emotion.startsWith('procedural-')) {
        const catIndex = getCategoryIndex(emotion);
        const step = (catIndex % 11) + 1;
        for (let j = 0; j < 6; j++) {
            const semitoneOffset = (step * j) % 12;
            const targetKey = chordKey + semitoneOffset;
            const sym = getStandardSymbolForOffset(semitoneOffset, mode);
            addSug(sym, `Chromatic skip +${semitoneOffset} semitones (${step}-step mathematical spiral)`, targetKey);
        }
        return suggestions;
    }

    // Traditional hand-curated categories
    switch (emotion) {
        case 'mournful':
            addSug('iv', 'Plaintive Aeolian minor subdominant (minor iv)');
            addSug('bVI', 'Sorrowful borrowed flat-VI triad');
            addSug('ii°7', 'Yearning half-diminished ii°7 chord');
            addSug('i7', 'Aeolian tonic minor 7th');
            addSug('bvi', 'Romantic mediant drop (minor bvi)');
            addSug('v7', 'Introspective minor v7');
            addSug('v', 'Natural minor v minor triad');
            addSug('iv7', 'Soulful plagal minor iv7');
            addSug('bIII', 'Bright contrast flat-III major');
            addSug('bIIImaj7', 'Yearning flat-III major 7th');
            addSug('iiø7', 'Sorrowful half-diminished supertonic');
            addSug('bVImaj7', 'Mournful flat-VI major 7th');
            break;
        case 'luminous':
            addSug('II', 'Uplifting Lydian major II chord');
            addSug('Imaj7', 'Bright, shimmering major 7th');
            addSug('IVmaj7', 'Warm Lydian-esque major 7th on the IV');
            addSug('V9', 'Bright dominant 9th');
            addSug('III', 'Lifting chromatic mediant (major III)');
            addSug('VI', 'Triumphant major VI (Lydian side)');
            addSug('Imaj9', 'Dreamy major 9th');
            addSug('Vmaj7', 'Soaring dominant major 7th');
            addSug('IVmaj9', 'Bright major 9th on the IV');
            addSug('Vsus2', 'Open suspended 2nd on the dominant');
            addSug('Iadd9', 'Pure add9 tonic');
            addSug('vii7b5', 'Half-diminished leading tone chord');
            break;
        case 'heroic':
            addSug('bVII', 'Triumphant Mixolydian flat-VII');
            addSug('bVI', 'Epic flat-VI chord');
            addSug('bIII', 'Powerful flat-III major chord');
            addSug('V', 'Strong dominant V');
            addSug('VI', 'Triumphant major VI (Yes/Prog feel)');
            addSug('bVII7', 'Epic flat-VII dominant 7th');
            addSug('bVImaj7', 'Stately flat-VI major 7th');
            addSug('bIIImaj7', 'Bright flat-III major 7th');
            addSug('I7', 'Tension-building tonic dominant 7th');
            addSug('IV7', 'Mixolydian subdominant dominant 7th');
            addSug('v7', 'Epic minor v7 passing chord');
            addSug('II7', 'Secondary dominant major II7');
            break;
        case 'nostalgic':
            addSug('IVmaj7', 'Nostalgic Lydian major 7th');
            addSug('iv', 'Stevie/Chopin minor iv plagal change');
            addSug('Imaj9', 'Dreamy major 9th');
            addSug('vi9', 'Tender minor 9th on the submediant');
            addSug('bVImaj7', 'Romantic flat-VI major 7th');
            addSug('Imaj7', 'Warm tonic major 7th');
            addSug('vi7', 'Tender submediant minor 7th');
            addSug('ii9', 'Uplifting supertonic minor 9th');
            addSug('iv7', 'Soulful minor iv7');
            addSug('bIIImaj7', 'Nostalgic flat-III major 7th');
            addSug('bVII9', 'Soulful flat-VII major 9th');
            addSug('ii11', 'Open supertonic minor 11th');
            break;
        case 'mysterious':
            addSug('IV', 'Dorian major IV chord');
            addSug('ii7', 'Dreamy minor 7th on supertonic');
            addSug('Isus2', 'Floating suspended 2nd');
            addSug('Vsus4', 'Suspended 4th on the dominant');
            addSug('v', 'Introspective minor v');
            addSug('v7', 'Introspective minor v7');
            addSug('ii11', 'Floating minor 11th supertonic');
            addSug('Iadd9', 'Floating add9 chord');
            addSug('Vsus2', 'Floating suspended 2nd dominant');
            addSug('IVmaj7', 'Mysterious Dorian major 7th on the IV');
            addSug('bVII', 'Mysterious flat-VII triad');
            addSug('bIII', 'Mysterious flat-III triad');
            break;
        case 'ethereal':
            addSug('Imaj7#11', 'Holdsworth Lydian #11 (semitone friction F#/G)');
            addSug('II7', 'Symmetric whole-tone dominant 7th');
            addSug('iii7b5', 'Floaty half-diminished chord');
            addSug('Iadd9', 'Open-voiced add9 triad');
            addSug('I7b5', 'Symmetric whole-tone flat-5th dominant');
            addSug('bVImaj7#11', 'Floating Lydian #11 on flat-VI');
            addSug('vi7b5', 'Floaty half-diminished submediant');
            addSug('II9', 'Symmetric Lydian dominant 9th');
            addSug('Imaj9#11', 'Floaty major 9th sharp 11');
            addSug('IVmaj7#11', 'Floating subdominant sharp 11');
            addSug('Vsus4#11', 'Floaty sharp 11 dominant');
            addSug('vii7', 'Leading tone minor 7th');
            break;
        case 'ominous':
            addSug('bII', 'Heavy Phrygian flat-II (Neapolitan)');
            addSug('vii°7', 'Tense diminished 7th');
            addSug('I7b9', 'Dissonant dominant 7th flat-9th');
            addSug('v°', 'Diminished minor v chord');
            addSug('bV', 'Dissonant tritone-related major bV');
            addSug('bIImaj7', 'Tense Phrygian flat-II major 7th');
            addSug('vii°', 'Tense diminished leading triad');
            addSug('i°7', 'Tense tonic diminished 7th');
            addSug('bVmaj7', 'Tense tritone major 7th');
            addSug('IV7b9', 'Altered subdominant flat-9th');
            addSug('V7b9', 'Dissonant dominant flat-9th');
            addSug('#I°7', 'Tense chromatic passing diminished');
            break;
        case 'baroque':
            addSug('V/V', 'Secondary dominant: V of V (creates logical momentum)', (chordKey + 7));
            addSug('V/vi', 'Secondary dominant: V of vi', (chordKey + 9));
            addSug('I', 'Picardy Third: Resolving minor context to Major I');
            addSug('vii°/V', 'Tension builder: diminished vii° of V', (chordKey + 7));
            addSug('V/ii', 'Secondary dominant: V of ii', (chordKey + 2));
            addSug('V/iii', 'Secondary dominant: V of iii', (chordKey + 4));
            addSug('V/IV', 'Secondary dominant: V of IV', (chordKey + 5));
            addSug('V7/V', 'Secondary dominant 7th: V7 of V', (chordKey + 7));
            addSug('V7/vi', 'Secondary dominant 7th: V7 of vi', (chordKey + 9));
            addSug('V7/ii', 'Secondary dominant 7th: V7 of ii', (chordKey + 2));
            addSug('vii°/vi', 'Tension builder: diminished vii° of vi', (chordKey + 9));
            addSug('ii°', 'Bach-style diminished supertonic');
            break;
        case 'cosmic':
            addSug('I', 'Home major center');
            addSug('bIIImaj7', 'Coltrane cycle step 1 (+Major 3rd, 4 semitones)', (chordKey + 4));
            addSug('bVImaj7', 'Coltrane cycle step 2 (+Major 3rd, 8 semitones)', (chordKey + 8));
            addSug('V7', 'Coltrane cycle dominant turnaround');
            addSug('bIII', 'Coltrane cycle triad step 1', (chordKey + 4));
            addSug('bVI', 'Coltrane cycle triad step 2', (chordKey + 8));
            addSug('II7', 'Cosmic step 2 dominant', (chordKey + 2));
            addSug('IV7', 'Cosmic step 5 dominant', (chordKey + 5));
            addSug('bVIImaj7', 'Cosmic flat-VII major 7th', (chordKey + 10));
            addSug('V7/bIII', 'Cosmic dominant of step 1', (chordKey + 11));
            addSug('V7/bVI', 'Cosmic dominant of step 2', (chordKey + 3));
            addSug('vii°7', 'Cosmic cosmic diminished leading tone');
            break;
        case 'soulful':
            addSug('I#°', 'Soulful passing diminished chord');
            addSug('ii11', 'Warm minor 11th chord');
            addSug('iv7', 'Soulful minor 7th on the iv');
            addSug('V7alt', 'Tense dominant 7th with altered extensions');
            addSug('Imaj7', 'Warm major 7th');
            addSug('vi9', 'Warm minor 9th submediant');
            addSug('ii9', 'Warm minor 9th supertonic');
            addSug('V9sus4', 'Soulful suspended 9th');
            addSug('Imaj9', 'Warm tonic major 9th');
            addSug('IVmaj9', 'Warm subdominant major 9th');
            addSug('bVII7', 'Soulful flat-VII dominant 7th');
            addSug('Iadd9', 'Warm add9 triad');
            break;
        case 'exotic':
            addSug('bII', 'Heavy flat-II modal major');
            addSug('vii7', 'Leading tone minor 7th');
            addSug('bV', 'Tritone-related major bV');
            addSug('#IV7', 'Lydian dominant 7th');
            addSug('vii°', 'Diminished leading tone triad');
            addSug('bIImaj7', 'Exotic flat-II major 7th');
            break;
        case 'tension':
            addSug('V7', 'Strong dominant seventh');
            addSug('vii°7', 'Fully diminished seventh');
            addSug('I7b9', 'Altered dominant flat-9');
            addSug('vii°/V', 'Diminished vii° of V', (chordKey + 7));
            addSug('V/V', 'Secondary dominant V of V', (chordKey + 7));
            addSug('V/vi', 'Secondary dominant V of vi', (chordKey + 9));
            break;
        case 'dreamy':
            addSug('Imaj7#11', 'Lydian sharp-11 major 7th');
            addSug('Imaj9', 'Lush tonic major 9th');
            addSug('vi9', 'Soft submediant minor 9th');
            addSug('ii11', 'Open supertonic minor 11th');
            addSug('bVImaj7#11', 'Dreamy Lydian sharp-11 on flat-VI');
            addSug('IVmaj9', 'Soft subdominant major 9th');
            break;
        case 'hopeful':
            addSug('IV', 'Subdominant major IV');
            addSug('V', 'Dominant major V');
            addSug('Iadd9', 'Warm tonic add9');
            addSug('vi7', 'Tender minor 7th submediant');
            addSug('IVmaj7', 'Bright major 7th subdominant');
            addSug('Imaj7', 'Warm tonic major 7th');
            break;
        case 'cyberpunk':
            addSug('i', 'Dark tonic minor');
            addSug('bII', 'Phrygian flat-II major');
            addSug('vii7', 'Leading tone minor 7th');
            addSug('v°', 'Dissonant diminished minor v');
            addSug('bV', 'Industrial tritone major bV');
            addSug('i7', 'Aeolian tonic minor 7th');
            break;
        case 'alien':
            addSug('bVmaj7', 'Unearthly tritone major 7th');
            addSug('I7b5', 'Whole-tone flat-5 dominant');
            addSug('iii7b5', 'Floaty leading tone minor 7 flat 5');
            addSug('bIImaj7#11', 'Unearthly flat-II sharp-11');
            addSug('bVImaj7#11', 'Floaty Lydian sharp-11 on flat-VI');
            addSug('#I°7', 'Dissonant chromatic diminished');
            break;
        case 'neutral':
            addSug('I', 'Stable tonic triad');
            addSug('IV', 'Balanced subdominant triad');
            addSug('V', 'Balanced dominant triad');
            addSug('vi', 'Balanced relative minor triad');
            addSug('ii', 'Balanced minor supertonic triad');
            addSug('iii', 'Balanced minor mediant triad');
            break;
        case 'spectral':
            addSug('Imaj7#11', 'Spectral Lydian sharp 11');
            addSug('II9', 'Spectral Lydian dominant 9th');
            addSug('V7b5', 'Whole-tone flat-5 dominant');
            addSug('Imaj9#11', 'Floaty major 9 sharp 11');
            addSug('IVmaj7#11', 'Glimmering Lydian subdominant');
            addSug('Vsus4#11', 'Glimmering sharp 11 dominant');
            break;
    }

    return suggestions;
}

export function getModulationLabel(fromKey, toKey) {
    const diff = (toKey - fromKey + 12) % 12;
    switch (diff) {
        case 0:
            return "(Tonic / Home)";
        case 7:
            return "🌅 Brightening (+5th)";
        case 5:
            return "🍃 Softening (-5th)";
        case 4:
            return "🚀 Transcendence (+Maj 3rd)";
        case 3:
            return "🌌 Introspection (+Min 3rd)";
        case 1:
            return "⚡ Climactic Surge (+1s)";
        case 11:
            return "🌧 Melancholic Fall (-1s)";
        case 6:
            return "🌪 Tritone Pivot (Dramatic)";
        case 2:
            return "📈 Ascending Step (+2s)";
        case 10:
            return "📉 Descending Step (-2s)";
        case 8:
            return "✨ Symmetrical Lift (+8s)";
        case 9:
            return "🪐 Cosmic Rotation (+9s)";
        default:
            return "";
    }
}