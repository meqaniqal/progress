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

export function getChordNotes(symbolOrChord, baseKey, divisions = 12, customTuning = null, skipCustomLookup = false) {
    if (symbolOrChord && typeof symbolOrChord === 'object') {
        if (symbolOrChord.customNotes && symbolOrChord.customNotes.length > 0) {
            const customNotes = symbolOrChord.customNotes;
            const isLegacy = typeof customNotes[0] === 'number';
            if (isLegacy) {
                return customNotes;
            }
            const chordDivisions = symbolOrChord.divisions || divisions;
            const tuning = getEffectiveTuning(symbolOrChord.symbol, chordDivisions, customTuning);
            const isNativelyMicrotonal = symbolOrChord.divisions !== undefined && tuning && Math.abs(tuning.periodSize - 12.0) > 0.01;
            if (isNativelyMicrotonal) {
                return customNotes.map(n => n.pitch);
            }
            const chordKey = symbolOrChord.key !== undefined ? symbolOrChord.key : baseKey;
            const computedNotes = getChordNotes(symbolOrChord.symbol, chordKey, chordDivisions, customTuning, true);
            return customNotes.map((noteObj, i) => {
                if (noteObj.isMicrotonal) {
                    return noteObj.pitch;
                }
                return computedNotes && computedNotes[i] !== undefined ? computedNotes[i] : noteObj.pitch;
            });
        }
        return getChordNotes(symbolOrChord.symbol, symbolOrChord.key !== undefined ? symbolOrChord.key : baseKey, symbolOrChord.divisions || divisions, customTuning, skipCustomLookup);
    }
    let symbol = symbolOrChord;
    if (!symbol || typeof symbol !== 'string') return null;
    symbol = symbol.replace(/[+-]+$/, '');

    if (!skipCustomLookup && typeof window !== 'undefined' && window.__customChords) {
        const found = window.__customChords.find(c => c.symbol === symbol);
        if (found) return getChordNotes(found, baseKey, divisions, customTuning, true);
    }

    const tuning = getEffectiveTuning(symbol, divisions, customTuning);
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
        if (tuning.custom) {
            if (tuning.type === 'tun' && tuning.map) {
                const stdMidi = baseKey + interval;
                const tuned = tuning.map[stdMidi];
                return tuned !== null && tuned !== undefined ? tuned : stdMidi;
            } else if (tuning.type === 'scl' && tuning.offsets) {
                const N = tuning.divisions;
                const absoluteSemitones = (baseKey - 60) + interval;
                const scaleDegree = Math.round(absoluteSemitones * (N / tuning.periodSize));
                const periodShift = Math.floor(scaleDegree / N) * tuning.periodSize;
                const degreeInPeriod = ((scaleDegree % N) + N) % N;
                const pitchOffset = tuning.offsets[degreeInPeriod] + periodShift;
                return 60 + pitchOffset;
            }
        }
        
        if (tuning.pitches) {
            const absoluteSemitones = (baseKey - 60) + interval;
            const step12 = Math.round(absoluteSemitones);
            const octave = Math.floor(step12 / 12);
            const pc = ((step12 % 12) + 12) % 12;
            return 60 + octave * 12.0 + tuning.pitches[pc];
        }

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
    const cleanSymbol = chordSymbol.replace(/[+-]+$/, '');
    const microMatch = cleanSymbol.match(/^([A-Z0-9]+)([A-Z][a-zA-Z]+)(\d+)/);
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

import { getPlayableNotes, applyVoiceLeading, optimizeVoicing, applyInversion, generateInversions, calculateDistance } from './voiceLeading.js';
export { getPlayableNotes, applyVoiceLeading, optimizeVoicing, applyInversion, generateInversions, calculateDistance };


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
export function getEffectiveTuning(chordSymbol, globalDivisions = 12, customTuning = null) {
    let custom = customTuning;
    if (!custom) {
        if (typeof window !== 'undefined' && window.__customTuning) {
            custom = window.__customTuning;
        } else {
            // Dynamically check store if available or if state is imported
            try {
                // Since state is imported or can be imported, let's use the state object if we can.
                // But wait, theory.js doesn't import store.js. Let's see if we can get it from window or if we import it.
                // To avoid circular dependency, we can check window.__customTuning or a global variable.
                // Let's also check if we can store state.customTuning on window.__customTuning reliably.
                custom = typeof window !== 'undefined' ? window.__customTuning : null;
            } catch (e) {}
        }
    }
    if (custom) {
        return { divisions: custom.divisions, periodSize: custom.periodSize, custom: true, ...custom };
    }
    if (typeof globalDivisions === 'string') {
        const nativeTuning = MICRO_TUNINGS[globalDivisions.toUpperCase()];
        if (nativeTuning) {
            return { divisions: nativeTuning.divisions, periodSize: nativeTuning.periodSize, pitches: nativeTuning.pitches };
        }
    }
    if (chordSymbol) {
        const cleanSymbol = chordSymbol.replace(/[+-]+$/, '');
        const match = cleanSymbol.match(/^([A-Z0-9]+)([A-Z][a-zA-Z]+)(\d+)/);
        if (match) {
            const tuningKey = match[1].toUpperCase();
            const nativeTuning = MICRO_TUNINGS[tuningKey];
            if (nativeTuning) {
                return { divisions: nativeTuning.divisions, periodSize: nativeTuning.periodSize, pitches: nativeTuning.pitches };
            }
        }
    }
    let periodSize = 12.0;
    if (globalDivisions === 13) periodSize = 12 * Math.log2(3); // Global BP Fallback
    else if (globalDivisions === 5) periodSize = 12.0;
    else if (globalDivisions !== 12 && typeof globalDivisions !== 'string') {
        // Find if global divisions corresponds to one of the microtunings directly
        const matched = Object.values(MICRO_TUNINGS).find(t => t.divisions === globalDivisions);
        if (matched) {
            return { divisions: matched.divisions, periodSize: matched.periodSize, pitches: matched.pitches };
        }
    }
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
        
    if (tuning.custom) {
        if (tuning.type === 'tun' && tuning.map) {
            let bestNote = Math.round(floatPitch);
            let minDiff = Infinity;
            for (let i = 0; i < 128; i++) {
                if (tuning.map[i] !== null) {
                    const diff = Math.abs(floatPitch - tuning.map[i]);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestNote = tuning.map[i];
                    }
                }
            }
            return bestNote;
        } else if (tuning.type === 'scl' && tuning.offsets) {
            const N = tuning.divisions;
            const relative = floatPitch - 60;
            const periodShift = Math.floor(relative / tuning.periodSize) * tuning.periodSize;
            const pc = ((relative % tuning.periodSize) + tuning.periodSize) % tuning.periodSize;
            let minDiff = Infinity;
            let bestOffset = 0;
            for (let offset of tuning.offsets) {
                const diff = Math.abs(pc - offset);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestOffset = offset;
                }
            }
            return 60 + periodShift + bestOffset;
        }
    }
    
    if (tuning.pitches) {
        const relative = floatPitch - 60;
        const octave = Math.floor(relative / 12.0);
        const pc = ((relative % 12.0) + 12.0) % 12.0;
        let minDiff = Infinity;
        let bestOffset = 0;
        for (let offset of tuning.pitches) {
            const diff = Math.abs(pc - offset);
            if (diff < minDiff) {
                minDiff = diff;
                bestOffset = offset;
            }
        }
        return 60 + octave * 12.0 + bestOffset;
    }
        
    if (tuning.divisions === 12) {
        const dev = Math.abs(floatPitch - Math.round(floatPitch));
        if (dev > 0.01) {
            return floatPitch;
        }
        return Math.round(floatPitch);
    }
    
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

export {
    HAND_CURATED_CATEGORIES,
    getProceduralCategory,
    getCategoryIndex,
    getDynamicProgSuggestions
} from './progressionSuggestions.js';

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

export function parseScl(content) {
    const lines = content.split('\n').map(l => l.trim());
    const cleanLines = [];
    for (let line of lines) {
        if (line.startsWith('!')) continue;
        const idxOfComment = line.indexOf('!');
        if (idxOfComment !== -1) {
            line = line.substring(0, idxOfComment).trim();
        }
        if (line.length > 0) {
            cleanLines.push(line);
        }
    }
    
    if (cleanLines.length < 2) return null;
    
    const name = cleanLines[0];
    const noteCount = parseInt(cleanLines[1], 10);
    const offsets = [0.0];
    
    for (let i = 2; i < 2 + noteCount; i++) {
        if (!cleanLines[i]) break;
        const valStr = cleanLines[i];
        if (valStr.includes('.')) {
            offsets.push(parseFloat(valStr) / 100.0);
        } else if (valStr.includes('/')) {
            const parts = valStr.split('/');
            const num = parseFloat(parts[0]);
            const den = parseFloat(parts[1]);
            if (den !== 0) {
                offsets.push(12.0 * Math.log2(num / den));
            }
        } else {
            const val = parseFloat(valStr);
            if (val < 100) {
                offsets.push(12.0 * Math.log2(val));
            } else {
                offsets.push(val / 100.0);
            }
        }
    }
    
    const periodSize = offsets[offsets.length - 1];
    
    return {
        name,
        type: 'scl',
        offsets,
        periodSize,
        divisions: noteCount
    };
}

export function parseTun(content) {
    const lines = content.split('\n');
    let inTuningSection = false;
    const tuningMap = new Array(128).fill(null);
    let name = "Custom .tun Scale";
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith(';') || line.startsWith('#')) continue;
        
        if (line.toLowerCase().startsWith('[tuning]') || line.toLowerCase().startsWith('[scale]')) {
            inTuningSection = true;
            continue;
        } else if (line.startsWith('[')) {
            inTuningSection = false;
        }
        
        if (line.toLowerCase().startsWith('name') && line.includes('=')) {
            name = line.split('=')[1].trim().replace(/"/g, '');
        }
        
        if (inTuningSection) {
            const match = line.match(/^note\s+(\d+)\s*=\s*([\d\.\-]+)/i);
            if (match) {
                const midiNote = parseInt(match[1], 10);
                const freq = parseFloat(match[2]);
                if (midiNote >= 0 && midiNote < 128 && freq > 0) {
                    const midiVal = 69 + 12 * Math.log2(freq / 440.0);
                    tuningMap[midiNote] = midiVal;
                }
            }
        }
    }
    
    const parsedNotesCount = tuningMap.filter(n => n !== null).length;
    if (parsedNotesCount === 0) return null;
    
    return {
        name,
        type: 'tun',
        map: tuningMap
    };
}