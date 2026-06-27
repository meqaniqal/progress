import { getChordNotes, applyVoiceLeading, generateInversions, calculateDistance, optimizeVoicing, getTransitionSuggestions, getHarmonicProfile, calculateChordTension, midiToFreq, getEdoPitch, segmentMicrotonalCluster, snapToGrid, resolveHierarchicalCollisions, getDynamicProgSuggestions, getModulationLabel, getAlternatives, applyInversion, getEffectiveTuning, parseScl, parseTun } from './theory.js';

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
            const result = applyVoiceLeading([{ symbol: 'I', key: 60 }]);
            const avgPitch = result[0].reduce((a, b) => a + b) / result[0].length;
            expect(avgPitch).toBeGreaterThanOrEqual(48); // Above C3
            expect(avgPitch).toBeLessThanOrEqual(60); // Below C4
        });

        it('should minimize jump distance between subsequent chords', () => {
            // C Maj (I) -> G Maj (V)
            // I dropped 1 oct: [48, 52, 55] (C3, E3, G3)
            // A raw V chord is [67, 71, 74]. Jumping from [48, 52, 55] directly would be a distance of 19+19+19 = 57.
            // Voice leading should pick a closer inversion (e.g. [47, 50, 55] or similar).
            const result = applyVoiceLeading([{ symbol: 'I', key: 60 }, { symbol: 'V', key: 60 }]);
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
            expect(notes[0]).toBeCloseTo(60 + 5 * (12 / 31));
        });

        it('should snap bass pitch offsets securely to the EDO grid', () => {
            // C4 = 60. Bass plays a 5th up (+7)
            const bassMidi = 60 + 7;
            const snapped = snapToGrid(bassMidi, 31);
            // 7 * (31/12) = 18.08 -> step 18.
            expect(snapped).toBeCloseTo(60 + 18 * (12 / 31));
        });
    });

    describe('Hierarchical Collision Engine', () => {
        it('resolves clashes between moving and stationary voices', () => {
            // Voice 0 is moving, Voice 1 is stationary.
            // Both are at pitch 60. Voice 0 (moving) has priority, so Voice 1 (stationary) is nudged away.
            // Voice 1 (Alto) nudges down twice to 58 to clear the <= 1.5 semitone threshold.
            const notes = [60, 60];
            const resolved = resolveHierarchicalCollisions(notes, [0]);
            expect(resolved[0]).toBe(60); // Priority
            expect(resolved[1]).toBe(58); // Nudged
        });

        it('resolves clashes between two moving voices based on outer vs inner roles', () => {
            // Voice 0 (Soprano, priority 10) and Voice 1 (Alto, priority 5). Both moving.
            // Both at pitch 60. Soprano has priority. Alto is nudged.
            const notes = [60, 60];
            const resolved = resolveHierarchicalCollisions(notes, [0, 1]);
            expect(resolved[0]).toBe(60);
            expect(resolved[1]).toBe(58); // Nudged twice (60 -> 59 -> 58) to be 2 semitones away (> 1.5 diff)
        });

        it('resolves clashes between two stationary voices based on outer vs inner roles', () => {
            // Voice 1 (Alto, priority 5) and Voice 3 (Bass, priority 9). Neither is moving.
            // Let's set initial notes so only Alto and Bass clash.
            // Voice 0 = 70 (no clash), Voice 1 = 60, Voice 2 = 75 (no clash), Voice 3 = 60.
            const notes = [70, 60, 75, 60];
            const resolved = resolveHierarchicalCollisions(notes, []);
            expect(resolved[3]).toBe(60); // Bass has priority, stays at 60
            expect(resolved[1]).toBe(62); // Alto is upper voice relative to Bass, nudges up to 62
        });

        it('prefers moving inner voice over stationary outer voice due to motion boost', () => {
            // Voice 0 (Soprano, stationary, base 10) and Voice 1 (Alto, moving, base 5 + 100 motion boost = 105).
            // Both at 60. Alto has priority. Soprano is nudged.
            // Soprano is upper voice relative to Alto (index 0 < 1), so Soprano nudges up to 62.
            const notes = [60, 60];
            const resolved = resolveHierarchicalCollisions(notes, [1]);
            expect(resolved[1]).toBe(60); // Alto stays
            expect(resolved[0]).toBe(62); // Soprano nudged
        });
    });

    describe('Emotional Progression Suggestions', () => {
        it('returns logical suggestions for classical baroque Bach emotion', () => {
            const currentChord = { symbol: 'I', key: 60 };
            const suggestions = getDynamicProgSuggestions(currentChord, 'baroque', 'major', 60);
            expect(suggestions.length).toBeGreaterThan(0);
            // Baroque should suggest Secondary Dominants like V/V (key offset 7) or V/vi (key offset 9)
            expect(suggestions.some(s => s.symbol === 'V/V')).toBe(true);
            expect(suggestions.some(s => s.symbol === 'V/vi')).toBe(true);

            // Verify octave normalization (all keys should be around the 60 base key octave range)
            suggestions.forEach(s => {
                expect(s.key).toBeGreaterThanOrEqual(60);
                expect(s.key).toBeLessThanOrEqual(71);
            });
        });

        it('returns dynamic suggestions for Holdsworth ethereal category', () => {
            const currentChord = { symbol: 'I', key: 60 };
            const suggestions = getDynamicProgSuggestions(currentChord, 'ethereal', 'major', 60);
            expect(suggestions.some(s => s.symbol === 'Imaj7#11')).toBe(true);
            expect(suggestions.some(s => s.symbol === 'Iadd9#11')).toBe(true);
        });

        it('returns dynamic suggestions for Coltrane cosmic category', () => {
            const currentChord = { symbol: 'I', key: 60 };
            const suggestions = getDynamicProgSuggestions(currentChord, 'cosmic', 'major', 60);
            expect(suggestions.some(s => s.symbol === 'bIIImaj9')).toBe(true);
            expect(suggestions.some(s => s.symbol === 'bVImaj9')).toBe(true);
        });

        it('has zero duplicate chord symbols across all categories, and every category contains at least 12 unique chords', () => {
            const currentChord = { symbol: 'I', key: 60 };
            const categories = [
                'mournful', 'luminous', 'heroic', 'nostalgic', 'mysterious',
                'ethereal', 'ominous', 'baroque', 'cosmic', 'soulful',
                'exotic', 'tension', 'dreamy', 'hopeful', 'cyberpunk',
                'alien', 'neutral', 'spectral'
            ];

            // 1. Standard 12-EDO check
            const seenChords = new Set();
            for (const cat of categories) {
                const suggestions = getDynamicProgSuggestions(currentChord, cat, 'major', 60);
                
                // Assert that each category has at least 12 suggestions
                expect(suggestions.length).toBeGreaterThanOrEqual(12);

                const catSymbols = suggestions.map(s => s.symbol);
                // Assert that symbols within the same category are unique
                const uniqueCatSymbols = new Set(catSymbols);
                expect(uniqueCatSymbols.size).toBe(suggestions.length);

                // Assert that no chord is duplicated across different categories
                for (const sym of catSymbols) {
                    expect(seenChords.has(sym)).toBe(false);
                    seenChords.add(sym);
                }
            }

            // 2. Microtonal bpLambda check
            const seenMicroChords = new Set();
            for (const cat of categories) {
                const suggestions = getDynamicProgSuggestions(currentChord, cat, 'bpLambda', 60);
                
                // Assert that each category has at least 12 suggestions
                expect(suggestions.length).toBeGreaterThanOrEqual(12);

                const catSymbols = suggestions.map(s => s.symbol);
                // Assert that symbols within the same category are unique
                const uniqueCatSymbols = new Set(catSymbols);
                expect(uniqueCatSymbols.size).toBe(suggestions.length);

                // Assert that no chord is duplicated across different categories
                for (const sym of catSymbols) {
                    expect(seenMicroChords.has(sym)).toBe(false);
                    seenMicroChords.add(sym);
                }
            }
        });
    });

    describe('Chord Alternatives / Substitutions', () => {
        it('returns up to 12 chord substitution options using fallback parameters', () => {
            const alts = getAlternatives('I', 60, 'major');
            expect(alts.length).toBeGreaterThan(0);
            expect(alts.length).toBeLessThanOrEqual(12);
        });
    });

    describe('Modulation Labeling', () => {
        it('returns correct descriptive label for standard intervals', () => {
            expect(getModulationLabel(60, 67)).toBe('🌅 Brightening (+5th)');
            expect(getModulationLabel(60, 65)).toBe('🍃 Softening (-5th)');
            expect(getModulationLabel(60, 64)).toBe('🚀 Transcendence (+Maj 3rd)');
            expect(getModulationLabel(60, 61)).toBe('⚡ Climactic Surge (+1s)');
            expect(getModulationLabel(60, 60)).toBe('(Tonic / Home)');
        });
    });

    describe('Bohlen-Pierce Microtonal Chord Parsing, Inversions, and Suffixes', () => {
        it('should correctly parse Bohlen-Pierce chord notes with or without + or - suffixes', () => {
            const notesClean = getChordNotes('BPLambda1', 60, 13);
            const notesPlus = getChordNotes('BPLambda1+', 60, 13);
            const notesMinus = getChordNotes('BPLambda1-', 60, 13);
            
            expect(notesPlus).toEqual(notesClean);
            expect(notesMinus).toEqual(notesClean);
            expect(notesClean.length).toBeGreaterThan(0);
        });

        it('should resolve effective tuning properly for Bohlen-Pierce chord symbols with suffixes', () => {
            const tuning = getEffectiveTuning('BPLambda1+', 13);
            expect(tuning.divisions).toBe(13);
            expect(tuning.periodSize).toBeCloseTo(19.01955, 4);
        });

        it('should apply octave-based in-between note inversions to Bohlen-Pierce note lists', () => {
            const notes = [60, 63, 67];
            const periodBP = 19.01955;
            
            // 1st inversion should shift bottom note by an octave (12)
            const result1 = applyInversion(notes, 1, periodBP);
            expect(result1).toEqual([63, 67, 72]);

            // 3rd inversion (offset = 3) should shift all notes by an octave (12)
            const result3 = applyInversion(notes, 3, periodBP);
            expect(result3).toEqual([72, 75, 79]);
        });
    });
    describe('Custom Tuning File Parsers (.scl / .tun)', () => {
        it('should correctly parse Scala (.scl) files with cents and ratios', () => {
            const sclContent = `! test.scl
Description of scale
 5
!
 200.0
 3/2
 700.0
 2
 1200.0`;
            const parsed = parseScl(sclContent);
            expect(parsed).not.toBeNull();
            expect(parsed.name).toBe("Description of scale");
            expect(parsed.divisions).toBe(5);
            expect(parsed.offsets[0]).toBe(0.0);
            expect(parsed.offsets[1]).toBe(2.0); // 200 cents = 2 semitones
            expect(parsed.offsets[2]).toBeCloseTo(12 * Math.log2(1.5), 3); // 3/2 ratio
            expect(parsed.offsets[3]).toBe(7.0); // 700 cents = 7 semitones
            expect(parsed.offsets[4]).toBeCloseTo(12 * Math.log2(2), 3); // 2 ratio (12 semitones)
            expect(parsed.offsets[5]).toBe(12.0); // 1200 cents = 12 semitones
        });

        it('should correctly parse AnaMark (.tun) files with absolute frequencies', () => {
            const tunContent = `; Comment line
[Tuning]
name="Test Tun Tuning"
note 60 = 261.6256
note 69 = 440.0`;
            const parsed = parseTun(tunContent);
            expect(parsed).not.toBeNull();
            expect(parsed.name).toBe("Test Tun Tuning");
            expect(parsed.map[69]).toBeCloseTo(69.0, 2);
            expect(parsed.map[60]).toBeCloseTo(60.0, 2);
        });
    });

    describe('New Microtonal Tuning Systems (17-EDO, 22-EDO, 53-EDO, Just Intonation, Werckmeister III)', () => {
        it('should resolve correct divisions for EDO17, EDO22, EDO53', () => {
            expect(getEffectiveTuning(null, 17).divisions).toBe(17);
            expect(getEffectiveTuning(null, 22).divisions).toBe(22);
            expect(getEffectiveTuning(null, 53).divisions).toBe(53);
        });

        it('should resolve correct unequal pitches for Just Intonation (JI)', () => {
            const jiTuning = getEffectiveTuning(null, 'JI');
            expect(jiTuning.divisions).toBe(12);
            expect(jiTuning.pitches).not.toBeNull();
            expect(jiTuning.pitches[4]).toBe(3.8631); // Pure major third (5/4) in semitones
        });

        it('should resolve correct unequal pitches for Werckmeister III (WM3)', () => {
            const wm3Tuning = getEffectiveTuning(null, 'WM3');
            expect(wm3Tuning.divisions).toBe(12);
            expect(wm3Tuning.pitches[4]).toBe(3.90); // WM3 major third in semitones
        });

        it('should calculate correct chord notes under JI', () => {
            // C major triad [60, 64, 67] in JI should be C(60), E(60 + 3.8631), G(60 + 7.0196)
            const notes = getChordNotes('I', 60, 'JI');
            expect(notes[0]).toBe(60);
            expect(notes[1]).toBeCloseTo(63.8631, 3);
            expect(notes[2]).toBeCloseTo(67.0196, 3);
        });
    });

    describe('Audit fixes validation tests', () => {
        it('should return null when getChordNotes encounters a circular custom chord reference', () => {
            const cycleA = { symbol: 'CYCLE_B' };
            const cycleB = { symbol: 'CYCLE_A' };
            
            // Set up a mutual reference loop
            cycleA.symbol = 'CYCLE_B';
            cycleB.symbol = 'CYCLE_A';
            
            const originalCustomChords = global.window ? global.window.__customChords : undefined;
            if (!global.window) {
                global.window = {};
            }
            
            global.window.__customChords = [
                { symbol: 'CYCLE_A', customNotes: [ { pitch: 60 } ] },
                { symbol: 'CYCLE_B', customNotes: [ { pitch: 62 } ] }
            ];
            
            // We can pass a visited set containing CYCLE_A to simulate a cycle during traversal
            const visited = new Set(['CYCLE_A']);
            const result = getChordNotes(cycleA, 60, 12, null, false, visited);
            expect(result).toBeNull();

            // Cleanup
            if (originalCustomChords === undefined) {
                delete global.window.__customChords;
            } else {
                global.window.__customChords = originalCustomChords;
            }
        });

        it('should return null from parseScl if note count exceeds actual pitch lines', () => {
            const malformedScl = `! malformed.scl
Scale with too few lines
5
100.0
200.0`;
            const parsed = parseScl(malformedScl);
            expect(parsed).toBeNull();
        });
    });
});