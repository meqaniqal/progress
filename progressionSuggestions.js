import { getMicrotonalDiatonicChords } from './microtonalDictionary.js';

export const HAND_CURATED_CATEGORIES = [
    { id: 'mournful', label: '😢 Mournful', description: 'Plaintive, sorrowful, minor modal relationships', color: '#6366f1' },
    { id: 'luminous', label: '✨ Luminous', description: 'Bright, shimmering, Lydian major relationships', color: '#fbbf24' },
    { id: 'heroic', label: '⚔️ Heroic', description: 'Epic, Mixolydian, triumphant progression steps', color: '#ef4444' },
    { id: 'nostalgic', label: '💕 Nostalgic', description: 'Warm, tender, romantic/plagal relationships', color: '#ec4899' },
    { id: 'mysterious', label: '🌌 Mysterious', description: 'Introspective, floating, Dorian minor steps', color: '#8b5cf6' },
    { id: 'ethereal', label: '🧚 Ethereal', description: 'Floaty, whole-tone, Lydian #11 textures', color: '#06b6d4' },
    { id: 'ominous', label: '🌋 Ominous', description: 'Heavy, Phrygian, tense diminished structures', color: '#7f1d1d' },
    { id: 'baroque', label: '🎻 Baroque', description: 'Secondary dominants, classical Bach sequences', color: '#854d0e' },
    { id: 'cosmic', label: '🚀 Cosmic', description: 'Coltrane cycles, whole-tone augmented orbits', color: '#1e3a8a' },
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

export const FIXED_SUGGESTIONS = {
    mournful: [
        'iv', 'bVI', 'ii°7', 'i7', 'bvi', 'vm9', 'v', 'iv7', 'bIII', 'bIIImaj7', 'iiø7', 'bVImaj7'
    ],
    luminous: [
        'II', 'Imaj7', 'V9', 'III', 'VI', 'Imaj9', 'Vmaj7', 'Vsus2', 'Iadd9', 'vii7b5', 'IIImaj7', 'VImaj7'
    ],
    heroic: [
        'bVII', 'V7sus4', 'bVII7', 'I7', 'IV7', 'II7', 'v7', 'bVIImaj7', 'I9', 'IV9', 'V7', 'bVIIadd9'
    ],
    nostalgic: [
        'IVmaj7', 'vi9', 'vi7', 'ii9', 'bVII9', 'IVmaj9', 'vi11', 'IVadd9', 'ii7', 'I6', 'IV6', 'viadd9'
    ],
    mysterious: [
        'IV', 'Isus2', 'Vsus4', 'ii13', 'IVsus2', 'bVIImaj9', 'bIIImaj7add9', 'i6', 'ivmaj7', 'bIII6', 'ii7b5', 'im9'
    ],
    ethereal: [
        'Imaj7#11', 'iii7b5', 'bVImaj7#11', 'vi7b5', 'Imaj9#11', 'IVmaj7#11', 'Vsus4#11', 'vii7', 'III7#5', 'bIIImaj7#11', 'bVIImaj7#11', 'Iadd9#11'
    ],
    ominous: [
        'bII', 'vii°7', 'I7b9', 'v°', 'bV', 'bIImaj7', 'vii°', 'i°7', 'bVmaj7', 'IV7b9', 'V7b9', '#I°7'
    ],
    baroque: [
        'V7/V', 'V7/vi', 'I', 'vii°/V', 'V7/ii', 'V7/iii', 'V7/IV', 'V/V', 'V/vi', 'V/ii', 'vii°/vi', 'ii°'
    ],
    cosmic: [
        'bIIImaj9', 'bVImaj9', 'bIIIadd9', 'bVIadd9', 'II9', 'IV7#11', 'V7/bIII', 'V7/bVI', 'vii°9', 'bIIImaj7#5', 'bVImaj7#5', 'Imaj7#5'
    ],
    soulful: [
        'I#°', 'ii11', 'V7alt', 'Imaj13', 'IVmaj13', 'vi13', 'ii13sus2', 'V13', 'bVII13', 'I9sus4', 'IV9sus4', 'vi9sus4'
    ],
    exotic: [
        'bII6', 'vii7#5', 'bV6', '#IV7b9', 'vii°6', 'bIImaj7b5', 'vii7b5#9', 'v7b5b9', '#i7b5', '#iv7b5', 'bV7b9', 'bII7b9'
    ],
    tension: [
        'I7#9', 'V7b13', 'I7b13', 'V7#9#5', 'vii°7/V', 'vii°7/vi', 'V7#5', 'bII7#9', 'bV7#9', '#IV°7/V', 'Vsus4b9', 'V7#9b13'
    ],
    dreamy: [
        'Imaj11', 'bVImaj9#11', 'IVmaj11', 'Imaj7b5', 'IVmaj7b5', 'bIIImaj9#11', 'bVIImaj9#11', 'ii9sus4', 'bIII13', 'bVI13', 'Imaj9#5', 'bIIImaj9#5'
    ],
    hopeful: [
        'Iadd11', 'IVadd11', 'Vadd11', 'viadd11', 'iiadd9', 'iiiadd9', 'iii7', 'V7sus2', 'vi7b5#9', 'ii7b5#11', 'IVadd9#11', 'Vadd9#11'
    ],
    cyberpunk: [
        'i', 'vii9', 'iv9', 'v9', 'im11', '#i', '#iv', 'bvi9', 'viiø9', 'im13', 'ivm13', 'v6'
    ],
    alien: [
        'bVmaj9', 'I7b5', 'iii7b5#9', 'bIImaj7#11', 'bVImaj11#11', '#I°9', 'bIIImaj11#11', 'bVIImaj11#11', 'Imaj9#5#11', 'ii7b5#9', 'vii7b5#11', '#IV7'
    ],
    neutral: [
        'ii', 'iii', 'vi', 'I5', 'IV5', 'V5', 'vi5', 'ii5', 'iii5', 'I6/9', 'IV6/9', 'V6/9'
    ],
    spectral: [
        'Imaj13#11', 'II13', 'V7b5', 'Imaj9#11b5', 'IVmaj13#11', 'Vsus4#11b5', 'Imaj13#5', 'bIIImaj13#11', 'bVImaj13#11', 'II7#5', 'bVIImaj13#11', 'Imaj7b5#11'
    ]
};

export function getCategoryIndex(emotionId) {
    if (typeof emotionId === 'number') return emotionId;
    const idx = HAND_CURATED_CATEGORIES.findIndex(cat => cat.id === emotionId);
    return idx !== -1 ? idx : 0;
}

function getRootOffsetFromSymbol(symbol) {
    let accidental = 0;
    let stripped = symbol;
    
    if (stripped.includes('/')) {
        stripped = stripped.split('/')[0];
    }
    
    if (stripped.startsWith('b')) { 
        accidental = -1; 
        stripped = stripped.substring(1); 
    } else if (stripped.startsWith('#')) { 
        accidental = 1; 
        stripped = stripped.substring(1); 
    }
    
    const match = stripped.match(/^(IV|III|II|I|VII|VI|V|iv|iii|ii|i|vii|vi|v)/);
    if (match) {
        const numeral = match[1];
        const scaleOffsets = {
            'i': 0, 'ii': 2, 'iii': 4, 'iv': 5, 'v': 7, 'vi': 9, 'vii': 11,
            'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11
        };
        return (scaleOffsets[numeral] + accidental + 12) % 12;
    }
    return 0;
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
        const catIdx = getCategoryIndex(emotion);
        const scaleLength = microDiatonic.length;
        const suffixes = [
            '', '7', 'maj7', '9', 'add9', 'sus4', 'sus2', '6', '11', '13',
            'maj9', 'maj11', 'maj13', 'maj7#11', 'maj7#5', 'dim', 'dim7', '°', '°7', 'm6',
            'add11', 'add13', 'maj13#11', '13#11', '7b9', '7#9', '9#11', '9b13', '7b13', '7#5',
            '7b5', 'm11', 'm13', 'm9', 'm7b5', 'ø7', 'add9#11', 'sus4b9', 'sus4#11', 'sus2#11',
            '69', '6/9', 'maj7b9', 'maj9b13', 'maj7b5'
        ];
        
        // Generate exactly 12 unique suggestions (2 pages of 6) for this category
        for (let j = 0; j < 12; j++) {
            const index = catIdx * 12 + j;
            const degree = (index % scaleLength) + 1;
            const suffix = suffixes[Math.floor(index / scaleLength) % suffixes.length];
            const baseSym = microDiatonic[degree - 1];
            const sym = `${baseSym}${suffix}`;
            addSug(sym, `Microtonal degree ${degree} emotional color (${emotion} slot ${j})`);
        }
        return suggestions;
    }

    // Standard 12-EDO Suggestions
    const chordList = FIXED_SUGGESTIONS[emotion] || FIXED_SUGGESTIONS['neutral'];
    chordList.forEach((sym, j) => {
        const offset = getRootOffsetFromSymbol(sym);
        addSug(sym, `${emotion} suggestion ${j + 1}`, baseOctave + offset);
    });

    return suggestions;
}

export function getProceduralCategory(categoryIndex, mode = 'major') {
    const catIndex = categoryIndex % HAND_CURATED_CATEGORIES.length;
    return HAND_CURATED_CATEGORIES[catIndex];
}
