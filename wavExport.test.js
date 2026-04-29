import { calculateAudioTimeline } from './wavExport.js';

describe('WAV Export - Layer 1 Timeline Calculator', () => {
    it('should generate an empty timeline for an empty progression', () => {
        const timeline = calculateAudioTimeline([], 120, false);
        expect(timeline).toEqual([]);
    });

    it('should correctly stagger startTimes based on BPM', () => {
        const bpm = 60; // 1 beat per second
        const progression = [
            { symbol: 'I', key: 60, duration: 1 },
            { symbol: 'V', key: 60, duration: 1 }
        ];
        
        const timeline = calculateAudioTimeline(progression, bpm, false);
        
        // Look for the first event of the second chord
        // The first chord (I) should be at startTime: 0
        const firstChordEvents = timeline.filter(ev => ev.startTime === 0);
        expect(firstChordEvents.length).toBeGreaterThan(0);
        
        // The second chord (V) should be exactly at startTime: 1
        const secondChordEvents = timeline.filter(ev => ev.startTime === 1);
        expect(secondChordEvents.length).toBeGreaterThan(0);
    });

    it('should include both sawtooth (pad) and sine (bass) wave events', () => {
        const progression = [{ symbol: 'I', key: 60 }];
        const timeline = calculateAudioTimeline(progression, 120, false);
        
        const padEvents = timeline.filter(ev => ev.type === 'sawtooth');
        const bassEvents = timeline.filter(ev => ev.type === 'sine');
        
        expect(padEvents.length).toBeGreaterThan(0);
        expect(bassEvents.length).toBeGreaterThan(0);
    });
});