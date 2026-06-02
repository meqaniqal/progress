import { resolveHierarchicalCollisions, segmentMicrotonalCluster, snapToGrid } from './theory.js';

function getTransitionPitchForStep(transition, step, voiceIndex, currentNotes, prevNotes, nextNotes) {
    const current = currentNotes[voiceIndex];
    const prev = prevNotes ? prevNotes[voiceIndex] : current;
    const next = nextNotes ? nextNotes[voiceIndex] : current;

    const c = current !== undefined ? current : (prev !== undefined ? prev : (next !== undefined ? next : 60));
    const p = prev !== undefined ? prev : c;
    const n = next !== undefined ? next : c;

    // A flourish resolves into the chord it touches at its right edge.
    const isResolvingToNext = (transition.startTime + transition.duration) > 0.5;
    const target = isResolvingToNext ? n : c; 
    const origin = isResolvingToNext ? c : p;
    const rate = transition.flourishRate;

    switch (transition.type) {
        case 'run-up': {
            let startPitch = origin;
            if (target <= origin) startPitch = target - rate; // Force from below
            const totalDistance = target - startPitch;
            return Math.round(startPitch + (totalDistance * ((step + 1) / (rate + 1))));
        }
        case 'run-down': {
            let startPitch = origin;
            if (target >= origin) startPitch = target + rate; // Force from above
            const totalDistance = target - startPitch;
            return Math.round(startPitch + (totalDistance * ((step + 1) / (rate + 1))));
        }
        case 'enclosure': {
            let offset = 0;
            if (step % 2 === 0) {
                offset = Math.ceil((rate - step) / 2);
            } else {
                offset = -Math.ceil((rate - step) / 2);
            }
            return target + offset;
        }
        case 'random': {
            if (transition.startTime < 0.01 && step === 0) {
                const startPool = [p + 1, p - 1, p + 2, p - 2, Math.round((p + c) / 2)];
                return startPool[Math.floor(Math.random() * startPool.length)];
            }
            
            if (transition.startTime + transition.duration > 0.99 && step === rate - 1) {
                const endPool = [n + 1, n - 1, n + 2, n - 2, Math.round((c + n) / 2)];
                return endPool[Math.floor(Math.random() * endPool.length)];
            }

            const randOrigin = (transition.startTime < 0.01) ? p : c;
            const pool = [
                randOrigin, target, 
                Math.round((randOrigin + target) / 2), 
                randOrigin + 2, 
                target - 1,
                target + 1
            ];
            return pool[Math.floor(Math.random() * pool.length)];
        }
        default:
            return c;
    }
}

export function getTransitionPitch(transition, voiceIndex, currentNotes, prevNotes, nextNotes, midPoint = 0) {
    if (transition.stepPitches) {
        const progress = Math.max(0, Math.min(1, (midPoint - transition.startTime) / transition.duration));
        const rate = transition.flourishRate;
        const step = Math.min(rate - 1, Math.floor(progress * rate));
        return transition.stepPitches[step];
    }

    const current = currentNotes[voiceIndex];
    const prev = prevNotes ? prevNotes[voiceIndex] : current;
    const next = nextNotes ? nextNotes[voiceIndex] : current;

    const c = current !== undefined ? current : 60;
    const p = prev !== undefined ? prev : c;
    const n = next !== undefined ? next : c;

    const isStart = transition.startTime < 0.5;

    if (['run-up', 'run-down', 'enclosure', 'random'].includes(transition.type)) {
        const progress = Math.max(0, Math.min(1, (midPoint - transition.startTime) / transition.duration));
        const rate = transition.flourishRate || (transition.type === 'random' ? 4 : 3);
        const step = Math.min(rate - 1, Math.floor(progress * rate));
        return getTransitionPitchForStep({ ...transition, flourishRate: rate }, step, voiceIndex, currentNotes, prevNotes, nextNotes);
    }

    switch (transition.type) {
        case 'passing': {
            return isStart ? Math.round((p + c) / 2) : Math.round((c + n) / 2);
        }
        case 'anticipate':
            return isStart ? c : n;
        case 'suspend':
            return isStart ? p : c;
        default:
            return c;
    }
}

export function expandMasterTransitions(transitions, currentNotes, prevNotes, nextNotes) {
    const expanded = [];
    const voiceTransitions = transitions.filter(t => t.voiceIndex !== 'master');
    const masterTransitions = transitions.filter(t => t.voiceIndex === 'master');

    masterTransitions.forEach(t => {
        currentNotes.forEach((note, i) => {
            // Priority check: Individual voice lanes override the master lane if they overlap in time
            const hasExplicitOverride = voiceTransitions.some(vt => 
                parseInt(vt.voiceIndex, 10) === i && 
                vt.startTime < t.startTime + t.duration && 
                vt.startTime + vt.duration > t.startTime
            );

            if (hasExplicitOverride) return;

            if (t.type === 'auto-smooth') {
                const nextNote = nextNotes ? nextNotes[i] : note;
                if (nextNote !== undefined && Math.abs(nextNote - note) >= 2) {
                    expanded.push({ ...t, voiceIndex: i, type: 'passing', startTime: 0.8, duration: 0.2 });
                }
            } else if (t.type === 'suspend-all') {
                expanded.push({ ...t, voiceIndex: i, type: 'suspend' }); // Legacy compatibility
            } else {
                // Map all standard flourishes (enclosures, run-ups) directly to the individual voices
                expanded.push({ ...t, voiceIndex: i });
            }
        });
    });

    // Return explicit voice transitions first so they take ultimate priority
    return [...voiceTransitions, ...expanded];
}

export function sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes, chordDurationSec = 2.0) {
    if (!transitions || transitions.length === 0) {
        return instances.map(inst => ({
            ...inst,
            notesToPlay: currentNotes.map((n, i) => n + (inst.pitchOffsets?.[i] || inst.pitchOffset || 0))
        }));
    }

    // Evaluate probability once per block to ensure multi-note flourishes play in their entirety or not at all
    const activeTrans = expandMasterTransitions(transitions, currentNotes, prevNotes, nextNotes)
        .filter(t => t.probability == null || Math.random() <= t.probability)
        .map(t => {
            if (['run-up', 'run-down', 'enclosure', 'random'].includes(t.type)) {
                // Dynamic Rate Limiting: Minimum 50ms per note to clearly register pitch
                const absoluteDurationSec = t.duration * chordDurationSec;
                const maxAllowedRate = Math.floor(absoluteDurationSec / 0.05); // 50ms minimum per note
                
                if (maxAllowedRate < 2) {
                    // If it can't even fit 2 notes cleanly, downgrade to a single passing tone
                    return { ...t, type: 'passing', flourishRate: undefined };
                }
                
                const defaultRate = t.type === 'random' ? 4 : 3;
                let rate = t.flourishRate || defaultRate;
                
                // Throttle rate if physical time is too short
                if (rate > maxAllowedRate) {
                    rate = maxAllowedRate;
                }
                
                // Pre-calculate step pitches to ensure rhythmic consistency and prevent merging
                const stepPitches = [];
                let lastPitch = null;
                for (let i = 0; i < rate; i++) {
                    let pitch = getTransitionPitchForStep({ ...t, flourishRate: rate }, i, parseInt(t.voiceIndex, 10), currentNotes, prevNotes, nextNotes);
                    
                    // Prevent consecutive duplicate pitches so audio engine doesn't merge them
                    let attempts = 3;
                    while (pitch === lastPitch && attempts > 0) {
                        if (t.type === 'random') {
                            pitch = getTransitionPitchForStep({ ...t, flourishRate: rate }, i, parseInt(t.voiceIndex, 10), currentNotes, prevNotes, nextNotes);
                        } else {
                            pitch += (Math.random() > 0.5 ? 1 : -1);
                        }
                        attempts--;
                    }
                    
                    // Hard fallback if random pool failed to find a unique note after 3 attempts
                    if (pitch === lastPitch && lastPitch !== null) {
                        pitch += 1;
                    }
                    stepPitches.push(pitch);
                    lastPitch = pitch;
                }
                
                return { ...t, flourishRate: rate, stepPitches };
            }
            return t;
        });
    
    // Deduplicate all time boundaries from both instances and transitions
    const boundaries = new Set([0, 1]);
    
    // Round to 3 decimal places (1ms precision) to completely eliminate float fragmentation slivers
    instances.forEach(inst => { 
        boundaries.add(Math.round(inst.startTime * 1000) / 1000); 
        boundaries.add(Math.round((inst.startTime + inst.duration) * 1000) / 1000); 
    });
    activeTrans.forEach(t => { 
        boundaries.add(Math.round(t.startTime * 1000) / 1000); 
        boundaries.add(Math.round((t.startTime + t.duration) * 1000) / 1000); 
        
        // Subdivide time boundaries for multi-note flourishes based on flourishRate
        if (['run-up', 'run-down', 'enclosure', 'random'].includes(t.type) && t.flourishRate && t.flourishRate > 1) {
            const stepDur = t.duration / t.flourishRate;
            for (let i = 1; i < t.flourishRate; i++) {
                boundaries.add(Math.round((t.startTime + (stepDur * i)) * 1000) / 1000);
            }
        }
    });

    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
    const slicedInstances = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
        const start = sortedBoundaries[i];
        const end = sortedBoundaries[i + 1];
        const duration = end - start;
        if (duration <= 0.001) continue;

        const midPoint = start + (duration / 2);
        const activeInst = instances.find(inst => midPoint >= inst.startTime && midPoint <= inst.startTime + inst.duration);
        
        if (activeInst) {
            let sliceNotes = [];
            let movingVoices = [];
            for (let v = 0; v < currentNotes.length; v++) {
                const activeT = activeTrans.find(t => parseInt(t.voiceIndex, 10) === v && midPoint >= t.startTime && midPoint <= t.startTime + t.duration);
                
                if (activeT) {
                    sliceNotes.push(getTransitionPitch(activeT, v, currentNotes, prevNotes, nextNotes, midPoint));
                    movingVoices.push(v);
                } else {
                    sliceNotes.push(currentNotes[v] + (activeInst.pitchOffsets?.[v] || activeInst.pitchOffset || 0));
                }
            }

            // Apply Hierarchical Collision: Moving notes forcefully push stationary notes out of the way
            sliceNotes = resolveHierarchicalCollisions(sliceNotes, movingVoices);

            slicedInstances.push({ ...activeInst, startTime: start, duration: duration, notesToPlay: sliceNotes });
        }
    }
    
    return slicedInstances;
}

export function evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec = 2.0) {
    const sliced = sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes, chordDurationSec);

    sliced.forEach(slice => {
        slice.willPlay = (slice.probability === undefined || Math.random() <= slice.probability);
        
        // Pre-snap notes
        const adjustedNotes = slice.notesToPlay.map(n => snapToGrid(n, editorTuning));
        slice.adjustedNotes = adjustedNotes;

        if (autoPanLeading && !slice.arpSettings) {
            const segmented = segmentMicrotonalCluster(adjustedNotes);
            slice.voicePans = [];
            adjustedNotes.forEach(note => {
                let pan = 0;
                if (segmented.frictionLeft.includes(note)) pan = -0.75;
                else if (segmented.frictionRight.includes(note)) pan = 0.75;
                slice.voicePans.push(pan);
            });
        } else {
            slice.voicePans = adjustedNotes.map(() => 0);
        }
    });

    return sliced;
}

export function evaluateVoiceEvents(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec = 2.0) {
    const sliced = evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec);

    const events = [];
    const instancesById = {};
    sliced.forEach(slice => {
        if (!instancesById[slice.id]) instancesById[slice.id] = [];
        instancesById[slice.id].push(slice);
    });

    for (const id in instancesById) {
        const slices = instancesById[id];
        const firstSlice = slices[0];

        if (firstSlice.arpSettings) {
            slices.forEach(slice => {
                if (!slice.willPlay) return;
                events.push({
                    type: 'arp_slice',
                    slice: slice
                });
            });
        } else {
            for (let v = 0; v < currentNotes.length; v++) {
                let currentEvent = null;

                slices.forEach(slice => {
                    if (!slice.willPlay) {
                        if (currentEvent) {
                            events.push(currentEvent);
                            currentEvent = null;
                        }
                        return;
                    }

                    const pitch = slice.adjustedNotes[v];
                    const pan = slice.voicePans[v];

                    if (!currentEvent) {
                        currentEvent = {
                            type: 'chord_note',
                            voiceIndex: v,
                            pitch: pitch,
                            pan: pan,
                            startTime: slice.startTime,
                            duration: slice.duration
                        };
                    } else {
                        if (Math.abs(currentEvent.pitch - pitch) < 0.001) {
                            currentEvent.duration += slice.duration;
                        } else {
                            events.push(currentEvent);
                            currentEvent = {
                                type: 'chord_note',
                                voiceIndex: v,
                                pitch: pitch,
                                pan: pan,
                                startTime: slice.startTime,
                                duration: slice.duration
                            };
                        }
                    }
                });
                if (currentEvent) events.push(currentEvent);
            }
        }
    }

    return events;
}