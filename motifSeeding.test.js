import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { state } from './store.js';

describe('Melody Motif Seeding & Adaptation', () => {
    let playedNotes;
    let mockPlayTone;

    beforeEach(() => {
        playedNotes = [];
        mockPlayTone = (freq, startTime, duration, inst, bus) => {
            const midi = Math.round(12 * Math.log2(freq / 440) + 69);
            playedNotes.push({ midi, startTime, duration, inst, bus });
        };

        clearMelodyMemory();

        state.baseKey = 60; // C4
        state.mode = 'major';
        state.divisions = 12;
        state.melodySettings = {
            enabled: true,
            genre: 'generic',
            motifRecurrence: 1.0,
            variationDepth: 0.0, // Strict seed conformance
            density: 1.0,
            restProbability: 0.0,
            ornamentIntensity: 0.0,
            countermelodyEnabled: false,
            seedSource: 'motif',
            activeMotifId: 'test-motif-id',
            midiExtractionMode: 'polyphonic'
        };

        state.userMotifs = [
            {
                id: 'test-motif-id',
                name: 'Test Motif',
                notes: [
                    { time: 0.0, duration: 0.5, pitchOffset: 0, voiceIndex: 0 }, // Root
                    { time: 1.0, duration: 0.5, pitchOffset: 4, voiceIndex: 0 }, // 3rd
                    { time: 2.0, duration: 0.5, pitchOffset: 7, voiceIndex: 0 }, // 5th
                    { time: 3.0, duration: 0.5, pitchOffset: 12, voiceIndex: 0 } // Octave
                ]
            }
        ];
    });

    test('scheduleMelody in polyphonic mode conforms notes strictly to chord tones', () => {
        const chordObj = { symbol: 'I', duration: 4 }; // C Major
        scheduleMelody(0, chordObj, null, null, 4.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        expect(playedNotes).toHaveLength(4);
        
        // Pitch checks
        const pitches = playedNotes.map(n => n.midi);
        // Notes should sit around melody range (67 to 79) conformed to C Major chord tones
        pitches.forEach(p => {
            const pc = p % 12;
            expect([0, 4, 7]).toContain(pc); // C, E, G
        });

        // Time checks
        expect(playedNotes[0].startTime).toBeCloseTo(0.0);
        expect(playedNotes[1].startTime).toBeCloseTo(1.0);
        expect(playedNotes[2].startTime).toBeCloseTo(2.0);
        expect(playedNotes[3].startTime).toBeCloseTo(3.0);
    });

    test('monophonic motif seeding uses motif to generate melody structure', () => {
        state.melodySettings.midiExtractionMode = 'highest';
        state.melodySettings.seedSource = 'motif';
        
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 4.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        // Should schedule notes representing the seed motif
        expect(playedNotes.length).toBeGreaterThan(0);
    });
});
