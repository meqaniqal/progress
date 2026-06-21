import { pregenerateMgenMelody, clearMgenCache, getMgenMelodyNotes, scheduleMgenMelody } from './mgenEngine.js';
import { state } from './store.js';
import { progressStateToGenerationConfig } from './mgen/src/progressBridge.js';

describe('mgenEngine integration layer', () => {
    let mockPlayTone;
    let playedNotes;

    beforeEach(() => {
        clearMgenCache();
        playedNotes = [];
        mockPlayTone = (freq, startTime, duration, inst, bus, velocity) => {
            // frequency to MIDI conversion
            const midi = 12 * Math.log2(freq / 440) + 69;
            playedNotes.push({ freq, midi, startTime, duration, inst, bus, velocity });
        };

        // Initialize state to mock values
        state.baseKey = 60; // C4
        state.mode = 'major';
        state.bpm = 120;
        state.divisions = 12;
        state.melodySettings = {
            enabled: true,
            engine: 'mgen',
            genre: 'none',
            density: 0.5,
            restProbability: 0.1,
            tensionCurve: 'linear'
        };
        state.instruments = {
            melody: 'sine'
        };

        state.currentProgression = [
            { symbol: 'I', duration: 4, key: 60, notes: [60, 64, 67] },
            { symbol: 'IV', duration: 4, key: 60, notes: [60, 65, 69] }
        ];
    });

    test('clearMgenCache and getMgenMelodyNotes management', () => {
        expect(getMgenMelodyNotes()).toBeNull();
        clearMgenCache();
        expect(getMgenMelodyNotes()).toBeNull();
    });

    test('pregenerateMgenMelody builds, runs pipeline, and populates cache', async () => {
        await pregenerateMgenMelody(state);
        const cached = getMgenMelodyNotes();
        expect(cached).not.toBeNull();
        expect(Array.isArray(cached)).toBe(true);
        
        // mgen should have generated some melody notes
        expect(cached.length).toBeGreaterThan(0);
        
        // check note structure
        const firstNote = cached[0];
        expect(firstNote).toHaveProperty('pitch');
        expect(firstNote).toHaveProperty('stepTime');
        expect(firstNote).toHaveProperty('noteDuration');
        expect(firstNote.melodyInst).toBe('melody');
    });

    test('scheduleMgenMelody schedules notes for a given slot window', async () => {
        await pregenerateMgenMelody(state);
        const cached = getMgenMelodyNotes();
        
        // Find notes that fall in the first chord (slot index 0)
        // first chord has duration 4, so beats = 4, slotStartBeat = 0
        const firstSlotNotes = cached.filter(n => n.stepTime >= 0 && n.stepTime < 4);
        
        // Execute scheduling for slot 0
        // args: time, chordObj, nextChordObj, prevChordObj, chordSlotDuration, beats, bpm, absIndex, totalChords, chordNotes, playToneFn, voiceEvents
        const timeOffset = 10.0; // arbitrary start time in seconds
        scheduleMgenMelody(
            timeOffset, 
            state.currentProgression[0], 
            state.currentProgression[1], 
            null, 
            2.0, // chordSlotDuration in seconds
            4,   // beats
            120, // bpm
            0,   // absIndex
            2,   // totalChords
            [60, 64, 67], 
            mockPlayTone, 
            null
        );

        // Verify that playedNotes has same number of elements as firstSlotNotes
        expect(playedNotes.length).toBe(firstSlotNotes.length);

        // Verify scheduled times and notes
        playedNotes.forEach((played, idx) => {
            const originalNote = firstSlotNotes[idx];
            const expectedTime = timeOffset + (originalNote.stepTime * (60.0 / 120));
            expect(played.startTime).toBeCloseTo(expectedTime, 4);
            expect(played.midi).toBeCloseTo(originalNote.pitch, 2);
            expect(played.inst).toBe('sine');
            expect(played.bus).toBe('melody');
        });
    });

    test('scheduleMgenMelody schedules notes for slot index 1', async () => {
        await pregenerateMgenMelody(state);
        const cached = getMgenMelodyNotes();
        
        // Find notes that fall in the second chord (slot index 1)
        // second chord starts at beat 4, duration 4
        const secondSlotNotes = cached.filter(n => n.stepTime >= 4 && n.stepTime < 8);
        
        const timeOffset = 15.0; // arbitrary start time in seconds
        scheduleMgenMelody(
            timeOffset, 
            state.currentProgression[1], 
            null, 
            state.currentProgression[0], 
            2.0, 
            4, 
            120, 
            1, 
            2, 
            [60, 65, 69], 
            mockPlayTone, 
            null
        );

        expect(playedNotes.length).toBe(secondSlotNotes.length);

        playedNotes.forEach((played, idx) => {
            const originalNote = secondSlotNotes[idx];
            // relative beat start = stepTime - 4
            const expectedTime = timeOffset + ((originalNote.stepTime - 4) * (60.0 / 120));
            expect(played.startTime).toBeCloseTo(expectedTime, 4);
            expect(played.midi).toBeCloseTo(originalNote.pitch, 2);
        });
    });

    test('scheduleMgenMelody applies microtonal offsets and snaps to tuning grid', async () => {
        // Pre-generate notes so we have a valid cache
        await pregenerateMgenMelody(state);
        const cached = getMgenMelodyNotes();
        
        // Find notes that fall in slot 0
        const slot0Notes = cached.filter(n => n.stepTime >= 0 && n.stepTime < 4);
        const targetNote = slot0Notes.find(n => [0, 4, 7].includes(n.pitch % 12)) || slot0Notes[0];
        if (targetNote) {
            const targetPc = targetNote.pitch % 12;
            
            let customChordNotes = [60, 64, 67];
            let expectedShift = 0.0;
            const diffs = [60, 64, 67].map(n => {
                let diff = Math.abs((targetNote.pitch % 12) - (n % 12));
                if (diff > 6) diff = 12 - diff;
                return diff;
            });
            const minIdx = diffs.indexOf(Math.min(...diffs));
            if (minIdx === 0) {
                customChordNotes = [60.5, 64, 67];
                expectedShift = 0.5;
            } else if (minIdx === 1) {
                customChordNotes = [60, 64.5, 67];
                expectedShift = 0.5;
            } else {
                customChordNotes = [60, 64, 67.5];
                expectedShift = 0.5;
            }
            
            playedNotes = [];
            scheduleMgenMelody(
                0.0,
                state.currentProgression[0],
                state.currentProgression[1],
                null,
                4.0,
                4,
                120,
                0,
                2,
                customChordNotes,
                mockPlayTone,
                null
            );
            
            const expectedStartTime = 0.0 + (targetNote.stepTime * (60.0 / 120));
            const playedTarget = playedNotes.find(p => Math.abs(p.startTime - expectedStartTime) < 0.01);
            if (playedTarget) {
                const expectedMidi = targetNote.pitch + expectedShift;
                expect(playedTarget.midi).toBeCloseTo(expectedMidi, 2);
            }
        }
    });

    test('progressStateToGenerationConfig maps pitchDiversityWeight, tensionLevel, and isAntecedent correctly', () => {
        const customState = {
            ...state,
            melodySettings: {
                ...state.melodySettings,
                pitchDiversityWeight: 0.75,
                tensionLevel: 0.85,
                isAntecedent: true,
                tensionCurve: 'arch'
            }
        };

        const config = progressStateToGenerationConfig(customState);
        expect(config.options.pitchDiversityWeight).toBe(0.75);
        expect(config.phraseContext.tensionLevel).toBe(0.85);
        expect(config.phraseContext.isAntecedent).toBe(true);
    });
});
