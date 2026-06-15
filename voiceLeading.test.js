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

        test('respects manual inversion offset within voice leading', () => {
            const progression = [
                { symbol: 'I', key: 60, inversionOffset: 0 },
                { symbol: 'I', key: 60, inversionOffset: 1 } // 1st inversion manually requested
            ];
            const notes = getPlayableNotes(progression, { useVoiceLeading: true });
            // Root notes for I (C major) are [48, 52, 55] (or voice-led equivalents)
            // With inversionOffset: 1, the lowest note should be shifted up.
            // Let's verify that the pitches of notes[1] are a valid 1st inversion layout (e.g. 3rd is the lowest note)
            const rootNotes = getPlayableNotes([progression[0]], { useVoiceLeading: true })[0];
            const firstInvNotes = notes[1];
            
            // Check that they aren't identical (since notes[1] has inversionOffset: 1)
            expect(firstInvNotes).not.toEqual(rootNotes);
            
            // A 1st inversion should have the 3rd (E) in the bass. Since C is 60, E is 64/52.
            const lowestPitch = Math.min(...firstInvNotes);
            expect(lowestPitch % 12).toBe(4); // E is 4 semitones above C (0)
        });
    });

    describe('generateInversions with manual offset', () => {
        test('constrains output candidates to only the specified inversion offset', () => {
            const chord = [60, 64, 67]; // C triad
            const allInversions = generateInversions(chord, 'close', 12, 0);
            const offsetInversions = generateInversions(chord, 'close', 12, 1);
            
            // Since we search across 6 octave registers [-3, -2, -1, 0, 1, 2],
            // we expect exactly 6 candidates (one for each octave range)
            expect(offsetInversions.length).toBe(6);
            
            // All generated inversions must be 1st inversions (lowest note modulo 12 should be 4, i.e., E)
            offsetInversions.forEach(inv => {
                const lowest = Math.min(...inv);
                expect(lowest % 12).toBe(4);
            });
        });
    });
});
