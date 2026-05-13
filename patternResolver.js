/**
 * Resolves a pattern to a specific duration.
 * If isGlobal is true, the pattern is treated as a 4-beat master loop.
 * It will be truncated if the chord is shorter, or looped if the chord is longer.
 */
export function resolvePattern(pattern, isGlobal, chordBeats, inheritMode = null, drumPattern = null, isDrumGlobal = false) {
    if (!pattern) return null;

    let resolvedInstances = [];
    const resolvedHits = [];

    if (!isGlobal) {
        if (pattern.instances) pattern.instances.forEach(i => resolvedInstances.push({ ...i }));
        if (pattern.hits) pattern.hits.forEach(h => resolvedHits.push({ ...h }));
    } else {
        const GLOBAL_BEATS = pattern.lengthBeats || 4;
        const mode = inheritMode || pattern.globalMode || 'loop';
        
        if (mode === 'stretch') {
            if (pattern.instances) {
                for (const inst of pattern.instances) {
                    resolvedInstances.push({
                        ...inst,
                        id: inst.id + '_stretch',
                        startTime: inst.startTime,
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
            const loops = mode === 'empty' ? 1 : Math.ceil(chordBeats / GLOBAL_BEATS);
            for (let loop = 0; loop < loops; loop++) {
                if (pattern.instances) {
                    for (const inst of pattern.instances) {
                        const absStart = (loop * GLOBAL_BEATS) + (inst.startTime * GLOBAL_BEATS);
                        let absEnd = absStart + (inst.duration * GLOBAL_BEATS);
                        if (absStart >= chordBeats) continue;
                        if (absEnd > chordBeats) absEnd = chordBeats;
                        const newDuration = absEnd - absStart;
                        if (newDuration > 0.001) {
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
    }

    // Apply dynamic kick avoidance if requested
    if (pattern.avoidKick && drumPattern && resolvedInstances.length > 0) {
        const resolvedDrums = resolvePattern(drumPattern, isDrumGlobal, chordBeats, null, null, false);
        if (resolvedDrums && resolvedDrums.hits) {
            const kickRoom = 0.5 / chordBeats; // Shift by an 8th note
            const ducked = [];
            resolvedInstances.forEach(inst => {
                let newStart = inst.startTime;
                let newDur = inst.duration;
                
                // Find if a kick hits exactly at the start of this instance
                const overlappingKick = resolvedDrums.hits.find(h => h.row === 'kick' && Math.abs(h.time - inst.startTime) < 0.02);
                
                if (overlappingKick) {
                    newStart = overlappingKick.time + kickRoom;
                    newDur = inst.duration - (newStart - inst.startTime);
                }
                
                // If shifting the start didn't completely swallow the slice, keep the remainder
                if (newDur > 0.001) {
                    ducked.push({ ...inst, startTime: newStart, duration: newDur });
                }
            });
            resolvedInstances = ducked;
        }
    }

    const resolved = { ...pattern };
    if (pattern.instances) resolved.instances = resolvedInstances;
    if (pattern.hits) resolved.hits = resolvedHits;
    return resolved;
}