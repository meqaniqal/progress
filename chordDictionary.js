// --- Dynamic Chord Generation ---
// Define chords purely by their intervals (semitones from the root)
export const CHORD_INTERVALS = {
    // --- Triads ---
    'I':      [0, 4, 7],   // Major
    'i':      [0, 3, 7],   // Minor
    'ii':     [2, 5, 9],   // Minor
    'ii°':    [2, 5, 8],   // Diminished
    'iii':    [4, 7, 11],  // Minor
    'III':    [3, 7, 10],  // Major
    'IV':     [5, 9, 12],  // Major
    'V':      [7, 11, 14], // Major
    'v':      [7, 10, 14], // Minor
    'vi':     [9, 12, 16], // Minor
    'VI':     [8, 12, 15], // Major
    'VII':    [10, 14, 17], // Major
    'iv':     [5, 8, 12],  // Minor (Borrowed)
    'bVI':    [8, 12, 15], // Major (Borrowed)
    'bVII':   [10, 14, 17], // Major (Borrowed)
    
    // --- 7ths ---
    'Imaj7':  [0, 4, 7, 11],
    'i7':     [0, 3, 7, 10],
    'ii7':    [2, 5, 9, 12], // 12 represents root up an octave
    'ii°7':   [2, 5, 8, 12], // Half-diminished 7th
    'iii7':   [4, 7, 11, 14],
    'IIImaj7':[3, 7, 10, 14],
    'IVmaj7': [5, 9, 12, 16],
    'v7':     [7, 10, 14, 17],
    'VImaj7': [8, 12, 15, 19],
    'VII7':   [10, 14, 17, 20],
    'V7':     [7, 11, 14, 17],
    'vi7':    [9, 12, 16, 19],
    
    // --- Extended & Altered Borrowed ---
    'Imaj9':  [0, 4, 7, 11, 14],
    'IVmaj9': [5, 9, 12, 16, 19],
    'ii9':    [2, 5, 9, 12, 16],
    'ii11':   [2, 5, 9, 12, 16, 19],
    'V9':     [7, 11, 14, 17, 21],
    'V11':    [7, 12, 14, 17, 21], // Voiced as V9sus4 to avoid the harsh M3/P11 clash and control the top register
    'Vsus4':  [7, 12, 14],
    'V7sus4': [7, 12, 14, 17],
    'V7#9':   [7, 11, 14, 17, 22], // Altered Dominant (Tension)
    'V7b13':  [7, 11, 14, 15, 17], // Tighter voicing placing the b13 below the 7th
    'iv7':    [5, 8, 12, 15],
    'bVImaj7':[8, 12, 15, 19],
    'bVII7':  [10, 14, 17, 20]
};