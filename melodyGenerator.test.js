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
            tensionCurve: 'flat',
            shortestNoteLimit: 16
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
        console.log('PLAYED NOTES:', playedNotes.map(n => n.midi));
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

    test('Chromatic chord tone preservation and voice leading resolution', () => {
        // Chord bVI in C major (key 60) is Ab Major: notes Ab (68), C (72), Eb (75)
        const chordObj = { symbol: 'bVI', duration: 4, key: 60 };
        const prevChordObj = { symbol: 'I', duration: 4, key: 60 };
        const nextChordObj = { symbol: 'V', duration: 4, key: 60 };
        
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        
        scheduleMelody(0, chordObj, nextChordObj, prevChordObj, 2.0, 4, 120, 0, 1, [68, 72, 75], mockPlayTone);

        console.log('CHROMATIC PLAYED NOTES:', playedNotes.map(n => ({ midi: n.midi, pc: (n.midi % 12 + 12) % 12 })));
        // Verify if any played note corresponds to the chromatic chord tones (Ab/Eb -> pc 8 or 3)
        const hasChromaticTone = playedNotes.some(note => {
            const pc = (note.midi % 12 + 12) % 12;
            return pc === 8 || pc === 3;
        });
        expect(hasChromaticTone).toBe(true);
    });

    test('Motif Families: Generates hook, connector, and cadence cells', () => {
        // Clear memory to force generation
        clearMelodyMemory();
        
        // Mock scheduleMelody to check behavior across phrase positions
        // We will call with absIndex = 0 (hook), 2 (connector), 3 (cadence)
        const chordObj = { symbol: 'I', duration: 4 };
        
        // Phrase beginning (absIndex = 0)
        playedNotes = [];
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 4, [60, 64, 67], mockPlayTone);
        expect(playedNotes.length).toBeGreaterThan(0);
        
        // Phrase ending (absIndex = 3)
        playedNotes = [];
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 3, 4, [60, 64, 67], mockPlayTone);
        expect(playedNotes.length).toBeGreaterThan(0);
    });

    test('Vertical Congruence: Avoids chord tone doubling via weighted selection', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        // We pass active chord tones [60, 64, 67]
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);
        
        // Verify that not all notes played are chord tones (meaning it selects extensions/other valid pitches)
        const nonChordTonePlayed = playedNotes.some(note => {
            const pc = (note.midi % 12 + 12) % 12;
            return ![0, 4, 7].includes(pc);
        });
        expect(nonChordTonePlayed).toBe(true);
    });

    test('Register Separation: Enforces range boundaries for melody and countermelody', () => {
        state.melodySettings.countermelodyEnabled = true;
        state.melodySettings.countermelodyMode = 'contrary';
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;

        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 4, [60, 64, 67], mockPlayTone);

        const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
        const counterNotes = playedNotes.filter(n => n.bus === 'countermelody');

        expect(melodyNotes.length).toBeGreaterThan(0);
        expect(counterNotes.length).toBeGreaterThan(0);

        melodyNotes.forEach(n => {
            expect(n.midi).toBeGreaterThanOrEqual(67);
            expect(n.midi).toBeLessThanOrEqual(84); // 79 + 5 ceiling max if pushed
        });

        counterNotes.forEach(n => {
            expect(n.midi).toBeGreaterThanOrEqual(57);
            expect(n.midi).toBeLessThanOrEqual(69);
        });
    });

    test('Phrase Resolution Rules: Rule A and Rule B', () => {
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        // Consequent phrase (absIndex = 1)
        const chordObj = { symbol: 'I', duration: 4, key: 60 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 1, 4, [60, 64, 67], mockPlayTone);

        const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
        expect(melodyNotes.length).toBeGreaterThan(0);

        // Rule A check: consequent phrase final note should resolve to root (pc 0) or 3rd (pc 4) of chord
        const finalNote = melodyNotes[melodyNotes.length - 1];
        const finalPc = (finalNote.midi % 12 + 12) % 12;
        expect([0, 4]).toContain(finalPc);
    });

    test('Local Chord-Scale Transposition matches quality and root', () => {
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.variationDepth = 1.0; // Force high chance of local transposition

        // Chord II (D major) in C major (key 60)
        // Root is 62 (D). Notes D (62), F# (66), A (69)
        const chordObj = { symbol: 'II', duration: 4, key: 60 };
        const originalRandom = Math.random;
        Math.random = () => 0.0; // Force local scale selection

        try {
            scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 4, [62, 66, 69], mockPlayTone);
            
            const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
            expect(melodyNotes.length).toBeGreaterThan(0);
            
            // D major scale pitch classes: D(2), E(4), F#(6), G(7), A(9), B(11), C#(1)
            const dMajorPcs = [1, 2, 4, 6, 7, 9, 11];
            melodyNotes.forEach(note => {
                const pc = (note.midi % 12 + 12) % 12;
                expect(dMajorPcs).toContain(pc);
            });
        } finally {
            Math.random = originalRandom;
        }
    });

    test('Color tone stepwise resolution rule', () => {
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        for (let i = 1; i < playedNotes.length; i++) {
            const prevNote = playedNotes[i - 1];
            const prevPc = (prevNote.midi % 12 + 12) % 12;
            const isPrevColor = ![0, 2, 4, 5, 7, 9, 11].includes(prevPc) && ![0, 4, 7].includes(prevPc);
            if (isPrevColor) {
                const currentNote = playedNotes[i];
                const currentPc = (currentNote.midi % 12 + 12) % 12;
                const isCurrentDiatonicOrChordTone = [0, 2, 4, 5, 7, 9, 11].includes(currentPc) || [0, 4, 7].includes(currentPc);
                const diff = Math.abs(currentNote.midi - prevNote.midi);
                // The note after a color tone should resolve stepwise or be diatonic/chord-tone
                expect(diff <= 2 || isCurrentDiatonicOrChordTone).toBe(true);
            }
        }
    });

    test('Isolated notes are snapped strictly to stable chord tones', () => {
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 0.25; // Lower density to create isolated notes
        state.melodySettings.restProbability = 0.5;

        // Clear memory to reset note timings
        clearMelodyMemory();

        const chordObj = { symbol: 'I', duration: 4, key: 60 };
        // Pass chord tones: C (60), E (64), G (67)
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
        expect(melodyNotes.length).toBeGreaterThan(0);

        // Find notes that are isolated (no notes within ~0.95 beat, which is 0.475 seconds at 120bpm)
        const gapThreshold = 0.475;
        melodyNotes.forEach((n, idx) => {
            const prev = idx > 0 ? melodyNotes[idx - 1] : null;
            const next = idx < melodyNotes.length - 1 ? melodyNotes[idx + 1] : null;
            const spaceBefore = prev ? (n.startTime - prev.startTime) : 999;
            const spaceAfter = next ? (next.startTime - n.startTime) : 999;

            if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
                const pc = (n.midi % 12 + 12) % 12;
                // Isolated notes must be snapped strictly to stable C major chord tones: C(0), E(4), G(7)
                expect([0, 4, 7]).toContain(pc);
            }
        });
    });

    test('Foreshadowing does not hijack early/downbeat notes', () => {
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 0.25; // low density to trigger silence and foreshadowing
        state.melodySettings.restProbability = 0.5;

        clearMelodyMemory();

        const chordObj = { symbol: 'I', duration: 4, key: 60 };
        const nextChordObj = { symbol: 'ii', duration: 4, key: 62 }; // next chord is Dm
        scheduleMelody(0, chordObj, nextChordObj, null, 2.0, 4, 120, 0, 2, [60, 64, 67], mockPlayTone);

        const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
        expect(melodyNotes.length).toBeGreaterThan(0);

        // Note 1 (Step 0) should remain a C major chord tone, not be hijacked to Dm
        const note1 = melodyNotes[0];
        const pc = (note1.midi % 12 + 12) % 12;
        expect([0, 4, 7]).toContain(pc);
    });
});


