import { CONFIG } from './config.js';

/**
 * Applies a boolean carve operation (A NOT B) on existing instances.
 * If isEraser is true, it just removes the overlapping regions (carving a hole).
 * If isEraser is false, it removes overlaps AND inserts the new instance, replacing that segment.
 */
export function drawPatternBlock(pattern, startTime, duration, isEraser, generateId) {
    const MIN_DURATION = CONFIG.MIN_DRAW_DURATION;
    let newInstances = [];
    const drawEnd = startTime + duration;

    // 1. Carve holes in existing instances
    for (const inst of pattern.instances) {
        const instEnd = inst.startTime + inst.duration;

        // Case 1: Completely outside the draw area -> keep as is
        if (instEnd <= startTime + 0.001 || inst.startTime >= drawEnd - 0.001) {
            newInstances.push({ ...inst });
            continue;
        }

        // Case 2: Completely swallowed by the draw area -> discard entirely
        if (inst.startTime >= startTime - 0.001 && instEnd <= drawEnd + 0.001) {
            continue;
        }

        // Case 3: Overlaps on the left (inst starts before draw, ends inside draw)
        if (inst.startTime < startTime && instEnd > startTime && instEnd <= drawEnd + 0.001) {
            const newDur = startTime - inst.startTime;
            if (newDur >= MIN_DURATION) {
                newInstances.push({ ...inst, duration: newDur });
            }
            continue;
        }

        // Case 4: Overlaps on the right (inst starts inside draw, ends after draw)
        if (inst.startTime >= startTime - 0.001 && inst.startTime < drawEnd && instEnd > drawEnd) {
            const newDur = instEnd - drawEnd;
            if (newDur >= MIN_DURATION) {
                newInstances.push({ ...inst, startTime: drawEnd, duration: newDur });
            }
            continue;
        }

        // Case 5: Draw area is completely inside the instance -> split into two
        if (inst.startTime < startTime && instEnd > drawEnd) {
            const leftDur = startTime - inst.startTime;
            if (leftDur >= MIN_DURATION) {
                newInstances.push({ ...inst, duration: leftDur });
            }

            const rightDur = instEnd - drawEnd;
            if (rightDur >= MIN_DURATION) {
                newInstances.push({
                    ...inst,
                    id: generateId(), // New ID for the split right half
                    startTime: drawEnd,
                    duration: rightDur,
                    isSelected: false
                });
            }
            continue;
        }
    }

    // 2. Add the new instance if we are not just erasing
    if (!isEraser && duration >= MIN_DURATION) {
        // Deselect everything else first
        newInstances = newInstances.map(inst => ({ ...inst, isSelected: false }));
        
        newInstances.push({
            id: generateId(),
            startTime: startTime,
            duration: duration,
            type: 'chord',
            pitchOffset: 0,
            isSelected: true,
            arpSettings: null,
            probability: 1.0
        });
    }

    // 3. Sort by start time for cleanliness
    newInstances.sort((a, b) => a.startTime - b.startTime);

    return { ...pattern, instances: newInstances };
}