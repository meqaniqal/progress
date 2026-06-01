import { jest } from '@jest/globals';
import { getTransitionPitch, expandMasterTransitions, sliceInstancesByTransitions } from './transitionEvaluator.js';

describe('transitionEvaluator', () => {
    
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
            // run-up rate 3 -> offsets are -3, -2, -1. Target is 65.
            // Notes should be 62, 63, 64.
            expect(sliced.length).toBe(3);
            expect(sliced[0].notesToPlay[0]).toBe(62);
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
            expect(pitch1).toBe(62);
            expect(pitch2).toBe(63);
            expect(pitch3).toBe(64);
        });

        it('should resolve a run-down to the next chord note when placed at the end', () => {
            const trans = { type: 'run-down', startTime: 0.8, duration: 0.2, flourishRate: 3 };
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.81)).toBe(68);
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
            expect([63, 64, 66, 67]).toContain(pitch);
        });
        
        it('should resolve a run-up to the current chord note when placed at the start', () => {
            const trans = { type: 'run-up', startTime: 0.0, duration: 0.2, flourishRate: 3 };
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.01)).toBe(57);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.10)).toBe(58);
            expect(getTransitionPitch(trans, 0, [60], [55], [65], 0.19)).toBe(59);
        });
    });
});