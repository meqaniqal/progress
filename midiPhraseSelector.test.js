import { extractMotifNotes } from './midiPhraseSelector.js';

describe('midiPhraseSelector.js extraction', () => {
    const mockPolyphonicNotes = [
        // Beat 0 chords: C4 (60), E4 (64), G4 (67)
        { pitch: 67, time: 0.0, duration: 1.0, velocity: 0.8 },
        { pitch: 64, time: 0.0, duration: 1.0, velocity: 0.7 },
        { pitch: 60, time: 0.0, duration: 1.0, velocity: 0.6 },
        
        // Beat 1 chord: D4 (62), F4 (65), A4 (69)
        { pitch: 69, time: 1.0, duration: 1.0, velocity: 0.8 },
        { pitch: 65, time: 1.0, duration: 1.0, velocity: 0.7 },
        { pitch: 62, time: 1.0, duration: 1.0, velocity: 0.6 }
    ];

    test('extract highest register notes (soprano)', () => {
        const result = extractMotifNotes(mockPolyphonicNotes, 'highest');
        expect(result).toHaveLength(2);
        expect(result[0].pitch).toBe(67);
        expect(result[1].pitch).toBe(69);
    });

    test('extract lowest register notes (bass)', () => {
        const result = extractMotifNotes(mockPolyphonicNotes, 'lowest');
        expect(result).toHaveLength(2);
        expect(result[0].pitch).toBe(60);
        expect(result[1].pitch).toBe(62);
    });

    test('extract alto voice', () => {
        const result = extractMotifNotes(mockPolyphonicNotes, 'alto');
        expect(result).toHaveLength(2);
        expect(result[0].pitch).toBe(64);
        expect(result[1].pitch).toBe(65);
    });

    test('extract polyphonic notes as is', () => {
        const result = extractMotifNotes(mockPolyphonicNotes, 'polyphonic');
        expect(result).toHaveLength(6);
        expect(result[0].pitch).toBe(67);
    });

    test('extract arpeggiated notes', () => {
        const result = extractMotifNotes(mockPolyphonicNotes, 'arpeggiate');
        expect(result).toHaveLength(6);
        // Notes should be ordered from lowest to highest per step
        expect(result[0].pitch).toBe(60);
        expect(result[0].time).toBe(0.0);
        expect(result[1].pitch).toBe(64);
        expect(result[1].time).toBe(0.25);
        expect(result[2].pitch).toBe(67);
        expect(result[2].time).toBe(0.50);
        expect(result[3].pitch).toBe(62);
        expect(result[3].time).toBe(0.75);
    });
});
