import { initChordPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, drawPatternBlock } from './patternUtils.js';

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

    it('should exclusively select an instance and deselect others', () => {
        let pattern = initChordPattern();
        pattern.instances.push({ id: '2', startTime: 0.5, duration: 0.5, isSelected: true });
        const id1 = pattern.instances[0].id;
        
        pattern = exclusiveSelect(pattern, id1);
        expect(pattern.instances[0].isSelected).toBe(true);
        expect(pattern.instances[1].isSelected).toBe(false); // Was true, now false
        
        pattern = exclusiveSelect(pattern, id1); // Should remain selected to guarantee at least one active slice
        expect(pattern.instances[0].isSelected).toBe(true);
    });

    it('should apply arp settings to selected instances', () => {
        let pattern = initChordPattern();
        const id = pattern.instances[0].id;
        
        const settings = { style: 'up', rate: 0.25, oneShot: true };
        pattern = applyArpSettings(pattern, [id], settings);
        
        expect(pattern.instances[0].arpSettings).toEqual(settings);
    });

    it('should move an instance and preserve duration if space allows', () => {
        let pattern = { instances: [{ id: '1', startTime: 0.0, duration: 0.2 }] };
        pattern = moveInstance(pattern, '1', 0.5);
        expect(pattern.instances[0].startTime).toBe(0.5);
        expect(pattern.instances[0].duration).toBe(0.2);
    });

    it('should shrink duration if moved into a tighter left boundary', () => {
        let pattern = { instances: [
            { id: '1', startTime: 0.0, duration: 0.2 },
            { id: '2', startTime: 0.5, duration: 0.2 }
        ]};
        pattern = moveInstance(pattern, '2', 0.1);
        expect(pattern.instances[1].startTime).toBe(0.2);
        expect(pattern.instances[1].duration).toBeCloseTo(0.1);
    });

    it('should shrink duration if moved into a tighter right boundary', () => {
        let pattern = { instances: [
            { id: '1', startTime: 0.2, duration: 0.4 },
            { id: '2', startTime: 0.8, duration: 0.2 }
        ]};
        pattern = moveInstance(pattern, '1', 0.6, 0.4);
        expect(pattern.instances[0].startTime).toBe(0.6);
        expect(pattern.instances[0].duration).toBeCloseTo(0.2);
    });

    it('should enforce a minimum duration when pushed against a right boundary', () => {
        let pattern = { instances: [
            { id: '1', startTime: 0.2, duration: 0.2 },
            { id: '2', startTime: 0.5, duration: 0.2 }
        ]};
        pattern = moveInstance(pattern, '1', 0.6);
        expect(pattern.instances[0].startTime).toBeCloseTo(0.48);
        expect(pattern.instances[0].duration).toBeCloseTo(0.02);
    });

    it('should allow shortening an already adjacent instance without moving away first', () => {
        let pattern = { instances: [
            { id: '1', startTime: 0.2, duration: 0.3 },
            { id: '2', startTime: 0.5, duration: 0.3 }
        ]};
        // Instances touch exactly at 0.5. Move '1' into '2'.
        pattern = moveInstance(pattern, '1', 0.4, 0.3);
        expect(pattern.instances[0].startTime).toBe(0.4);
        expect(pattern.instances[0].duration).toBeCloseTo(0.1);
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

    it('should expand an instance to its maximum adjacent boundaries', () => {
        let pattern = { instances: [
            { id: '1', startTime: 0.1, duration: 0.2 },
            { id: '2', startTime: 0.4, duration: 0.2 }, // We will expand this
            { id: '3', startTime: 0.8, duration: 0.1 }
        ]};
        pattern = expandInstance(pattern, '2');
        expect(pattern.instances[1].startTime).toBeCloseTo(0.3); // Reaches end of instance 1
        expect(pattern.instances[1].duration).toBeCloseTo(0.5); // Stretches from 0.3 to 0.8 (start of instance 3)
    });

    describe('resizeInstance', () => {
        it('should resize from the right edge', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.2, duration: 0.3 }] };
            pattern = resizeInstance(pattern, '1', 'right', 0.6);
            expect(pattern.instances[0].startTime).toBe(0.2);
            expect(pattern.instances[0].duration).toBeCloseTo(0.4);
        });

        it('should resize from the left edge', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.2, duration: 0.3 }] };
            pattern = resizeInstance(pattern, '1', 'left', 0.1);
            expect(pattern.instances[0].startTime).toBe(0.1);
            expect(pattern.instances[0].duration).toBeCloseTo(0.4);
        });

        it('should clamp right edge to the next instance', () => {
            let pattern = { instances: [
                { id: '1', startTime: 0.2, duration: 0.2 },
                { id: '2', startTime: 0.6, duration: 0.2 }
            ]};
            pattern = resizeInstance(pattern, '1', 'right', 0.8);
            expect(pattern.instances[0].duration).toBeCloseTo(0.4); // Clamped to 0.6 - 0.2
        });

        it('should clamp left edge to the previous instance', () => {
            let pattern = { instances: [
                { id: '1', startTime: 0.1, duration: 0.2 },
                { id: '2', startTime: 0.5, duration: 0.2 }
            ]};
            pattern = resizeInstance(pattern, '2', 'left', 0.0);
            expect(pattern.instances[1].startTime).toBeCloseTo(0.3); // Clamped to 0.1 + 0.2
            expect(pattern.instances[1].duration).toBeCloseTo(0.4); // Original end was 0.7, 0.7 - 0.3 = 0.4
        });

        it('should enforce MIN_DURATION on right edge', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.2, duration: 0.2 }] };
            pattern = resizeInstance(pattern, '1', 'right', 0.1); // Trying to go backwards past start
            expect(pattern.instances[0].duration).toBeCloseTo(0.02);
        });

        it('should enforce MIN_DURATION on left edge', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.2, duration: 0.2 }] };
            pattern = resizeInstance(pattern, '1', 'left', 0.5); // Trying to push start past end
            expect(pattern.instances[0].startTime).toBeCloseTo(0.38); // 0.4 - 0.02
            expect(pattern.instances[0].duration).toBeCloseTo(0.02);
        });
    });

    describe('drawPatternBlock (Boolean Carving)', () => {
        it('should add a new block when drawing in empty space', () => {
            let pattern = { instances: [] };
            pattern = drawPatternBlock(pattern, 0.2, 0.4);
            expect(pattern.instances.length).toBe(1);
            expect(pattern.instances[0].startTime).toBe(0.2);
            expect(pattern.instances[0].duration).toBe(0.4);
            expect(pattern.instances[0].isSelected).toBe(true);
        });

        it('should truncate an existing block when drawing overlaps its right side', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.0, duration: 0.5 }] };
            pattern = drawPatternBlock(pattern, 0.4, 0.3); // Draw from 0.4 to 0.7
            expect(pattern.instances.length).toBe(2);
            expect(pattern.instances[0].id).toBe('1');
            expect(pattern.instances[0].duration).toBeCloseTo(0.4);
            expect(pattern.instances[1].startTime).toBe(0.4);
            expect(pattern.instances[1].duration).toBe(0.3);
        });

        it('should truncate an existing block when drawing overlaps its left side', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.4, duration: 0.5 }] };
            pattern = drawPatternBlock(pattern, 0.2, 0.3); // Draw from 0.2 to 0.5
            expect(pattern.instances.length).toBe(2);
            expect(pattern.instances[0].startTime).toBe(0.2);
            expect(pattern.instances[0].duration).toBe(0.3);
            expect(pattern.instances[1].id).toBe('1');
            expect(pattern.instances[1].startTime).toBe(0.5);
            expect(pattern.instances[1].duration).toBeCloseTo(0.4);
        });

        it('should split an existing block when drawing completely inside it', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.0, duration: 1.0 }] };
            pattern = drawPatternBlock(pattern, 0.3, 0.4); // Draw from 0.3 to 0.7
            expect(pattern.instances.length).toBe(3);
            expect(pattern.instances[0].id).toBe('1');
            expect(pattern.instances[0].startTime).toBe(0.0);
            expect(pattern.instances[0].duration).toBeCloseTo(0.3);
            expect(pattern.instances[1].startTime).toBe(0.3);
            expect(pattern.instances[1].duration).toBe(0.4);
            expect(pattern.instances[2].id).not.toBe('1');
            expect(pattern.instances[2].startTime).toBe(0.7);
            expect(pattern.instances[2].duration).toBeCloseTo(0.3);
        });

        it('should completely delete a block if it is swallowed by the drawn area', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.4, duration: 0.2 }] };
            pattern = drawPatternBlock(pattern, 0.2, 0.6); // Draw from 0.2 to 0.8
            expect(pattern.instances.length).toBe(1);
            expect(pattern.instances[0].id).not.toBe('1');
            expect(pattern.instances[0].startTime).toBe(0.2);
            expect(pattern.instances[0].duration).toBe(0.6);
        });

        it('should carve a hole without adding a block when isEraser is true', () => {
            let pattern = { instances: [{ id: '1', startTime: 0.0, duration: 1.0 }] };
            pattern = drawPatternBlock(pattern, 0.4, 0.2, true); // Erase from 0.4 to 0.6
            expect(pattern.instances.length).toBe(2);
            expect(pattern.instances[0].duration).toBeCloseTo(0.4);
            expect(pattern.instances[1].startTime).toBeCloseTo(0.6);
            expect(pattern.instances[1].duration).toBeCloseTo(0.4);
        });
    });
});