import { state } from './store.js';
import { getChordNotes, getEffectiveTuning, midiToFreq, deduceSourceMode } from './theory.js';
import { playTone } from './synth.js';

// Cache for motif memory across iterations
// Structure: { keyString: [ midiNotes ] }
let motifCache = {};

export function clearMelodyMemory() {
    motifCache = {};
}

/**
 * Main entry point to generate and schedule melody and countermelody notes for a chord slot.
 */
export function scheduleMelody(
    time,
    chordObj,
    nextChordObj,
    prevChordObj,
    chordSlotDuration,
    beats,
    bpm,
    absIndex,
    totalChords,
    chordNotes,
    playToneFn = playTone,
    voiceEvents = []
) {
    const settings = state.melodySettings;
    if (!settings || !settings.enabled) return;

    // Check if we should disable during Arpeggiators
    const hasArp = chordObj.arpSettings && chordObj.arpSettings.pattern !== 'none';
    if (hasArp && settings.behaviorDuringArp === 'off') return;

    // Check if we should disable during transitions
    const hasTransition = chordObj.chordPattern && chordObj.chordPattern.transitions && chordObj.chordPattern.transitions.length > 0;
    if (hasTransition && settings.behaviorDuringTransitions === 'off') return;

    // Determine EDO tuning and key
    const tuning = getEffectiveTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);
    const divisions = tuning.divisions;

    // Retrieve active scale pitch classes from local chord key and mode
    const keyRoot = Number(state.baseKey) || 60;
    const melodyRangeStart = keyRoot; // C4 (60) by default
    const melodyRangeEnd = keyRoot + 24; // C6 (84) by default

    const chordKey = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;
    const chordMode = deduceSourceMode(chordObj.symbol, state.mode || 'major') || state.mode || 'major';
    const scaleIntervals = getScaleIntervals(chordMode);

    const scalePitches = buildScalePitches(chordKey, scaleIntervals, divisions, melodyRangeStart, melodyRangeEnd);

    // Build Chord Tones Pool (MIDI numbers)
    const activeChordTones = (chordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += divisions;
        while (note > melodyRangeEnd) note -= divisions;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

    // Merge scale pitches and active chord tones so chromatic notes are not snapped away
    const validPitches = Array.from(new Set([...scalePitches, ...activeChordTones])).sort((a, b) => a - b);

    // Retrieve previous/next chord notes dynamically to support voice leading
    const prevChordNotes = prevChordObj ? getChordNotes(prevChordObj, state.baseKey, divisions) : [];
    const nextChordNotes = nextChordObj ? getChordNotes(nextChordObj, state.baseKey, divisions) : [];

    const activePrevChordTones = (prevChordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += divisions;
        while (note > melodyRangeEnd) note -= divisions;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

    const activeNextChordTones = (nextChordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += divisions;
        while (note > melodyRangeEnd) note -= divisions;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

    const pool = activeChordTones.length > 0 ? activeChordTones : validPitches;

    // Filter passing / transition pitches that may be out of scale
    const transitionPitches = (voiceEvents || [])
        .filter(ev => ev.transitionType !== null && ev.transitionType !== undefined)
        .map(ev => ({
            pitch: ev.pitch,
            startTime: ev.startTime,
            duration: ev.duration
        }));

    // Identify transition / slice boundaries to vary the Call & Response split point intelligently
    let dialogueSplitTime = 0.5; // default 50% split
    const transitions = (chordObj.chordPattern && chordObj.chordPattern.transitions) || [];
    if (transitions.length > 0) {
        const earliestTransition = Math.min(...transitions.map(t => t.startTime || 0.75));
        if (earliestTransition > 0.1 && earliestTransition < 0.9) {
            dialogueSplitTime = earliestTransition;
        }
    } else {
        const slices = (chordObj.chordPattern && chordObj.chordPattern.instances) || [];
        if (slices.length > 1) {
            const secondSlice = slices[1];
            if (secondSlice.startTime > 0.1 && secondSlice.startTime < 0.9) {
                dialogueSplitTime = secondSlice.startTime;
            }
        }
    }

    // Subdivision: 4 steps per beat (16th notes)
    const stepsPerBeat = 4;
    const totalSteps = beats * stepsPerBeat;
    const stepDuration = chordSlotDuration / totalSteps;

    // 1. Generate Motif or Transformation
    const motifKey = `${state.baseKey}_${state.mode}`;
    let baseMotif = motifCache[motifKey];
    if (!baseMotif || Math.random() < (1.0 - settings.motifRecurrence)) {
        baseMotif = generateSeedMotif(pool, 4, activeChordTones, validPitches, divisions);
        motifCache[motifKey] = baseMotif;
    }

    // Determine the transformation type based on step / slice index (Motivic Development)
    const chordToneAnchor = activeChordTones.length > 0 ? activeChordTones[0] : keyRoot;
    const transpositionOffset = chordToneAnchor - baseMotif[0];
    let sliceMotif = baseMotif.map(note => {
        let transposed = note + transpositionOffset;
        while (transposed < melodyRangeStart) transposed += divisions;
        while (transposed > melodyRangeEnd) transposed -= divisions;
        return findClosest(transposed, validPitches);
    });

    if (settings.variationDepth > 0) {
        const variationRoll = (absIndex % 4);
        if (variationRoll === 1 && settings.variationDepth > 0.3) {
            sliceMotif = applyInversion(sliceMotif, pool);
        } else if (variationRoll === 2 && settings.variationDepth > 0.5) {
            sliceMotif = applyRetrograde(sliceMotif);
        } else if (variationRoll === 3 && settings.variationDepth > 0.7) {
            sliceMotif = applySequence(sliceMotif, pool, Math.random() > 0.5 ? 2 : -2);
        }
    }

    // Determine tension density
    let targetDensity = settings.density;
    if (settings.tensionCurve === 'arch') {
        const loopPosition = absIndex / Math.max(1, totalChords);
        const intensity = Math.sin(loopPosition * Math.PI); // Peak at 0.5
        targetDensity = Math.max(0.1, settings.density * (0.5 + intensity * 0.5));
    }

    // Phrasing: Antecedent-Consequent call-and-response spacing
    const isConsequentPhrase = (absIndex % 2 === 1);
    const restProbability = settings.restProbability;

    let prevPitch = melodyRangeStart + 12; // Start in the middle (C5)
    let prevCounterPitch = melodyRangeStart; // Start countermelody in the lower octave (C4)
    let lastInterval = 0;

    // Rhythm and Pitch scheduling loop
    for (let step = 0; step < totalSteps; step++) {
        const stepTime = time + (step * stepDuration);
        const noteDuration = stepDuration * 0.9;

        // 1. Determine melody vs countermelody active state
        let melodyPlays = true;
        let playCounter = false;

        if (settings.countermelodyEnabled && settings.countermelodyMode === 'call-response') {
            const stepProgress = step / totalSteps;
            if (stepProgress < dialogueSplitTime) {
                // First segment: Melody plays, countermelody rests
                if (Math.random() > targetDensity) melodyPlays = false;
                if (step === totalSteps - 1 || (step % 4 === 0 && Math.random() < restProbability)) melodyPlays = false;
                playCounter = false;
            } else {
                // Second segment: Melody rests, countermelody responses active
                melodyPlays = false;
                playCounter = (Math.random() < 0.6 && step % 2 === 0);
            }
        } else {
            // Standard density checks for melody
            if (Math.random() > targetDensity) melodyPlays = false;
            if (step === totalSteps - 1 || (step % 4 === 0 && Math.random() < restProbability)) melodyPlays = false;
            if (isConsequentPhrase && step < 4 && Math.random() < 0.6) melodyPlays = false;
            
            // Standard countermelody trigger density
            if (settings.countermelodyEnabled) {
                const mode = settings.countermelodyMode || 'contrary';
                if (mode === 'harmonize') {
                    if (melodyPlays && Math.random() < 0.8) playCounter = true;
                } else { // contrary
                    if (Math.random() < 0.6) playCounter = true;
                }
            }
        }

        // Check for out-of-scale transition note active at this step position
        const stepPos = step / totalSteps;
        const activeTransition = transitionPitches.find(t => Math.abs(stepPos - t.startTime) < (0.5 / totalSteps));

        let pitch = prevPitch;
        if (melodyPlays) {
            if (activeTransition) {
                // Target the out-of-scale transition pitch to make it sound purposeful
                pitch = activeTransition.pitch;
                while (pitch < melodyRangeStart) pitch += divisions;
                while (pitch > melodyRangeEnd) pitch -= divisions;
            } else {
                // Preserve the sequenced motif pitch directly to maintain recognizable interval contour
                pitch = sliceMotif[step % sliceMotif.length];

                const wasLeap = Math.abs(lastInterval) > 4;
                if (wasLeap) {
                    const contraryDirection = lastInterval > 0 ? -1 : 1;
                    const candidates = validPitches.filter(p => contraryDirection > 0 ? p > prevPitch : p < prevPitch);
                    if (candidates.length > 0) {
                        const target = prevPitch + contraryDirection * (12 / divisions) * (Math.random() > 0.5 ? 2 : 1);
                        pitch = findClosest(target, candidates);
                    }
                }
            }

            // Voice leading resolution at step 0 if transitioning from a different chord tone
            if (step === 0 && prevChordObj) {
                const commonTones = getCommonTones(chordNotes, prevChordNotes, divisions);
                const tonesToTarget = commonTones.length > 0 ? commonTones : activePrevChordTones;
                if (tonesToTarget.length > 0 && Math.random() < 0.5) {
                    pitch = findClosest(prevPitch, tonesToTarget);
                }
            }

            // Voice leading resolution at the last step to transition smoothly to the next chord
            if (step === totalSteps - 1 && nextChordObj && activeNextChordTones.length > 0 && Math.random() < 0.5) {
                pitch = findClosest(pitch, activeNextChordTones);
            }

            pitch = applyGenreRules(pitch, settings.genre, step, validPitches, divisions);

            const melodyInst = state.instruments.melody || 'sine';
            playToneFn(midiToFreq(pitch), stepTime, noteDuration, melodyInst, 'melody');
            applyOrnaments(pitch, stepTime, noteDuration, settings.genre, settings.ornamentIntensity, melodyInst, 'melody', playToneFn);

            lastInterval = pitch - prevPitch;
            prevPitch = pitch;
        }

        // 2. Schedule Countermelody
        if (settings.countermelodyEnabled && playCounter) {
            const counterInst = state.instruments.countermelody || 'sine';
            let counterPitch = prevCounterPitch;

            const mode = settings.countermelodyMode || 'contrary';
            if (activeTransition && mode === 'harmonize') {
                // Harmonize out-of-scale transition notes directly
                const targetHarm = activeTransition.pitch + (Math.random() > 0.5 ? 4 : 3); // 3rd or 5th
                counterPitch = findClosest(targetHarm, validPitches);
            } else if (mode === 'harmonize' && melodyPlays) {
                // Harmonize melody pitch
                const index = validPitches.indexOf(pitch);
                if (index !== -1) {
                    const shift = Math.random() > 0.5 ? 2 : 4; // 3rd or 5th degree index shift
                    let targetIndex = index + (Math.random() > 0.5 ? shift : -shift);
                    if (targetIndex < 0) targetIndex = index + shift;
                    if (targetIndex >= validPitches.length) targetIndex = index - shift;
                    counterPitch = validPitches[Math.max(0, Math.min(validPitches.length - 1, targetIndex))];
                } else {
                    counterPitch = findClosest(pitch - 12 + (Math.random() > 0.5 ? 4 : 7), validPitches);
                }
            } else if (mode === 'call-response') {
                // Walking answer line that flows stepwise or chordally from previous counter pitch
                if (activeChordTones.length > 0 && Math.random() < 0.6) {
                    counterPitch = findClosest(prevCounterPitch, activeChordTones);
                } else {
                    counterPitch = findClosestStep(prevCounterPitch, validPitches, divisions);
                }
            } else { // 'contrary'
                // Move countermelody in contrary direction of melody movement 80% of the time
                const melodyMoved = lastInterval !== 0;
                if (melodyMoved && Math.random() < 0.8) {
                    const contraryDirection = lastInterval > 0 ? -1 : 1;
                    const contraryTarget = prevCounterPitch + (contraryDirection * (12 / divisions) * (Math.random() > 0.5 ? 2 : 1));
                    counterPitch = findClosest(contraryTarget, validPitches);
                } else {
                    const referencePitch = melodyPlays ? pitch : prevPitch;
                    counterPitch = resolveContraryPitch(referencePitch, keyRoot, validPitches);
                }
            }

            // Keep counterPitch in range
            while (counterPitch < melodyRangeStart - 12) counterPitch += divisions;
            while (counterPitch > melodyRangeEnd) counterPitch -= divisions;

            playToneFn(midiToFreq(counterPitch), stepTime, noteDuration, counterInst, 'countermelody');
            prevCounterPitch = counterPitch;
        }
    }
}

// Helpers
function getScaleIntervals(mode) {
    const SCALES = {
        major: [0, 2, 4, 5, 7, 9, 11],
        minor: [0, 2, 3, 5, 7, 8, 10],
        harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
        melodicMinor: [0, 2, 3, 5, 7, 9, 11],
        dorian: [0, 2, 3, 5, 7, 9, 10],
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        lydian: [0, 2, 4, 6, 7, 9, 11],
        mixolydian: [0, 2, 4, 5, 7, 9, 10],
        wholeTone: [0, 2, 4, 6, 8, 10],
        diminishedWH: [0, 2, 3, 5, 6, 8, 9, 11],
        altered: [0, 1, 3, 4, 6, 8, 10]
    };
    return SCALES[mode] || SCALES.major;
}

function buildScalePitches(keyRoot, intervals, divisions, start, end) {
    const pitches = [];
    const stepSize = 12 / divisions;
    for (let midi = start; midi <= end; midi++) {
        const pc = (midi - keyRoot) % 12;
        const normalizedPc = pc < 0 ? pc + 12 : pc;
        // Check if pitch class fits inside the scale grid
        if (intervals.includes(Math.round(normalizedPc))) {
            pitches.push(midi);
        }
    }
    return pitches;
}

function generateSeedMotif(pool, size, chordTones, scalePitches, divisions) {
    const motif = [];
    if (pool.length === 0) return motif;
    
    let current = chordTones && chordTones.length > 0 ? 
        chordTones[Math.floor(Math.random() * chordTones.length)] : 
        pool[Math.floor(Math.random() * pool.length)];
    
    motif.push(current);
    
    for (let i = 1; i < size; i++) {
        const lastInterval = i >= 2 ? (motif[i - 1] - motif[i - 2]) : 0;
        if (Math.abs(lastInterval) > 4) {
            const contraryDirection = lastInterval > 0 ? -1 : 1;
            const target = motif[i - 1] + (contraryDirection * (12 / divisions) * (Math.random() > 0.5 ? 2 : 1));
            current = findClosest(target, scalePitches);
        } else {
            const roll = Math.random();
            if (roll < 0.6) {
                current = findClosestStep(current, scalePitches, divisions);
            } else if (roll < 0.85) {
                const direction = Math.random() > 0.5 ? 1 : -1;
                const target = current + (direction * (12 / divisions) * (Math.random() > 0.5 ? 3 : 4));
                current = findClosest(target, scalePitches);
            } else {
                if (chordTones && chordTones.length > 0) {
                    current = findClosest(current, chordTones);
                } else {
                    current = pool[Math.floor(Math.random() * pool.length)];
                }
            }
        }
        motif.push(current);
    }
    return motif;
}

function applyInversion(motif, pool) {
    if (motif.length === 0) return motif;
    const center = motif[0];
    return motif.map(note => {
        const inverted = center - (note - center);
        return findClosest(inverted, pool);
    });
}

function applyRetrograde(motif) {
    return [...motif].reverse();
}

function applySequence(motif, pool, shiftSteps) {
    return motif.map(note => {
        const idx = pool.indexOf(note);
        if (idx === -1) return note;
        const targetIdx = Math.max(0, Math.min(pool.length - 1, idx + shiftSteps));
        return pool[targetIdx];
    });
}

function findClosest(val, array) {
    if (array.length === 0) return val;
    return array.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
}

// Ensure the EDO step increments are based on EDO scale
function findClosestStep(prev, scalePitches, divisions) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    const target = prev + (direction * (12 / divisions) * (Math.random() > 0.5 ? 2 : 1));
    return findClosest(target, scalePitches);
}

function getCommonTones(notesA, notesB, divisions) {
    if (!notesA || !notesB) return [];
    const pcsA = notesA.map(n => (n % divisions + divisions) % divisions);
    const pcsB = notesB.map(n => (n % divisions + divisions) % divisions);
    const commons = pcsA.filter(pc => pcsB.includes(pc));
    return notesA.filter(n => commons.includes((n % divisions + divisions) % divisions));
}

function applyGenreRules(pitch, genre, step, scalePitches, divisions) {
    if (genre === 'blues') {
        // Blue notes (flat 3rd or flat 5th) offsets
        if (step % 4 === 2 && Math.random() < 0.4) {
            return pitch - 0.5; // Quarter-tone flat bend
        }
    }
    if (genre === 'jazz') {
        // Encircle targets on step index
        if (step % 4 === 3) {
            return pitch + (Math.random() > 0.5 ? 1.0 : -1.0); // Encircling offsets
        }
    }
    return pitch;
}

function applyOrnaments(pitch, stepTime, noteDuration, genre, intensity, inst, bus, playToneFn) {
    if (Math.random() > intensity) return;

    if (genre === 'classical' && Math.random() < 0.5) {
        // Grace Note (Acciaccatura)
        const gracePitch = pitch - 1;
        playToneFn(midiToFreq(gracePitch), stepTime - 0.05, 0.04, inst, bus);
    } else if (genre === 'blues' && Math.random() < 0.4) {
        // Brief bend glide
        const bendPitch = pitch - 0.5;
        playToneFn(midiToFreq(bendPitch), stepTime, noteDuration * 0.3, inst, bus);
    }
}

function resolveContraryPitch(pitch, center, scalePitches) {
    const offset = pitch - center;
    const contraryTarget = center - offset;
    return findClosest(contraryTarget, scalePitches);
}
