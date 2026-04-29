import { CHORD_INTERVALS } from './chordDictionary.js';

export function getChordNotes(symbol, baseKey) {
    const intervals = CHORD_INTERVALS[symbol];
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

// --- Synesthetic Color Mapping ---
export function getHarmonicProfile(symbol) {
    // Strip extensions for base functional analysis
    const baseFunc = symbol.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7/g, '');
    
    let fifthsFromTonic = 0;
    let isBorrowed = false;
    let tension = 0; // -1.0 (Home/Rest) to 1.0 (High Tension)

    switch(baseFunc) {
        // Diatonic
        case 'I':  fifthsFromTonic = 0;  tension = -1.0; break;
        case 'IV': fifthsFromTonic = -1; tension = 0.2;  break;
        case 'V':  fifthsFromTonic = 1;  tension = 1.0;  break;
        case 'ii': fifthsFromTonic = 2;  tension = 0.5;  break;
        case 'vi': fifthsFromTonic = 3;  tension = -0.5; break;
        case 'iii': fifthsFromTonic = 4; tension = 0.1;  break;
        
        // Borrowed
        case 'iv':   fifthsFromTonic = -1; isBorrowed = true; tension = 0.6; break;
        case 'bVI':  fifthsFromTonic = -4; isBorrowed = true; tension = 0.4; break;
        case 'bVII': fifthsFromTonic = -2; isBorrowed = true; tension = 0.8; break;
    }

    return { fifthsFromTonic, isBorrowed, tension };
}

// --- Modulation & Pivot Chords ---
export function getTransitionSuggestions(fromKey, toKey) {
    if (fromKey === toKey) return [];
    const diatonic = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];
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
export function getTurnaroundSuggestions(targetSymbol) {
    const baseFunc = targetSymbol.replace(/maj9|maj7|sus4|7#9|7b13|11|13|9|7/g, '');
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