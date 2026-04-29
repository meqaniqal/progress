import { applyVoiceLeading, generateInversions, calculateDistance, optimizeVoicing, getTransitionSuggestions, getHarmonicProfile, calculateChordTension } from './theory.js';

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

    describe('optimizeVoicing', () => {
        it('should leave triads and 4-note 7th chords intact', () => {
            const triad = [60, 64, 67];
            const seventh = [60, 64, 67, 71];
            expect(optimizeVoicing(triad)).toEqual([60, 64, 67]);
            expect(optimizeVoicing(seventh)).toEqual([60, 64, 67, 71]);
        });

        it('should drop the perfect 5th from 5-note chords (9ths)', () => {
            // Cmaj9: C(60), E(64), G(67), B(71), D(74)
            const maj9 = [60, 64, 67, 71, 74];
            expect(optimizeVoicing(maj9)).toEqual([60, 64, 71, 74]); // Missing the G(67)
        });

        it('should drop both the root and the perfect 5th from 6+ note chords (11ths)', () => {
            // C11: C(60), E(64), G(67), Bb(70), D(74), F(77)
            const dom11 = [60, 64, 67, 70, 74, 77];
            // Should drop C(60) and G(67)
            expect(optimizeVoicing(dom11)).toEqual([64, 70, 74, 77]);
        });
    });

    describe('getTransitionSuggestions (Modulation)', () => {
        it('should return pivot chords when moving from C Major to G Major', () => {
            const fromKey = 60; // C Major
            const toKey = 67; // G Major (1 sharp)
            const suggestions = getTransitionSuggestions(fromKey, toKey);
            
            const symbols = suggestions.map(s => s.symbol);
            
            // C Maj (I in C -> IV in G), E min (iii in C -> vi in G), A min (vi in C -> ii in G), G Maj (V in C -> I in G)
            expect(symbols).toContain('IV');
            expect(symbols).toContain('vi');
            expect(symbols).toContain('ii');
        });
        
        it('should return pivot chords when moving from A Minor to E Minor in minor mode', () => {
            const fromKey = 69; // A Minor
            const toKey = 64; // E Minor
            const suggestions = getTransitionSuggestions(fromKey, toKey, 'minor');
            
            const symbols = suggestions.map(s => s.symbol);
            
            // A min (i in A -> iv in E), C Maj (bIII in A -> bVI in E), G Maj (bVII in A -> bIII in E)
            expect(symbols).toContain('iv');
            expect(symbols).toContain('bVI');
            expect(symbols).toContain('bIII');
        });
    });

    describe('applyVoiceLeading', () => {
        it('should return an empty array if progression is empty', () => {
            expect(applyVoiceLeading([])).toEqual([]);
        });
        
        it('should return the first chord dropped by one octave for C3 warmth', () => {
            const result = applyVoiceLeading([{symbol: 'I', key: 60}]);
            expect(result[0]).toEqual([48, 52, 55]); // C3 range: 60-12, 64-12, 67-12
        });
        
        it('should minimize jump distance between subsequent chords', () => {
            // C Maj (I) -> G Maj (V)
            // I dropped 1 oct: [48, 52, 55] (C3, E3, G3)
            // A raw V chord is [67, 71, 74]. Jumping from [48, 52, 55] directly would be a distance of 19+19+19 = 57.
            // Voice leading should pick a closer inversion (e.g. [47, 50, 55] or similar).
            const result = applyVoiceLeading([{symbol: 'I', key: 60}, {symbol: 'V', key: 60}]);
            expect(result.length).toBe(2);
            const dist = calculateDistance(result[0], result[1]);
            expect(dist).toBeLessThan(15); // Assert that the jump is small and musical
        });
    });
    
    describe('Mathematical Tension & Omni-Scale Profile', () => {
        it('should algorithmically determine tension values based on interval vectors', () => {
            const majorTriad = calculateChordTension([60, 64, 67]);
            const dimTriad = calculateChordTension([60, 63, 66]); // Has tritone
            
            expect(dimTriad).toBeGreaterThan(majorTriad);
        });
        
        it('should correctly identify borrowed chords mathematically via scale pitch class comparison', () => {
            // bVI in C Major (Ab Maj) contains Ab/G# which is not in C Major scale
            const borrowedProfile = getHarmonicProfile('bVI', 'major', 60);
            const diatonicProfile = getHarmonicProfile('vi', 'major', 60);
            
            expect(borrowedProfile.isBorrowed).toBe(true);
            expect(diatonicProfile.isBorrowed).toBe(false);
        });
    });
});