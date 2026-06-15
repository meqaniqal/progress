import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { state } from './store.js';

describe('Macro-Level Melody Generation Strategy', () => {
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
            motifRecurrence: 0.8,
            variationDepth: 0.5,
            density: 0.9,
            restProbability: 0.0,
            density: 1.0,
            ornamentIntensity: 0.0,
            countermelodyEnabled: false,
            behaviorDuringArp: 'simplify',
            behaviorDuringTransitions: 'simplify',
            tensionCurve: 'flat',
            macroPlannerEnabled: true,
            macroContourArchetype: 'arch'
        };
    });

    test('Macro Target Planner contour alignment (Arch shape)', () => {
        const originalRandom = Math.random;
        Math.random = () => 0.9; // Return 0.9 to prevent random flourishes, runs, or mutations
        try {
            const chordObj = { symbol: 'I', duration: 4 };
            // We will schedule across 4 chords to see the arch rise and fall
            const totalChords = 4;
            
            const phrasePitches = [];
            for (let i = 0; i < totalChords; i++) {
                playedNotes = [];
                scheduleMelody(i * 2.0, chordObj, null, null, 2.0, 4, 120, i, totalChords, [60, 64, 67], mockPlayTone);
                if (playedNotes.length > 0) {
                    phrasePitches.push(playedNotes[0].midi); // Grab step 0 target note
                }
            }

            expect(phrasePitches.length).toBe(4);
            // Arch shape contour target values: statement (mid) -> build (high) -> climax (peak) -> resolution (low)
            // Verify it generally rises then falls
            expect(phrasePitches[1]).toBeGreaterThanOrEqual(phrasePitches[0]);
            expect(phrasePitches[2]).toBeGreaterThanOrEqual(phrasePitches[1]);
            expect(phrasePitches[3]).toBeLessThan(phrasePitches[2]);
        } finally {
            Math.random = originalRandom;
        }
    });

    test('Climax Management: Penalize hitting climax peak multiple times', () => {
        state.melodySettings.macroContourArchetype = 'arch';
        const chordObj = { symbol: 'I', duration: 4 };
        
        // Generate notes for a climax role slot (absIndex = 2 of 4)
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 2, 4, [60, 64, 67], mockPlayTone);
        
        const midiNotes = playedNotes.map(n => n.midi);
        const maxPitch = Math.max(...midiNotes);
        const maxPitchOccurrences = midiNotes.filter(p => p === maxPitch).length;
        
        // Hitting the peak climax pitch should be kept singular (at most 2 times, ideally 1)
        expect(maxPitchOccurrences).toBeLessThanOrEqual(2);
    });
});
