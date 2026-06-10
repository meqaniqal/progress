/**
 * genrePresets.js
 * Curated preset patterns and settings for different musical genres.
 */

import { generateId } from './patternUtils.js';

export const GENRE_PRESETS = {
    lofi: {
        name: 'Lofi Hip Hop',
        swing: 0.6,
        groovePreset: 'swing',
        description: 'Relaxed swing groove, syncopated kick, laid-back bass, and lush chords.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 0.5, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.5, duration: 0.5, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.0, duration: 0.375, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.375, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.75, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                { time: 0.0, row: 'kick', velocity: 0.9, probability: 1.0 },
                { time: 0.625, row: 'kick', velocity: 0.7, probability: 0.8 },
                { time: 1.0, row: 'snare', velocity: 0.85, probability: 1.0 },
                { time: 1.875, row: 'kick', velocity: 0.8, probability: 0.9 },
                { time: 3.0, row: 'snare', velocity: 0.85, probability: 1.0 },
                // Slack hats
                { time: 0.0, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 0.25, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 0.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 0.75, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 1.0, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 1.25, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 1.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 1.75, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 2.0, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 2.25, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 2.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 2.75, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 3.0, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 3.25, row: 'ch', velocity: 0.35, probability: 0.85 },
                { time: 3.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 3.75, row: 'ch', velocity: 0.35, probability: 0.85 }
            ]
        }
    },
    neosoul: {
        name: 'Neo-Soul',
        swing: 0.65,
        groovePreset: 'swing',
        description: 'Lush chord stabs, highly syncopated walking bassline, and classic rimshot beats.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.25, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.625, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.0, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.375, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.625, duration: 0.125, type: 'chord', pitchOffset: 2, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.8 },
                { startTime: 0.75, duration: 0.25, type: 'chord', pitchOffset: 7, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                { time: 0.0, row: 'kick', velocity: 0.9, probability: 1.0 },
                { time: 0.75, row: 'kick', velocity: 0.7, probability: 0.85 },
                { time: 1.0, row: 'snare', velocity: 0.8, probability: 1.0 },
                { time: 1.5, row: 'kick', velocity: 0.85, probability: 0.9 },
                { time: 2.25, row: 'kick', velocity: 0.7, probability: 0.8 },
                { time: 3.0, row: 'snare', velocity: 0.8, probability: 1.0 },
                { time: 3.75, row: 'kick', velocity: 0.65, probability: 0.7 },
                // Soulful hats
                { time: 0.0, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 0.25, row: 'oh', velocity: 0.5, probability: 0.8 },
                { time: 0.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 0.75, row: 'ch', velocity: 0.45, probability: 0.8 },
                { time: 1.0, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 1.25, row: 'ch', velocity: 0.45, probability: 0.8 },
                { time: 1.5, row: 'oh', velocity: 0.6, probability: 0.95 },
                { time: 1.75, row: 'ch', velocity: 0.45, probability: 0.8 },
                { time: 2.0, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 2.25, row: 'oh', velocity: 0.5, probability: 0.8 },
                { time: 2.5, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 2.75, row: 'ch', velocity: 0.45, probability: 0.8 },
                { time: 3.0, row: 'ch', velocity: 0.6, probability: 0.9 },
                { time: 3.25, row: 'ch', velocity: 0.45, probability: 0.8 },
                { time: 3.5, row: 'oh', velocity: 0.6, probability: 0.95 },
                { time: 3.75, row: 'ch', velocity: 0.45, probability: 0.8 }
            ]
        }
    },
    synthwave: {
        name: 'Synthwave / Outrun',
        swing: 0.0,
        groovePreset: 'none',
        description: 'Driving 80s feel, pumping straight eighths bass, and a classic four-on-the-floor beat.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 1.0, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.0, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.125, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.25, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.375, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.5, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.625, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.75, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.875, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                { time: 0.0, row: 'kick', velocity: 1.0, probability: 1.0 },
                { time: 1.0, row: 'snare', velocity: 0.95, probability: 1.0 },
                { time: 2.0, row: 'kick', velocity: 1.0, probability: 1.0 },
                { time: 3.0, row: 'snare', velocity: 0.95, probability: 1.0 },
                // Constant 8th note hats with slight velocity accenting
                { time: 0.0, row: 'ch', velocity: 0.7, probability: 1.0 },
                { time: 0.5, row: 'ch', velocity: 0.55, probability: 1.0 },
                { time: 1.0, row: 'ch', velocity: 0.7, probability: 1.0 },
                { time: 1.5, row: 'ch', velocity: 0.55, probability: 1.0 },
                { time: 2.0, row: 'ch', velocity: 0.7, probability: 1.0 },
                { time: 2.5, row: 'ch', velocity: 0.55, probability: 1.0 },
                { time: 3.0, row: 'ch', velocity: 0.7, probability: 1.0 },
                { time: 3.5, row: 'ch', velocity: 0.55, probability: 1.0 }
            ]
        }
    },
    idm: {
        name: 'Intelligent Dance Music',
        swing: 0.35,
        groovePreset: 'swing',
        description: 'Complex syncopated rhythms, glitchy drums, and probability-based fills.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.375, duration: 0.125, type: 'chord', pitchOffset: 12, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.75 },
                { startTime: 0.5, duration: 0.375, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.875, duration: 0.125, type: 'chord', pitchOffset: -12, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.6 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.0, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.5, duration: 0.125, type: 'chord', pitchOffset: -5, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.75, duration: 0.25, type: 'chord', pitchOffset: 7, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.8 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                { time: 0.0, row: 'kick', velocity: 0.9, probability: 1.0 },
                { time: 0.375, row: 'kick', velocity: 0.75, probability: 0.8 },
                { time: 0.875, row: 'clap', velocity: 0.6, probability: 0.5 },
                { time: 1.0, row: 'snare', velocity: 0.8, probability: 1.0 },
                { time: 1.5, row: 'oh', velocity: 0.7, probability: 0.9 },
                { time: 2.25, row: 'kick', velocity: 0.85, probability: 0.9 },
                { time: 2.75, row: 'snare', velocity: 0.5, probability: 0.4 },
                { time: 3.0, row: 'snare', velocity: 0.85, probability: 1.0 },
                { time: 3.375, row: 'clap', velocity: 0.6, probability: 0.7 },
                { time: 3.5, row: 'ch', velocity: 0.7, probability: 0.8 },
                { time: 3.625, row: 'ch', velocity: 0.6, probability: 0.75 },
                { time: 3.75, row: 'oh', velocity: 0.8, probability: 0.9 }
            ]
        }
    },
    afrobeat: {
        name: 'Afrobeat',
        swing: 0.5,
        groovePreset: 'african',
        description: 'Polyrhythmic continuous hand-percussion, highly syncopated bass, and interlocking beats.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.25, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.5, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.875, duration: 0.125, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.85 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.125, duration: 0.25, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.5, duration: 0.125, type: 'chord', pitchOffset: 5, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.625, duration: 0.25, type: 'chord', pitchOffset: 7, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                { time: 0.0, row: 'kick', velocity: 0.9, probability: 1.0 },
                { time: 0.5, row: 'clap', velocity: 0.7, probability: 0.9 },
                { time: 1.0, row: 'snare', velocity: 0.8, probability: 1.0 },
                { time: 1.5, row: 'kick', velocity: 0.85, probability: 1.0 },
                { time: 2.25, row: 'kick', velocity: 0.8, probability: 0.9 },
                { time: 2.5, row: 'clap', velocity: 0.7, probability: 0.9 },
                { time: 3.0, row: 'snare', velocity: 0.8, probability: 1.0 },
                // Percussion layers (rim/hats/shakers)
                { time: 0.0, row: 'ch', velocity: 0.65, probability: 1.0 },
                { time: 0.25, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 0.5, row: 'oh', velocity: 0.7, probability: 1.0 },
                { time: 0.75, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 1.0, row: 'ch', velocity: 0.65, probability: 1.0 },
                { time: 1.25, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 1.5, row: 'oh', velocity: 0.7, probability: 1.0 },
                { time: 1.75, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 2.0, row: 'ch', velocity: 0.65, probability: 1.0 },
                { time: 2.25, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 2.5, row: 'oh', velocity: 0.7, probability: 1.0 },
                { time: 2.75, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 3.0, row: 'ch', velocity: 0.65, probability: 1.0 },
                { time: 3.25, row: 'ch', velocity: 0.5, probability: 0.95 },
                { time: 3.5, row: 'oh', velocity: 0.7, probability: 1.0 },
                { time: 3.75, row: 'ch', velocity: 0.5, probability: 0.95 }
            ]
        }
    },
    eastern: {
        name: 'Eastern rhythms (9/8 Karsilama style)',
        swing: 0.3,
        groovePreset: 'latin',
        description: 'Traditional 9/8 syncopated meter (divided as 2+2+2+3) mapped to a rhythmic pattern.',
        chordPattern: {
            instances: [
                { startTime: 0.0, duration: 0.222, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.222, duration: 0.222, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.9 },
                { startTime: 0.444, duration: 0.222, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.666, duration: 0.334, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 }
            ]
        },
        bassPattern: {
            instances: [
                { startTime: 0.0, duration: 0.222, type: 'chord', pitchOffset: 0, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 },
                { startTime: 0.444, duration: 0.222, type: 'chord', pitchOffset: -5, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 0.95 },
                { startTime: 0.666, duration: 0.334, type: 'chord', pitchOffset: 7, pitchOffsets: [], isSelected: false, arpSettings: null, probability: 1.0 }
            ]
        },
        drumPattern: {
            lengthBeats: 4,
            hits: [
                // 2+2+2+3 subdivision accents
                { time: 0.0, row: 'kick', velocity: 0.95, probability: 1.0 },
                { time: 0.888, row: 'snare', velocity: 0.8, probability: 1.0 },
                { time: 1.777, row: 'kick', velocity: 0.85, probability: 1.0 },
                { time: 2.666, row: 'snare', velocity: 0.9, probability: 1.0 },
                { time: 3.333, row: 'snare', velocity: 0.7, probability: 0.85 },
                // Hand drums/darbuka style shaker hits
                { time: 0.0, row: 'ch', velocity: 0.6, probability: 0.95 },
                { time: 0.444, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 0.888, row: 'ch', velocity: 0.6, probability: 0.95 },
                { time: 1.333, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 1.777, row: 'ch', velocity: 0.6, probability: 0.95 },
                { time: 2.222, row: 'ch', velocity: 0.5, probability: 0.9 },
                { time: 2.666, row: 'oh', velocity: 0.7, probability: 0.95 },
                { time: 3.0, row: 'ch', velocity: 0.55, probability: 0.9 },
                { time: 3.333, row: 'oh', velocity: 0.7, probability: 0.95 },
                { time: 3.666, row: 'ch', velocity: 0.5, probability: 0.85 }
            ]
        }
    }
};

/**
 * Overwrites the given section patterns with the chosen genre preset patterns.
 * @param {object} section - The active section object containing globalPatterns and progression.
 * @param {string} genreKey - The selected preset key (lofi, neosoul, etc.).
 */
export function applyGenrePreset(section, genreKey) {
    const preset = GENRE_PRESETS[genreKey];
    if (!preset) return false;

    // Overwrite Global Patterns
    const newChordPat = structuredClone(preset.chordPattern);
    newChordPat.isLocalOverride = false;
    newChordPat.instances.forEach(inst => inst.id = generateId());

    const newBassPat = structuredClone(preset.bassPattern);
    newBassPat.isLocalOverride = false;
    newBassPat.instances.forEach(inst => inst.id = generateId());

    const newDrumPat = structuredClone(preset.drumPattern);
    newDrumPat.isLocalOverride = false;
    newDrumPat.hits.forEach(hit => hit.id = generateId());

    section.globalPatterns = {
        chordPattern: newChordPat,
        bassPattern: newBassPat,
        drumPattern: newDrumPat
    };

    // Clean local overrides on the progression to inherit the new preset cleanly
    if (section.progression) {
        section.progression.forEach(chord => {
            if (chord.chordPattern) chord.chordPattern.isLocalOverride = false;
            if (chord.bassPattern) chord.bassPattern.isLocalOverride = false;
            if (chord.drumPattern) chord.drumPattern.isLocalOverride = false;
        });
    }

    return true;
}
