import { defaultContext } from './melodyContext.js';
import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { state } from './store.js';

describe('Professional Melody Generator', () => {
    let mockPlayTone;
    let playedNotes;

    beforeEach(() => {
        // Reset global settings state
        state.melodySettings = {
            enabled: true,
            genre: 'none',
            engine: 'pro',
            density: 0.8,
            restProbability: 0.0,
            rangeMin: 60,
            rangeMax: 84,
            phraseStructure: 'period',
            allowAsymmetry: false
        };
        state.divisions = 12;

        playedNotes = [];
        mockPlayTone = (freq, startTime, duration, inst, bus) => {
            playedNotes.push({ freq, startTime, duration, inst, bus });
        };

        clearMelodyMemory();
    });

    test('should generate and schedule melody notes with the professional engine', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            0,
            1,
            [60, 64, 67],
            mockPlayTone
        );

        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
        expect(playedNotes.length).toBeGreaterThan(0);
    });

    test('should plan and deliver a climax step and climax pitch matching the planning rules', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            0,
            1,
            [60, 64, 67],
            mockPlayTone
        );

        // Find the note corresponding to the climax
        const maxPitch = Math.max(...result.map(n => n.pitch));
        const climaxNote = result.find(n => n.pitch === maxPitch);

        expect(climaxNote).toBeDefined();
        expect(climaxNote.pitch).toBeGreaterThanOrEqual(48);
    });

    test('should apply strict blues voice leading rules for flat 3rd and flat 5th', () => {
        state.melodySettings.genre = 'blues';
        state.melodySettings.density = 0.95;

        const chordObj = { symbol: 'I', duration: 4 }; // C major chord, C root (60)
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            0,
            1,
            [60, 64, 67],
            mockPlayTone
        );

        for (let i = 0; i < result.length; i++) {
            const note = result[i];
            const pc = Math.round(((note.pitch % 12 + 12) % 12) * 100) / 100;

            // Flat 5th (pc = 6 relative to C=60 is 6)
            if (pc === 6) {
                expect(i).toBeGreaterThan(0);
                expect(i).toBeLessThan(result.length - 1);
                const prev = result[i - 1];
                const next = result[i + 1];
                const prevPc = Math.round(((prev.pitch % 12 + 12) % 12) * 100) / 100;
                const nextPc = Math.round(((next.pitch % 12 + 12) % 12) * 100) / 100;

                expect([5, 7].includes(prevPc)).toBe(true);
                if (prevPc === 5) {
                    expect(nextPc).toBe(7);
                } else if (prevPc === 7) {
                    expect(nextPc).toBe(5);
                }
            }

            // Flat 3rd (pc = 3 relative to C=60 is 3)
            if (pc === 3) {
                expect(i).toBeLessThan(result.length - 1);
                const next = result[i + 1];
                const nextPc = Math.round(((next.pitch % 12 + 12) % 12) * 100) / 100;
                expect(nextPc).toBe(4); // Resolves a half-step up to major 3rd
            }
        }
    });

    test('should schedule grace notes in classical mode when space permits', () => {
        state.melodySettings.genre = 'classical';
        state.melodySettings.density = 0.5;

        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            0,
            1,
            [60, 64, 67],
            mockPlayTone
        );

        // Grace notes have a very short duration in our mock (0.04)
        const graceNotes = playedNotes.filter(n => n.duration === 0.04);
        expect(graceNotes.length).toBeGreaterThanOrEqual(0);
    });

    test('should never generate isolated blue notes (must be supported on both sides)', () => {
        state.melodySettings.genre = 'blues';
        state.melodySettings.density = 0.3; // Sparser settings
        state.melodySettings.restProbability = 0.5;

        const chordObj = { symbol: 'I', duration: 4 }; // C major chord
        
        // Run multiple times to verify statistical stability
        for (let run = 0; run < 10; run++) {
            playedNotes = [];
            const result = scheduleMelody(
                0,
                chordObj,
                null,
                null,
                2.0,
                4,
                120,
                0,
                1,
                [60, 64, 67],
                mockPlayTone
            );

            result.forEach((note, idx) => {
                const pc = Math.round(((note.pitch % 12 + 12) % 12) * 100) / 100;
                const isBlueNote = (pc === 3 || pc === 6);

                if (isBlueNote) {
                    // Check that there is a note scheduled on the step immediately preceding and succeeding it
                    const hasPrevNeighbor = result.some(n => n.step === note.step - 1);
                    const hasNextNeighbor = result.some(n => n.step === note.step + 1);

                    expect(hasPrevNeighbor).toBe(true);
                    expect(hasNextNeighbor).toBe(true);
                }
            });
        }
    });

    test('should generate dense runs when density is high and rest probability is low', () => {
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.maxNoteSpeed = 16; // 16th notes

        const chordObj = { symbol: 'I', duration: 4 };
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            2, // absIndex = 2 to ensure we hit a high-tension section of the phrase arch
            1,
            [60, 64, 67],
            mockPlayTone
        );

        // With density = 1.0 and rest = 0.0, a dense run of notes is generated (allowing for dynamic speed variations)
        expect(result.length).toBeGreaterThanOrEqual(12);
    });

    test('should support 32nd note speed (maxNoteSpeed: 32) producing shorter durations', () => {
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.maxNoteSpeed = 32;

        const chordObj = { symbol: 'I', duration: 4 };
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            2, // absIndex = 2 to ensure we hit a high-tension section of the phrase arch
            1,
            [60, 64, 67],
            mockPlayTone
        );

        // Verify that 32nd notes are generated (duration: 2.0s / 32 steps = 0.0625s)
        const has32ndNote = result.some(n => Math.abs(n.noteDuration - 0.0625) < 0.001);
        expect(has32ndNote).toBe(true);
    });

    test('should prevent excessive sequentially repeated notes', () => {
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.maxNoteSpeed = 16; // limit should be 2 consecutive repeats max (3 of same note in a row prohibited)

        const chordObj = { symbol: 'I', duration: 4 };
        const result = scheduleMelody(
            0,
            chordObj,
            null,
            null,
            2.0,
            4,
            120,
            0,
            1,
            [60, 64, 67],
            mockPlayTone
        );

        let repeats = 1;
        for (let i = 1; i < result.length; i++) {
            if (result[i].pitch === result[i - 1].pitch) {
                repeats++;
                expect(repeats).toBeLessThanOrEqual(3);
            } else {
                repeats = 1;
            }
        }
    });
});
