import { getMicrotonalDiatonicChords } from './microtonalDictionary.js';

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
