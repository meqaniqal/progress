import { CHORD_INTERVALS } from './chordDictionary.js';

export const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor: [0, 2, 3, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

// Psychoacoustic dissonance weights for interval pairs (0.0 to 1.0)
export const INTERVAL_WEIGHTS = {
    0: 0.0, 1: 1.0, 2: 0.6, 3: 0.3, 
    4: 0.2, 5: 0.4, 6: 0.9, 7: 0.1, 
    8: 0.6, 9: 0.3, 10: 0.5, 11: 0.9
};

export function getChordNotes(symbol, baseKey) {
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
            const thirdOffset = numeral === numeral.toLowerCase() ? 3 : 4;
            let fifthOffset = 7;
            
            if (remainder.includes('+') || remainder.includes('aug')) fifthOffset = 8;
            if (remainder.includes('°') || remainder.includes('dim')) fifthOffset = 6;
            
            intervals = [rootOffset, rootOffset + thirdOffset, rootOffset + fifthOffset];
            
            if (remainder.includes('maj7')) intervals.push(rootOffset + 11);
            else if (remainder.includes('7')) {
                if (fifthOffset === 6 && !remainder.includes('°7')) intervals.push(rootOffset + 10);
                else if (remainder.includes('°7')) intervals.push(rootOffset + 9);
                else intervals.push(rootOffset + 10);
            }
        }
    }
    
    if (!intervals) return null;
    return intervals.map(interval => baseKey + interval);
}

// --- Harmonic Function Alternatives ---
// Returns chords that share a similar harmonic function for contextual swapping
// Calculates shared tones purely by modulo interval mapping, making it key-agnostic.
export function getAlternatives(chordSymbol) {
    const sourceIntervals = CHORD_INTERVALS[chordSymbol];
    if (!sourceIntervals) return [];
    
    const sourceNotes = sourceIntervals.map(n => n % 12);
    const allChords = Object.keys(CHORD_INTERVALS);
    const scoredAlternatives = [];

    for (const targetSymbol of allChords) {
        if (targetSymbol === chordSymbol) continue;

        const targetNotes = CHORD_INTERVALS[targetSymbol].map(n => n % 12);
        const sharedNotes = sourceNotes.filter(note => targetNotes.includes(note));
        
        // Only suggest chords with significant overlap (at least 2 shared notes for triads/7ths)
        if (sharedNotes.length >= 2) {
            scoredAlternatives.push({
                symbol: targetSymbol,
                score: sharedNotes.length
            });
        }
    }

    // Sort by the number of shared tones (descending) and return the top 3 for a clean UI
    return scoredAlternatives.sort((a, b) => b.score - a.score)
                             .map(alt => alt.symbol)
                             .slice(0, 3);
}

// --- Omni-Scale Generation & Mathematics ---
export function getDiatonicChords(scaleType = 'major') {
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
export function getTurnaroundSuggestions(targetSymbol, mode = 'major') {
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
export function applyVoiceLeading(progression) {
    // progression is now an array of objects: { symbol: 'I', key: 60 }
    const validProgression = progression.filter(chord => getChordNotes(chord.symbol, chord.key));
    if (validProgression.length === 0) return [];
    
    // Start the first chord in root position, dropped down an octave for warmth (C3 range)
    const firstNotes = getChordNotes(validProgression[0].symbol, validProgression[0].key);
    let processed = [optimizeVoicing(firstNotes).map(n => n - 12)]; 

    for (let i = 1; i < validProgression.length; i++) {
        let prevChord = processed[i - 1];
        let targetNotes = getChordNotes(validProgression[i].symbol, validProgression[i].key);
        targetNotes = optimizeVoicing(targetNotes);
        
        // Generate possible inversions (moving notes up/down octaves)
        let inversions = generateInversions(targetNotes);
        
        // Find the inversion with the smallest movement delta
        let bestInversion = inversions[0];
        let smallestDistance = Infinity;

        inversions.forEach(inv => {
            let distance = calculateDistance(prevChord, inv);
            if (distance < smallestDistance) {
                smallestDistance = distance;
                bestInversion = inv;
            }
        });

        processed.push(bestInversion);
    }
    return processed;
}

export function generateInversions(chord) {
    const inversions = [];
    
    // Generate closed inversions across multiple octaves
    // so the voice leading algorithm can find the closest register smoothly.
    for (let oct of [-24, -12, 0, 12]) {
        const base = chord.map(n => n + oct);
        inversions.push([...base]); // Root Position
        
        // Generate Drop 2 for root position (if it's a 7th chord or larger)
        if (base.length >= 4) {
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
            inversions.push([...sortedInv]);
            
            // Generate Drop 2 for this specific inversion
            if (sortedInv.length >= 4) {
                const drop2 = [...sortedInv];
                const secondFromTop = drop2.splice(drop2.length - 2, 1)[0];
                drop2.unshift(secondFromTop - 12); // Drop the 2nd highest note an octave
                inversions.push(drop2);
            }
        }
    }
    
    return inversions;
}

export function calculateDistance(chordA, chordB) {
    // Sort to compare voices lowest to highest
    let sortedA = [...chordA].sort((a,b)=>a-b);
    let sortedB = [...chordB].sort((a,b)=>a-b);
    let dist = 0;
    
    const len = Math.min(sortedA.length, sortedB.length);
    for (let i = 0; i < len; i++) {
        dist += Math.abs(sortedA[i] - sortedB[i]);
    }
    
    // Lightly penalize jumps between chords of different sizes (e.g. Triad -> 9th)
    if (sortedA.length !== sortedB.length) {
        dist += Math.abs(sortedA.length - sortedB.length) * 12;
    }
    
    return dist;
}