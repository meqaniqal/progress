import { calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder, calculateLoopBounds } from './stateUtils.js';

describe('State Utils - Swap Index Math', () => {
    it('should shift swaps down when an earlier chord is removed', () => {
        const currentSwaps = { 1: { symbol: 'vi' }, 3: { symbol: 'IV' } };
        const result = calculateSwapsOnRemove(currentSwaps, 0);
        expect(result).toEqual({ 0: { symbol: 'vi' }, 2: { symbol: 'IV' } });
    });

    it('should delete the swap if the removed chord was swapped', () => {
        const currentSwaps = { 1: { symbol: 'vi' } };
        const result = calculateSwapsOnRemove(currentSwaps, 1);
        expect(result).toEqual({});
    });

    it('should shift swaps up when a chord is inserted before them', () => {
        const currentSwaps = { 1: { symbol: 'vi' } };
        const result = calculateSwapsOnInsert(currentSwaps, 0);
        expect(result).toEqual({ 2: { symbol: 'vi' } });
    });

    it('should not shift swaps when a chord is inserted after them', () => {
        const currentSwaps = { 1: { symbol: 'vi' } };
        const result = calculateSwapsOnInsert(currentSwaps, 2);
        expect(result).toEqual({ 1: { symbol: 'vi' } });
    });

    it('should accurately move a swap during a reorder', () => {
        const currentSwaps = { 0: { symbol: 'vi' } };
        // Moving index 0 to index 2 in an array of length 3
        const result = calculateSwapsOnReorder(currentSwaps, 3, 0, 2);
        expect(result).toEqual({ 2: { symbol: 'vi' } });
    });
});

describe('State Utils - Loop Bounds', () => {
    it('should handle zero length arrays safely', () => {
        expect(calculateLoopBounds(0, 5, 10)).toEqual({ start: 0, end: 0 });
    });

    it('should enforce that start is never less than 0', () => {
        expect(calculateLoopBounds(5, -2, 4)).toEqual({ start: 0, end: 4 });
    });

    it('should enforce that start is never greater than length - 1', () => {
        expect(calculateLoopBounds(5, 10, 12)).toEqual({ start: 4, end: 5 });
    });

    it('should enforce that end is strictly greater than start', () => {
        expect(calculateLoopBounds(5, 2, 1)).toEqual({ start: 2, end: 3 });
    });

    it('should enforce that end is never greater than length', () => {
        expect(calculateLoopBounds(5, 0, 10)).toEqual({ start: 0, end: 5 });
    });
});