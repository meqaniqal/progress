import { jest } from '@jest/globals';
import { getDragAfterElement } from './dragdrop.js';

describe('Drag and Drop Logic', () => {
    let container;

    beforeEach(() => {
        // Mock a DOM container since Jest runs in Node (no native layout engine)
        container = {
            querySelectorAll: jest.fn()
        };
    });

    it('should return the correct element when cursor is in the left half of an element', () => {
        const mockChild = {
            getBoundingClientRect: () => ({
                top: 0, bottom: 40, left: 0, width: 100
            })
        };
        
        container.querySelectorAll.mockReturnValue([mockChild]);

        // Cursor at x = 40 (left half of 100), y = 20 (vertically inside)
        const result = getDragAfterElement(container, 40, 20);
        expect(result).toBe(mockChild);
    });

    it('should return null when cursor is past the halfway point of the last element', () => {
        const mockChild = {
            getBoundingClientRect: () => ({
                top: 0, bottom: 40, left: 0, width: 100
            })
        };
        
        container.querySelectorAll.mockReturnValue([mockChild]);

        // Cursor at x = 60 (right half of 100), y = 20
        const result = getDragAfterElement(container, 60, 20);
        expect(result).toBeNull(); // It should insert after the last element
    });
});