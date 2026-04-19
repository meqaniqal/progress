import { applyVoiceLeading, generateInversions, calculateDistance, chordDictionary } from './theory.js';

describe('Theory & Voice Leading Module', () => {
    
    describe('calculateDistance', () => {
        it('should return 0 for identical chords', () => {
            expect(calculateDistance([60, 64, 67], [60, 64, 67])).toBe(0);
        });
        
        it('should calculate the total absolute distance between notes', () => {
            // Movement from C Major [60, 64, 67] to D minor [62, 65, 69]
            // |60-62| + |64-65| + |67-69| = 2 + 1 + 2 = 5
            expect(calculateDistance([60, 64, 67], [62, 65, 69])).toBe(5);
        });
    });

    describe('generateInversions', () => {
        it('should generate multiple voice configurations across octaves', () => {
            const inversions = generateInversions([60, 64, 67]);
            expect(inversions.length).toBe(12);
        });
        
        it('should include the root position, 1st inversion, and 2nd inversion', () => {
            const inversions = generateInversions([60, 64, 67]);
            expect(inversions).toContainEqual([60, 64, 67]); // root
            expect(inversions).toContainEqual([64, 67, 72]); // 1st inversion (E, G, C)
            expect(inversions).toContainEqual([55, 60, 64]); // 2nd inversion lower (G, C, E)
        });
    });

    describe('applyVoiceLeading', () => {
        it('should return an empty array if progression is empty', () => {
            expect(applyVoiceLeading([])).toEqual([]);
        });
        
        it('should return the first chord dropped by one octave for C3 warmth', () => {
            const result = applyVoiceLeading(['I']);
            expect(result[0]).toEqual([48, 52, 55]); // C3 range: 60-12, 64-12, 67-12
        });
        
        it('should minimize jump distance between subsequent chords', () => {
            // C Maj (I) -> G Maj (V)
            // I dropped 1 oct: [48, 52, 55] (C3, E3, G3)
            // A raw V chord is [67, 71, 74]. Jumping from [48, 52, 55] directly would be a distance of 19+19+19 = 57.
            // Voice leading should pick a closer inversion (e.g. [47, 50, 55] or similar).
            const result = applyVoiceLeading(['I', 'V']);
            expect(result.length).toBe(2);
            const dist = calculateDistance(result[0], result[1]);
            expect(dist).toBeLessThan(15); // Assert that the jump is small and musical
        });
    });
});