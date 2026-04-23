// --- Per-Chord Rhythm & Pattern Editor Data Structures ---

export function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Initializes a default rhythm pattern for a newly created or unedited chord.
 * The timeline is normalized from 0.0 (start) to 1.0 (end of the chord slot).
 */
export function initChordPattern() {
    return {
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
                arpSettings: null // e.g., { style: 'up', rate: 0.25, gate: 0.8 }
            }
        ]
    };
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
 * Toggles the selection state for drag-box operations.
 */
export function toggleSelection(pattern, instanceIds, isSelected) {
    const newInstances = pattern.instances.map(inst => 
        instanceIds.includes(inst.id) ? { ...inst, isSelected } : inst
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
 * Moves an instance to a new start time, keeping all other properties intact.
 */
export function moveInstance(pattern, instanceId, newStartTime) {
    const newInstances = pattern.instances.map(inst =>
        inst.id === instanceId ? { ...inst, startTime: newStartTime } : inst
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
            arpSettings: null
        };
        return { ...pattern, instances: [...pattern.instances, newInst] };
    }
    return pattern;
}