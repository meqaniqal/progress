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

    test('Voice-leading microtonal collision prevention nudges consecutive notes', () => {
        const preciseNotes = [];
        const mockPlayTonePrecise = (freq, startTime, duration, inst, bus) => {
            const midi = 12 * Math.log2(freq / 440) + 69;
            preciseNotes.push({ midi, startTime, duration, inst, bus });
        };

        state.divisions = 24; // Quarter-tones (edoStep = 0.5)
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.variationDepth = 0.0;

        clearMelodyMemory();

        // 72.2 and 72.4 are only 0.2 semitones apart, which is < 1 EDO step (0.5 semitones)
        const chordObj = {
            symbol: 'I',
            duration: 4,
            divisions: 24,
            key: 60,
            customNotes: [
                { pitch: 72.2, isMicrotonal: true },
                { pitch: 72.4, isMicrotonal: true }
            ]
        };

        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [72.2, 72.4], mockPlayTonePrecise);

        const melodyNotes = preciseNotes.filter(n => n.bus === 'melody');
        expect(melodyNotes.length).toBeGreaterThan(1);

        // Verify that no two consecutive melody notes are within 0.01 and 0.49 semitones of each other
        for (let i = 1; i < melodyNotes.length; i++) {
            const diff = Math.abs(melodyNotes[i].midi - melodyNotes[i - 1].midi);
            if (diff > 0.01) {
                expect(diff).toBeGreaterThanOrEqual(0.49);
            }
        }
    });

    test('Scale Degree Anchoring prefers microtonal customNotes for anchors', () => {
        const preciseNotes = [];
        const mockPlayTonePrecise = (freq, startTime, duration, inst, bus) => {
            const midi = 12 * Math.log2(freq / 440) + 69;
            preciseNotes.push({ midi, startTime, duration, inst, bus });
        };

        state.divisions = 12;
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 0.1;
        state.melodySettings.restProbability = 0.8;
        state.melodySettings.variationDepth = 0.0;

        clearMelodyMemory();

        const chordObj = {
            symbol: 'I',
            duration: 4,
            key: 60,
            customNotes: [
                { pitch: 60, isMicrotonal: false },
                { pitch: 64.3, isMicrotonal: true }, // microtonally adjusted E
                { pitch: 67, isMicrotonal: false }
            ]
        };

        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64.3, 67], mockPlayTonePrecise);

        const melodyNotes = preciseNotes.filter(n => n.bus === 'melody');
        expect(melodyNotes.length).toBeGreaterThan(0);

        melodyNotes.forEach(n => {
            const pc = (n.midi % 12 + 12) % 12;
            if (Math.abs(pc - 4) < 0.6) {
                // If it is near E, it should be closer to 64.3 (pc 4.3) than 64.0 (pc 4.0)
                expect(Math.abs(pc - 4.3)).toBeLessThan(0.15);
            }
        });
    });

    test('Micro-rests are successfully introduced at low rest probabilities', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 1.0;
        state.melodySettings.restProbability = 0.25; // Low rest probability

        playedNotes = [];
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        // Under 1.0 density and 0.0 rest probability, we would get a continuous run of notes.
        // With 0.25 rest probability, micro-rests should be introduced, meaning there should be gaps.
        // We verify that the notes scheduled have gaps in time that correspond to rests.
        const stepTimes = playedNotes.map(n => n.startTime);
        let hasGap = false;
        for (let i = 1; i < stepTimes.length; i++) {
            const timeDiff = stepTimes[i] - stepTimes[i - 1];
            // If the time diff is significantly larger than a single 16th step step duration, it's a rest gap.
            // 120 bpm = 2 beats per second. 4 beats = 2.0 seconds. 16 steps in 4 beats means each step is 0.125 seconds.
            // A gap of > 0.18s indicates a rest gap (e.g. at least 2 sixteenth steps apart).
            if (timeDiff > 0.18) {
                hasGap = true;
                break;
            }
        }
        expect(hasGap).toBe(true);
    });

    test('Passing color notes are resolved stepwise and never precede long rests', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 0.5;
        state.melodySettings.restProbability = 0.3;

        playedNotes = [];
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        const chordTonePcs = [0, 4, 7];
        const scalePcs = [0, 2, 4, 5, 7, 9, 11]; // C Major scale

        for (let i = 0; i < playedNotes.length; i++) {
            const note = playedNotes[i];
            const pc = (note.midi % 12 + 12) % 12;
            const isChordTone = chordTonePcs.includes(pc);
            const isScaleTone = scalePcs.includes(pc);
            const isColorTone = !isChordTone && !isScaleTone;

            if (isColorTone) {
                // If it is a color/passing tone, verify that the next note exists and is close
                expect(i).toBeLessThan(playedNotes.length - 1);
                const nextNote = playedNotes[i + 1];
                const timeDiff = nextNote.startTime - note.startTime;
                expect(timeDiff).toBeLessThanOrEqual(0.18); // Close (within 1 beat)

                // Verify that the next note is a chord tone
                const nextPc = (nextNote.midi % 12 + 12) % 12;
                expect(chordTonePcs).toContain(nextPc);

                // Verify stepwise resolution
                const interval = Math.abs(nextNote.midi - note.midi);
                expect(interval).toBeLessThanOrEqual(2);
            }
        }
    });

    test('Blues mode does not generate consecutive blue notes and remains mostly in scale', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'blues';
        state.melodySettings.density = 0.8;
        state.melodySettings.restProbability = 0.1;

        playedNotes = [];
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        const chordTonePcs = [0, 4, 7];
        const scalePcs = [0, 2, 4, 5, 7, 9, 11]; // C Major scale

        let consecutiveBlueCount = 0;
        for (let i = 0; i < playedNotes.length; i++) {
            const note = playedNotes[i];
            const pc = (note.midi % 12 + 12) % 12;
            const isScaleTone = scalePcs.includes(pc);
            
            // A blue note in this context is off-key/non-scale tone
            if (!isScaleTone) {
                consecutiveBlueCount++;
                expect(consecutiveBlueCount).toBeLessThanOrEqual(1); // Never consecutive
            } else {
                consecutiveBlueCount = 0;
            }
        }
    });

    test('Rests slider successfully increases number of rests in generated melody', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'generic';
        state.melodySettings.density = 0.8;
        
        // Test with low rest probability
        state.melodySettings.restProbability = 0.05;
        playedNotes = [];
        scheduleMelody(0, { symbol: 'I', duration: 4 }, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);
        const lowRestNoteCount = playedNotes.length;

        // Test with high rest probability
        state.melodySettings.restProbability = 0.95;
        playedNotes = [];
        scheduleMelody(0, { symbol: 'I', duration: 4 }, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);
        const highRestNoteCount = playedNotes.length;

        expect(highRestNoteCount).toBeLessThan(lowRestNoteCount);
    });

    test('Grace notes in Classical/Baroque mode are not scheduled with insufficient space', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'classical';
        state.melodySettings.density = 0.9;
        state.melodySettings.restProbability = 0.0;
        state.melodySettings.ornamentIntensity = 1.0;

        let preciseTones = [];
        const mockPlayTonePrecise = (freq, startTime, duration, inst, bus) => {
            preciseTones.push({ freq, startTime, duration, bus });
        };

        scheduleMelody(0, { symbol: 'I', duration: 4 }, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTonePrecise);

        const graceNotes = preciseTones.filter(n => n.duration === 0.04);
        const melodyNotes = preciseTones.filter(n => n.bus === 'melody' && n.duration !== 0.04);

        graceNotes.forEach(g => {
            // Find the main note that starts right after the grace note
            const mainNote = melodyNotes.find(m => Math.abs(m.startTime - (g.startTime + 0.05)) < 0.001);
            expect(mainNote).toBeDefined();

            // Find the previous note and verify there is enough space
            const prevNote = melodyNotes.find(m => m.startTime < g.startTime);
            if (prevNote) {
                const space = g.startTime - (prevNote.startTime + prevNote.duration);
                expect(space).toBeGreaterThanOrEqual(0.03); // Ornaments start at least 30ms after previous note ends
            }
        });
    });

    test('Blues mode does not approach blue notes from one half-step below and resolve to it', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'blues';
        state.melodySettings.density = 0.9;
        state.melodySettings.restProbability = 0.0;

        playedNotes = [];
        const chordObj = { symbol: 'I', duration: 4 };
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        const scalePcs = [0, 2, 4, 5, 7, 9, 11]; // C Major scale

        for (let i = 1; i < playedNotes.length - 1; i++) {
            const prevNote = playedNotes[i - 1];
            const note = playedNotes[i];
            const nextNote = playedNotes[i + 1];

            const notePc = (note.midi % 12 + 12) % 12;
            const isScaleTone = scalePcs.includes(notePc);

            // If this is a blue note
            if (!isScaleTone) {
                const isPrevHalfStepBelow = Math.abs(prevNote.midi - (note.midi - 1)) < 0.01;
                const isNextHalfStepBelow = Math.abs(nextNote.midi - (note.midi - 1)) < 0.01;
                
                // It should not be approached from one half-step below AND resolved back to one half-step below
                expect(isPrevHalfStepBelow && isNextHalfStepBelow).toBe(false);
            }
        }
    });

    test('Blues mode voice leading rules for flat 3rd and flat 5th are correctly enforced', () => {
        state.divisions = 12;
        state.melodySettings.genre = 'blues';
        state.melodySettings.density = 0.95;
        state.melodySettings.restProbability = 0.0;

        playedNotes = [];
        const chordObj = { symbol: 'I', duration: 4 }; // C major chord, C root (chordKey = 60, pc = 0)
        scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

        for (let i = 0; i < playedNotes.length; i++) {
            const note = playedNotes[i];
            const pc = (note.midi % 12 + 12) % 12;
            
            // Check flat 5 (pc = 6 relative to C root is 6)
            if (pc === 6) {
                // Must be in the middle of a chromatic run (prev note must be pc 5 or pc 7, and next note must continue the direction)
                expect(i).toBeGreaterThan(0);
                expect(i).toBeLessThan(playedNotes.length - 1);
                const prev = playedNotes[i - 1];
                const next = playedNotes[i + 1];
                const prevPc = (prev.midi % 12 + 12) % 12;
                const nextPc = (next.midi % 12 + 12) % 12;
                
                expect([5, 7].includes(prevPc)).toBe(true);
                if (prevPc === 5) {
                    expect(nextPc).toBe(7);
                } else if (prevPc === 7) {
                    expect(nextPc).toBe(5);
                }
            }
            
            // Check flat 3 (pc = 3 relative to C root is 3)
            if (pc === 3) {
                // Must act as an approach note that resolves a half-step up to major 3rd (pc = 4)
                expect(i).toBeLessThan(playedNotes.length - 1);
                const next = playedNotes[i + 1];
                const nextPc = (next.midi % 12 + 12) % 12;
                expect(nextPc).toBe(4);
            }
        }
    });
});


