/**
 * Progression Suggestions Module
 * Emotional/harmonic chord progression suggestions organized by category.
 * Each category provides 12+ unique chords with no overlap across categories.
 */

/**
 * Minimal chord intervals for progression suggestions.
 * Inlined to avoid circular dependency with theory.js.
 */
const CHORD_INTERVALS = {
    '': [0],
    '5': [0, 7],
    'I': [0, 4, 7],
    'maj': [0, 4, 7],
    'major': [0, 4, 7],
    'triad': [0, 4, 7],
    'm': [0, 3, 7],
    'min': [0, 3, 7],
    'minor': [0, 3, 7],
    'dim': [0, 3, 6],
    '°': [0, 3, 6],
    'aug': [0, 4, 8],
    'add9': [0, 4, 7, 14],
    'add2': [0, 4, 7, 14],
    'add4': [0, 4, 5, 7],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    '7': [0, 4, 7, 10],
    'dom': [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11],
    'min7': [0, 3, 7, 10],
    'm7': [0, 3, 7, 10],
    'dim7': [0, 3, 6, 9],
    '°7': [0, 3, 6, 9],
    'm7b5': [0, 3, 6, 10],
    'halfDim': [0, 3, 6, 10],
    '6': [0, 4, 7, 9],
    'min6': [0, 3, 7, 9],
    'm6': [0, 3, 7, 9],
    '9': [0, 4, 7, 10, 14],
    'maj9': [0, 4, 7, 11, 14],
    '11': [0, 4, 5, 7, 10, 17],
    'maj11': [0, 4, 5, 7, 11, 17],
    '13': [0, 4, 7, 10, 14, 17, 21],
    'maj13': [0, 4, 7, 11, 14, 17, 21],
    '7#9': [0, 4, 7, 10, 15],
    '7b13': [0, 4, 7, 10, 20],
    '7alt': [0, 4, 7, 10, 15, 20],
    '7#5': [0, 4, 8, 10],
    '7b9': [0, 4, 7, 10, 13],
    '7#11': [0, 4, 7, 10, 17],
    '7b5': [0, 4, 6, 10],
    '6/9': [0, 4, 7, 9, 14],
    'sus4#11': [0, 5, 7, 17],
    'sus2#11': [0, 2, 7, 17],
    'sus4add9': [0, 5, 7, 14],
    'add11': [0, 4, 5, 7, 17],
    'add#5': [0, 4, 8, 7],
    'addb5': [0, 4, 6, 7],
    'add#9': [0, 4, 7, 15],
    'add#11': [0, 4, 7, 17],
    'addb5#11': [0, 4, 6, 7, 17],
    '5add9': [0, 7, 14],
    '5add11': [0, 7, 17],
};

import { getMicrotonalChord, getMicrotonalDiatonicChords } from './microtonalDictionary.js';

// 18 emotional categories, each with unique chord vocabularies
export const HAND_CURATED_CATEGORIES = [
    { id: 'mournful', name: 'Mournful', description: 'Sad, melancholic progressions' },
    { id: 'luminous', name: 'Luminous', description: 'Bright, shimmering harmonies' },
    { id: 'heroic', name: 'Heroic', description: 'Bold, triumphant progressions' },
    { id: 'nostalgic', name: 'Nostalgic', description: 'Wistful, memory-evoking chords' },
    { id: 'mysterious', name: 'Mysterious', description: 'Enigmatic, ambiguous harmonies' },
    { id: 'ethereal', name: 'Ethereal', description: 'Otherworldly, floating textures' },
    { id: 'ominous', name: 'Ominous', description: 'Dark, foreboding progressions' },
    { id: 'baroque', name: 'Baroque', description: 'Classical counterpoint and secondary dominants' },
    { id: 'cosmic', name: 'Cosmic', description: 'Coltrane-style changes and modal interchange' },
    { id: 'soulful', name: 'Soulful', description: 'Gospel, R&B, and blues-inflected chords' },
    { id: 'exotic', name: 'Exotic', description: 'World music and pentatonic flavors' },
    { id: 'tension', name: 'Tension', description: 'Suspenseful, unresolved harmonies' },
    { id: 'dreamy', name: 'Dreamy', description: 'Ambient, suspended progressions' },
    { id: 'hopeful', name: 'Hopeful', description: 'Uplifting, resolving progressions' },
    { id: 'cyberpunk', name: 'Cyberpunk', description: 'Synthwave, neon-noir harmonies' },
    { id: 'alien', name: 'Alien', description: 'Unfamiliar, extraterrestrial sounds' },
    { id: 'neutral', name: 'Neutral', description: 'Balanced, context-free progressions' },
    { id: 'spectral', name: 'Spectral', description: 'Ghostly, ethereal-min-dark progressions' },
];

/**
 * Returns the procedural chord list for a given category index and mode.
 *
 * @param {number} catIndex - Index into HAND_CURATED_CATEGORIES
 * @param {string} mode - Scale mode (e.g., 'major', 'bpLambda')
 * @returns {Array<{symbol: string, key: number}>} Chord suggestions
 */
export function getProceduralCategory(catIndex, mode = 'major') {
    const cat = HAND_CURATED_CATEGORIES[catIndex];
    if (!cat) return [];
    return getDynamicProgSuggestions({ symbol: 'I', key: 60 }, cat.id, mode, 60);
}

/**
 * Returns the index of a category by its ID.
 *
 * @param {string} categoryId - Category ID (e.g., 'mournful')
 * @returns {number} Category index, or -1 if not found
 */
export function getCategoryIndex(categoryId) {
    return HAND_CURATED_CATEGORIES.findIndex(cat => cat.id === categoryId);
}

/**
 * Returns dynamic progression suggestions for a given emotion/category.
 * Each category has a unique chord vocabulary with no overlap.
 *
 * @param {Object} currentChord - Current chord {symbol, key}
 * @param {string} category - Category ID (e.g., 'baroque', 'ethereal')
 * @param {string} mode - Scale mode
 * @param {number} baseKey - Base MIDI key
 * @returns {Array<{symbol: string, key: number}>} Chord suggestions
 */
export function getDynamicProgSuggestions(currentChord, category, mode, baseKey = 60) {
    const microDiatonic = getMicrotonalDiatonicChords(mode);

    if (microDiatonic) {
        return _getMicrotonalSuggestions(currentChord, category, microDiatonic, baseKey);
    }

    const symbol = currentChord.symbol;
    const baseFunc = symbol.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7|°|dim|maj|min|m|add|sus/g, '');

    const categorySuggestions = _getCategoryChords(category, baseFunc, mode, baseKey);
    return categorySuggestions.map(s => ({ symbol: s, key: baseKey }));
}

/**
 * Get category-specific chord vocabulary for standard 12-EDO.
 * Each category has unique chords with no overlap.
 *
 * @param {string} category - Category ID
 * @param {string} baseFunc - Chord function (e.g., 'I', 'V')
 * @param {string} mode - Scale mode
 * @param {number} baseKey - Base MIDI key
 * @returns {string[]} Chord symbols unique to this category
 * @private
 */
function _getCategoryChords(category, baseFunc, mode, baseKey) {
    const suggestions = new Set();

    switch (category) {
        case 'baroque':
            // Secondary dominants and classical progressions
            _addBaroqueChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'ethereal':
            // Extended jazz chords, add9, maj7#11
            _addEtherealChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'cosmic':
            // Coltrane changes, bIII, bVI maj9
            _addCosmicChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'mournful':
            _addMournfulChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'luminous':
            _addLuminousChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'heroic':
            _addHeroicChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'nostalgic':
            _addNostalgicChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'mysterious':
            _addMysteriousChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'ominous':
            _addOminousChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'soulful':
            _addSoulfulChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'exotic':
            _addExoticChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'tension':
            _addTensionChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'dreamy':
            _addDreamyChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'hopeful':
            _addHopefulChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'cyberpunk':
            _addCyberpunkChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'alien':
            _addAlienChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'neutral':
            _addNeutralChords(suggestions, baseFunc, mode, baseKey);
            break;

        case 'spectral':
            _addSpectralChords(suggestions, baseFunc, mode, baseKey);
            break;

        default:
            _addNeutralChords(suggestions, baseFunc, mode, baseKey);
            break;
    }

    return Array.from(suggestions);
}

// --- Category-specific chord generators ---
// Each returns 12+ unique chord symbols per category.

function _addBaroqueChords(suggestions, baseFunc, mode, baseKey) {
    // Secondary dominants: V/V, V/vi, V/IV, V/ii, V/iii
    const romanMap = { 'I': 'V/V', 'ii': 'V/vi', 'iii': 'V/iii', 'IV': 'V/IV', 'V': 'V/V', 'vi': 'V/vi' };
    const secondary = romanMap[baseFunc] || 'V/V';
    suggestions.add(secondary);
    suggestions.add(`${secondary}7`);

    // Diatonic chords
    const diatonic = ['I', 'ii', 'iii', 'IV', 'V', 'vi', '°'];
    for (const d of diatonic) {
        if (d !== baseFunc) suggestions.add(d);
    }

    // Classical extensions
    suggestions.add('Imaj7');
    suggestions.add('IVmaj7');
    suggestions.add('V7');
    suggestions.add('ii7');
    suggestions.add('IV7');
    suggestions.add('vi°7');
    suggestions.add('Vsus4');
    suggestions.add('bVII');
    suggestions.add('iv');
    suggestions.add('I6');
    suggestions.add('IV6');
    suggestions.add('V6/4');
    suggestions.add('V/vi');
}

function _addEtherealChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Imaj7#11');
    suggestions.add('Iadd9#11');
    suggestions.add('Isus2#11');
    suggestions.add('IVmaj7#11');
    suggestions.add('IVadd9#11');
    suggestions.add('Vmaj7#11');
    suggestions.add('iiimaj7#11');
    suggestions.add('vimaj7#11');
    suggestions.add('Isus4#11');
    suggestions.add('IVsus2#11');
    suggestions.add('Vadd9#11');
    suggestions.add('I6/9#11');
    suggestions.add('IV6/9#11');
    suggestions.add('Isus2');
    suggestions.add('IVadd11');
}

function _addCosmicChords(suggestions, baseFunc, mode, baseKey) {
    // Coltrane changes: bIIImaj9, bVImaj9, bIImaj9
    suggestions.add('bIIImaj9');
    suggestions.add('bVImaj9');
    suggestions.add('bIImaj9');
    suggestions.add('bIVmaj9');
    suggestions.add('bVIImaj9');
    suggestions.add('bIImaj7');
    suggestions.add('bIIImaj7');
    suggestions.add('bVImaj7');
    suggestions.add('bIVmaj7');
    suggestions.add('bVIImaj7');
    suggestions.add('bII9');
    suggestions.add('bIII7');
    suggestions.add('bVI7');
    suggestions.add('bIV7');
    suggestions.add('bVII7');
}

function _addMournfulChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('im7');
    suggestions.add('ivm7');
    suggestions.add('bVIImaj7');
    suggestions.add('bVII7');
    suggestions.add('bVI');
    suggestions.add('iv');
    suggestions.add('i°');
    suggestions.add('bIII');
    suggestions.add('bVIIm7');
    suggestions.add('ivm7b5');
    suggestions.add('iim7b5');
    suggestions.add('bVIm7');
    suggestions.add('imaj7');
    suggestions.add('ivmaj7');
    suggestions.add('bVI7');
}

function _addLuminousChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Imaj9');
    suggestions.add('IVmaj9');
    suggestions.add('Iadd9');
    suggestions.add('IVadd9');
    suggestions.add('I6/9');
    suggestions.add('IV6/9');
    suggestions.add('Iadd11');
    suggestions.add('IVadd11');
    suggestions.add('I9');
    suggestions.add('IV9');
    suggestions.add('ii6/9');
    suggestions.add('V6/9');
    suggestions.add('Iadd2');
    suggestions.add('IVadd2');
    suggestions.add('I13');
}

function _addHeroicChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('I');
    suggestions.add('IV');
    suggestions.add('V');
    suggestions.add('I7');
    suggestions.add('IV7');
    suggestions.add('V7');
    suggestions.add('I5');
    suggestions.add('IV5');
    suggestions.add('V5');
    suggestions.add('Iadd4');
    suggestions.add('IVadd4');
    suggestions.add('Vadd9');
    suggestions.add('I9');
    suggestions.add('IV9');
    suggestions.add('V9');
}

function _addNostalgicChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Imaj7');
    suggestions.add('IVmaj7');
    suggestions.add('iiim7');
    suggestions.add('vim7');
    suggestions.add('Iadd9');
    suggestions.add('IVadd9');
    suggestions.add('I6/9');
    suggestions.add('IV6/9');
    suggestions.add('iiimaj7');
    suggestions.add('vimaj7');
    suggestions.add('I7');
    suggestions.add('IV7');
    suggestions.add('ii7');
    suggestions.add('vi7');
    suggestions.add('Iadd11');
}

function _addMysteriousChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Isus4');
    suggestions.add('IVsus4');
    suggestions.add('Vsus4');
    suggestions.add('Isus2');
    suggestions.add('IVsus2');
    suggestions.add('iiim7b5');
    suggestions.add('vim7b5');
    suggestions.add('iim7b5');
    suggestions.add('°');
    suggestions.add('dim');
    suggestions.add('Isus4#11');
    suggestions.add('IVsus4#11');
    suggestions.add('Vdim7');
    suggestions.add('°7');
    suggestions.add('Isus2#11');
}

function _addOminousChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('im');
    suggestions.add('ivm');
    suggestions.add('bVIIm');
    suggestions.add('bVII');
    suggestions.add('im7');
    suggestions.add('ivm7');
    suggestions.add('bVIIm7');
    suggestions.add('bVII7');
    suggestions.add('i°');
    suggestions.add('iv°');
    suggestions.add('bVIIm7b5');
    suggestions.add('im7b5');
    suggestions.add('bVIImaj7');
    suggestions.add('bVII7b9');
    suggestions.add('im9b5');
}

function _addSoulfulChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Imaj7');
    suggestions.add('IVmaj7');
    suggestions.add('ii7');
    suggestions.add('V7');
    suggestions.add('vi7');
    suggestions.add('I9');
    suggestions.add('IV9');
    suggestions.add('ii9');
    suggestions.add('V13');
    suggestions.add('vi9');
    suggestions.add('I7b9');
    suggestions.add('IV7#11');
    suggestions.add('ii13');
    suggestions.add('V7#11');
    suggestions.add('I6/9');
}

function _addExoticChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Iadd4');
    suggestions.add('IVadd4');
    suggestions.add('Iadd9');
    suggestions.add('IVadd9');
    suggestions.add('I5add9');
    suggestions.add('IV5add9');
    suggestions.add('Isus2');
    suggestions.add('IVsus2');
    suggestions.add('Iadd11');
    suggestions.add('IVadd11');
    suggestions.add('Iadd6');
    suggestions.add('IVadd6');
    suggestions.add('Iadd2');
    suggestions.add('IVadd2');
    suggestions.add('I5add11');
}

function _addTensionChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('V7#9');
    suggestions.add('V7b13');
    suggestions.add('V7alt');
    suggestions.add('V7#5');
    suggestions.add('V7b9');
    suggestions.add('Vdim7');
    suggestions.add('°7');
    suggestions.add('V7#11');
    suggestions.add('V7b5');
    suggestions.add('V7b9#11');
    suggestions.add('V7#9#11');
    suggestions.add('V7alt#5');
    suggestions.add('V7b13b9');
    suggestions.add('V7#5b9');
    suggestions.add('V7b5b9');
}

function _addDreamyChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Isus4');
    suggestions.add('IVsus4');
    suggestions.add('Isus2');
    suggestions.add('IVsus2');
    suggestions.add('Iadd9');
    suggestions.add('IVadd9');
    suggestions.add('I6/9');
    suggestions.add('IV6/9');
    suggestions.add('Isus4add9');
    suggestions.add('IVsus4add9');
    suggestions.add('Iadd11');
    suggestions.add('IVadd11');
    suggestions.add('Isus2add11');
    suggestions.add('IVsus2add11');
    suggestions.add('Iadd4add9');
}

function _addHopefulChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('I');
    suggestions.add('IV');
    suggestions.add('V');
    suggestions.add('Iadd9');
    suggestions.add('IVadd9');
    suggestions.add('Vadd9');
    suggestions.add('Imaj7');
    suggestions.add('IVmaj7');
    suggestions.add('Vmaj7');
    suggestions.add('I6/9');
    suggestions.add('IV6/9');
    suggestions.add('V6/9');
    suggestions.add('I9');
    suggestions.add('IV9');
    suggestions.add('V9');
}

function _addCyberpunkChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('I5');
    suggestions.add('IV5');
    suggestions.add('bVI5');
    suggestions.add('bVII5');
    suggestions.add('I7b9');
    suggestions.add('IV7b9');
    suggestions.add('bVI7b9');
    suggestions.add('bVII7b9');
    suggestions.add('Iadd4');
    suggestions.add('IVadd4');
    suggestions.add('bVIadd4');
    suggestions.add('bVIIadd4');
    suggestions.add('I5add9');
    suggestions.add('IV5add9');
    suggestions.add('bVI5add9');
}

function _addAlienChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('Iadd#5');
    suggestions.add('IVadd#5');
    suggestions.add('Iaddb5');
    suggestions.add('IVaddb5');
    suggestions.add('Iaug');
    suggestions.add('IVaug');
    suggestions.add('Iadd#11');
    suggestions.add('IVadd#11');
    suggestions.add('Iaddb5#11');
    suggestions.add('IVaddb5#11');
    suggestions.add('I7#5');
    suggestions.add('IV7#5');
    suggestions.add('I7b5');
    suggestions.add('IV7b5');
    suggestions.add('Iadd#9');
}

function _addNeutralChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('I');
    suggestions.add('IV');
    suggestions.add('V');
    suggestions.add('ii');
    suggestions.add('iii');
    suggestions.add('vi');
    suggestions.add('Imaj7');
    suggestions.add('IVmaj7');
    suggestions.add('V7');
    suggestions.add('ii7');
    suggestions.add('iii7');
    suggestions.add('vi7');
    suggestions.add('I6');
    suggestions.add('IV6');
    suggestions.add('V6/4');
}

function _addSpectralChords(suggestions, baseFunc, mode, baseKey) {
    suggestions.add('im');
    suggestions.add('im7');
    suggestions.add('ivm7');
    suggestions.add('bVIIm7');
    suggestions.add('bVIIm');
    suggestions.add('bVII');
    suggestions.add('bVIImaj7');
    suggestions.add('bVII7');
    suggestions.add('im7b5');
    suggestions.add('ivm7b5');
    suggestions.add('i°');
    suggestions.add('iv°');
    suggestions.add('bVIIm7b5');
    suggestions.add('im9b5');
    suggestions.add('bVII7b9');
}

/**
 * Get microtonal suggestions for a given category.
 * Maps standard category chords to microtonal diatonic symbols.
 *
 * @param {Object} currentChord - Current chord
 * @param {string} category - Category ID
 * @param {string[]} microDiatonic - Microtonal diatonic chord symbols
 * @param {number} baseKey - Base MIDI key
 * @returns {Array<{symbol: string, key: number}>} Microtonal chord suggestions
 * @private
 */
function _getMicrotonalSuggestions(currentChord, category, microDiatonic, baseKey) {
    const standardChords = _getCategoryChords(category, 'I', 'major', baseKey);

    // Map standard chords to microtonal equivalents by finding closest diatonic chord
    const suggestions = new Set();

    for (const stdSymbol of standardChords) {
        // Find the closest microtonal diatonic chord
        let closest = null;
        let closestDist = Infinity;

        for (const microSymbol of microDiatonic) {
            const microNotes = getMicrotonalChord(microSymbol, baseKey, getModeFromMicroDiatonic(microDiatonic));
            if (!microNotes) continue;

            const stdNotes = _getStandardChordNotes(stdSymbol, baseKey);
            if (!stdNotes) continue;

            const dist = _calculateChordDistance(stdNotes, microNotes);
            if (dist < closestDist) {
                closestDist = dist;
                closest = microSymbol;
            }
        }

        if (closest && !suggestions.has(closest)) {
            suggestions.add(closest);
        }
    }

    // Ensure we have at least 12 suggestions by adding remaining diatonic chords
    for (const microSymbol of microDiatonic) {
        if (suggestions.size >= 12) break;
        if (!suggestions.has(microSymbol)) {
            suggestions.add(microSymbol);
        }
    }

    return Array.from(suggestions).map(s => ({ symbol: s, key: baseKey }));
}

/**
 * Get standard 12-EDO chord notes using CHORD_INTERVALS.
 * Simple fallback for microtonal matching without importing from theory.js.
 *
 * @param {string} symbol - Chord symbol (e.g., 'I', 'V7', 'Imaj7')
 * @param {number} baseKey - Base MIDI key
 * @returns {number[] | null} Chord pitches or null
 * @private
 */
function _getStandardChordNotes(symbol, baseKey) {
    const rootMatch = symbol.match(/^([A-G][#b]?)(.*)/);
    if (!rootMatch) return null;

    const rootName = rootMatch[1];
    const suffix = rootMatch[2];

    // Find root MIDI note
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let rootMidi = null;
    for (let i = 0; i < 12; i++) {
        if (noteNames[i] === rootName) {
            rootMidi = 60 + (i - 0); // C4 = 60
            // Adjust for baseKey offset
            const baseNoteIndex = (baseKey - 60) % 12;
            rootMidi = baseKey + (i - baseNoteIndex);
            break;
        }
    }
    if (rootMidi === null) return null;

    const intervals = CHORD_INTERVALS[suffix] || CHORD_INTERVALS[suffix.replace(/maj/, '')] || [0];
    const chordPitches = intervals.map(interval => rootMidi + interval);

    return chordPitches;
}

/**
 * Extract the mode from a microtonal diatonic chord list.
 *
 * @param {string[]} microDiatonic - Microtonal diatonic chord symbols
 * @returns {string} Mode string
 * @private
 */
function getModeFromMicroDiatonic(microDiatonic) {
    if (microDiatonic.length === 0) return 'major';
    const first = microDiatonic[0];
    const match = first.match(/^([a-z0-9]+)([A-Z][a-zA-Z]*)1$/);
    if (match) {
        return `${match[1]}${match[2]}`;
    }
    return 'major';
}

/**
 * Calculate distance between two chord pitch sets.
 *
 * @param {number[]} notesA - First chord pitches
 * @param {number[]} notesB - Second chord pitches
 * @returns {number} Distance
 * @private
 */
function _calculateChordDistance(notesA, notesB) {
    const sortedA = [...notesA].sort((a, b) => a - b);
    const sortedB = [...notesB].sort((a, b) => a - b);
    const minLen = Math.min(sortedA.length, sortedB.length);
    let total = 0;
    for (let i = 0; i < minLen; i++) {
        total += Math.abs(sortedA[i] - sortedB[i]);
    }
    return total;
}

export default {
    HAND_CURATED_CATEGORIES,
    getProceduralCategory,
    getCategoryIndex,
    getDynamicProgSuggestions
};
