import { getChordNotes, applyVoiceLeading, generateInversions, calculateDistance, optimizeVoicing, getTransitionSuggestions, getHarmonicProfile, calculateChordTension, midiToFreq, getEdoPitch, segmentMicrotonalCluster, snapToGrid } from './theory.js';

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
            expect(inversions.length).toBe(18);
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
        
        it('should anchor the first chord near the C3/C4 warmth register to prevent octave extremes', () => {
            const result = applyVoiceLeading([{symbol: 'I', key: 60}]);
            const avgPitch = result[0].reduce((a,b)=>a+b)/result[0].length;
            expect(avgPitch).toBeGreaterThanOrEqual(48); // Above C3
            expect(avgPitch).toBeLessThanOrEqual(60); // Below C4
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

    describe('Mathematical Omni-Scale Parser (getChordNotes)', () => {
        it('should correctly build sus4 chords not in the hardcoded dictionary (e.g., Isus4)', () => {
            // I = C (60). sus4 intervals: root(0), perfect 4th(5), perfect 5th(7)
            // Notes: 60, 65, 67
            const notes = getChordNotes('Isus4', 60);
            expect(notes).toEqual([60, 65, 67]);
        });

        it('should correctly build sus2 chords (e.g., iisus2)', () => {
            // ii = D (62). sus2 intervals: root(0), major 2nd(2), perfect 5th(7)
            // Notes: 62, 64, 69
            const notes = getChordNotes('iisus2', 60);
            expect(notes).toEqual([62, 64, 69]);
        });

        it('should correctly build 13th chords (e.g., V13)', () => {
            // V = G (67). 13th chord implies major triad, minor 7th, and major 13th.
            // Notes: G(67), B(71), D(74), F(77), E(88 - an octave up)
            const notes = getChordNotes('V13', 60);
            expect(notes).toEqual([67, 71, 74, 77, 88]);
        });

        it('should correctly build minor 11th chords (e.g., vi11)', () => {
            // vi = A (69). 11th implies minor triad, minor 7th, and perfect 11th.
            // Notes: A(69), C(72), E(76), G(79), D(86 - an octave up)
            const notes = getChordNotes('vi11', 60);
            expect(notes).toEqual([69, 72, 76, 79, 86]);
        });
    });

    describe('Microtonal Math & Harmonic Segmentation', () => {
        it('should correctly convert MIDI to frequency', () => {
            expect(midiToFreq(69)).toBeCloseTo(440.0);
            expect(midiToFreq(60)).toBeCloseTo(261.625, 2);
        });

        it('should correctly calculate floating point pitches for non-12-TET divisions', () => {
            // 24-EDO (Quarter tones): 1 step from C(60) = 60.5
            expect(getEdoPitch(60, 1, 24)).toBeCloseTo(60.5);

            // 31-EDO: 1 step from C(60) = 60 + (12/31) ~ 60.387
            expect(getEdoPitch(60, 1, 31)).toBeCloseTo(60.387, 3);
        });

        it('should segment highly dissonant microtonal clusters into core and friction arrays', () => {
            // C4 (60.0), C4 + 35 cents (60.35), G4 (67.0)
            const cluster = [60.0, 60.35, 67.0];
            const segmented = segmentMicrotonalCluster(cluster);
            
            expect(segmented.core).toEqual([60.0, 67.0]);
            expect(segmented.frictionLeft).toEqual([60.35]); // 35 cents falls within the 15-65c clash threshold
        });
    });

    describe('EDO Scale Support (Phase 2)', () => {
        it('should output floating point MIDI pitches for non-12-TET divisions', () => {
            const notes = getChordNotes('I', 60, 31);
            expect(notes[0]).toBeCloseTo(60.0);
            expect(notes[1]).toBeCloseTo(63.871, 3);
            expect(notes[2]).toBeCloseTo(66.968, 3);
        });
        
        it('should safely optimize voicings for floating-point microtonal pitches', () => {
            // Cmaj9 in 31-EDO: Root (0), Maj3 (4), P5 (7), Maj7 (11), Maj9 (14)
            const notes = getChordNotes('Imaj9', 60, 31);
            const voiced = optimizeVoicing(notes);
            expect(voiced.length).toBe(4); // The Perfect 5th should be dropped
            expect(voiced[0]).toBeCloseTo(60.0);
            expect(voiced[1]).toBeCloseTo(63.871, 3);
            expect(voiced[2]).toBeCloseTo(70.839, 3);
            expect(voiced[3]).toBeCloseTo(73.935, 3);
        });
        
        it('should snap off-grid baseKeys (e.g. D major) to the absolute EDO grid anchored at C4 (60)', () => {
            // D major in 31-EDO. D is 2 semitones up.
            const notes = getChordNotes('I', 62, 31);
            // 2 * (31/12) = 5.166 -> step 5.
            expect(notes[0]).toBeCloseTo(60 + 5 * (12/31));
        });
        
        it('should snap bass pitch offsets securely to the EDO grid', () => {
            // C4 = 60. Bass plays a 5th up (+7)
            const bassMidi = 60 + 7;
            const snapped = snapToGrid(bassMidi, 31);
            // 7 * (31/12) = 18.08 -> step 18.
            expect(snapped).toBeCloseTo(60 + 18 * (12/31));
        });
    });
});