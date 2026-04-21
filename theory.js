// --- Dynamic Chord Generation & Base Key Management ---
let currentBaseKeyMidi = 60; // Default to C4 (60)

// Define chords purely by their intervals (semitones from the root)
const CHORD_INTERVALS = {
    // --- Triads ---
    'I':      [0, 4, 7],   // Major
    'ii':     [2, 5, 9],   // Minor
    'iii':    [4, 7, 11],  // Minor
    'IV':     [5, 9, 12],  // Major
    'V':      [7, 11, 14], // Major
    'vi':     [9, 12, 16], // Minor
    'iv':     [5, 8, 12],  // Minor (Borrowed)
    'bVI':    [8, 12, 15], // Major (Borrowed)
    'bVII':   [10, 14, 17], // Major (Borrowed)
    
    // --- 7ths ---
    'Imaj7':  [0, 4, 7, 11],
    'ii7':    [2, 5, 9, 12], // 12 represents root up an octave
    'iii7':   [4, 7, 11, 14],
    'IVmaj7': [5, 9, 12, 16],
    'V7':     [7, 11, 14, 17],
    'vi7':    [9, 12, 16, 19],
    
    // --- Extended & Altered Borrowed ---
    'Imaj9':  [0, 4, 7, 11, 14],
    'V9':     [7, 11, 14, 17, 21],
    'iv7':    [5, 8, 12, 15],
    'bVImaj7':[8, 12, 15, 19],
    'bVII7':  [10, 14, 17, 20]
};

// The active dictionary exported for the audio and UI engines
export const chordDictionary = {};

// Rebuilds the dictionary array whenever the base key changes
export function setBaseKey(midiNote) {
    currentBaseKeyMidi = midiNote;
    // Clear existing keys to safely overwrite the exported object reference
    Object.keys(chordDictionary).forEach(k => delete chordDictionary[k]);
    
    for (const [numeral, intervals] of Object.entries(CHORD_INTERVALS)) {
        chordDictionary[numeral] = intervals.map(interval => currentBaseKeyMidi + interval);
    }
}

// Initialize with default C Major
setBaseKey(currentBaseKeyMidi);

// --- Harmonic Function Alternatives ---
// Returns chords that share a similar harmonic function for contextual swapping
// This is a dynamic calculation, not a static map, allowing it to scale
// with any new chords added to the CHORD_INTERVALS dictionary.
export function getAlternatives(chordSymbol) {
    const sourceNotes = chordDictionary[chordSymbol]?.map(n => n % 12);
    if (!sourceNotes) return [];

    const allChords = Object.keys(chordDictionary);
    const scoredAlternatives = [];

    for (const targetSymbol of allChords) {
        if (targetSymbol === chordSymbol || !chordDictionary[targetSymbol]) continue;

        // Compare based on pitch class (0-11) to ignore octave differences
        const targetNotes = chordDictionary[targetSymbol].map(n => n % 12);
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

// --- Core Algorithm: Voice Leading ---
// Calculates the inversion of a target chord that has the shortest 
// total melodic distance from the previous chord.
export function applyVoiceLeading(progression) {
    // Defensive programming: Filter out any invalid chords gracefully
    const validProgression = progression.filter(chord => chordDictionary[chord]);
    if (validProgression.length === 0) return [];
    
    // Start the first chord in root position, dropped down an octave for warmth (C3 range)
    let processed = [chordDictionary[validProgression[0]].map(n => n - 12)]; 

    for (let i = 1; i < validProgression.length; i++) {
        let prevChord = processed[i - 1];
        let targetNotes = chordDictionary[validProgression[i]];
        
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
        
        // Dynamically generate inversions for N-length chords (7ths, 9ths, etc.)
        for (let i = 1; i < chord.length; i++) {
            const inv = [...base];
            for (let j = 0; j < i; j++) {
                inv[j] += 12; // Shift bottom notes up an octave
            }
            inversions.push(inv.sort((a, b) => a - b));
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