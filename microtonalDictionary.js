/**
 * Isolated Sandbox for True Microtonal / Macrotonal Scales.
 * Handles tuning systems that do not fit into the standard 12-TET octave or heptatonic (7-note) Roman Numeral systems.
 */

// Mathematical constant for the Tritave (3:1 frequency ratio), expressed in standard MIDI semitones
// 1 Tritave = 12 * Math.log2(3) ≈ 19.01955 semitones
const TRITAVE_MIDI_SIZE = 12 * Math.log2(3); 

export const MICRO_TUNINGS = {
    'BP': {
        name: 'Bohlen-Pierce (13-ED3)',
        divisions: 13,
        periodSize: TRITAVE_MIDI_SIZE, // Overrides the default 12-semitone octave period
        scales: {
            // 9-note scales derived from the 13-step Bohlen-Pierce tuning
            Lambda: [0, 1, 3, 4, 6, 7, 9, 10, 12],
            Dur:    [0, 1, 2, 4, 5, 7, 8, 10, 11],
            Moll:   [0, 2, 3, 5, 6, 8, 9, 11, 12]
        }
    },
    'SLENDRO': {
        name: 'Slendro (5-EDO)',
        divisions: 5,
        periodSize: 12.0, // Uses the standard Octave
        scales: {
            Pentatonic: [0, 1, 2, 3, 4]
        }
    },
    'EDO24': {
        name: '24-EDO (Quarter Tones)',
        divisions: 24,
        periodSize: 12.0, // Uses standard Octave
        scales: {
            Bayati: [0, 3, 6, 10, 14, 16, 20], // Features the neutral second (1.5 semitones)
            Rast: [0, 4, 7, 10, 14, 18, 21]    // Features the neutral third (3.5 semitones)
        }
    }
};

export function getMicrotonalChord(symbol, baseKey) {
    if (!symbol) return null;

    // Allow numbers in the tuning key (e.g., EDO24) and capture suffixes
    const match = symbol.match(/^([A-Z0-9]+)([A-Z][a-zA-Z]+)(\d+)(.*)$/);
    if (!match) return null;

    const tuningKey = match[1];
    const scaleName = match[2];
    const degree = parseInt(match[3], 10) - 1; // 1-indexed to 0-indexed
    const suffix = match[4] || '';

    const tuning = MICRO_TUNINGS[tuningKey];
    if (!tuning || !tuning.scales[scaleName]) return null;

    const scale = tuning.scales[scaleName];
    const scaleLength = scale.length;
    const stepSize = tuning.periodSize / tuning.divisions;

    // Determine scale steps for chord notes based on suffix
    let chordSteps = [0, 2, 4]; // Default triad steps

    if (suffix.includes('sus4')) {
        chordSteps = [0, 3, 4];
    } else if (suffix.includes('sus2')) {
        chordSteps = [0, 1, 4];
    } else if (suffix.includes('dim') || suffix.includes('°')) {
        if (suffix.includes('7')) chordSteps = [0, 1, 3, 5];
        else chordSteps = [0, 1, 3];
    } else if (suffix.includes('maj7') || suffix.includes('maj9') || suffix.includes('maj11') || suffix.includes('maj13') || suffix.includes('maj7#11') || suffix.includes('maj7#5')) {
        chordSteps = [0, 2, 4, 6];
    } else if (suffix.includes('7') || suffix.includes('9') || suffix.includes('11') || suffix.includes('13')) {
        chordSteps = [0, 2, 4, 6];
    }

    if (suffix.includes('9') || suffix.includes('add9')) {
        chordSteps.push(8);
    }
    if (suffix.includes('11')) {
        chordSteps.push(10);
    }
    if (suffix.includes('13')) {
        chordSteps.push(12);
    }
    if (suffix.includes('6') || suffix.includes('m6')) {
        chordSteps = [0, 2, 4, 5];
    }

    const chordPitches = [];
    for (const stepOffset of chordSteps) {
        const scaleIndex = (degree + stepOffset) % scaleLength;
        const periodShift = Math.floor((degree + stepOffset) / scaleLength) * tuning.periodSize;
        const pitchOffset = (scale[scaleIndex] * stepSize) + periodShift;
        const absoluteTarget = baseKey + pitchOffset;
        
        const edoStep = Math.round((absoluteTarget - 60) * (tuning.divisions / tuning.periodSize));
        const snappedPitch = 60 + (edoStep * (tuning.periodSize / tuning.divisions));
        
        chordPitches.push(snappedPitch);
    }
    return chordPitches;
}

/**
 * Returns an array of diatonic chord symbols for a given microtonal mode.
 * @param {string} mode - The scale mode (e.g., 'bpLambda')
 * @returns {string[] | null} Array of chord symbols (e.g., ['BPLambda1', 'BPLambda2', ...])
 */
export function getMicrotonalDiatonicChords(mode) {
    if (!mode) return null;
    const match = mode.match(/^([a-z0-9]+)([A-Z][a-zA-Z]*)$/);
    if (!match) return null;

    const tuningKey = match[1].toUpperCase();
    const scaleName = match[2];

    const tuning = MICRO_TUNINGS[tuningKey];
    if (!tuning || !tuning.scales[scaleName]) return null;

    return tuning.scales[scaleName].map((_, i) => `${tuningKey}${scaleName}${i + 1}`);
}