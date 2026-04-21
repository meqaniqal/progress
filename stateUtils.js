// Pure functions for complex state array/map index math

export function calculateSwapsOnRemove(currentSwaps, removedIndex) {
    const newSwaps = {};
    for (const key in currentSwaps) {
        const i = parseInt(key, 10);
        if (i < removedIndex) {
            newSwaps[i] = currentSwaps[key];
        } else if (i > removedIndex) {
            newSwaps[i - 1] = currentSwaps[key];
        }
    }
    return newSwaps;
}

export function calculateSwapsOnInsert(currentSwaps, insertIndex) {
    const newSwaps = {};
    const sortedKeys = Object.keys(currentSwaps).map(Number).sort((a, b) => b - a);
    for (const i of sortedKeys) {
        if (i >= insertIndex) {
            newSwaps[i + 1] = currentSwaps[i];
        } else {
            newSwaps[i] = currentSwaps[i];
        }
    }
    return newSwaps;
}

export function calculateSwapsOnReorder(currentSwaps, length, oldIndex, newIndex) {
    if (oldIndex === newIndex) return currentSwaps;
    const swapsArray = Array.from({ length }, (_, i) => currentSwaps[i] || null);
    const movingSwap = swapsArray.splice(oldIndex, 1)[0];
    swapsArray.splice(newIndex, 0, movingSwap);
    const newSwaps = {};
    swapsArray.forEach((swap, i) => { if (swap) newSwaps[i] = swap; });
    return newSwaps;
}

export function calculateLoopBounds(length, currentStart, currentEnd) {
    let start = typeof currentStart === 'number' ? currentStart : 0;
    let end = typeof currentEnd === 'number' ? currentEnd : length;

    if (length === 0) return { start: 0, end: 0 };

    if (start < 0) start = 0;
    if (start >= length) start = length - 1;

    if (end <= start) end = start + 1;
    if (end > length) end = length;

    return { start, end };
}