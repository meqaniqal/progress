import { generateCountermelodyNote } from './melodyCountermelody.js';
import { defaultContext } from './melodyContext.js';
import { createRNG } from './melodyRandom.js';

describe('melodyCountermelody Note Generation', () => {
    let context;
    let slotState;

    beforeEach(() => {
        context = defaultContext(createRNG(42));
        slotState = {
            g: {
                step: 0,
                beat: 0,
                sub: 0,
                stepTime: 0,
                noteDuration: 0.25
            },
            melodyPlays: true,
            pitch: 67,
            lastInterval: 0,
            prevCounterPitch: 60,
            counterValidPitches: [57, 59, 60, 62, 64, 65, 67, 69, 71, 72],
            divisions: 12,
            keyRoot: 60,
            periodSize: 12,
            settings: {
                genre: 'none',
                countermelodyMode: 'contrary'
            },
            slotAestheticMode: 'cantabile',
            counterActiveChordTones: [60, 64, 67],
            isolatedCounterStepsSet: new Set(),
            chordKey: 60,
            validPitches: [60, 62, 64, 65, 67, 69, 71, 72],
            activeScalePcSet: new Set([0, 2, 4, 5, 7, 9, 11]),
            chordTonePcSet: new Set([0, 4, 7]),
            currentTension: 0.5,
            activeTransition: null,
            state: {
                instruments: {
                    countermelody: 'sine'
                }
            },
            counterScheduled: [],
            melodyHistory: []
        };
    });

    test('generateCountermelodyNote schedules a note and updates prevCounterPitch', () => {
        generateCountermelodyNote(context, slotState);

        expect(slotState.counterScheduled.length).toBe(1);
        expect(slotState.counterScheduled[0].pitch).toBeDefined();
        expect(slotState.prevCounterPitch).toBeDefined();
    });

    test('respects harmonize mode by scheduling relative to melody pitch', () => {
        slotState.settings.countermelodyMode = 'harmonize';
        slotState.melodyPlays = true;
        slotState.pitch = 72; // C5

        generateCountermelodyNote(context, slotState);

        // harmonize mode targetIndex is index - shift (2 or 4) from C5
        // pitch is 72, which is index 7 in validPitches [60, 62, 64, 65, 67, 69, 71, 72]
        // Target index will be 7 - 2 = 5 (pitch 69) or 7 - 4 = 3 (pitch 65) transposed down by an octave
        // (due to targetHarm - periodSize / validPitches[targetIndex] - periodSize)
        expect(slotState.counterScheduled[0].pitch).toBeLessThan(72);
    });

    test('prevents polyphonic microtonal collision between melody and countermelody', () => {
        slotState.melodyPlays = true;
        slotState.pitch = 60.2; // Melody pitch is C4 + 20 cents
        slotState.prevCounterPitch = 60.1; // Countermelody is microtonally clashing
        slotState.counterValidPitches = [57, 59, 60, 62, 64];

        generateCountermelodyNote(context, slotState);

        // Countermelody pitch should be nudged away from the melody pitch to a distinct scale degree
        const diff = Math.abs(slotState.counterScheduled[0].pitch - slotState.pitch);
        expect(diff).toBeGreaterThan(0.5 * (12 / slotState.divisions));
    });

    test('enforces minimum note durations for countermelody', () => {
        slotState.slotAestheticMode = 'virtuoso';
        slotState.g.noteDuration = 0.05; // very short duration
        slotState.state.bpm = 120;
        
        generateCountermelodyNote(context, slotState);
        
        // beatDuration at 120 BPM is 0.5s. Minimum counter duration is beatDuration * 0.5 = 0.25s.
        // It is scaled by 0.8 to 1.2, so it should be at least 0.25 * 0.8 = 0.2s.
        expect(slotState.counterScheduled[0].noteDuration).toBeGreaterThanOrEqual(0.2);
    });

    test('virtuoso mode pitch variety schedules leaps and holds', () => {
        slotState.settings.genre = 'jazz';
        slotState.slotAestheticMode = 'virtuoso';
        
        // We will generate multiple notes with the same seed to observe variety
        const pitches = [];
        for (let i = 0; i < 20; i++) {
            slotState.counterScheduled = [];
            generateCountermelodyNote(context, slotState);
            pitches.push(slotState.counterScheduled[0].pitch);
            slotState.prevCounterPitch = slotState.counterScheduled[0].pitch;
        }
        
        // Check that at least some notes had leaps or remained the same (not just 1-degree steps)
        let hasLeapOrHold = false;
        for (let i = 1; i < pitches.length; i++) {
            const stepDiff = Math.abs(pitches[i] - pitches[i - 1]);
            // If the difference is 0 (hold) or > 2 semitones (leap), variety is working
            if (stepDiff === 0 || stepDiff > 2) {
                hasLeapOrHold = true;
                break;
            }
        }
        expect(hasLeapOrHold).toBe(true);
    });
});
