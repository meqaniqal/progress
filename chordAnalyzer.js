import { CHORD_INTERVALS } from './chordDictionary.js';

const DEGREE_NAMES = {
    0: { upper: 'I', lower: 'i' },
    1: { upper: 'bII', lower: 'bii' },
    2: { upper: 'II', lower: 'ii' },
    3: { upper: 'bIII', lower: 'biii' },
    4: { upper: 'III', lower: 'iii' },
    5: { upper: 'IV', lower: 'iv' },
    6: { upper: '#IV', lower: '#iv' },
    7: { upper: 'V', lower: 'v' },
    8: { upper: 'bVI', lower: 'bvi' },
    9: { upper: 'VI', lower: 'vi' },
    10: { upper: 'bVII', lower: 'bvii' },
    11: { upper: 'VII', lower: 'vii' }
};

const CHORD_QUALITIES = [
    { name: 'maj7', intervals: [0, 4, 7, 11], caseType: 'upper', suffix: 'maj7' },
    { name: 'min7', intervals: [0, 3, 7, 10], caseType: 'lower', suffix: '7' },
    { name: 'dom7', intervals: [0, 4, 7, 10], caseType: 'upper', suffix: '7' },
    { name: 'dim7', intervals: [0, 3, 6, 9], caseType: 'lower', suffix: '°7' },
    { name: 'halfDim7', intervals: [0, 3, 6, 10], caseType: 'lower', suffix: '°7' },
    { name: 'maj', intervals: [0, 4, 7], caseType: 'upper', suffix: '' },
    { name: 'min', intervals: [0, 3, 7], caseType: 'lower', suffix: '' },
    { name: 'sus4', intervals: [0, 5, 7], caseType: 'upper', suffix: 'sus4' },
    { name: 'sus2', intervals: [0, 2, 7], caseType: 'upper', suffix: 'sus2' },
    { name: 'dim', intervals: [0, 3, 6], caseType: 'lower', suffix: '°' },
    { name: 'aug', intervals: [0, 4, 8], caseType: 'upper', suffix: '+' }
];

export function identifyChord(midiNotes, baseKey = 60) {
    if (!midiNotes || midiNotes.length === 0) return null;
    
    const cleanNotes = midiNotes.map(n => Math.round(n));
    const classes = [...new Set(cleanNotes.map(n => (n % 12 + 12) % 12))].sort((a, b) => a - b);
    
    if (classes.length === 0) return null;

    const keyRoot = (baseKey % 12 + 12) % 12;
    const targetClasses = classes.map(c => (c - keyRoot + 12) % 12).sort((a, b) => a - b);
    
    for (const [symbol, intervals] of Object.entries(CHORD_INTERVALS)) {
        const dictClasses = [...new Set(intervals.map(i => (i % 12 + 12) % 12))].sort((a, b) => a - b);
        if (dictClasses.length === targetClasses.length && dictClasses.every((v, i) => v === targetClasses[i])) {
            return symbol;
        }
    }

    let bestMatch = null;
    let highestScore = -1;

    for (const candidateRoot of classes) {
        const relIntervals = classes.map(c => (c - candidateRoot + 12) % 12).sort((a, b) => a - b);
        
        for (const quality of CHORD_QUALITIES) {
            let matchCount = 0;
            quality.intervals.forEach(qi => {
                if (relIntervals.includes(qi)) matchCount++;
            });
            
            const score = matchCount / Math.max(quality.intervals.length, relIntervals.length);
            
            if (score > highestScore && score >= 0.75) {
                highestScore = score;
                const offset = (candidateRoot - keyRoot + 12) % 12;
                const baseName = DEGREE_NAMES[offset] ? DEGREE_NAMES[offset][quality.caseType] : 'I';
                bestMatch = baseName + quality.suffix;
            }
        }
    }

    return bestMatch;
}
