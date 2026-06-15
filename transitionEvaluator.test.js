import { jest } from '@jest/globals';
import { getTransitionPitch, expandMasterTransitions, sliceInstancesByTransitions, applyInstanceOffsets } from './transitionEvaluator.js';
import { state } from './store.js';

describe('transitionEvaluator', () => {
    beforeEach(() => {
        state.snapTransitionsToScale = false;
        state.divisions = 12;
    });
    
    describe('getTransitionPitch', () => {
        it('calculates late passing tone (averages current and next)', () => {
            const trans = { type: 'passing', startTime: 0.8 };
            const pitch = getTransitionPitch(trans, 0, [60], [55], [64]);
            expect(pitch).toBe(62); // (60 + 64) / 2
        });

        it('calculates early passing tone (averages prev and current)', () => {
            const trans = { type: 'passing', startTime: 0.0 };
            const pitch = getTransitionPitch(trans, 0, [60], [58], [64]);
            expect(pitch).toBe(59); // (58 + 60) / 2
        });

        it('anticipates next note when late in the slot', () => {
            const trans = { type: 'anticipate', startTime: 0.8 };
            const pitch = getTransitionPitch(trans, 0, [60], [55], [64]);
            expect(pitch).toBe(64);
        });

        it('suspends previous note when early in the slot', () => {
            const trans = { type: 'suspend', startTime: 0.0 };
            const pitch = getTransitionPitch(trans, 0, [60], [55], [64]);
            expect(pitch).toBe(55);
        });
    });

    describe('expandMasterTransitions', () => {
        it('expands auto-smooth into passing tones for notes moving >= 2 semitones', () => {
            const trans = [{ voiceIndex: 'master', type: 'auto-smooth' }];
            const current = [60, 64, 67];
            const next = [62, 64, 69]; // Voice 0 moves +2, Voice 1 moves 0, Voice 2 moves +2
            
            const expanded = expandMasterTransitions(trans, current, null, next);
            
            expect(expanded.length).toBe(2);
            expect(expanded[0].voiceIndex).toBe(0);
            expect(expanded[0].type).toBe('passing');
            expect(expanded[1].voiceIndex).toBe(2);
            expect(expanded[1].type).toBe('passing');
        });

        it('expands suspend-all into suspensions for every active voice', () => {
            const trans = [{ voiceIndex: 'master', type: 'suspend-all' }];
            const current = [60, 64, 67];
            const expanded = expandMasterTransitions(trans, current, null, null);
            
            expect(expanded.length).toBe(3);
            expect(expanded.every(t => t.type === 'suspend')).toBe(true);
        });
    });

    describe('sliceInstancesByTransitions', () => {
        it('maps normal notes identically when there are no active transitions', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0, 0] }];
            const current = [60, 64];
            const sliced = sliceInstancesByTransitions(instances, [], current, current, current);
            
            expect(sliced.length).toBe(1);
            expect(sliced[0].notesToPlay).toEqual([60, 64]);
        });

        it('slices an instance exactly at transition boundaries and updates the transitioned note', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0, 0] }];
            // Transition on voice 0 from 0.8 to 1.0
            const trans = [{ id: 't1', voiceIndex: 0, type: 'passing', startTime: 0.8, duration: 0.2, probability: 1.0 }];
            const current = [60, 64];
            const next = [64, 64]; // Voice 0 moves from 60 to 64. Passing should be 62.

            const sliced = sliceInstancesByTransitions(instances, trans, current, current, next);
            
            expect(sliced.length).toBe(2);
            
            // First slice: 0.0 to 0.8 (Normal notes)
            expect(sliced[0].startTime).toBe(0.0);
            expect(sliced[0].duration).toBeCloseTo(0.8);
            expect(sliced[0].notesToPlay).toEqual([60, 64]);

            // Second slice: 0.8 to 1.0 (Transition note on voice 0)
            expect(sliced[1].startTime).toBeCloseTo(0.8);
            expect(sliced[1].duration).toBeCloseTo(0.2);
            expect(sliced[1].notesToPlay).toEqual([62, 64]); // 62 is the passing tone (60+64)/2
        });
        
        it('respects probability by skipping transition modification if probability fails', () => {
            // Mock Math.random to guarantee failure (0% chance)
            const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
            
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0, 0] }];
            // 10% chance
            const trans = [{ id: 't1', voiceIndex: 0, type: 'passing', startTime: 0.8, duration: 0.2, probability: 0.1 }];
            const current = [60, 64];
            const next = [64, 64];

            const sliced = sliceInstancesByTransitions(instances, trans, current, current, next);
            
            // Does not slice at the boundary because the transition failed probability check
            expect(sliced.length).toBe(1);
            expect(sliced[0].notesToPlay).toEqual([60, 64]);
            
            mathRandomSpy.mockRestore();
        });
    });

    describe('Flourish Consistency & Boundary Resolution', () => {
        it('should pre-calculate stepPitches and never generate consecutive duplicate pitches in a random block', () => {
            // Mock Math.random to always return 0 (which would normally pick the same first item from the pool repeatedly)
            const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.0);
            
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            const trans = [{ id: 't1', voiceIndex: 0, type: 'random', startTime: 0.0, duration: 0.5, flourishRate: 4 }];
            const current = [60];
            
            const sliced = sliceInstancesByTransitions(instances, trans, current, current, current);
            
            // Should be 4 slices for the random block + 1 for the rest of the instance = 5 slices
            expect(sliced.length).toBe(5);
            
            // Check the pitches of the 4 flourish slices
            const pitches = sliced.slice(0, 4).map(s => s.notesToPlay[0]);
            
            // They should NOT be identical, because the anti-duplication logic nudges them!
            expect(pitches[0]).not.toEqual(pitches[1]);
            expect(pitches[1]).not.toEqual(pitches[2]);
            expect(pitches[2]).not.toEqual(pitches[3]);
            
            mathRandomSpy.mockRestore();
        });

        it('should resolve full-slot flourishes to the next chord', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // Spans the entire duration! touches the right edge
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.0, duration: 1.0, flourishRate: 3 }];
            const current = [60];
            const next = [65]; // Target is next chord!
            
            const sliced = sliceInstancesByTransitions(instances, trans, current, current, next);
            
            // Because it touches the end (>0.5 right edge), it should target next (65)
            // Linear Interpolation from origin(60) to target(65)
            // 61.25 -> 61, 62.5 -> 63, 63.75 -> 64
            expect(sliced.length).toBe(3);
            expect(sliced[0].notesToPlay[0]).toBe(61);
            expect(sliced[1].notesToPlay[0]).toBe(63);
            expect(sliced[2].notesToPlay[0]).toBe(64);
        });

        it('should dynamically throttle flourish rates if absolute duration is too short for clear pitch perception', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // 0.2 duration ratio * 0.5s chord = 0.1s absolute duration.
            // 0.1s / 0.05s min note length = max 2 notes!
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.8, duration: 0.2, flourishRate: 8 }];
            const current = [60];
            const next = [65];
            
            const chordDurationSec = 0.5; // e.g. 120bpm, 1 beat
            
            const sliced = sliceInstancesByTransitions(instances, trans, current, current, next, chordDurationSec);
            
            // The rate of 8 should be throttled down to 2 notes.
            // Sliced length = 2 notes + 1 (the 0.0 to 0.8 chunk) = 3 slices.
            expect(sliced.length).toBe(3);
        });

        it('should gracefully downgrade to a passing tone if absolute duration cannot support even 2 notes', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // 0.05 duration ratio * 0.5s chord = 0.025s absolute duration.
            // 0.025s / 0.05s = max 0 notes! Downgrade to passing tone!
            const trans = [{ id: 't1', voiceIndex: 0, type: 'random', startTime: 0.95, duration: 0.05, flourishRate: 4 }];
            const current = [60];
            const next = [65];
            
            const chordDurationSec = 0.5;
            
            const sliced = sliceInstancesByTransitions(instances, trans, current, current, next, chordDurationSec);
            
            // It becomes a single passing tone slice
            // Sliced length = 1 passing note + 1 (the 0.0 to 0.95 chunk) = 2 slices.
            expect(sliced.length).toBe(2);
        });

        it('should resolve a run-up to the next chord note when placed at the end', () => {
            const trans = { type: 'run-up', startTime: 0.8, duration: 0.2, flourishRate: 3 };
            const pitch1 = getTransitionPitch(trans, 0, [60], [55], [65], 0.81); 
            const pitch2 = getTransitionPitch(trans, 0, [60], [55], [65], 0.90); 
            const pitch3 = getTransitionPitch(trans, 0, [60], [55], [65], 0.99); 
            expect(pitch1).toBe(61);
            expect(pitch2).toBe(63);
            expect(pitch3).toBe(64);
        });

        it('should resolve a run-down to the next chord note when placed at the end', () => {
            const trans = { type: 'run-down', startTime: 0.8, duration: 0.2, flourishRate: 3 };
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.81)).toBe(67);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.90)).toBe(67);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.99)).toBe(66);
        });

        it('should resolve an enclosure to the next chord note when placed at the end', () => {
            const trans = { type: 'enclosure', startTime: 0.8, duration: 0.2, flourishRate: 3 };
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.81)).toBe(67);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.90)).toBe(64);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.99)).toBe(66);
        });

        it('should properly anchor random block at the start boundary to step away from prev chord', () => {
            const trans = { type: 'random', startTime: 0.0, duration: 0.2, flourishRate: 4 };
            const pitch = getTransitionPitch(trans, 0, [60], [55], [65], 0.01);
            expect([53, 54, 56, 57, 58]).toContain(pitch);
        });

        it('should properly anchor random block at the end boundary to approach next chord', () => {
            const trans = { type: 'random', startTime: 0.8, duration: 0.2, flourishRate: 4 };
            const pitch = getTransitionPitch(trans, 0, [60], [55], [65], 0.99);
            expect([63, 64, 66, 67, 68]).toContain(pitch);
        });
        
        it('should resolve a run-up to the current chord note when placed at the start', () => {
            const trans = { type: 'run-up', startTime: 0.0, duration: 0.2, flourishRate: 3 };
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.01)).toBe(56);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.10)).toBe(58);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.19)).toBe(59);
        });
    });

    describe('Generative Personas', () => {
        beforeEach(() => {
            state.generatorPersona = 'normal';
        });

        afterEach(() => {
            state.generatorPersona = 'normal';
        });

        it('lazy persona overrides complex flourishes to passing/suspend and caps rate', () => {
            const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.0);
            state.generatorPersona = 'lazy';
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // Complex flourish 'run-up' spanning the end of the slot
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.8, duration: 0.2, flourishRate: 4, probability: 1.0 }];
            
            const sliced = sliceInstancesByTransitions(instances, trans, [60], [55], [64], 1.0);
            
            // For a lazy persona, 'run-up' on the right side (startTime = 0.8 >= 0.5) is coerced to 'passing'.
            // Passing tones are simple (rate cap doesn't apply to passing directly but rate is cleared).
            // Let's verify that a slice boundary is created at 0.8, and the note is a passing tone.
            expect(sliced.length).toBe(2);
            expect(sliced[1].startTime).toBeCloseTo(0.8);
            expect(sliced[1].notesToPlay[0]).toBe(62); // (60 + 64) / 2
            mathRandomSpy.mockRestore();
        });

        it('restless persona boosts flourish rates', () => {
            state.generatorPersona = 'restless';
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // Transition with undefined flourishRate, normally default rate is 3
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.5, duration: 0.5, probability: 1.0 }];
            
            // Chord duration of 10.0 seconds to make sure maxAllowedRate is huge and doesn't cap us
            const sliced = sliceInstancesByTransitions(instances, trans, [60], [55], [65], 10.0);
            
            // With restless, default rate of 3 is boosted to 4.
            // So we should have 4 slices for the flourish (0.5 to 1.0) + 1 slice for the first half (0.0 to 0.5) = 5 slices total.
            expect(sliced.length).toBe(5);
        });
    });

    describe('Advanced Ornaments and Counterpoint Rules', () => {
        it('calculates neighbor tone pitches correctly', () => {
            const trans = { type: 'neighbor', startTime: 0.5, duration: 0.5, flourishRate: 3 };
            // Origin 60, Target 62. Steps: step 0 (60), step 1 (61), step 2 (62)
            expect(getTransitionPitch(trans, 0, [60], [60], [62], 0.51)).toBe(60);
            expect(getTransitionPitch(trans, 0, [60], [60], [62], 0.75)).toBe(61);
            expect(getTransitionPitch(trans, 0, [60], [60], [62], 0.99)).toBe(62);
        });

        it('calculates cambiata tone pitches correctly', () => {
            const trans = { type: 'cambiata', startTime: 0.5, duration: 0.5, flourishRate: 4 };
            // Origin 60, Target 64. Step 0 (60), Step 1 (61), Step 2 (58), Step 3 (64)
            expect(getTransitionPitch(trans, 0, [60], [60], [64], 0.51)).toBe(60);
            expect(getTransitionPitch(trans, 0, [60], [60], [64], 0.65)).toBe(61);
            expect(getTransitionPitch(trans, 0, [60], [60], [64], 0.80)).toBe(58);
            expect(getTransitionPitch(trans, 0, [60], [60], [64], 0.99)).toBe(64);
        });

        it('avoids parallel perfect fifths and octaves during slice rendering', () => {
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0, 0] }];
            // Two voices transition simultaneously in parallel motion
            // Voice 0 starts at 60, moves to 62 (passing tone is 61)
            // Voice 1 starts at 67, moves to 69 (passing tone is 68)
            // This is a parallel fifth (61 and 68 are 7 semitones apart!)
            // Our algorithm should adjust one of them.
            const trans = [
                { id: 't1', voiceIndex: 0, type: 'passing', startTime: 0.8, duration: 0.2, probability: 1.0 },
                { id: 't2', voiceIndex: 1, type: 'passing', startTime: 0.8, duration: 0.2, probability: 1.0 }
            ];
            
            const sliced = sliceInstancesByTransitions(instances, trans, [60, 67], [60, 67], [62, 69]);
            
            expect(sliced.length).toBe(2);
            // Sliced[1] contains the transitioned note values.
            // Without parallel avoidance, it would be [61, 68] (a perfect 5th).
            // With parallel avoidance, one of the notes is adjusted.
            const notes = sliced[1].notesToPlay;
            const interval = Math.abs(notes[0] - notes[1]) % 12;
            expect(interval).not.toBe(7); // Should not be a perfect 5th (7 semitones)
        });
    });

    describe('Rhythmic Groove Anchoring', () => {
        beforeEach(() => {
            state.syncTransitionsToDrums = true;
        });

        afterEach(() => {
            state.syncTransitionsToDrums = true;
        });

        it('snaps subdivision boundaries to nearby drum hits when enabled', () => {
            const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.0);
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            // Run-up transition starting at 0.5, duration 0.5. flourishRate = 3.
            // Default step boundaries inside transition would be at 0.5 + 0.5/3 = 0.667.
            // Let's provide a drum hit at 0.70. It should snap the step boundary from 0.667 to 0.70.
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.5, duration: 0.5, flourishRate: 3, probability: 1.0 }];
            const drumHits = [{ time: 0.70, row: 'closed-hat' }];
            
            const sliced = sliceInstancesByTransitions(instances, trans, [60], [60], [65], 2.0, drumHits);
            
            // Slices: 0.0 to 0.5 (normal), 0.5 to 0.70 (flourish step 0), 0.70 to 1.0 (flourish step 1 & target).
            // Expect boundaries to exist at exactly 0.5 and 0.70.
            expect(sliced.some(s => Math.abs(s.startTime - 0.5) < 0.005)).toBe(true);
            expect(sliced.some(s => Math.abs(s.startTime - 0.7) < 0.005)).toBe(true);
            mathRandomSpy.mockRestore();
        });

        it('remains evenly spaced when syncTransitionsToDrums is disabled', () => {
            const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.0);
            state.syncTransitionsToDrums = false;
            const instances = [{ id: '1', startTime: 0.0, duration: 1.0, pitchOffsets: [0] }];
            const trans = [{ id: 't1', voiceIndex: 0, type: 'run-up', startTime: 0.5, duration: 0.5, flourishRate: 3, probability: 1.0 }];
            const drumHits = [{ time: 0.70, row: 'closed-hat' }];
            
            const sliced = sliceInstancesByTransitions(instances, trans, [60], [60], [65], 2.0, drumHits);
            
            // Without groove sync, the boundary remains at 0.5 + 0.5/3 = 0.667.
            expect(sliced.some(s => Math.abs(s.startTime - 0.667) < 0.005)).toBe(true);
            expect(sliced.some(s => Math.abs(s.startTime - 0.70) < 0.005)).toBe(false);
            mathRandomSpy.mockRestore();
        });
    });

    describe('Modal/Scale Snapping & Corridor Logic', () => {
        it('snaps pitches to scale when global snap is enabled', () => {
            state.snapTransitionsToScale = true;
            state.baseKey = 0; // C
            state.mode = 'major'; // C Major: [0, 2, 4, 5, 7, 9, 11] (C D E F G A B)

            // Let's create a transition on the current chord (C Major)
            const trans = { type: 'passing', startTime: 0.1 };
            // Midpoint 0.1 (< 0.5, so snaps to current chord C Major).
            // Passing pitch would normally be (59 + 60) / 2 = 59.5 -> rounded to 60 (C) or 59 (B) or 61 (C#).
            // Let's test a pitch value that is out of scale, e.g. 61 (C#).
            // It should snap to either 60 (C) or 62 (D) in C Major.
            const currentChord = { symbol: 'I', key: 0 };
            const pitch = getTransitionPitch(trans, 0, [60], [61], [60], 0.1, currentChord, null);
            expect([60, 62]).toContain(pitch);
        });

        it('adapts to local chord scales (dynamic corridor)', () => {
            state.snapTransitionsToScale = true;
            state.baseKey = 0; // C
            state.mode = 'major';

            // Current chord is C Major (I), next chord is Bb Major (bVII, a borrowed chord).
            // Bb Major scale (mixolydian/lydian/major) in C base key context: Bb Major is Bb C D Eb F G A.
            // Let's check Bb Major key center: Bb = 10.
            const currentChord = { symbol: 'I', key: 0 }; // C Major
            const nextChord = { symbol: 'bVII', key: 10 }; // Bb Major (mixolydian mode or major scale)
            // Bb Major intervals: [0, 2, 4, 5, 7, 9, 11] relative to key 10 (Bb) = 10, 0, 2, 3, 5, 7, 9
            // Let's test pitch = 61 (C#).
            // In C Major (midpoint < 0.5), 61 (C#) snaps to 60 or 62.
            const trans1 = { type: 'passing', startTime: 0.1 };
            const pitch1 = getTransitionPitch(trans1, 0, [60], [62], [60], 0.1, currentChord, nextChord);
            // With prev=62, current=60, passing tone is (62+60)/2 = 61. C# (61) snaps to 60 or 62.
            expect([60, 62]).toContain(pitch1);

            // In Bb Major (midpoint >= 0.5), 61 (C#) snaps to 60 (C) or 62 (D) or 63 (Eb? Bb + 5 = 15 % 12 = 3).
            // Let's verify snapping at t >= 0.5 uses the next chord's scale
            // Let's use F# major or minor where C# (61) is scale-degree, or D minor where C# is not.
            // Let's test with a next chord: symbol 'iv' (F minor), key = 5. F Minor scale has 5, 7, 8, 10, 0, 1, 3 (F G Ab Bb C Db Eb).
            // In F minor, C# (61) is Db (1) which IS in the scale. So it should not be snapped away, it remains 61.
            // In C major, 61 is C# which is NOT in the scale.
            const nextChordFMin = { symbol: 'iv', key: 5 }; // F minor
            const trans2 = { type: 'passing', startTime: 0.8 };
            const pitch2 = getTransitionPitch(trans2, 0, [60], [60], [62], 0.8, currentChord, nextChordFMin);
            // With current=60, next=62, passing tone is (60+62)/2 = 61.
            expect(pitch2).toBe(61); // Retained because it's Db in F Minor!
        });

        it('honors transition-specific snap overrides (strict vs chromatic)', () => {
            state.snapTransitionsToScale = true; // global snap is on
            state.baseKey = 0; // C
            state.mode = 'major';

            const currentChord = { symbol: 'I', key: 0 };

            // Transition with explicit chromatic override should NOT snap
            const transChromatic = { type: 'passing', startTime: 0.1, scaleSnap: 'chromatic' };
            const pitchChrom = getTransitionPitch(transChromatic, 0, [60], [62], [60], 0.1, currentChord, null);
            expect(pitchChrom).toBe(61); // Kept chromatic C#

            state.snapTransitionsToScale = false; // global snap is off
            // Transition with explicit strict override SHOULD snap
            const transStrict = { type: 'passing', startTime: 0.1, scaleSnap: 'strict' };
            const pitchStrict = getTransitionPitch(transStrict, 0, [60], [62], [60], 0.1, currentChord, null);
            expect([60, 62]).toContain(pitchStrict);
        });

        it('bypasses scale snapping for microtonal divisions', () => {
            state.snapTransitionsToScale = true;
            state.divisions = 24; // Quarter tones

            const currentChord = { symbol: 'I', key: 0 };
            const trans = { type: 'suspend', startTime: 0.1 };
            const pitch = getTransitionPitch(trans, 0, [60], [60.5], [60], 0.1, currentChord, null);
            expect(pitch).toBe(60.5); // Microtonal quarter-tone is preserved!
        });
    });

    describe('getMatchedOffset & applyInstanceOffsets', () => {
        it('matches pitch classes to follow correct chord tones under inversion', () => {
            const chordObj = { symbol: 'ii', key: 60, divisions: 12 }; // D minor triad (D F A)
            // Pattern has an offset of +5 on the 3rd chord tone (A)
            const inst = { pitchOffsets: [0, 0, 5], pitchOffset: 0 };
            
            // 1. Root Position: [50, 53, 57] (D, F, A)
            const rootNotes = [50, 53, 57];
            const resultRoot = applyInstanceOffsets(rootNotes, inst, chordObj, { periodSize: 12 });
            expect(resultRoot).toEqual([50, 53, 62]); // A (57) gets +5 -> 62 (D). Correct!

            // 2. 1st Inversion: [53, 57, 62] (F, A, D)
            const firstInvNotes = [53, 57, 62];
            const resultInv1 = applyInstanceOffsets(firstInvNotes, inst, chordObj, { periodSize: 12 });
            // F (53) -> pc 5 -> matches 53 -> offset 0 -> 53
            // A (57) -> pc 9 -> matches 57 -> offset +5 -> 62
            // D (62) -> pc 2 -> matches 50 -> offset 0 -> 62
            expect(resultInv1).toEqual([53, 62, 62]); // F (53), D (62), D (62). Correct!
        });
    });
});