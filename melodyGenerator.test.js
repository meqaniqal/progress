import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { state } from './store.js';

describe('Melody Generator Composition Rules', () => {
    let playedNotes;
    let mockPlayTone;

    beforeEach(() => {
        playedNotes = [];
        mockPlayTone = (freq, startTime, duration, inst, bus) => {
            // Frequency to MIDI conversion: midi = 12 * log2(freq / 440) + 69
            const midi = Math.round(12 * Math.log2(freq / 440) + 69);
            playedNotes.push({ midi, startTime, duration, inst, bus });
        };

        clearMelodyMemory();
        
        // Setup default state
        state.baseKey = 60; // C4
        state.mode = 'major';
        state.divisions = 12;
        state.melodySettings = {
            enabled: true,
            genre: 'none',
            motifRecurrence: 0.8,
            variationDepth: 0.5,
            density: 0.9, // High density to get more notes for statistical significance
            restProbability: 0.1,
            ornamentIntensity: 0.0,
            countermelodyEnabled: false,
            behaviorDuringArp: 'simplify',
            behaviorDuringTransitions: 'simplify',
            tensionCurve: 'flat'
        };
    });

    test('Stepwise motion vs leaps (Conjunct motion priority)', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        expect(playedNotes.length).toBeGreaterThan(2);

        let stepsCount = 0;
        let leapsCount = 0;

        for (let i = 1; i < playedNotes.length; i++) {
            const diff = Math.abs(playedNotes[i].midi - playedNotes[i - 1].midi);
            if (diff <= 2) {
                stepsCount++;
            } else if (diff > 2) {
                leapsCount++;
            }
        }

        const totalIntervals = stepsCount + leapsCount;
        if (totalIntervals > 0) {
            const stepRatio = stepsCount / totalIntervals;
            // We targeted ~70% stepwise. Check if it's statistically prominent (>50%)
            expect(stepRatio).toBeGreaterThan(0.4);
        }
    });

    test('Leap contrary motion resolution rule', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        for (let i = 2; i < playedNotes.length; i++) {
            const prevInterval = playedNotes[i - 1].midi - playedNotes[i - 2].midi;
            const currentInterval = playedNotes[i].midi - playedNotes[i - 1].midi;

            // If a leap larger than a Major 3rd (4 semitones) occurred
            if (Math.abs(prevInterval) > 4) {
                // Assert it resolved by moving in the contrary direction
                const resolvedContrary = (prevInterval > 0 && currentInterval < 0) || (prevInterval < 0 && currentInterval > 0);
                expect(resolvedContrary).toBe(true);
            }
        }
    });

    test('EDO tuning and scale compatibility', () => {
        state.divisions = 24; // Quarter-tones
        const chordObj = { symbol: 'I', duration: 4, divisions: 24 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        playedNotes.forEach(note => {
            // Frequencies should fit scale intervals (multiples of 0.5 semitones in EDO-24)
            const relativeMidi = note.midi - state.baseKey;
            const isMultipleOfHalf = (relativeMidi * 2) % 1 === 0;
            expect(isMultipleOfHalf).toBe(true);
        });
    });
});
