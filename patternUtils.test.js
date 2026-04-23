import { initChordPattern, sliceInstance, toggleSelection, applyArpSettings, moveInstance, fillGapInstance } from './patternUtils.js';

describe('Pattern Utils - Rhythm Pattern Editor', () => {
    it('should initialize a default chord pattern', () => {
        const pattern = initChordPattern();
        expect(pattern.instances.length).toBe(1);
        expect(pattern.instances[0].startTime).toBe(0.0);
        expect(pattern.instances[0].duration).toBe(1.0);
        expect(pattern.generative.mode).toBe('off');
    });

    it('should slice an instance at a given ratio', () => {
        const pattern = initChordPattern();
        const initialId = pattern.instances[0].id;
        
        const sliced = sliceInstance(pattern, initialId, 0.5); // Split exactly in half
        expect(sliced.instances.length).toBe(2);
        
        expect(sliced.instances[0].startTime).toBe(0.0);
        expect(sliced.instances[0].duration).toBe(0.5);
        
        expect(sliced.instances[1].startTime).toBe(0.5);
        expect(sliced.instances[1].duration).toBe(0.5);
        expect(sliced.instances[0].id).not.toBe(sliced.instances[1].id); // IDs should be unique
    });

    it('should toggle selection for specific instances', () => {
        let pattern = initChordPattern();
        const id = pattern.instances[0].id;
        
        pattern = toggleSelection(pattern, [id], true);
        expect(pattern.instances[0].isSelected).toBe(true);
        
        pattern = toggleSelection(pattern, [id], false);
        expect(pattern.instances[0].isSelected).toBe(false);
    });

    it('should apply arp settings to selected instances', () => {
        let pattern = initChordPattern();
        const id = pattern.instances[0].id;
        
        const settings = { style: 'up', rate: 0.25, oneShot: true };
        pattern = applyArpSettings(pattern, [id], settings);
        
        expect(pattern.instances[0].arpSettings).toEqual(settings);
    });

    it('should move an instance to a new start time', () => {
        let pattern = initChordPattern();
        const id = pattern.instances[0].id;
        
        pattern = moveInstance(pattern, id, 0.25);
        
        expect(pattern.instances[0].startTime).toBe(0.25);
    });

    it('should fill the entire space if timeline is completely empty', () => {
        let pattern = { instances: [] };
        pattern = fillGapInstance(pattern, 0.5);
        expect(pattern.instances.length).toBe(1);
        expect(pattern.instances[0].startTime).toBe(0.0);
        expect(pattern.instances[0].duration).toBe(1.0);
    });

    it('should fill the gap between two existing instances', () => {
        let pattern = { instances: [{ startTime: 0.0, duration: 0.2 }, { startTime: 0.8, duration: 0.2 }] };
        pattern = fillGapInstance(pattern, 0.5);
        expect(pattern.instances.length).toBe(3);
        // The new instance should sit perfectly between 0.2 and 0.8
        expect(pattern.instances[2].startTime).toBe(0.2);
        expect(pattern.instances[2].duration).toBeCloseTo(0.6);
    });

    it('should not create a slice if clicking inside an existing instance', () => {
        let pattern = { instances: [{ startTime: 0.0, duration: 0.5 }] };
        pattern = fillGapInstance(pattern, 0.25);
        expect(pattern.instances.length).toBe(1);
    });
});