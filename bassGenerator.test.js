import { generateIntelligentBassline } from './bassGenerator.js';

describe('Intelligent Bassline Generator', () => {
    const mockDrumPattern = {
        hits: [
            { row: 'kick', time: 0.0 },     // Beat 1
            { row: 'kick', time: 0.25 },    // Beat 2
            { row: 'snare', time: 0.5 },    // Snare shouldn't count
            { row: 'kick', time: 0.75 }     // Beat 4
        ]
    };

    it('should lock bass directly to the kick drum by default', () => {
        const result = generateIntelligentBassline(mockDrumPattern, null, { lengthBeats: 4, avoidKick: false });
        expect(result.instances.length).toBe(3);
        expect(result.instances[0].startTime).toBe(0.0);
        expect(result.instances[1].startTime).toBe(0.25);
        expect(result.instances[2].startTime).toBe(0.75);
    });

    it('should flag the pattern for nondestructive ducking when avoidKick is true', () => {
        const result = generateIntelligentBassline(mockDrumPattern, null, { lengthBeats: 4, avoidKick: true });
        expect(result.avoidKick).toBe(true);
        expect(result.instances.length).toBe(3);
        
        expect(result.instances[0].startTime).toBe(0.0);
    });

    it('should apply walking pitch styles', () => {
        const result = generateIntelligentBassline(mockDrumPattern, null, { lengthBeats: 4, pitchStyle: 'octaves' });
        
        expect(result.instances[0].pitchOffset).toBe(0);
        expect(result.instances[1].pitchOffset).toBe(12);
        expect(result.instances[2].pitchOffset).toBe(0);
    });
});