/**
 * Microtonal Suggestions Module
 * Continuous float-based (cents) harmonic substitutions and turnarounds.
 * Uses Least Squares Distance math to calculate closest harmonic replacements
 * and modulations across different tuning systems.
 */

/**
 * Minimal chord intervals for microtonal suggestions.
 * Inlined to avoid circular dependency with theory.js.
 */
const CHORD_INTERVALS = {
    '': [0], '5': [0, 7], 'I': [0, 4, 7], 'maj': [0, 4, 7], 'major': [0, 4, 7],
    'm': [0, 3, 7], 'min': [0, 3, 7], 'minor': [0, 3, 7], 'dim': [0, 3, 6], '°': [0, 3, 6],
    'aug': [0, 4, 8], 'add9': [0, 4, 7, 14], 'add2': [0, 4, 7, 14], 'add4': [0, 4, 5, 7],
    'sus2': [0, 2, 7], 'sus4': [0, 5, 7], '7': [0, 4, 7, 10], 'dom': [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], 'm7': [0, 3, 7, 10], 'dim7': [0, 3, 6, 9],
    '°7': [0, 3, 6, 9], 'm7b5': [0, 3, 6, 10], 'halfDim': [0, 3, 6, 10], '6': [0, 4, 7, 9],
    'min6': [0, 3, 7, 9], 'm6': [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14],
    '11': [0, 4, 5, 7, 10, 17], 'maj11': [0, 4, 5, 7, 11, 17], '13': [0, 4, 7, 10, 14, 17, 21],
    'maj13': [0, 4, 7, 11, 14, 17, 21], '7#9': [0, 4, 7, 10, 15], '7b13': [0, 4, 7, 10, 20],
    '7alt': [0, 4, 7, 10, 15, 20], '7#5': [0, 4, 8, 10], '7b9': [0, 4, 7, 10, 13],
    '7#11': [0, 4, 7, 10, 17], '7b5': [0, 4, 6, 10], '6/9': [0, 4, 7, 9, 14],
    'sus4#11': [0, 5, 7, 17], 'sus2#11': [0, 2, 7, 17], 'sus4add9': [0, 5, 7, 14],
    'add11': [0, 4, 5, 7, 17], 'add#5': [0, 4, 8, 7], 'addb5': [0, 4, 6, 7],
    'add#9': [0, 4, 7, 15], 'add#11': [0, 4, 7, 17], 'addb5#11': [0, 4, 6, 7, 17],
    '5add9': [0, 7, 14], '5add11': [0, 7, 17],
};

/**
 * Minimal scale definitions for microtonal suggestions.
 * Inlined to avoid circular dependency with theory.js.
 */
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
};

import { getMicrotonalChord, getMicrotonalDiatonicChords, MICRO_TUNINGS } from './microtonalDictionary.js';

/**
 * Returns chords that share a similar harmonic function for contextual swapping
 * within a microtonal tuning system. Uses cents-based distance calculation.
 *
 * @param {string} chordSymbol - The chord symbol (e.g., 'BPLambda1')
 * @param {number} baseKey - Base MIDI key (default 60 = C4)
 * @param {string} mode - The microtonal mode (e.g., 'bpLambda')
 * @returns {Array<{symbol: string, score: number}>} Scored alternative chords
 */
export function getMicrotonalAlternatives(chordSymbol, baseKey = 60, mode = 'major') {
    const microDiatonic = getMicrotonalDiatonicChords(mode);
    if (!microDiatonic) return [];

    const tuningInfo = _parseMicrotonalMode(mode);
    if (!tuningInfo) return [];

    const sourceNotes = getMicrotonalChord(chordSymbol, baseKey, mode);
    if (!sourceNotes) return [];

    // Calculate source pitch class set in cents relative to baseKey
    const sourceCents = sourceNotes.map(n => (n - baseKey) * 100);

    const candidates = [];

    // Score all diatonic chords by shared cents-distance
    for (const targetSymbol of microDiatonic) {
        if (targetSymbol === chordSymbol) continue;

        const targetNotes = getMicrotonalChord(targetSymbol, baseKey, mode);
        if (!targetNotes) continue;

        const targetCents = targetNotes.map(n => (n - baseKey) * 100);

        // Calculate shared tone count (notes within 50 cents = same pitch class)
        let sharedTones = 0;
        for (const srcCent of sourceCents) {
            const closestTarget = Math.min(...targetCents.map(tc => Math.abs(tc - srcCent)));
            if (closestTarget < 50) {
                sharedTones++;
            }
        }

        // Calculate total Least Squares Distance
        const lsd = _calculateLeastSquaresDistance(sourceCents, targetCents);

        // Score: more shared tones = better, lower LSD = better
        const score = sharedTones * 10 - lsd;

        candidates.push({
            symbol: targetSymbol,
            score: score
        });
    }

    // Also score traditional chords mapped into the microtonal space
    const traditionalCandidates = Object.keys(CHORD_INTERVALS);
    for (const tradSymbol of traditionalCandidates) {
        if (microDiatonic.includes(tradSymbol)) continue; // Already scored above

        // Map traditional chord into microtonal space by finding closest diatonic match
        const targetNotes = _getStandardChordNotes(tradSymbol, baseKey);
        if (!targetNotes) continue;

        // Find closest diatonic chord by distance
        let closestDiatonic = null;
        let closestDist = Infinity;
        for (const diatonicSymbol of microDiatonic) {
            const diatonicNotes = getMicrotonalChord(diatonicSymbol, baseKey, mode);
            if (!diatonicNotes) continue;
            const dist = _simpleDistance(targetNotes, diatonicNotes);
            if (dist < closestDist) {
                closestDist = dist;
                closestDiatonic = diatonicSymbol;
            }
        }

        if (closestDiatonic) {
            const targetNotes = getMicrotonalChord(closestDiatonic, baseKey, mode);
            const targetCents = targetNotes.map(n => (n - baseKey) * 100);
            const lsd = _calculateLeastSquaresDistance(sourceCents, targetCents);

            // Lower score for non-diatonic traditional chords
            candidates.push({
                symbol: tradSymbol,
                score: 1 - lsd * 0.1
            });
        }
    }

    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map(alt => alt.symbol);
}

/**
 * Get standard 12-EDO chord notes using inlined CHORD_INTERVALS.
 *
 * @param {string} symbol - Chord symbol
 * @param {number} baseKey - Base MIDI key
 * @returns {number[] | null} Chord pitches or null
 * @private
 */
function _getStandardChordNotes(symbol, baseKey) {
    const rootMatch = symbol.match(/^([A-G][#b]?)(.*)/);
    if (!rootMatch) return null;

    const rootName = rootMatch[1];
    const suffix = rootMatch[2];

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let rootMidi = null;
    for (let i = 0; i < 12; i++) {
        if (noteNames[i] === rootName) {
            const baseNoteIndex = (baseKey - 60) % 12;
            rootMidi = baseKey + (i - baseNoteIndex);
            break;
        }
    }
    if (rootMidi === null) return null;

    const intervals = CHORD_INTERVALS[suffix] || CHORD_INTERVALS[suffix.replace(/maj/, '')] || [0];
    return intervals.map(interval => rootMidi + interval);
}

/**
 * Simple distance calculation between two chord pitch sets.
 *
 * @param {number[]} chordA - First chord pitches
 * @param {number[]} chordB - Second chord pitches
 * @returns {number} Total absolute distance
 * @private
 */
function _simpleDistance(chordA, chordB) {
    const sortedA = [...chordA].sort((a, b) => a - b);
    const sortedB = [...chordB].sort((a, b) => a - b);
    const minLen = Math.min(sortedA.length, sortedB.length);
    let dist = 0;
    for (let i = 0; i < minLen; i++) {
        dist += Math.abs(sortedA[i] - sortedB[i]);
    }
    return dist;
}

/**
 * Returns chords that strongly lead into the given target chord
 * within a microtonal tuning system. Uses cents-based voice leading distance.
 *
 * @param {string} targetSymbol - The target chord symbol (e.g., 'BPLambda1')
 * @param {number} baseKey - Base MIDI key (default 60 = C4)
 * @param {string} mode - The microtonal mode (e.g., 'bpLambda')
 * @returns {string[]} Array of turnaround chord symbols
 */
export function getMicrotonalTurnarounds(targetSymbol, baseKey = 60, mode = 'major') {
    const microDiatonic = getMicrotonalDiatonicChords(mode);
    if (!microDiatonic) return [];

    const tuningInfo = _parseMicrotonalMode(mode);
    if (!tuningInfo) return [];

    const targetNotes = getMicrotonalChord(targetSymbol, baseKey, mode);
    if (!targetNotes) return [];

    const targetCents = targetNotes.map(n => (n - baseKey) * 100);

    const candidates = [];

    // Score all diatonic chords by voice leading distance to target
    for (const candidateSymbol of microDiatonic) {
        if (candidateSymbol === targetSymbol) continue;

        const candidateNotes = getMicrotonalChord(candidateSymbol, baseKey, mode);
        if (!candidateNotes) continue;

        const candidateCents = candidateNotes.map(n => (n - baseKey) * 100);

        // Calculate voice leading distance in cents
        const vlDistance = _calculateLeastSquaresDistance(candidateCents, targetCents);

        // Calculate chord tension (dissonance) of the candidate
        const tension = _calculateMicrotonalTension(candidateCents);

        // Score: maximize tension (suspense), minimize voice leading distance
        const score = (tension * 20) - vlDistance;

        candidates.push({
            symbol: candidateSymbol,
            score: score
        });
    }

    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => c.symbol);
}

/**
 * Parse a microtonal mode string into its tuning components.
 * @param {string} mode - Mode string (e.g., 'bpLambda')
 * @returns {Object|null} Parsed tuning info or null
 * @private
 */
function _parseMicrotonalMode(mode) {
    if (!mode) return null;
    const match = mode.match(/^([a-z0-9]+)([A-Z][a-zA-Z]*)$/);
    if (!match) return null;

    const tuningKey = match[1].toUpperCase();
    const scaleName = match[2];

    const tuning = MICRO_TUNINGS[tuningKey];
    if (!tuning || !tuning.scales[scaleName]) return null;

    return {
        tuningKey,
        scaleName,
        tuning
    };
}

/**
 * Calculate Least Squares Distance between two sets of pitch values (in cents).
 * Matches pitches optimally by sorting and pairing.
 *
 * @param {number[]} centsA - First set of pitches in cents
 * @param {number[]} centsB - Second set of pitches in cents
 * @returns {number} Total squared distance
 * @private
 */
function _calculateLeastSquaresDistance(centsA, centsB) {
    if (centsA.length === 0 || centsB.length === 0) return Infinity;

    const sortedA = [...centsA].sort((a, b) => a - b);
    const sortedB = [...centsB].sort((a, b) => a - b);

    // Match notes by sorted order (optimal for voice leading)
    const minLen = Math.min(sortedA.length, sortedB.length);
    let totalDistance = 0;

    for (let i = 0; i < minLen; i++) {
        const diff = sortedA[i] - sortedB[i];
        totalDistance += diff * diff;
    }

    return totalDistance;
}

/**
 * Calculate the tension (dissonance) of a set of pitch values in cents.
 * Higher tension = more dissonant intervals.
 *
 * @param {number[]} cents - Pitches in cents
 * @returns {number} Tension value (0.0-1.0)
 * @private
 */
function _calculateMicrotonalTension(cents) {
    if (cents.length < 2) return 0;

    let totalTension = 0;
    let intervalCount = 0;

    for (let i = 0; i < cents.length; i++) {
        for (let j = i + 1; j < cents.length; j++) {
            const interval = Math.abs(cents[i] - cents[j]);
            // Dissonance peaks at tritone (~1800 cents) and minor second (~100 cents)
            const tritoneDistance = Math.abs(interval - 1800);
            const minorSecondDistance = Math.abs(interval - 100);
            const majorSecondDistance = Math.abs(interval - 200);

            // High tension for dissonant intervals
            const dissonance = Math.min(1, (minorSecondDistance + majorSecondDistance) / 200);
            totalTension += dissonance;
            intervalCount++;
        }
    }

    return intervalCount > 0 ? totalTension / intervalCount : 0;
}

export default {
    getMicrotonalAlternatives,
    getMicrotonalTurnarounds
};
