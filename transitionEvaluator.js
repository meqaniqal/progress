import { resolveHierarchicalCollisions, segmentMicrotonalCluster, snapToGrid, SCALES, deduceSourceMode } from './theory.js';
import { state } from './store.js';

export function snapPitchToScale(pitch, key, mode) {
    const intervals = SCALES[mode] || SCALES['major'];
    const scaleClasses = intervals.map(i => (key + i) % 12);
    
    const pc = ((pitch % 12) + 12) % 12;
    
    let bestClass = scaleClasses[0];
    let minDiff = Infinity;
    
    for (const sc of scaleClasses) {
        let diff = Math.abs(pc - sc);
        if (diff > 6) diff = 12 - diff;
        if (diff < minDiff) {
            minDiff = diff;
            bestClass = sc;
        }
    }
    
    const baseOctave = Math.floor(pitch / 12) * 12;
    let bestPitch = baseOctave + bestClass;
    let minPitchDiff = Math.abs(bestPitch - pitch);
    
    for (const offset of [-12, 12]) {
        const testPitch = baseOctave + bestClass + offset;
        const testDiff = Math.abs(testPitch - pitch);
        if (testDiff < minPitchDiff) {
            minPitchDiff = testDiff;
            bestPitch = testPitch;
        }
    }
    
    return bestPitch;
}

export function getSliceNotes(chordObj, baseChordNotes, position = 'first') {
    if (!chordObj || !baseChordNotes) return baseChordNotes;
    
    let pattern = chordObj.chordPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
    if (!pattern.instances || pattern.instances.length === 0) return baseChordNotes;
    
    if (pattern.instances.length <= 1) {
        const inst = pattern.instances[0];
        if (!inst) return baseChordNotes;
        return baseChordNotes.map((n, i) => n + (inst.pitchOffsets?.[i] || inst.pitchOffset || 0));
    }
    
    let targetInst = pattern.instances[0];
    pattern.instances.forEach(inst => {
        if (position === 'first' && inst.startTime < targetInst.startTime) {
            targetInst = inst;
        } else if (position === 'last' && inst.startTime > targetInst.startTime) {
            targetInst = inst;
        }
    });
    
    return baseChordNotes.map((n, i) => n + (targetInst.pitchOffsets?.[i] || targetInst.pitchOffset || 0));
}


function avoidParallelIntervals(prevNotes, currentNotes, movingVoices) {
    if (!prevNotes || prevNotes.length !== currentNotes.length) return currentNotes;
    const resolved = [...currentNotes];
    const len = currentNotes.length;
    
    for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
            // Check if both voices moved
            const movedI = prevNotes[i] !== resolved[i];
            const movedJ = prevNotes[j] !== resolved[j];
            if (movedI && movedJ) {
                const dirI = Math.sign(resolved[i] - prevNotes[i]);
                const dirJ = Math.sign(resolved[j] - prevNotes[j]);
                if (dirI === dirJ) { // Similar/parallel motion
                    const interval = Math.round(Math.abs(resolved[i] - resolved[j])) % 12;
                    if (interval === 0 || interval === 7) {
                        // Parallel fifth or octave. Adjust one of them.
                        if (movingVoices.includes(j)) {
                            resolved[j] += (dirJ > 0 ? -1 : 1);
                        } else if (movingVoices.includes(i)) {
                            resolved[i] += (dirI > 0 ? -1 : 1);
                        } else {
                            resolved[j] += 1;
                        }
                    }
                }
            }
        }
    }
    return resolved;
}

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
        case 'neighbor': {
            if (step === 0) return origin;
            if (step === rate - 1) return target;
            const dir = (target >= origin) ? 1 : -1;
            return origin + (step % 2 === 1 ? dir : 0);
        }
        case 'cambiata': {
            if (step === 0) return origin;
            if (step === rate - 1) return target;
            const dir = (target >= origin) ? 1 : -1;
            if (step === 1) return origin + dir;
            if (step === 2) return origin - (dir * 2);
            return origin - dir;
        }
        default:
            return c;
    }
}

export function getTransitionPitch(transition, voiceIndex, currentNotes, prevNotes, nextNotes, midPoint = 0, chordObj = null, nextChordObj = null) {
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

    let pitch = c;
    if (['run-up', 'run-down', 'enclosure', 'random', 'neighbor', 'cambiata'].includes(transition.type)) {
        const progress = Math.max(0, Math.min(1, (midPoint - transition.startTime) / transition.duration));
        const rate = transition.flourishRate || (transition.type === 'random' ? 4 : 3);
        const step = Math.min(rate - 1, Math.floor(progress * rate));
        pitch = getTransitionPitchForStep({ ...transition, flourishRate: rate }, step, voiceIndex, currentNotes, prevNotes, nextNotes);
    } else {
        switch (transition.type) {
            case 'passing': {
                pitch = isStart ? Math.round((p + c) / 2) : Math.round((c + n) / 2);
                break;
            }
            case 'anticipate':
                pitch = isStart ? c : n;
                break;
            case 'suspend':
                pitch = isStart ? p : c;
                break;
            default:
                pitch = c;
                break;
        }
    }

    const shouldSnap = (transition.scaleSnap === 'strict') || 
                       (transition.scaleSnap === undefined && state.snapTransitionsToScale);
    const divisions = state.divisions || 12;
    if (shouldSnap && divisions === 12) {
        const currentKey = chordObj ? chordObj.key : (state.baseKey !== undefined ? state.baseKey : 60);
        const currentSymbol = chordObj ? chordObj.symbol : 'I';
        const currentMode = deduceSourceMode(currentSymbol, state.mode || 'major') || state.mode || 'major';
        
        const nextKey = nextChordObj ? nextChordObj.key : currentKey;
        const nextSymbol = nextChordObj ? nextChordObj.symbol : 'I';
        const nextMode = nextChordObj ? (deduceSourceMode(nextSymbol, state.mode || 'major') || state.mode || 'major') : currentMode;
        
        const snapKey = (midPoint < 0.5) ? currentKey : nextKey;
        const snapMode = (midPoint < 0.5) ? currentMode : nextMode;
        
        pitch = snapPitchToScale(pitch, snapKey, snapMode);
    }

    return pitch;
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

export function sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes, chordDurationSec = 2.0, drumHits = [], chordObj = null, nextChordObj = null, prevChordObj = null) {
    if (!transitions || transitions.length === 0) {
        return instances.map(inst => ({
            ...inst,
            notesToPlay: currentNotes.map((n, i) => n + (inst.pitchOffsets?.[i] || inst.pitchOffset || 0))
        }));
    }

    const firstCurrentNotes = getSliceNotes(chordObj, currentNotes, 'first');
    const lastCurrentNotes = getSliceNotes(chordObj, currentNotes, 'last');
    const lastPrevNotes = prevChordObj ? getSliceNotes(prevChordObj, prevNotes, 'last') : prevNotes;
    const firstNextNotes = nextChordObj ? getSliceNotes(nextChordObj, nextNotes, 'first') : nextNotes;

    // Evaluate probability once per block to ensure multi-note flourishes play in their entirety or not at all
    const activeTrans = expandMasterTransitions(transitions, currentNotes, prevNotes, nextNotes)
        .filter(t => {
            const persona = state.generatorPersona || 'normal';
            let prob = t.probability ?? 1.0;
            if (persona === 'lazy') {
                prob = prob * 0.4; // Scale down flourish probability for lazy persona
            } else if (persona === 'restless') {
                prob = Math.min(1.0, prob * 1.5); // Boost probability for restless
            }
            return Math.random() <= prob;
        })
        .map(t => {
            const persona = state.generatorPersona || 'normal';
            let type = t.type;
            
            // Lazy persona overrides complex run types to passing/suspend
            if (persona === 'lazy' && ['run-up', 'run-down', 'enclosure', 'random', 'cambiata'].includes(type)) {
                type = (t.startTime < 0.5) ? 'suspend' : 'passing';
            }

            if (['run-up', 'run-down', 'enclosure', 'random', 'neighbor', 'cambiata'].includes(type)) {
                // Dynamic Rate Limiting: Minimum 50ms per note to clearly register pitch
                const absoluteDurationSec = t.duration * chordDurationSec;
                const maxAllowedRate = Math.floor(absoluteDurationSec / 0.05); // 50ms minimum per note
                
                if (maxAllowedRate < 2) {
                    // If it can't even fit 2 notes cleanly, downgrade to a single passing tone
                    return { ...t, type: 'passing', flourishRate: undefined };
                }
                
                const defaultRate = type === 'random' || type === 'cambiata' ? 4 : 3;
                let rate = t.flourishRate || defaultRate;
                
                if (persona === 'lazy') {
                    rate = Math.min(rate, 2); // Cap rate at 2 notes for lazy persona
                } else if (persona === 'restless' && !t.flourishRate) {
                    rate = Math.min(maxAllowedRate, rate + 1); // Boost default rate by 1 under restless persona
                }
                
                // Throttle rate if physical time is too short
                if (rate > maxAllowedRate) {
                    rate = maxAllowedRate;
                }
                
                // Pre-calculate step pitches to ensure rhythmic consistency and prevent merging
                const stepPitches = [];
                let lastPitch = null;
                const isResolvingToNext = (t.startTime + t.duration) > 0.5;
                const stepPrevNotes = isResolvingToNext ? lastPrevNotes : lastPrevNotes;
                const stepCurrentNotes = isResolvingToNext ? lastCurrentNotes : firstCurrentNotes;
                const stepNextNotes = isResolvingToNext ? firstNextNotes : firstNextNotes;

                for (let i = 0; i < rate; i++) {
                    const stepTime = t.startTime + (t.duration / rate) * (i + 0.5);
                    
                    let pitch = getTransitionPitchForStep({ ...t, type, flourishRate: rate }, i, parseInt(t.voiceIndex, 10), stepCurrentNotes, stepPrevNotes, stepNextNotes);
                    
                    const shouldSnap = (t.scaleSnap === 'strict') || 
                                       (t.scaleSnap === undefined && state.snapTransitionsToScale);
                    const divisions = state.divisions || 12;
                    if (shouldSnap && divisions === 12) {
                        const currentKey = chordObj ? chordObj.key : (state.baseKey !== undefined ? state.baseKey : 60);
                        const currentSymbol = chordObj ? chordObj.symbol : 'I';
                        const currentMode = deduceSourceMode(currentSymbol, state.mode || 'major') || state.mode || 'major';
                        
                        const nextKey = nextChordObj ? nextChordObj.key : currentKey;
                        const nextSymbol = nextChordObj ? nextChordObj.symbol : 'I';
                        const nextMode = nextChordObj ? (deduceSourceMode(nextSymbol, state.mode || 'major') || state.mode || 'major') : currentMode;
                        
                        const snapKey = (stepTime < 0.5) ? currentKey : nextKey;
                        const snapMode = (stepTime < 0.5) ? currentMode : nextMode;
                        
                        pitch = snapPitchToScale(pitch, snapKey, snapMode);
                    }

                    // Prevent consecutive duplicate pitches so audio engine doesn't merge them
                    let attempts = 3;
                    while (pitch === lastPitch && attempts > 0) {
                        if (type === 'random') {
                            pitch = getTransitionPitchForStep({ ...t, type, flourishRate: rate }, i, parseInt(t.voiceIndex, 10), stepCurrentNotes, stepPrevNotes, stepNextNotes);
                        } else {
                            pitch += (Math.random() > 0.5 ? 1 : -1);
                        }
                        
                        if (shouldSnap && divisions === 12) {
                            const currentKey = chordObj ? chordObj.key : (state.baseKey !== undefined ? state.baseKey : 60);
                            const currentSymbol = chordObj ? chordObj.symbol : 'I';
                            const currentMode = deduceSourceMode(currentSymbol, state.mode || 'major') || state.mode || 'major';
                            
                            const nextKey = nextChordObj ? nextChordObj.key : currentKey;
                            const nextSymbol = nextChordObj ? nextChordObj.symbol : 'I';
                            const nextMode = nextChordObj ? (deduceSourceMode(nextSymbol, state.mode || 'major') || state.mode || 'major') : currentMode;
                            
                            const snapKey = (stepTime < 0.5) ? currentKey : nextKey;
                            const snapMode = (stepTime < 0.5) ? currentMode : nextMode;
                            
                            pitch = snapPitchToScale(pitch, snapKey, snapMode);
                        }
                        attempts--;
                    }
                    
                    // Hard fallback if random pool failed to find a unique note after 3 attempts
                    if (pitch === lastPitch && lastPitch !== null) {
                        pitch += 1;
                        if (shouldSnap && divisions === 12) {
                            const currentKey = chordObj ? chordObj.key : (state.baseKey !== undefined ? state.baseKey : 60);
                            const currentSymbol = chordObj ? chordObj.symbol : 'I';
                            const currentMode = deduceSourceMode(currentSymbol, state.mode || 'major') || state.mode || 'major';
                            
                            const nextKey = nextChordObj ? nextChordObj.key : currentKey;
                            const nextSymbol = nextChordObj ? nextChordObj.symbol : 'I';
                            const nextMode = nextChordObj ? (deduceSourceMode(nextSymbol, state.mode || 'major') || state.mode || 'major') : currentMode;
                            
                            const snapKey = (stepTime < 0.5) ? currentKey : nextKey;
                            const snapMode = (stepTime < 0.5) ? currentMode : nextMode;
                            
                            pitch = snapPitchToScale(pitch, snapKey, snapMode);
                        }
                    }
                    stepPitches.push(pitch);
                    lastPitch = pitch;
                }
                
                return { ...t, type, flourishRate: rate, stepPitches };
            }
            return { ...t, type };
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
        if (['run-up', 'run-down', 'enclosure', 'random', 'neighbor', 'cambiata'].includes(t.type) && t.flourishRate && t.flourishRate > 1) {
            const stepDur = t.duration / t.flourishRate;
            if (state.syncTransitionsToDrums !== false && drumHits && drumHits.length > 0) {
                const transitionEnd = t.startTime + t.duration;
                const stepTimes = [];
                for (let i = 1; i < t.flourishRate; i++) {
                    stepTimes.push(t.startTime + stepDur * i);
                }
                const snappedTimes = stepTimes.map(st => {
                    let closestHitTime = st;
                    let minDiff = Infinity;
                    for (const hit of drumHits) {
                        if (hit.time > t.startTime + 0.01 && hit.time < transitionEnd - 0.01) {
                            const diff = Math.abs(hit.time - st);
                            if (diff < minDiff && diff < 0.15) {
                                minDiff = diff;
                                closestHitTime = hit.time;
                            }
                        }
                    }
                    return closestHitTime;
                });
                for (let i = 0; i < snappedTimes.length; i++) {
                    if (i > 0 && snappedTimes[i] <= snappedTimes[i - 1] + 0.02) {
                        snappedTimes[i] = snappedTimes[i - 1] + 0.02;
                    }
                    if (snappedTimes[i] >= transitionEnd - 0.01) {
                        snappedTimes[i] = transitionEnd - 0.01 - (snappedTimes.length - 1 - i) * 0.02;
                    }
                    boundaries.add(Math.round(snappedTimes[i] * 1000) / 1000);
                }
            } else {
                for (let i = 1; i < t.flourishRate; i++) {
                    boundaries.add(Math.round((t.startTime + (stepDur * i)) * 1000) / 1000);
                }
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
            let voiceTransitionTypes = [];
            for (let v = 0; v < currentNotes.length; v++) {
                const activeT = activeTrans.find(t => parseInt(t.voiceIndex, 10) === v && midPoint >= t.startTime && midPoint <= t.startTime + t.duration);
                
                if (activeT) {
                    const isStart = activeT.startTime < 0.5;
                    const stepPrevNotes = isStart ? lastPrevNotes : lastCurrentNotes;
                    const stepCurrentNotes = isStart ? firstCurrentNotes : lastCurrentNotes;
                    const stepNextNotes = isStart ? firstCurrentNotes : firstNextNotes;
                    sliceNotes.push(getTransitionPitch(activeT, v, stepCurrentNotes, stepPrevNotes, stepNextNotes, midPoint, chordObj, nextChordObj));
                    movingVoices.push(v);
                    voiceTransitionTypes.push(activeT.type);
                } else {
                    sliceNotes.push(currentNotes[v] + (activeInst.pitchOffsets?.[v] || activeInst.pitchOffset || 0));
                    voiceTransitionTypes.push(null);
                }
            }

            // Apply Hierarchical Collision: Moving notes forcefully push stationary notes out of the way
            sliceNotes = resolveHierarchicalCollisions(sliceNotes, movingVoices);

            // Avoid parallel perfect fifths and octaves compared to the previous slice
            if (slicedInstances.length > 0) {
                const prevSlice = slicedInstances[slicedInstances.length - 1];
                sliceNotes = avoidParallelIntervals(prevSlice.notesToPlay, sliceNotes, movingVoices);
            }

            slicedInstances.push({ ...activeInst, startTime: start, duration: duration, notesToPlay: sliceNotes, voiceTransitionTypes });
        }
    }
    
    return slicedInstances;
}

export function evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec = 2.0, drumHits = [], chordObj = null, nextChordObj = null, prevChordObj = null) {
    const sliced = sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes, chordDurationSec, drumHits, chordObj, nextChordObj, prevChordObj);

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

export function evaluateVoiceEvents(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec = 2.0, drumHits = [], chordObj = null, nextChordObj = null, prevChordObj = null) {
    const sliced = evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading, chordDurationSec, drumHits, chordObj, nextChordObj, prevChordObj);

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
                    const transitionType = slice.voiceTransitionTypes ? slice.voiceTransitionTypes[v] : null;

                    if (!currentEvent) {
                        currentEvent = {
                            type: 'chord_note',
                            voiceIndex: v,
                            pitch: pitch,
                            pan: pan,
                            startTime: slice.startTime,
                            duration: slice.duration,
                            transitionType: transitionType
                        };
                    } else {
                        if (Math.abs(currentEvent.pitch - pitch) < 0.001 && currentEvent.transitionType === transitionType) {
                            currentEvent.duration += slice.duration;
                        } else {
                            events.push(currentEvent);
                            currentEvent = {
                                type: 'chord_note',
                                voiceIndex: v,
                                pitch: pitch,
                                pan: pan,
                                startTime: slice.startTime,
                                duration: slice.duration,
                                transitionType: transitionType
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