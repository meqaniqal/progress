// --- Per-Chord Rhythm & Pattern Editor Data Structures ---

export function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Initializes a default rhythm pattern for a newly created or unedited chord.
 * The timeline is normalized from 0.0 (start) to 1.0 (end of the chord slot).
 */
export function initChordPattern(isLocalOverride = false) {
    return {
        isLocalOverride,
        // Global state for this specific chord's generative features
        generative: {
            mode: 'off', // 'off', 'one-shot', 'continuous'
            history: []  // Captures recent multi-pass MIDI events for export
        },
        // Instances represent sliced blocks on the timeline
        instances: [
            {
                id: generateId(),
                startTime: 0.0,
                duration: 1.0, // Full length of the chord slot
                type: 'chord', // 'chord' means it plays all notes. Later 'note' can represent single isolated pitches.
                pitchOffset: 0, // Chromatic offset from the root (-12 to +12)
                isSelected: true,
                arpSettings: null, // e.g., { style: 'up', rate: 0.25, gate: 0.8 }
                probability: 1.0 // 1.0 = 100% chance to play
            }
        ]
    };
}

/**
 * Initializes a default drum pattern using a discrete hit-based grid.
 */
export function initDrumPattern(isLocalOverride = false) {
    return {
        isLocalOverride,
        lengthBeats: 4, // Independent beat length (e.g., 4, 8, 16) for global patterns
        hits: [] // e.g., { id: '...', time: 0.25, row: 'kick', velocity: 1.0 }
    };
}

/**
 * Initializes a full set of patterns for a chord (Chords, Bass, Drums).
 * The bass defaults to inheriting the chord's rhythm slices.
 */
export function initPatternSet() {
    const chordPattern = initChordPattern(false);
    const bassPattern = JSON.parse(JSON.stringify(chordPattern));
    bassPattern.instances.forEach(inst => inst.id = generateId()); // Ensure unique DOM IDs
    const drumPattern = initDrumPattern(false);
    return { chordPattern, bassPattern, drumPattern };
}

/**
 * Adds a new hit to a drum pattern.
 */
export function addDrumHit(pattern, hit) {
    const newHit = { probability: 1.0, ...hit, id: generateId() };
    const hits = pattern && Array.isArray(pattern.hits) ? pattern.hits : [];
    return { ...pattern, hits: [...hits, newHit] };
}

/**
 * Removes a hit from a drum pattern by its ID.
 */
export function removeDrumHit(pattern, hitId) {
    const hits = pattern && Array.isArray(pattern.hits) ? pattern.hits : [];
    return { ...pattern, hits: hits.filter(h => h.id !== hitId) };
}

/**
 * Updates properties of a specific drum hit.
 */
export function updateDrumHit(pattern, hitId, updates) {
    const hits = pattern && Array.isArray(pattern.hits) ? pattern.hits : [];
    const newHits = hits.map(h => h.id === hitId ? { ...h, ...updates } : h);
    return { ...pattern, hits: newHits };
}

/**
 * Updates properties of a specific slice instance.
 */
export function updateInstance(pattern, instanceId, updates) {
    const instances = pattern && Array.isArray(pattern.instances) ? pattern.instances : [];
    const newInstances = instances.map(inst => inst.id === instanceId ? { ...inst, ...updates } : inst);
    return { ...pattern, instances: newInstances };
}

/**
 * Slices an instance into two pieces at a specific ratio.
 */
export function sliceInstance(pattern, instanceId, splitRatio = 0.5) {
    const index = pattern.instances.findIndex(inst => inst.id === instanceId);
    if (index === -1) return pattern;

    const target = pattern.instances[index];
    const duration1 = target.duration * splitRatio;
    const duration2 = target.duration * (1 - splitRatio);

    const inst1 = { ...target, duration: duration1, id: generateId(), isSelected: true };
    const inst2 = { ...target, startTime: target.startTime + duration1, duration: duration2, id: generateId(), isSelected: false };

    const newInstances = pattern.instances.map(inst => ({ ...inst, isSelected: false }));
    newInstances.splice(index, 1, inst1, inst2);

    return { ...pattern, instances: newInstances };
}

/**
 * Expands an instance to fill the available space up to its adjacent boundaries.
 */
export function expandInstance(pattern, instanceId) {
    const target = pattern.instances.find(inst => inst.id === instanceId);
    if (!target) return pattern;

    const others = pattern.instances.filter(inst => inst.id !== instanceId);
    let leftBound = 0.0;
    let rightBound = 1.0;
    const targetCenter = target.startTime + (target.duration / 2);

    for (const other of others) {
        const otherStart = other.startTime;
        const otherEnd = other.startTime + other.duration;
        const otherCenter = otherStart + (other.duration / 2);

        if (otherCenter < targetCenter) {
            if (otherEnd > leftBound) leftBound = otherEnd;
        } else {
            if (otherStart < rightBound) rightBound = otherStart;
        }
    }

    const newInstances = pattern.instances.map(inst =>
        inst.id === instanceId ? { ...inst, startTime: leftBound, duration: rightBound - leftBound } : inst
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Toggles the selection state for drag-box operations.
 */
export function toggleSelection(pattern, instanceIds, isSelected) {
    const newInstances = pattern.instances.map(inst => 
        instanceIds.includes(inst.id) ? { ...inst, isSelected } : inst
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Selects a single instance and deselects all others. 
 * If it is already the only selected instance, it remains selected to guarantee at least one active slice.
 */
export function exclusiveSelect(pattern, instanceId) {
    const target = pattern.instances.find(inst => inst.id === instanceId);
    if (!target) return pattern;

    // Check if target is currently the ONLY selected instance
    const selectedInstances = pattern.instances.filter(inst => inst.isSelected);
    const isOnlyTargetSelected = selectedInstances.length === 1 && selectedInstances[0].id === instanceId;

    if (isOnlyTargetSelected) {
        // Guarantee at least one active slice
        return pattern;
    }

    const newInstances = pattern.instances.map(inst => 
        ({ ...inst, isSelected: inst.id === instanceId })
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Applies or removes arpeggiator settings to the selected instances.
 */
export function applyArpSettings(pattern, instanceIds, arpSettings) {
    const newInstances = pattern.instances.map(inst => 
        instanceIds.includes(inst.id) ? { ...inst, arpSettings: arpSettings ? { ...arpSettings } : null } : inst
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Moves an instance to a new start time, applying smart boundary collision to prevent overlap.
 * Shortens the instance if pushed into a smaller space.
 */
export function moveInstance(pattern, instanceId, newStartTime, intendedDuration = null) {
    const target = pattern.instances.find(inst => inst.id === instanceId);
    if (!target) return pattern;

    const baseDuration = intendedDuration !== null ? intendedDuration : target.duration;
    const others = pattern.instances.filter(inst => inst.id !== instanceId);
    
    let leftBound = 0.0;
    let rightBound = 1.0;
    const targetCenter = target.startTime + (target.duration / 2);

    for (const other of others) {
        const otherStart = other.startTime;
        const otherEnd = other.startTime + other.duration;
        const otherCenter = otherStart + (other.duration / 2);

        if (otherCenter < targetCenter) {
            if (otherEnd > leftBound) leftBound = otherEnd;
        } else {
            if (otherStart < rightBound) rightBound = otherStart;
        }
    }

    const MIN_DURATION = 0.02;
    let clampedStart = Math.max(leftBound, newStartTime);
    let newDuration = baseDuration;
    
    // Handle left boundary squish (shorten slice from the right if dragged left into a wall)
    let overflowLeft = leftBound - newStartTime;
    if (overflowLeft > 0) {
        newDuration -= overflowLeft;
    }
    
    // Prevent pushing start time past the right bound (preserve minimum visible duration)
    if (clampedStart + MIN_DURATION > rightBound) {
        clampedStart = rightBound - MIN_DURATION;
    }

    // Handle right boundary squish (shorten slice from the left if dragged right into a wall)
    if (clampedStart + newDuration > rightBound) {
        newDuration = rightBound - clampedStart;
    }

    // Always enforce minimum duration
    if (newDuration < MIN_DURATION) {
        newDuration = MIN_DURATION;
    }

    const newInstances = pattern.instances.map(inst =>
        inst.id === instanceId ? { ...inst, startTime: clampedStart, duration: newDuration } : inst
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Calculates the boundaries of an empty gap and creates a new instance to fill it.
 */
export function fillGapInstance(pattern, clickRatio) {
    let gapStart = 0.0;
    let gapEnd = 1.0;

    for (const inst of pattern.instances) {
        const instStart = inst.startTime;
        const instEnd = inst.startTime + inst.duration;

        // If the click is inside an existing instance, do nothing
        if (clickRatio >= instStart && clickRatio <= instEnd) {
            return pattern;
        }

        // Narrow the gap boundaries based on surrounding instances
        if (instEnd <= clickRatio && instEnd > gapStart) gapStart = instEnd;
        if (instStart >= clickRatio && instStart < gapEnd) gapEnd = instStart;
    }

    // Avoid creating microscopic instances due to floating point errors
    if (gapEnd - gapStart > 0.01) {
        const newInst = {
            id: generateId(),
            startTime: gapStart,
            duration: gapEnd - gapStart,
            type: 'chord',
            pitchOffset: 0,
            isSelected: true,
            arpSettings: null,
            probability: 1.0
        };
        const newInstances = pattern.instances.map(inst => ({ ...inst, isSelected: false }));
        return { ...pattern, instances: [...newInstances, newInst] };
    }
    return pattern;
}

/**
 * Resizes an instance from either its left or right edge, applying boundary collisions.
 */
export function resizeInstance(pattern, instanceId, edge, newTime) {
    const target = pattern.instances.find(inst => inst.id === instanceId);
    if (!target) return pattern;

    const others = pattern.instances.filter(inst => inst.id !== instanceId);
    let leftBound = 0.0;
    let rightBound = 1.0;
    const targetCenter = target.startTime + (target.duration / 2);

    for (const other of others) {
        const otherStart = other.startTime;
        const otherEnd = other.startTime + other.duration;
        const otherCenter = otherStart + (other.duration / 2);

        if (otherCenter < targetCenter) {
            if (otherEnd > leftBound) leftBound = otherEnd;
        } else {
            if (otherStart < rightBound) rightBound = otherStart;
        }
    }

    const MIN_DURATION = 0.02;
    let newStart = target.startTime;
    let newDuration = target.duration;

    if (edge === 'left') {
        const maxStart = (target.startTime + target.duration) - MIN_DURATION;
        newStart = Math.max(leftBound, Math.min(newTime, maxStart));
        newDuration = (target.startTime + target.duration) - newStart;
    } else if (edge === 'right') {
        const minEnd = target.startTime + MIN_DURATION;
        const newEnd = Math.max(minEnd, Math.min(newTime, rightBound));
        newDuration = newEnd - target.startTime;
    }

    const newInstances = pattern.instances.map(inst =>
        inst.id === instanceId ? { ...inst, startTime: newStart, duration: newDuration } : inst
    );
    return { ...pattern, instances: newInstances };
}

/**
 * Applies a boolean carve operation (A NOT B) on existing instances.
 * If isEraser is true, it just removes the overlapping regions (carving a hole).
 * If isEraser is false, it removes overlaps AND inserts the new instance, replacing that segment.
 */
export function drawPatternBlock(pattern, startTime, duration, isEraser = false) {
    const MIN_DURATION = 0.01;
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

/**
 * Resolves a pattern to a specific duration.
 * If isGlobal is true, the pattern is treated as a 4-beat master loop.
 * It will be truncated if the chord is shorter, or looped if the chord is longer.
 */
export function resolvePattern(pattern, isGlobal, chordBeats, inheritMode = null) {
    if (!isGlobal) return pattern; // Local patterns scale to fit natively

    const GLOBAL_BEATS = pattern.lengthBeats || 4;
    const mode = inheritMode || pattern.globalMode || 'loop';
    
    const resolvedInstances = [];
    const resolvedHits = [];

    if (mode === 'stretch') {
        if (pattern.instances) {
            for (const inst of pattern.instances) {
                resolvedInstances.push({
                    ...inst,
                    id: inst.id + '_stretch',
                    startTime: inst.startTime, // Relative 0.0-1.0 is preserved naturally
                    duration: inst.duration
                });
            }
        }
        if (pattern.hits) {
            for (const hit of pattern.hits) {
                resolvedHits.push({
                    ...hit,
                    id: hit.id + '_stretch',
                    time: hit.time
                });
            }
        }
    } else {
        // Loop or Empty
        const loops = mode === 'empty' ? 1 : Math.ceil(chordBeats / GLOBAL_BEATS);

        for (let loop = 0; loop < loops; loop++) {
        if (pattern.instances) {
            for (const inst of pattern.instances) {
                const absStart = (loop * GLOBAL_BEATS) + (inst.startTime * GLOBAL_BEATS);
                let absEnd = absStart + (inst.duration * GLOBAL_BEATS);

                if (absStart >= chordBeats) continue;
                if (absEnd > chordBeats) absEnd = chordBeats;

                const newDuration = absEnd - absStart;
                if (newDuration > 0.001) { // Prevent micro-slices
                    resolvedInstances.push({
                        ...inst,
                        id: inst.id + '_' + loop,
                        startTime: absStart / chordBeats,
                        duration: newDuration / chordBeats
                    });
                }
            }
        }
        if (pattern.hits) {
            for (const hit of pattern.hits) {
                const absTime = (loop * GLOBAL_BEATS) + (hit.time * GLOBAL_BEATS);
                if (absTime >= chordBeats) continue;
                
                resolvedHits.push({
                    ...hit,
                    id: hit.id + '_' + loop,
                    time: absTime / chordBeats
                });
            }
        }
        }
    }

    const resolved = { ...pattern };
    if (pattern.instances) resolved.instances = resolvedInstances;
    if (pattern.hits) resolved.hits = resolvedHits;
    return resolved;
}