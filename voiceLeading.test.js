import { optimizeVoicing, applyInversion, generateInversions, calculateDistance, getPlayableNotes } from './voiceLeading.js';

describe('Voice Leading Engine', () => {
    describe('optimizeVoicing', () => {
        test('triads remain intact', () => {
            const triad = [60, 64, 67];
            expect(optimizeVoicing(triad)).toEqual(triad);
        });

        test('drops the perfect fifth for five note chords', () => {
            const chord = [60, 64, 67, 70, 74]; // C9
            const optimized = optimizeVoicing(chord);
            // Root = 60, root+7 = 67. 67 should be removed.
            expect(optimized).not.toContain(67);
            expect(optimized.length).toBe(4);
        });
    });

    describe('applyInversion', () => {
        test('offset 0 returns same notes', () => {
            const notes = [60, 64, 67];
            expect(applyInversion(notes, 0)).toEqual(notes);
        });

        test('first inversion of major triad (offset 1)', () => {
            const notes = [60, 64, 67];
            // 60 goes up to 72
            expect(applyInversion(notes, 1)).toEqual([64, 67, 72]);
        });

        test('macrotonal shifts octave instead of tritave (BP scale protection)', () => {
            const notes = [60, 63, 67];
            const periodBP = 19.019; // Bohlen-Pierce tritave
            const result = applyInversion(notes, 1, periodBP);
            // In macrotonal BP modes, we shift the bottom note by an octave (12.0)
            expect(result).toEqual([63, 67, 72]);
        });
    });

    describe('calculateDistance', () => {
        test('equal chords distance is zero', () => {
            expect(calculateDistance([60, 64, 67], [60, 64, 67])).toBe(0);
        });

        test('melodic step distance calculation', () => {
            expect(calculateDistance([60, 64, 67], [61, 65, 68])).toBe(3); // 1 + 1 + 1 semitone shifts
        });
    });

    describe('getPlayableNotes', () => {
        test('resolves empty progression to empty list', () => {
            expect(getPlayableNotes([])).toEqual([]);
        });

        test('generates playable notes using voice leading', () => {
            const progression = [
                { symbol: 'I', key: 60 },
                { symbol: 'V', key: 60 }
            ];
            const notes = getPlayableNotes(progression);
            expect(notes.length).toBe(2);
            expect(notes[0].length).toBeGreaterThan(0);
        });
    });
});
