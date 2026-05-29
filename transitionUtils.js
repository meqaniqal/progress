export function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

export function addTransition(pattern, voiceIndex, startTime, duration = 0.05) {
    const transitions = pattern.transitions || [];
    const safeDuration = Math.min(duration, 1.0 - startTime); // Prevent overflow off the end of the slice
    const newTransition = {
        id: generateId(),
        voiceIndex,
        startTime,
        duration: safeDuration,
        type: voiceIndex === 'master' ? 'auto-smooth' : 'passing',
        probability: 1.0,
        isSelected: true
    };
    
    // Deselect all existing transitions
    const newTransitions = transitions.map(t => ({ ...t, isSelected: false }));
    newTransitions.push(newTransition);
    
    return { ...pattern, transitions: newTransitions };
}

export function updateTransition(pattern, id, updates) {
    const transitions = pattern.transitions || [];
    const newTransitions = transitions.map(t => t.id === id ? { ...t, ...updates } : t);
    return { ...pattern, transitions: newTransitions };
}

export function resizeTransition(pattern, id, edge, newTime, minDuration = 0.02) {
    const target = (pattern.transitions || []).find(t => t.id === id);
    if (!target) return pattern;
    
    const others = (pattern.transitions || []).filter(t => t.id !== id && t.voiceIndex === target.voiceIndex);
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

    let newStart = target.startTime;
    let newDuration = target.duration;
    
    if (edge === 'right') {
        const minEnd = target.startTime + minDuration;
        const newEnd = Math.max(minEnd, Math.min(newTime, rightBound));
        newDuration = newEnd - target.startTime;
    } else if (edge === 'left') {
        const maxStart = (target.startTime + target.duration) - minDuration;
        newStart = Math.max(leftBound, Math.min(newTime, maxStart));
        newDuration = (target.startTime + target.duration) - newStart;
    }
    
    return updateTransition(pattern, id, { startTime: newStart, duration: newDuration });
}

export function moveTransition(pattern, id, newStartTime, intendedDuration = null) {
    const target = (pattern.transitions || []).find(t => t.id === id);
    if (!target) return pattern;

    const baseDuration = intendedDuration !== null ? intendedDuration : target.duration;
    const others = (pattern.transitions || []).filter(t => t.id !== id && t.voiceIndex === target.voiceIndex);
    
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
    
    // Shorten block if dragged left into a wall
    let overflowLeft = leftBound - newStartTime;
    if (overflowLeft > 0) newDuration -= overflowLeft;
    
    // Enforce bounds
    if (clampedStart + MIN_DURATION > rightBound) clampedStart = rightBound - MIN_DURATION;
    if (clampedStart + newDuration > rightBound) newDuration = rightBound - clampedStart;
    if (newDuration < MIN_DURATION) newDuration = MIN_DURATION;

    return updateTransition(pattern, id, { startTime: clampedStart, duration: newDuration });
}