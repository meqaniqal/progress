import { getChordNotes } from './theory.js';

describe('Microtonal Chord Preservation (Per-Note)', () => {
    test('Unmodified notes in a chord follow global tuning changes', () => {
        // Chord symbol 'I', root key 60 (C)
        // Under 12-TET, C major triad is [60, 64, 67]
        // Under 31-TET, C major triad is [60, 64.25806451612904, 67.74193548387096]
        const chordObj = {
            symbol: 'I',
            key: 60,
            customNotes: [
                { pitch: 60, isMicrotonal: false },
                { pitch: 64, isMicrotonal: false },
                { pitch: 67, isMicrotonal: false }
            ]
        };

        // Under 12-TET, resolves to 12-TET pitches
        const notes12 = getChordNotes(chordObj, 60, 12);
        expect(notes12).toEqual([60, 64, 67]);

        // Under 31-TET, unmodified notes adjust to 31-TET pitches
        const notes31 = getChordNotes(chordObj, 60, 31);
        expect(notes31[0]).toBeCloseTo(60, 3);
        expect(notes31[1]).toBeCloseTo(63.871, 3);
        expect(notes31[2]).toBeCloseTo(66.968, 3);
    });

    test('Microtonally adjusted notes in a chord are preserved exactly', () => {
        // Chord symbol 'I', root key 60 (C)
        // Root and 3rd are unmodified, but the 5th (67) is manually shifted/dragged to 67.5 (microtonal)
        const chordObj = {
            symbol: 'I',
            key: 60,
            customNotes: [
                { pitch: 60, isMicrotonal: false },
                { pitch: 64, isMicrotonal: false },
                { pitch: 67.5, isMicrotonal: true }
            ]
        };

        // Under 12-TET, 5th remains at 67.5, root and 3rd are standard 12-TET
        const notes12 = getChordNotes(chordObj, 60, 12);
        expect(notes12[0]).toBe(60);
        expect(notes12[1]).toBe(64);
        expect(notes12[2]).toBe(67.5);

        // Under 31-TET, 5th remains at 67.5, root and 3rd adjust to 31-TET
        const notes31 = getChordNotes(chordObj, 60, 31);
        expect(notes31[0]).toBeCloseTo(60, 3);
        expect(notes31[1]).toBeCloseTo(63.871, 3);
        expect(notes31[2]).toBeCloseTo(67.5, 3);
    });

    test('Legacy customNotes (number arrays) are preserved verbatim', () => {
        const chordObj = {
            symbol: 'I',
            key: 60,
            customNotes: [60.5, 64.5, 67.5]
        };

        const notes12 = getChordNotes(chordObj, 60, 12);
        expect(notes12).toEqual([60.5, 64.5, 67.5]);

        const notes31 = getChordNotes(chordObj, 60, 31);
        expect(notes31).toEqual([60.5, 64.5, 67.5]);
    });
});
