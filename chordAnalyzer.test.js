import { identifyChord } from './chordAnalyzer.js';
import { state } from './store.js';

describe('chordAnalyzer', () => {
    beforeEach(() => {
        state.baseKey = 60; // C
        state.divisions = 12;
    });

    it('identifies standard major and minor triads', () => {
        // C Major: C (60), E (64), G (67)
        expect(identifyChord([60, 64, 67], 60)).toBe('I');
        
        // C Minor: C (60), Eb (63), G (67)
        expect(identifyChord([60, 63, 67], 60)).toBe('i');

        // D Minor (ii in key of C): D (62), F (65), A (69)
        expect(identifyChord([62, 65, 69], 60)).toBe('ii');
    });

    it('identifies chords in inversion', () => {
        // C Major first inversion: E (64), G (67), C (72)
        expect(identifyChord([64, 67, 72], 60)).toBe('I');

        // G Major second inversion: D (62), G (67), B (71)
        expect(identifyChord([62, 67, 71], 60)).toBe('V');
    });

    it('identifies suspended chords', () => {
        // Csus4: C (60), F (65), G (67)
        expect(identifyChord([60, 65, 67], 60)).toBe('Isus4');

        // Gsus4: G (67), C (72), D (74) -> G (7), C (0), D (2) relative to baseKey C
        expect(identifyChord([67, 72, 74], 60)).toBe('Vsus4');
    });

    it('identifies 7th chords', () => {
        // G Dominant 7th (V7 in C): G (67), B (71), D (74), F (77)
        expect(identifyChord([67, 71, 74, 77], 60)).toBe('V7');

        // C Major 7th (Imaj7 in C): C (60), E (64), G (67), B (71)
        expect(identifyChord([60, 64, 67, 71], 60)).toBe('Imaj7');
    });

    it('returns null or closest match for unrecognized configurations', () => {
        // A single note doesn't form a chord
        expect(identifyChord([60], 60)).toBeNull();
        
        // Random cluster
        expect(identifyChord([60, 61, 62], 60)).toBeNull();
    });
});
