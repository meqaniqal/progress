import { generateArpNotes } from './arp.js';

describe('Arpeggiator Logic', () => {
    const notes = [60, 64, 67]; // C Major triad
    const bpm = 120; // 2 beats per second, 0.5s per beat

    it('should generate notes in "up" order', () => {
        const events = generateArpNotes({
            notesToPlay: [67, 60, 64], // Unordered
            arpSettings: { style: 'up', rate: '1/16' },
            instanceDuration: 0.5, // 1 beat
            bpm
        });
        // 1/16th note at 120bpm is 0.125s. 0.5s duration fits 4 notes.
        expect(events.map(e => e.note)).toEqual([60, 64, 67, 60]);
    });

    it('should generate notes in "down" order', () => {
        const events = generateArpNotes({
            notesToPlay: [67, 60, 64], // Unordered
            arpSettings: { style: 'down', rate: '1/16' },
            instanceDuration: 0.5,
            bpm
        });
        expect(events.map(e => e.note)).toEqual([67, 64, 60, 67]);
    });

    it('should generate notes in "upDown" order', () => {
        // upDown pattern is [C, E, G, E] -> length 4
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'upDown', rate: '1/16' },
            instanceDuration: 0.5,
            bpm
        });
        expect(events.map(e => e.note)).toEqual([60, 64, 67, 64]);
    });

    it('should generate notes in "downUp" order', () => {
        // downUp pattern is [G, E, C, E] -> length 4
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'downUp', rate: '1/16' },
            instanceDuration: 0.5,
            bpm
        });
        expect(events.map(e => e.note)).toEqual([67, 64, 60, 64]);
    });

    it('should handle "segment" rate correctly and play only once', () => {
        const instanceDuration = 1.5; // seconds
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: 'segment' },
            instanceDuration,
            bpm
        });
        expect(events.length).toBe(3);
        // Each step should be 1.5 / 3 = 0.5s
        expect(events[0].startTime).toBe(0);
        expect(events[1].startTime).toBe(0.5);
        expect(events[2].startTime).toBe(1.0);
        expect(events[0].duration).toBeCloseTo(0.5 * 0.9); // with gate
    });

    it('should handle beat-division rate (1/8)', () => {
        // At 120bpm, an 8th note is 0.25s.
        const instanceDuration = 1.0; // 2 beats, fits 4 notes
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: '1/8' },
            instanceDuration,
            bpm
        });
        expect(events.length).toBe(4);
        expect(events.map(e => e.note)).toEqual([60, 64, 67, 60]);
        expect(events[0].startTime).toBe(0);
        expect(events[1].startTime).toBe(0.25);
        expect(events[2].startTime).toBe(0.5);
        expect(events[3].startTime).toBe(0.75);
    });

    it('should handle triplet rate (1/8t)', () => {
        // At 120bpm, an 8th note is 0.25s. An 8th triplet is 0.25 * (2/3) = ~0.1667s
        const instanceDuration = 0.5; // 1 beat, fits 3 notes
        const stepDuration = (0.5 / 2) * (2 / 3);
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: '1/8t' },
            instanceDuration,
            bpm
        });
        expect(events.length).toBe(3);
        expect(events[0].startTime).toBe(0);
        expect(events[1].startTime).toBeCloseTo(stepDuration);
        expect(events[2].startTime).toBeCloseTo(stepDuration * 2);
    });

    it('should truncate notes that would extend beyond the instance duration', () => {
        // 8th notes are 0.25s. Instance is 0.6s long. Should fit 3 notes (0, 0.25, 0.5).
        const instanceDuration = 0.6;
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: '1/8' },
            instanceDuration,
            bpm
        });
        expect(events.length).toBe(3);
        
        // Tighter duration
        const instanceDuration2 = 0.4;
        const events2 = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: '1/8' },
            instanceDuration: instanceDuration2,
            bpm
        });
        // 0, 0.25. Next is 0.5, which is > 0.4. So only 2 notes.
        expect(events2.length).toBe(2);
    });

    it('should return an empty array for zero-length instances', () => {
        const events = generateArpNotes({
            notesToPlay: notes,
            arpSettings: { style: 'up', rate: '1/8' },
            instanceDuration: 0,
            bpm
        });
        expect(events).toEqual([]);
    });
});