import { drawPatternBlock } from './patternDrawMath.js';

describe('Pattern Draw Math - Boolean Carving', () => {
    let idCounter;
    
    // Deterministic ID generator for easy assertions
    const mockGenerateId = () => `new_id_${idCounter++}`;

    beforeEach(() => {
        idCounter = 1;
    });

    it('should add a new block when drawing in empty space', () => {
        let pattern = { instances: [] };
        pattern = drawPatternBlock(pattern, 0.2, 0.4, false, mockGenerateId);
        
        expect(pattern.instances.length).toBe(1);
        expect(pattern.instances[0].id).toBe('new_id_1');
        expect(pattern.instances[0].startTime).toBe(0.2);
        expect(pattern.instances[0].duration).toBe(0.4);
        expect(pattern.instances[0].isSelected).toBe(true);
    });

    it('should truncate an existing block when drawing overlaps its right side', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.0, duration: 0.5 }] };
        pattern = drawPatternBlock(pattern, 0.4, 0.3, false, mockGenerateId); 
        
        expect(pattern.instances.length).toBe(2);
        expect(pattern.instances[0].id).toBe('orig_1');
        expect(pattern.instances[0].duration).toBeCloseTo(0.4);
        
        expect(pattern.instances[1].id).toBe('new_id_1');
        expect(pattern.instances[1].startTime).toBe(0.4);
        expect(pattern.instances[1].duration).toBe(0.3);
    });

    it('should truncate an existing block when drawing overlaps its left side', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.4, duration: 0.5 }] };
        pattern = drawPatternBlock(pattern, 0.2, 0.3, false, mockGenerateId); 
        
        expect(pattern.instances.length).toBe(2);
        
        expect(pattern.instances[0].id).toBe('new_id_1');
        expect(pattern.instances[0].startTime).toBe(0.2);
        expect(pattern.instances[0].duration).toBe(0.3);
        
        expect(pattern.instances[1].id).toBe('orig_1');
        expect(pattern.instances[1].startTime).toBe(0.5);
        expect(pattern.instances[1].duration).toBeCloseTo(0.4);
    });

    it('should split an existing block when drawing completely inside it', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.0, duration: 1.0 }] };
        pattern = drawPatternBlock(pattern, 0.3, 0.4, false, mockGenerateId); 
        
        expect(pattern.instances.length).toBe(3);
        
        // Left split
        expect(pattern.instances[0].id).toBe('orig_1');
        expect(pattern.instances[0].startTime).toBe(0.0);
        expect(pattern.instances[0].duration).toBeCloseTo(0.3);
        
        // Inserted center block
        expect(pattern.instances[1].id).toBe('new_id_2'); // new_id_1 was used for the right split
        expect(pattern.instances[1].startTime).toBe(0.3);
        expect(pattern.instances[1].duration).toBe(0.4);
        
        // Right split
        expect(pattern.instances[2].id).toBe('new_id_1');
        expect(pattern.instances[2].startTime).toBe(0.7);
        expect(pattern.instances[2].duration).toBeCloseTo(0.3);
    });

    it('should completely delete a block if it is swallowed by the drawn area', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.4, duration: 0.2 }] };
        pattern = drawPatternBlock(pattern, 0.2, 0.6, false, mockGenerateId); 
        
        expect(pattern.instances.length).toBe(1);
        expect(pattern.instances[0].id).toBe('new_id_1');
        expect(pattern.instances[0].startTime).toBe(0.2);
        expect(pattern.instances[0].duration).toBe(0.6);
    });

    it('should handle drawing across multiple blocks (complex overlap)', () => {
        let pattern = { instances: [
            { id: 'b1', startTime: 0.1, duration: 0.2 }, // [0.1 - 0.3] -> Truncated right
            { id: 'b2', startTime: 0.4, duration: 0.2 }, // [0.4 - 0.6] -> Swallowed entirely
            { id: 'b3', startTime: 0.7, duration: 0.2 }  // [0.7 - 0.9] -> Truncated left
        ]};
        
        // Draw from 0.2 to 0.8
        pattern = drawPatternBlock(pattern, 0.2, 0.6, false, mockGenerateId);
        
        expect(pattern.instances.length).toBe(3);
        
        // Left remnant of b1
        expect(pattern.instances[0].id).toBe('b1');
        expect(pattern.instances[0].duration).toBeCloseTo(0.1); 
        
        // The new giant block
        expect(pattern.instances[1].id).toBe('new_id_1');
        expect(pattern.instances[1].startTime).toBe(0.2);
        expect(pattern.instances[1].duration).toBe(0.6);
        
        // Right remnant of b3
        expect(pattern.instances[2].id).toBe('b3');
        expect(pattern.instances[2].startTime).toBe(0.8);
        expect(pattern.instances[2].duration).toBeCloseTo(0.1);
    });

    it('should carve a hole without adding a block when isEraser is true', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.0, duration: 1.0 }] };
        pattern = drawPatternBlock(pattern, 0.4, 0.2, true, mockGenerateId); 
        
        expect(pattern.instances.length).toBe(2);
        
        expect(pattern.instances[0].id).toBe('orig_1');
        expect(pattern.instances[0].duration).toBeCloseTo(0.4);
        
        expect(pattern.instances[1].id).toBe('new_id_1');
        expect(pattern.instances[1].startTime).toBeCloseTo(0.6);
        expect(pattern.instances[1].duration).toBeCloseTo(0.4);
    });

    it('should discard slivers that fall below MIN_DRAW_DURATION (0.01)', () => {
        // Suppose block is [0.195 -> 0.4]. We draw starting at 0.2. 
        // The remaining left sliver is 0.005. 
        // Because 0.005 < 0.01 (MIN_DRAW_DURATION), it should be discarded entirely.
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.195, duration: 0.205 }] };
        
        // Draw swallows almost all of it, leaving a 0.005 piece
        pattern = drawPatternBlock(pattern, 0.2, 0.4, false, mockGenerateId);
        
        // Because 0.005 < 0.01 (MIN_DRAW_DURATION), it should be discarded entirely.
        expect(pattern.instances.length).toBe(1);
        expect(pattern.instances[0].id).toBe('new_id_1');
        expect(pattern.instances[0].startTime).toBe(0.2);
    });

    it('should completely remove an instance if erased exactly', () => {
        let pattern = { instances: [{ id: 'orig_1', startTime: 0.4, duration: 0.2 }] };
        pattern = drawPatternBlock(pattern, 0.4, 0.2, true, mockGenerateId); 
        expect(pattern.instances.length).toBe(0);
    });
});