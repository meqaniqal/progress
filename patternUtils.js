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
                isSelected: false,
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

    const inst1 = { ...target, duration: duration1, id: generateId() };
    const inst2 = { ...target, startTime: target.startTime + duration1, duration: duration2, id: generateId() };

    const newInstances = [...pattern.instances];
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
 * Toggles the selection off if it is already the only selected instance.
 */
export function exclusiveSelect(pattern, instanceId) {
    const target = pattern.instances.find(inst => inst.id === instanceId);
    if (!target) return pattern;

    const selectedCount = pattern.instances.filter(i => i.isSelected).length;
    const willBeSelected = !(target.isSelected && selectedCount === 1);

    const newInstances = pattern.instances.map(inst => 
        ({ ...inst, isSelected: inst.id === instanceId ? willBeSelected : false })
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
            isSelected: false,
            arpSettings: null,
            probability: 1.0
        };
        return { ...pattern, instances: [...pattern.instances, newInst] };
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
 * Resolves a pattern to a specific duration.
 * If isGlobal is true, the pattern is treated as a 4-beat master loop.
 * It will be truncated if the chord is shorter, or looped if the chord is longer.
 */
export function resolvePattern(pattern, isGlobal, chordBeats) {
    if (!isGlobal) return pattern; // Local patterns scale to fit natively

    const GLOBAL_BEATS = pattern.lengthBeats || 4;
    const resolvedInstances = [];
    const resolvedHits = [];
    const loops = Math.ceil(chordBeats / GLOBAL_BEATS);

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

    const resolved = { ...pattern };
    if (pattern.instances) resolved.instances = resolvedInstances;
    if (pattern.hits) resolved.hits = resolvedHits;
    return resolved;
}