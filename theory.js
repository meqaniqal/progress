// Storing root-position triads for C Major and common borrowed chords (C4 = 60)
export const chordDictionary = {
    'I':    [60, 64, 67], // C, E, G
    'ii':   [62, 65, 69], // D, F, A
    'iii':  [64, 67, 71], // E, G, B
    'IV':   [65, 69, 72], // F, A, C (C5)
    'V':    [67, 71, 74], // G, B, D (D5)
    'vi':   [69, 72, 76], // A, C, E (E5)
    'iv':   [65, 68, 72], // F, Ab, C - Borrowed from C min
    'bVI':  [68, 72, 75], // Ab, C, Eb - Borrowed from C min
    'bVII': [70, 74, 77]  // Bb, D, F - Borrowed from C min
};

// Returns functional theory alternatives for substituting chords
export function getAlternatives(chordSymbol) {
    const map = {
        'I':    ['iii', 'vi', 'IV', 'bVI'],
        'ii':   ['IV', 'V', 'bVII'],
        'iii':  ['I', 'vi', 'V'],
        'IV':   ['ii', 'vi', 'iv'],
        'V':    ['vi', 'iii', 'bVII'], // V -> vi is a classic deceptive cadence
        'vi':   ['I', 'IV', 'iii'],
        'iv':   ['bVI', 'V', 'bVII'],
        'bVI':  ['iv', 'bVII', 'I'],
        'bVII': ['V', 'bVI', 'IV']
    };
    return map[chordSymbol] || ['I', 'IV', 'V', 'vi'];
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
    const [n1, n2, n3] = chord;
    const inversions = [];
    
    // Generate closed Root, 1st, and 2nd inversions across multiple octaves
    // so the voice leading algorithm can find the closest register smoothly.
    for (let oct of [-24, -12, 0, 12]) {
        inversions.push([n1 + oct, n2 + oct, n3 + oct]);           // Root
        inversions.push([n2 + oct - 12, n3 + oct - 12, n1 + oct]); // 1st Inversion
        inversions.push([n3 + oct - 12, n1 + oct, n2 + oct]);      // 2nd Inversion
    }
    
    return inversions;
}

export function calculateDistance(chordA, chordB) {
    // Sort to compare bottom-to-bottom, middle-to-middle, top-to-top
    let sortedA = [...chordA].sort((a,b)=>a-b);
    let sortedB = [...chordB].sort((a,b)=>a-b);
    let dist = 0;
    for (let i = 0; i < 3; i++) {
        dist += Math.abs(sortedA[i] - sortedB[i]);
    }
    return dist;
}