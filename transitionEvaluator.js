import { resolveVoiceCollision, segmentMicrotonalCluster, snapToGrid } from './theory.js';

export function getTransitionPitch(transition, voiceIndex, currentNotes, prevNotes, nextNotes) {
    const current = currentNotes[voiceIndex];
    const prev = prevNotes ? prevNotes[voiceIndex] : current;
    const next = nextNotes ? nextNotes[voiceIndex] : current;

    // Safe fallbacks for unequal voicing arrays
    const c = current !== undefined ? current : (prev !== undefined ? prev : (next !== undefined ? next : 60));
    const p = prev !== undefined ? prev : c;
    const n = next !== undefined ? next : c;

    const isStart = transition.startTime < 0.5;

    switch (transition.type) {
        case 'passing': {
            // Pass from Previous note if early in the slot, pass to Next note if late
            const target = isStart ? (p + c) / 2 : (c + n) / 2;
            const stationary = currentNotes.filter((_, i) => i !== voiceIndex);
            return resolveVoiceCollision(target, stationary);
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
    transitions.forEach(t => {
        if (t.voiceIndex === 'master') {
            if (t.type === 'auto-smooth') {
                currentNotes.forEach((note, i) => {
                    const nextNote = nextNotes ? nextNotes[i] : note;
                    if (nextNote !== undefined && Math.abs(nextNote - note) >= 2) {
                        expanded.push({ ...t, voiceIndex: i, type: 'passing', startTime: 0.8, duration: 0.2 });
                    }
                });
            } else if (t.type === 'suspend-all') {
                currentNotes.forEach((note, i) => {
                    expanded.push({ ...t, voiceIndex: i, type: 'suspend', startTime: 0.0, duration: 0.2 });
                });
            }
        } else {
            expanded.push(t);
        }
    });
    return expanded;
}

export function sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes) {
    if (!transitions || transitions.length === 0) {
        return instances.map(inst => ({
            ...inst,
            notesToPlay: currentNotes.map((n, i) => n + (inst.pitchOffsets?.[i] || inst.pitchOffset || 0))
        }));
    }

    const activeTrans = expandMasterTransitions(transitions, currentNotes, prevNotes, nextNotes);
    
    // Deduplicate all time boundaries from both instances and transitions
    const boundaries = new Set([0, 1]);
    instances.forEach(inst => { boundaries.add(inst.startTime); boundaries.add(inst.startTime + inst.duration); });
    activeTrans.forEach(t => { boundaries.add(t.startTime); boundaries.add(t.startTime + t.duration); });

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
            const sliceNotes = [];
            for (let v = 0; v < currentNotes.length; v++) {
                const activeT = activeTrans.find(t => parseInt(t.voiceIndex, 10) === v && midPoint >= t.startTime && midPoint <= t.startTime + t.duration);
                
                if (activeT && (activeT.probability == null || Math.random() <= activeT.probability)) {
                    sliceNotes.push(getTransitionPitch(activeT, v, currentNotes, prevNotes, nextNotes));
                } else {
                    sliceNotes.push(currentNotes[v] + (activeInst.pitchOffsets?.[v] || activeInst.pitchOffset || 0));
                }
            }

            slicedInstances.push({ ...activeInst, startTime: start, duration: duration, notesToPlay: sliceNotes });
        }
    }
    
    return slicedInstances;
}

export function evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading) {
    const sliced = sliceInstancesByTransitions(instances, transitions, currentNotes, prevNotes, nextNotes);

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

export function evaluateVoiceEvents(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading) {
    const sliced = evaluateVerticalSlices(instances, transitions, currentNotes, prevNotes, nextNotes, editorTuning, autoPanLeading);

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