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
            
            // Still gets sliced at the boundary, but the notesToPlay fall back to the base currentNotes
            expect(sliced[1].notesToPlay).toEqual([60, 64]);
            
            mathRandomSpy.mockRestore();
        });
    });
});