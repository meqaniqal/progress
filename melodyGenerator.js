import { state } from './store.js';
import { getChordNotes, getEffectiveTuning, midiToFreq, deduceSourceMode, getBassNote } from './theory.js';
import { playTone } from './synth.js';

// Cache for motif memory across iterations
// Structure: { keyString: { hook: [], connector: [], cadence: [], hookRhythm: [] } }
let motifCache = {};

// Phrase and surprise state tracking
let stepsSinceLastSurprise = 10;
let noteCountThisPhrase = 0;
let forceContraryNext = false;
let forceTonicNext = false;
let globalPrevPitch = null;
let globalPrevCounterPitch = null;
let globalLastInterval = 0;
let globalMelodyHistory = [];

// Narrative State Tracker
let narrativeState = {
    consecutiveSteps: 0,
    lowRegisterBars: 0,
    motifRepeats: 0,
    phraseSubdivisions: []
};

export function clearMelodyMemory() {
    motifCache = {};
    stepsSinceLastSurprise = 10;
    noteCountThisPhrase = 0;
    forceContraryNext = false;
    forceTonicNext = false;
    globalPrevPitch = null;
    globalPrevCounterPitch = null;
    globalLastInterval = 0;
    globalMelodyHistory = [];
    narrativeState = {
        consecutiveSteps: 0,
        lowRegisterBars: 0,
        motifRepeats: 0,
        phraseSubdivisions: []
    };
}

// 16-step rhythmic templates to encode deliberate syncopation personalities per genre
const RHYTHMIC_TEMPLATES = {
    none: {
        low:    [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        mid:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        high:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]
    },
    generic: {
        low:    [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],  // sparse, quarter-note feel
        mid:    [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0],  // moderate syncopation
        high:   [1,0,1,0, 1,1,0,1, 0,1,0,1, 1,0,1,0]   // active, 8th-note dominant
    },
    blues: {
        low:    [1,0,0,0, 0,1,0,0, 1,0,0,0, 0,0,1,0],  // call-and-response gaps
        mid:    [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],  // shuffle feel
        high:   [1,0,1,0, 0,1,0,1, 1,0,0,1, 0,1,0,0]   // dense blues run
    },
    jazz: {
        low:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],  // 8th-note line (swing applied separately)
        mid:    [1,0,1,1, 0,1,0,1, 1,0,1,0, 0,1,1,0],  // bebop syncopation
        high:   [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,0,1,1]   // dense chromatic run
    },
    latin: {
        low:    [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,0,1,0],  // clave-influenced
        mid:    [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1],  // bossa feel
        high:   [1,0,1,1, 0,1,0,1, 0,1,1,0, 1,0,1,0]   // active montuno-style
    },
    classical: {
        low:    [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        mid:    [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
        high:   [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1]
    }
};

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

    // Debug logging commented out but can be reactivated if needed for debugging
    // console.log(`[MelodyGen] Entry - globalPrevPitch: ${globalPrevPitch}`);

    // Check if we should disable during Arpeggiators
    const hasArp = chordObj.arpSettings && chordObj.arpSettings.pattern !== 'none';
    if (hasArp && settings.behaviorDuringArp === 'off') return;

    // Check if we should disable during transitions
    const hasTransition = chordObj.chordPattern && chordObj.chordPattern.transitions && chordObj.chordPattern.transitions.length > 0;
    if (hasTransition && settings.behaviorDuringTransitions === 'off') return;

    // Determine EDO tuning and key
    const tuning = getEffectiveTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const keyRoot = Number(state.baseKey) || 60;
    
    // Reset phrase bound motif index at phrase start boundaries
    if (absIndex % 4 === 0) {
        noteCountThisPhrase = 0;
        narrativeState.phraseSubdivisions = generatePhraseSubdivisions(settings.genre);
    }

    // --- 5. Multi-Parameter Tension Curve Automation ---
    const progressVal = absIndex / Math.max(1, totalChords);
    const tensionCurveValue = settings.tensionCurve === 'arch' ? Math.sin(progressVal * Math.PI) : 0.5;
    const currentTension = Math.max(0.0, Math.min(1.0, settings.density * 0.4 + tensionCurveValue * 0.6));

    // Automation mappings (enforce 0.2 density floor so slots aren't fully silent)
    const activeDensity = Math.max(0.2, settings.density * (0.3 + currentTension * 0.7));
    const ornamentProb = currentTension * (settings.ornamentIntensity || 0.5);
    
    // Only allow chromatic alterations in jazz or blues genres
    const isChromaticGenre = settings.genre === 'jazz' || settings.genre === 'blues';
    const chromaticProb = isChromaticGenre ? (currentTension * 0.3) : 0.0;

    // Register boundaries (Melody centered around C5 [72], Countermelody centered around E4 [64])
    const melodyRangeStart = 67;
    let melodyRangeEnd = 79;
    if (narrativeState.lowRegisterBars > 3) {
        melodyRangeEnd += 5; // push register ceiling up
    }
    const counterRangeStart = 57;
    const counterRangeEnd = 69;

    const chordKey = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;
    const chordMode = deduceSourceMode(chordObj.symbol, state.mode || 'major') || state.mode || 'major';
    const scaleIntervals = getScaleIntervals(chordMode, settings.genre);

    // Build pools for Melody
    const scalePitches = buildScalePitches(chordKey, scaleIntervals, divisions, melodyRangeStart, melodyRangeEnd);
    const activeChordTones = (chordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += periodSize;
        while (note > melodyRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);
    const validPitches = Array.from(new Set([...scalePitches, ...activeChordTones])).sort((a, b) => a - b);

    // Build pools for Countermelody
    const counterScalePitches = buildScalePitches(chordKey, scaleIntervals, divisions, counterRangeStart, counterRangeEnd);
    const counterActiveChordTones = (chordNotes || []).map(n => {
        let note = n;
        while (note < counterRangeStart) note += periodSize;
        while (note > counterRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= counterRangeStart && n <= counterRangeEnd);
    const counterValidPitches = Array.from(new Set([...counterScalePitches, ...counterActiveChordTones])).sort((a, b) => a - b);

    // Retrieve previous/next chord notes
    const prevChordNotes = prevChordObj ? getChordNotes(prevChordObj, state.baseKey, divisions) : [];
    const nextChordNotes = nextChordObj ? getChordNotes(nextChordObj, state.baseKey, divisions) : [];

    const activePrevChordTones = (prevChordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += periodSize;
        while (note > melodyRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

    const activeNextChordTones = (nextChordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += periodSize;
        while (note > melodyRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

    // Active bass note calculation for doubling avoidance
    const activeBassMidi = getBassNote(chordNotes || [], tuning);
    const activeBassPc = activeBassMidi !== null && activeBassMidi !== undefined ? (activeBassMidi % periodSize + periodSize) % periodSize : null;

    const pool = activeChordTones.length > 0 ? activeChordTones : validPitches;

    // Filter passing / transition pitches
    const transitionPitches = (voiceEvents || [])
        .filter(ev => ev.transitionType !== null && ev.transitionType !== undefined)
        .map(ev => ({
            pitch: ev.pitch,
            startTime: ev.startTime,
            duration: ev.duration
        }));

    // Call & Response split boundaries
    let dialogueSplitTime = 0.5;
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

    // --- 1. Motif Families (Hook, Connector, Cadence) ---
    const activeMotif = state.userMotifs && settings.activeMotifId ? state.userMotifs.find(m => m.id === settings.activeMotifId) : null;
    let motifFamily;
    if (settings.seedSource === 'motif' && activeMotif) {
        motifFamily = generateMotifFamilyFromUser(activeMotif, pool, activeChordTones, validPitches, tuning);
    } else {
        const motifKey = `${state.baseKey}_${state.mode}`;
        motifFamily = motifCache[motifKey];
        if (!motifFamily || (settings.genre !== 'none' && Math.random() < (1.0 - settings.motifRecurrence))) {
            motifFamily = generateMotifFamily(pool, activeChordTones, validPitches, tuning);
            motifCache[motifKey] = motifFamily;
            narrativeState.motifRepeats = 0;
        } else {
            narrativeState.motifRepeats++;
            // Mutate the cached motif family slightly to keep it fresh
            if (settings.genre !== 'none' && Math.random() < 0.3) {
                motifFamily = mutateMotifFamily(motifFamily, validPitches, tuning);
                motifCache[motifKey] = motifFamily;
            }
        }
    }

    const hookRhythm = motifFamily.hookRhythm || [1, 0, 1, 0];

    let currentCell = motifFamily.hook;
    if (progressVal >= 0.75) {
        currentCell = motifFamily.cadence;
    } else if (progressVal >= 0.25 && progressVal < 0.75) {
        currentCell = motifFamily.connector;
    }

    // Transpose active cell to chord anchor
    const anchorTarget = globalPrevPitch !== null ? globalPrevPitch : (keyRoot + 12);
    const chordToneAnchor = activeChordTones.length > 0 ? findClosest(anchorTarget, activeChordTones) : keyRoot;
    const transpositionOffset = chordToneAnchor - currentCell[0];

    // Helper to check if a pitch belongs to the base key scale
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none');
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    let sliceMotif = currentCell.map(note => {
        let transposed = note + transpositionOffset;
        while (transposed < melodyRangeStart) transposed += periodSize;
        while (transposed > melodyRangeEnd) transposed -= periodSize;
        
        let scaleSnapped = findClosest(transposed, scalePitches);
        if (activeChordTones.length > 0) {
            const closestChordTone = findClosest(transposed, activeChordTones);
            const isChromatic = !isBaseScaleTone(closestChordTone);
            const tolerance = isChromatic ? 2.01 : 1.01;
            if (Math.abs(transposed - closestChordTone) <= Math.abs(transposed - scaleSnapped) + tolerance) {
                return closestChordTone;
            }
        }
        return scaleSnapped;
    });

    // Apply variation transformations
    if (settings.genre !== 'none') {
        if (narrativeState.motifRepeats > 2) {
            const choice = Math.random();
            if (choice < 0.33) {
                sliceMotif = applyInversion(sliceMotif, pool);
            } else if (choice < 0.66) {
                sliceMotif = applyRetrograde(sliceMotif);
            } else {
                sliceMotif = applySequence(sliceMotif, pool, Math.random() > 0.5 ? 2 : -2);
            }
        } else if (settings.variationDepth > 0) {
            const variationRoll = (absIndex % 4);
            if (variationRoll === 1 && settings.variationDepth > 0.3) {
                sliceMotif = applyInversion(sliceMotif, pool);
            } else if (variationRoll === 2 && settings.variationDepth > 0.5) {
                sliceMotif = applyRetrograde(sliceMotif);
            } else if (variationRoll === 3 && settings.variationDepth > 0.7) {
                sliceMotif = applySequence(sliceMotif, pool, Math.random() > 0.5 ? 2 : -2);
            }
        }
    }

    const isConsequentPhrase = (absIndex % 2 === 1);
    const restProbability = settings.restProbability;

    let prevPitch = globalPrevPitch !== null ? globalPrevPitch : (melodyRangeStart + 6);
    let prevCounterPitch = globalPrevCounterPitch !== null ? globalPrevCounterPitch : counterRangeStart + 6;
    let lastInterval = globalLastInterval;

    const melodyHistory = globalMelodyHistory;
    const debugNotes = [];

    // Arrays to collect scheduled notes before playing them (to apply resolution rules reliably)
    const melodyScheduled = [];
    const counterScheduled = [];

    // --- 2. Rhythmic Syncopation Templates & Swing ---
    const genre = settings.genre || 'generic';
    const energyLevel = currentTension < 0.35 ? 'low' : currentTension > 0.7 ? 'high' : 'mid';
    const templatesGroup = RHYTHMIC_TEMPLATES[genre] || RHYTHMIC_TEMPLATES.generic;
    const activeTemplateRaw = templatesGroup[energyLevel] || templatesGroup.mid;
    const activeTemplate = [...activeTemplateRaw];
    if (activeTemplate.every(step => !step)) {
        activeTemplate[0] = 1;
    }

    // Compute dynamic Swing ratio (scales down at fast tempos)
    let swingRatio = 0.5;
    if (settings.genre === 'jazz' || settings.genre === 'blues') {
        const maxSwing = settings.genre === 'jazz' ? 0.62 : 0.58;
        if (bpm < 140) {
            swingRatio = maxSwing;
        } else if (bpm > 180) {
            swingRatio = 0.5;
        } else {
            swingRatio = maxSwing - ((bpm - 140) / 40) * (maxSwing - 0.5);
        }
    }

    // Surprise Quotient scaled as variationDepth * 0.05 (disabled in 'none' genre)
    const surpriseQuotient = settings.surpriseQuotient !== undefined ? settings.surpriseQuotient : (settings.genre === 'none' ? 0.0 : settings.variationDepth * 0.05);

    const stepsPerBeat = 4;
    const totalSteps = beats * stepsPerBeat;
    const beatDuration = chordSlotDuration / beats;
    const maxSteps = Math.round(chordSlotDuration / (15 / bpm));

    // Pre-calculate target pitch contour (gravitational pull towards a target climax pitch at ~65% progression)
    const melodyMid = 73;
    let targetPitch = melodyMid;
    if (progressVal < 0.65) {
        const t = progressVal / 0.65;
        targetPitch = melodyRangeStart + 2 + t * (melodyRangeEnd - (melodyRangeStart + 2));
    } else {
        const t = (progressVal - 0.65) / 0.35;
        const resolveTarget = keyRoot + 12;
        targetPitch = melodyRangeEnd - t * (melodyRangeEnd - resolveTarget);
    }

    // Schedule beat by beat to allow rate variation
    // Schedule beat by beat to allow rate variation or adapt polyphonic motif directly
    const isPolyphonicMotif = settings.seedSource === 'motif' && activeMotif && settings.midiExtractionMode === 'polyphonic';

    if (isPolyphonicMotif) {
        const motifLengthBeats = Math.max(...activeMotif.notes.map(n => n.time + n.duration), 4.0);
        const reps = Math.ceil(beats / motifLengthBeats);
        const beatDuration = chordSlotDuration / beats;

        for (let r = 0; r < reps; r++) {
            activeMotif.notes.forEach(note => {
                let noteBeat = note.time + r * motifLengthBeats;
                // Apply variation timing shift if variationDepth > 0
                if (settings.variationDepth > 0 && Math.random() < settings.variationDepth * 0.2) {
                    const shiftOptions = [-0.25, 0.25, -0.125, 0.125];
                    const shift = shiftOptions[Math.floor(Math.random() * shiftOptions.length)];
                    noteBeat = Math.max(0, noteBeat + shift);
                }
                if (noteBeat >= beats) return;

                const stepTime = time + noteBeat * beatDuration;
                const noteDuration = note.duration * beatDuration * 0.95;

                // Conform pitch
                let rawPitch = chordKey + (note.pitchOffset || 0);

                // Apply variation pitch shift if variationDepth > 0
                if (settings.variationDepth > 0 && Math.random() < settings.variationDepth * 0.3) {
                    const scaleDegreeShift = Math.random() > 0.5 ? 1 : -1;
                    rawPitch += scaleDegreeShift * (12 / divisions);
                }

                const isCounter = note.voiceIndex > 0;
                if (isCounter && settings.countermelodyEnabled) {
                    let conformedPitch = rawPitch;
                    while (conformedPitch < counterRangeStart) conformedPitch += periodSize;
                    while (conformedPitch > counterRangeEnd) conformedPitch -= periodSize;

                    let scaleSnapped = findClosest(conformedPitch, counterScalePitches);
                    if (counterActiveChordTones.length > 0) {
                        const closestChordTone = findClosest(conformedPitch, counterActiveChordTones);
                        if (Math.abs(conformedPitch - closestChordTone) <= Math.abs(conformedPitch - scaleSnapped) + 1.01) {
                            conformedPitch = closestChordTone;
                        } else {
                            conformedPitch = scaleSnapped;
                        }
                    } else {
                        conformedPitch = scaleSnapped;
                    }

                    counterScheduled.push({
                        pitch: conformedPitch,
                        stepTime,
                        noteDuration,
                        counterInst: state.instruments.countermelody || 'sine',
                        step: Math.round(noteBeat * 4)
                    });
                } else if (!isCounter) {
                    let conformedPitch = rawPitch;
                    while (conformedPitch < melodyRangeStart) conformedPitch += periodSize;
                    while (conformedPitch > melodyRangeEnd) conformedPitch -= periodSize;

                    let scaleSnapped = findClosest(conformedPitch, scalePitches);
                    if (activeChordTones.length > 0) {
                        const closestChordTone = findClosest(conformedPitch, activeChordTones);
                        if (Math.abs(conformedPitch - closestChordTone) <= Math.abs(conformedPitch - scaleSnapped) + 1.01) {
                            conformedPitch = closestChordTone;
                        } else {
                            conformedPitch = scaleSnapped;
                        }
                    } else {
                        conformedPitch = scaleSnapped;
                    }

                    melodyScheduled.push({
                        pitch: conformedPitch,
                        stepTime,
                        noteDuration,
                        melodyInst: state.instruments.melody || 'sine',
                        step: Math.round(noteBeat * 4)
                    });
                }
            });
        }
        melodyScheduled.sort((a, b) => a.stepTime - b.stepTime);
        counterScheduled.sort((a, b) => a.stepTime - b.stepTime);
    } else {
        for (let beat = 0; beat < beats; beat++) {
            // Choose subdivision rate per beat based on pre-computed phrase blueprint
            let subdivision = 4;
            if (settings.genre !== 'none') {
                const progressInPhrase = ((absIndex % 4) * beats + beat) / (4 * beats);
                const subIdx = Math.floor(progressInPhrase * narrativeState.phraseSubdivisions.length);
                subdivision = narrativeState.phraseSubdivisions[subIdx] || 4;
                
                // Cap subdivisions based on energy level / tension
                if (currentTension < 0.25) {
                    if (subdivision > 3) subdivision = 3; // Low Tension: Cap at 3 (allowing triplets)
                } else if (currentTension < 0.55) {
                    if (subdivision > 6) subdivision = 6; // Mid Tension: Cap at 6 (allowing sixteenth triplets)
                }
            }

            const subStepDuration = beatDuration / subdivision;

            for (let sub = 0; sub < subdivision; sub++) {
                const step = beat * stepsPerBeat + Math.round((sub / subdivision) * stepsPerBeat);
                if (step >= maxSteps) continue;
                
                // Swing timing adjustments
                let stepOffsetInBeat = sub / subdivision;
                let noteDurMultiplier = 0.9;
                if (settings.genre === 'jazz' || settings.genre === 'blues') {
                    if (subdivision === 4) {
                        if (sub === 2) {
                            stepOffsetInBeat = swingRatio;
                            noteDurMultiplier = swingRatio;
                        } else if (sub === 3) {
                            stepOffsetInBeat = swingRatio + (1.0 - swingRatio) * 0.5;
                            noteDurMultiplier = (1.0 - swingRatio) * 0.5;
                        }
                    } else if (subdivision === 2) {
                        if (sub === 1) {
                            stepOffsetInBeat = swingRatio;
                            noteDurMultiplier = 1.0 - swingRatio;
                        }
                    } else if (subdivision === 3) {
                        // swing triplets
                        if (sub === 0) {
                            noteDurMultiplier = 1.2;
                        } else if (sub === 1) {
                            stepOffsetInBeat = 0.4;
                            noteDurMultiplier = 0.8;
                        } else if (sub === 2) {
                            stepOffsetInBeat = 0.7;
                            noteDurMultiplier = 0.9;
                        }
                    }
                }

                const stepTime = time + (beat * beatDuration) + (stepOffsetInBeat * beatDuration);
                const noteDuration = subStepDuration * noteDurMultiplier;

                let melodyPlays = true;
                let playCounter = false;

                if (settings.countermelodyEnabled && settings.countermelodyMode === 'call-response') {
                    const stepProgress = step / totalSteps;
                    if (stepProgress < dialogueSplitTime) {
                        if (subdivision === 3 || subdivision === 6 || subdivision === 8) {
                            if (Math.random() > activeDensity) melodyPlays = false;
                        } else {
                            if (!activeTemplate[step % activeTemplate.length]) melodyPlays = false;
                            if (settings.genre !== 'none') {
                                if (Math.random() > activeDensity) melodyPlays = false;
                                if (step === totalSteps - 1 || (step % 4 === 0 && Math.random() < restProbability)) melodyPlays = false;
                            } else {
                                if (step === totalSteps - 1) melodyPlays = false;
                            }
                        }
                        playCounter = false;
                    } else {
                        melodyPlays = false;
                        playCounter = (step % 2 === 0 && Math.random() < 0.6) || (step % 4 === 3 && Math.random() < 0.4);
                    }
                } else {
                    if (subdivision === 3 || subdivision === 6 || subdivision === 8) {
                        if (Math.random() > Math.min(0.95, activeDensity * 2.2)) melodyPlays = false;
                    } else {
                        if (!activeTemplate[step % activeTemplate.length]) melodyPlays = false;
                        if (settings.genre !== 'none') {
                            if (Math.random() > activeDensity) melodyPlays = false;
                            if (step === totalSteps - 1 || (step % 4 === 0 && Math.random() < restProbability)) melodyPlays = false;
                            if (isConsequentPhrase && step < 4 && Math.random() < 0.65) melodyPlays = false;
                        } else {
                            if (step === totalSteps - 1) melodyPlays = false;
                        }
                    }
                    
                    if (settings.countermelodyEnabled) {
                        const mode = settings.countermelodyMode || 'contrary';
                        if (mode === 'harmonize') {
                            if (melodyPlays && Math.random() < 0.75) playCounter = true;
                        } else {
                            if (Math.random() < 0.55) playCounter = true;
                        }
                    }
                }

                // Apply motif rhythmic skeleton
                if (melodyPlays && settings.genre !== 'none') {
                    const isRun = subdivision === 3 || subdivision === 6 || subdivision === 8;
                    if (!isRun) {
                        if (!hookRhythm[noteCountThisPhrase % 4]) {
                            melodyPlays = false;
                        }
                        noteCountThisPhrase++;
                    }
                }

                const stepPos = step / totalSteps;
                const activeTransition = transitionPitches.find(t => Math.abs(stepPos - t.startTime) < (0.5 / totalSteps));

                let pitch = prevPitch;
                if (melodyPlays) {
                    // Force tonic resolution at step 0 if previous ended on leading tone (Rule B)
                    if (step === 0 && forceTonicNext) {
                        pitch = findClosest(chordKey + 12, validPitches);
                        forceTonicNext = false;
                    } else if (activeTransition) {
                        pitch = activeTransition.pitch;
                        while (pitch < melodyRangeStart) pitch += periodSize;
                        while (pitch > melodyRangeEnd) pitch -= periodSize;
                    } else {
                        // --- 8. Jazz Enclosure algorithm implementation ---
                        const isStrongBeatTarget = (step + 1) % stepsPerBeat === 0 || (step + 1) % stepsPerBeat === 2;
                        const isUpbeatStep = step % stepsPerBeat === 1 || step % stepsPerBeat === 3;
                        
                        if (settings.genre === 'jazz' && isUpbeatStep && isStrongBeatTarget && activeChordTones.length > 0 && Math.random() < 0.7) {
                            const target = findClosest(sliceMotif[(step + 1) % sliceMotif.length], activeChordTones);
                            const upperApproach = target + 1; // 1 EDO step chromatic above
                            const lowerCandidates = validPitches.filter(p => p < target);
                            const lowerApproach = lowerCandidates.length > 0 ? lowerCandidates[lowerCandidates.length - 1] : target - 1;
                            
                            // Schedule approach notes immediately
                            const appDuration = noteDuration * 0.45;
                            const melodyInst = state.instruments.melody || 'sine';
                            playToneFn(midiToFreq(upperApproach), stepTime, appDuration, melodyInst, 'melody');
                            playToneFn(midiToFreq(lowerApproach), stepTime + noteDuration * 0.5, appDuration, melodyInst, 'melody');
                            
                            melodyPlays = false; 
                            prevPitch = target;
                        } else {
                            let motifNote;
                            if (subdivision === 4 && sub > 0) {
                                // Run: stepwise scale continuation within sixteenth-note runs
                                const dir = lastInterval >= 0 ? 1 : -1;
                                const prevIdx = findScaleIndex(prevPitch, validPitches);
                                motifNote = prevIdx !== -1 ? validPitches[Math.max(0, Math.min(validPitches.length - 1, prevIdx + dir))] : sliceMotif[noteCountThisPhrase % sliceMotif.length];
                            } else {
                                motifNote = sliceMotif[noteCountThisPhrase % sliceMotif.length];
                            }

                            // --- 3. Vertical Congruence with Genre-Gated Doubling Avoidance ---
                            const rangeLimit = 2.1 * (12 / divisions);
                            let candidates = validPitches.filter(p => Math.abs(p - motifNote) <= rangeLimit);
                            
                            // Gravitational pull towards targetPitch (preferred pool ±4 semitones)
                            let preferredCandidates = candidates.filter(p => Math.abs(p - targetPitch) <= 4.01);
                            if (preferredCandidates.length > 0) {
                                candidates = preferredCandidates;
                            }

                            // Trigger higher leap probability if consecutive steps > 6
                            if (narrativeState.consecutiveSteps > 6) {
                                const leapCandidates = candidates.filter(p => Math.abs(p - prevPitch) > 2.1 * (12 / divisions));
                                if (leapCandidates.length > 0) {
                                    candidates = leapCandidates;
                                }
                            }

                            if (candidates.length > 0) {
                                const weights = candidates.map(p => {
                                    const pc = (p % periodSize + periodSize) % periodSize;
                                    let w = 1.0;
                                    if (settings.genre === 'jazz') {
                                        const pcDiff = ((pc - (chordKey % periodSize) + periodSize) % periodSize);
                                        const normDiff = Math.round(pcDiff); // 3rd, 7th (root is protected)
                                        const isInnerVoice = [3, 4, 10, 11].includes(normDiff);
                                        if (isInnerVoice) w *= 0.6;
                                    } else if (settings.genre === 'blues') {
                                        const pcDiff = ((pc - (chordKey % periodSize) + periodSize) % periodSize);
                                        const normDiff = Math.round(pcDiff);
                                        const isInnerVoice = [3, 4, 10, 11].includes(normDiff);
                                        if (isInnerVoice) w *= 0.8;
                                    }
                                    // Boost chromatic chord tones to ensure they are voiced properly
                                    const isChordTone = activeChordTones.includes(p);
                                    const isChromatic = !isBaseScaleTone(p);
                                    if (isChordTone && isChromatic) {
                                        w *= 5.0; // 5x weight boost for chromatic chord tones
                                    }
                                    return w;
                                });
                                pitch = selectWeightedPitch(candidates, weights);
                            } else {
                                pitch = motifNote;
                            }
                        }
                    }

                    if (step === 0 && prevChordObj && settings.genre !== 'none') {
                        const commonTones = getCommonTones(chordNotes, prevChordNotes, periodSize);
                        const tonesToTarget = commonTones.length > 0 ? commonTones : activePrevChordTones;
                        if (tonesToTarget.length > 0 && Math.random() < 0.25) {
                            const closestTarget = findClosest(prevPitch, tonesToTarget);
                            if (Math.abs(closestTarget - prevPitch) <= 3 * (12 / divisions)) {
                                pitch = closestTarget;
                            }
                        }
                    }

                    if (step === totalSteps - 1 && nextChordObj && activeNextChordTones.length > 0 && settings.genre !== 'none') {
                        const closestTarget = findClosest(pitch, activeNextChordTones);
                        if (Math.abs(closestTarget - pitch) <= 3 * (12 / divisions)) {
                            pitch = closestTarget;
                        }
                    }

                    // --- 6. Surprise Gestures with Guards ---
                    const isBeatBoundary = (step % 4 === 0);
                    if (Math.random() < surpriseQuotient && stepsSinceLastSurprise >= 8 && isBeatBoundary) {
                        const surpriseRoll = Math.random();
                        if (surpriseRoll < 0.25) {
                            pitch = pitch + (Math.random() > 0.5 ? periodSize : -periodSize);
                            if (pitch < melodyRangeStart || pitch > melodyRangeEnd) {
                                  pitch = findClosest(pitch + (pitch < melodyRangeStart ? periodSize : -periodSize), validPitches);
                            }
                            forceContraryNext = true; // Force next note to resolve contrary
                        } else if (surpriseRoll < 0.5) {
                            const scaleDegrees = getScaleIntervals(chordMode, settings.genre);
                            const degree6 = scaleDegrees[5] !== undefined ? scaleDegrees[5] : 9;
                            const deceptivePc = (chordKey + degree6) % divisions;
                            const deceptivePitches = validPitches.filter(p => (p % divisions + divisions) % divisions === deceptivePc);
                            if (deceptivePitches.length > 0) {
                                pitch = findClosest(pitch, deceptivePitches);
                            }
                        } else if (surpriseRoll < 0.75) {
                            pitch = prevPitch;
                        } else {
                            melodyPlays = false;
                        }
                        stepsSinceLastSurprise = 0;
                    } else {
                        stepsSinceLastSurprise++;
                    }

                    // Force contrary resolution after leap surprise
                    if (forceContraryNext && lastInterval !== 0) {
                        const contraryDirection = lastInterval > 0 ? -1 : 1;
                        const candidates = validPitches.filter(p => contraryDirection > 0 ? p > prevPitch : p < prevPitch);
                        if (candidates.length > 0) {
                            const target = prevPitch + contraryDirection * (12 / divisions) * (Math.random() > 0.5 ? 2 : 1);
                            pitch = findClosest(target, candidates);
                        }
                        forceContraryNext = false;
                    }

                    if (melodyPlays) {
                        pitch = applyGenreRules(pitch, settings.genre, step, validPitches, divisions);
                        
                        // Enforce contrary motion resolution for any leap > 4 semitones or forceContraryNext
                        if (lastInterval !== 0 && (Math.abs(lastInterval) > 4 || forceContraryNext)) {
                            const contraryDirection = lastInterval > 0 ? -1 : 1;
                            const currentInterval = pitch - prevPitch;
                            const resolvesContrary = (lastInterval > 0 && currentInterval < 0) || (lastInterval < 0 && currentInterval > 0);
                            if (!resolvesContrary) {
                                const candidates = validPitches.filter(p => contraryDirection > 0 ? p > prevPitch : p < prevPitch);
                                if (candidates.length > 0) {
                                    pitch = contraryDirection > 0 ? candidates[0] : candidates[candidates.length - 1];
                                }
                            }
                            forceContraryNext = false;
                        }

                        // Snap selected notes strictly to validPitches
                        pitch = findClosest(pitch, validPitches);

                        // Prevent repeated identical pitches by forcing stepwise movement
                        if (Math.abs(pitch - prevPitch) < 0.01) {
                            const idx = findScaleIndex(pitch, validPitches);
                            const dir = lastInterval >= 0 ? 1 : -1;
                            let newIdx = idx + dir;
                            if (newIdx < 0 || newIdx >= validPitches.length) {
                                newIdx = idx - dir;
                            }
                            pitch = validPitches[Math.max(0, Math.min(validPitches.length - 1, newIdx))];
                        }

                        const melodyInst = state.instruments.melody || 'sine';
                        
                        // Collect notes instead of scheduling/playing immediately
                        melodyScheduled.push({
                            pitch,
                            stepTime,
                            noteDuration,
                            melodyInst,
                            step
                        });

                        // Update narrative state steps count
                        const isStep = Math.abs(pitch - prevPitch) <= 2.1 * (12 / divisions);
                        if (isStep) {
                            narrativeState.consecutiveSteps++;
                        } else {
                            narrativeState.consecutiveSteps = 0;
                        }

                        lastInterval = pitch - prevPitch;
                        prevPitch = pitch;
                        if (sub === 0 || settings.genre === 'none' || subdivision !== 4) {
                            noteCountThisPhrase++;
                        }
                    }
                }

                if (settings.countermelodyEnabled && playCounter) {
                    const counterInst = state.instruments.countermelody || 'sine';
                    let counterPitch = prevCounterPitch;

                    const mode = settings.countermelodyMode || 'contrary';
                    
                    if (mode === 'call-response' && melodyHistory.length > 0) {
                        const quoteIndex = step % Math.max(1, melodyHistory.length);
                        const quotePitch = melodyHistory[quoteIndex];
                        counterPitch = findClosest(quotePitch - periodSize, counterValidPitches);
                        
                        const lastCallPitch = melodyHistory[melodyHistory.length - 1];
                        const lastPc = (lastCallPitch % periodSize + periodSize) % periodSize;
                        const isTense = [6, 10, 11].includes((lastPc - (chordKey % periodSize) + periodSize) % periodSize);
                        
                        if (isTense && counterActiveChordTones.length > 0 && Math.random() < 0.7) {
                            const stableTones = counterActiveChordTones.filter(ct => {
                                const pcDiff = ((ct % periodSize) - (chordKey % periodSize) + periodSize) % periodSize;
                                return [0, 3, 4, 7].includes(pcDiff);
                            });
                            if (stableTones.length > 0) {
                                counterPitch = findClosest(counterPitch, stableTones);
                            }
                        }
                    } else if (activeTransition && mode === 'harmonize') {
                        const targetHarm = activeTransition.pitch + (Math.random() > 0.5 ? 4 : 3);
                        counterPitch = findClosest(targetHarm - periodSize, counterValidPitches);
                    } else if (mode === 'harmonize' && melodyPlays) {
                        const index = findScaleIndex(pitch, validPitches);
                        if (index !== -1) {
                            const shift = Math.random() > 0.5 ? 2 : 4;
                            let targetIndex = index - shift;
                            if (targetIndex < 0) targetIndex = 0;
                            counterPitch = findClosest(validPitches[targetIndex] - periodSize, counterValidPitches);
                        } else {
                            counterPitch = findClosest(pitch - periodSize, counterValidPitches);
                        }
                    } else if (mode === 'call-response') {
                        if (counterActiveChordTones.length > 0 && Math.random() < 0.6) {
                            counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
                        } else {
                            counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
                        }
                    } else {
                        const melodyMoved = lastInterval !== 0;
                        if (melodyMoved && Math.random() < 0.8) {
                            const contraryDirection = lastInterval > 0 ? -1 : 1;
                            let idx = findScaleIndex(prevCounterPitch, counterValidPitches);
                            if (idx === -1) {
                                idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches);
                            }
                            const stepShift = Math.random() > 0.5 ? 2 : 1;
                            let newIdx = idx + contraryDirection * stepShift;
                            if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                                newIdx = idx - contraryDirection * stepShift;
                            }
                            counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                        } else {
                            counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
                        }
                    }

                    // Snap countermelody strictly to counterValidPitches
                    counterPitch = findClosest(counterPitch, counterValidPitches);

                    // Prevent repeated identical pitches for countermelody by forcing stepwise movement
                    if (Math.abs(counterPitch - prevCounterPitch) < 0.01 && counterValidPitches.length > 1) {
                        const idx = findScaleIndex(counterPitch, counterValidPitches);
                        if (idx !== -1) {
                            const dir = Math.random() > 0.5 ? 1 : -1;
                            let newIdx = idx + dir;
                            if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                                newIdx = idx - dir;
                            }
                            counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                        }
                    }

                    // Register Separation weight penalty of 0.1 if within 5 semitones of the current melody pitch
                    if (melodyPlays && pitch !== null) {
                        const rangeLimit = 3.1 * (12 / divisions);
                        const counterCandidates = counterValidPitches.filter(p => Math.abs(p - counterPitch) <= rangeLimit);
                        if (counterCandidates.length > 0) {
                            const weights = counterCandidates.map(p => {
                                let w = 1.0;
                                if (Math.abs(p - pitch) <= 5.0) {
                                    w *= 0.1;
                                }
                                return w;
                            });
                            counterPitch = selectWeightedPitch(counterCandidates, weights);
                        }
                    }

                    counterScheduled.push({
                        pitch: counterPitch,
                        stepTime,
                        noteDuration,
                        counterInst,
                        step
                    });
                    prevCounterPitch = counterPitch;
                }
            }
        }
    }

    // --- Empty Slot Mitigation Fallback ---
    // If no melody notes were scheduled, and the genre is not 'none',
    // force a single note on the downbeat (step 0) to ensure minimal melodic activity.
    if (melodyScheduled.length === 0 && settings.genre !== 'none') {
        const motifNote = sliceMotif[0];
        let pitch = findClosest(motifNote, validPitches);
        pitch = applyGenreRules(pitch, settings.genre, 0, validPitches, divisions);
        pitch = findClosest(pitch, validPitches);
        
        const melodyInst = state.instruments.melody || 'sine';
        const stepTime = time; // Downbeat
        const noteDuration = (chordSlotDuration / beats) * 0.9; // Approximate quarter note duration
        
        melodyScheduled.push({
            pitch,
            stepTime,
            noteDuration,
            melodyInst,
            step: 0
        });
        
        // Prevent repeated identical pitch from previous slot if possible
        if (globalPrevPitch !== null && Math.abs(pitch - globalPrevPitch) < 0.01) {
            const idx = findScaleIndex(pitch, validPitches);
            const dir = globalLastInterval >= 0 ? 1 : -1;
            let newIdx = idx + dir;
            if (newIdx < 0 || newIdx >= validPitches.length) {
                newIdx = idx - dir;
            }
            melodyScheduled[0].pitch = validPitches[Math.max(0, Math.min(validPitches.length - 1, newIdx))];
        }
    }

    // --- Identify Isolated Notes and snap to Chord/Scale Tones ---
    const gapThreshold = beatDuration * 0.95; // ~1 beat gap

    melodyScheduled.forEach((n, idx) => {
        const prevNote = idx > 0 ? melodyScheduled[idx - 1] : null;
        const nextNote = idx < melodyScheduled.length - 1 ? melodyScheduled[idx + 1] : null;

        const spaceBefore = prevNote ? (n.stepTime - prevNote.stepTime) : (n.stepTime - time);
        const spaceAfter = nextNote ? (nextNote.stepTime - n.stepTime) : (time + chordSlotDuration - n.stepTime);

        if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
            n.isIsolated = true;
            if (activeChordTones.length > 0) {
                n.pitch = findClosest(n.pitch, activeChordTones);
            } else {
                const baseScalePitches = validPitches.filter(p => isBaseScaleTone(p));
                if (baseScalePitches.length > 0) {
                    n.pitch = findClosest(n.pitch, baseScalePitches);
                }
            }
        }
    });

    // --- Apply Resolution Rules on the actual notes scheduled ---
    
    // Rule A: consequent phrase ending note resolves to root/3rd
    if (melodyScheduled.length > 0 && isConsequentPhrase && !isDominantChord(chordObj)) {
        const finalNote = melodyScheduled[melodyScheduled.length - 1];
        const stableTones = activeChordTones.filter(ct => {
            const diff = ((ct % divisions) - (chordKey % divisions) + divisions) % divisions;
            const norm = Math.round((diff / divisions) * 12);
            return [0, 3, 4].includes(norm);
        });
        if (stableTones.length > 0) {
            finalNote.pitch = findClosest(finalNote.pitch, stableTones);
        }
    }

    // Play/Schedule all collected melody notes
    melodyScheduled.forEach(n => {
        playToneFn(midiToFreq(n.pitch), n.stepTime, n.noteDuration, n.melodyInst, 'melody');
        if (!n.isIsolated) {
            applyOrnaments(n.pitch, n.stepTime, n.noteDuration, settings.genre, ornamentProb, n.melodyInst, 'melody', playToneFn);
        }
        debugNotes.push({ step: n.step, type: 'Melody', pitch: n.pitch });
        melodyHistory.push(n.pitch);
        if (melodyHistory.length > 32) {
            melodyHistory.shift();
        }
    });

    // Play/Schedule all collected countermelody notes
    counterScheduled.forEach(n => {
        playToneFn(midiToFreq(n.pitch), n.stepTime, n.noteDuration, n.counterInst, 'countermelody');
        debugNotes.push({ step: n.step, type: 'Counter', pitch: n.pitch });
    });

    // Save final state back to global variables
    if (melodyScheduled.length > 0) {
        const finalNote = melodyScheduled[melodyScheduled.length - 1];
        prevPitch = finalNote.pitch;
        if (melodyScheduled.length > 1) {
            const secondToLast = melodyScheduled[melodyScheduled.length - 2];
            lastInterval = prevPitch - secondToLast.pitch;
        } else if (globalPrevPitch !== null) {
            lastInterval = prevPitch - globalPrevPitch;
        } else {
            lastInterval = 0;
        }
    }
    
    globalPrevPitch = prevPitch;
    globalPrevCounterPitch = prevCounterPitch;
    globalLastInterval = lastInterval;

    // Track narrative state low register bars
    const melodyNotesThisSlot = debugNotes.filter(n => n.type === 'Melody');
    if (melodyNotesThisSlot.length > 0) {
        const avgPitch = melodyNotesThisSlot.reduce((sum, n) => sum + n.pitch, 0) / melodyNotesThisSlot.length;
        if (avgPitch < 72) {
            narrativeState.lowRegisterBars++;
        } else {
            narrativeState.lowRegisterBars = 0;
        }
    }

    // Check for leading tone at final scheduled step to set forceTonicNext (Rule B)
    if (melodyScheduled.length > 0 && isConsequentPhrase) {
        const finalNote = melodyScheduled[melodyScheduled.length - 1];
        if (isLeadingTone(finalNote.pitch, chordKey, periodSize)) {
            forceTonicNext = true;
        } else {
            forceTonicNext = false;
        }
    } else {
        forceTonicNext = false;
    }

    // Debug logging commented out but can be reactivated if needed for debugging
    // console.log(`[MelodyGen] Exit - globalPrevPitch: ${globalPrevPitch}`);
    // if (debugNotes.length > 0) {
    //     const melodyStr = debugNotes.filter(n => n.type === 'Melody').map(n => `${n.step}:${n.pitch}`).join(', ');
    //     const counterStr = debugNotes.filter(n => n.type === 'Counter').map(n => `${n.step}:${n.pitch}`).join(', ');
    //     console.log(`[MelodyGen] Chord: ${chordObj.symbol} | Bass PC: ${activeBassPc !== null ? activeBassPc : 'N/A'}`);
    //     if (melodyStr) console.log(`  └─ Melody: [${melodyStr}]`);
    //     if (counterStr) console.log(`  └─ Counter: [${counterStr}]`);
    // }
}

// Helpers
function getScaleIntervals(mode, genre = 'none') {
    if (genre === 'jazz') {
        const BEBOP_SCALES = {
            major: [0, 2, 4, 5, 7, 8, 9, 11],
            minor: [0, 2, 3, 4, 5, 7, 9, 10],
            dorian: [0, 2, 3, 4, 5, 7, 9, 10],
            mixolydian: [0, 2, 4, 5, 7, 9, 10, 11]
        };
        if (BEBOP_SCALES[mode]) return BEBOP_SCALES[mode];
    }

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
    const stepSize = 12.0 / divisions;
    const startStep = Math.round((start - keyRoot) / stepSize);
    const endStep = Math.round((end - keyRoot) / stepSize);
    
    for (let step = startStep; step <= endStep; step++) {
        const pitch = keyRoot + step * stepSize;
        const pc = (step % divisions + divisions) % divisions;
        const semitonePc = (pc * 12) / divisions;
        if (intervals.some(interval => Math.abs(interval - semitonePc) < (stepSize * 0.45))) {
            pitches.push(pitch);
        }
    }
    return pitches;
}

function generateMotifFamily(pool, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const hook = generateSeedMotif(pool, 4, chordTones, scalePitches, tuning);
    
    // Generate hook rhythmic skeleton (binary 4-element array, step 0 is always 1, at least one rest)
    const hookRhythm = [1, 0, 0, 0];
    let onesCount = 1;
    for (let i = 1; i < 4; i++) {
        if (Math.random() > 0.5 && onesCount < 3) {
            hookRhythm[i] = 1;
            onesCount++;
        }
    }

    const connector = [];
    if (hook.length >= 4) {
        connector.push(hook[2], hook[3]);
        const dir = hook[3] - hook[2];
        const stepSize = 12.0 / divisions;
        const target = hook[3] + (dir >= 0 ? 1 : -1) * stepSize * (Math.random() > 0.5 ? 2 : 1);
        connector.push(findClosest(target, scalePitches));
    } else {
        connector.push(...generateSeedMotif(pool, 3, chordTones, scalePitches, tuning));
    }

    const cadence = [];
    if (hook.length >= 4) {
        const reversed = [...hook].reverse();
        cadence.push(reversed[0]);
        for (let i = 1; i < reversed.length; i++) {
            const interval = reversed[i] - reversed[i - 1];
            const halvedTarget = cadence[i - 1] + (interval * 0.5);
            cadence.push(findClosest(halvedTarget, scalePitches));
        }
    } else {
        cadence.push(...generateSeedMotif(pool, 4, chordTones, scalePitches, tuning));
    }

    return { hook, connector, cadence, hookRhythm };
}

function mutateMotifFamily(motifFamily, pool, tuning) {
    const mutated = {
        hook: [...motifFamily.hook],
        connector: [...motifFamily.connector],
        cadence: [...motifFamily.cadence],
        hookRhythm: [...motifFamily.hookRhythm]
    };
    
    // Mutate one note in hook
    if (mutated.hook.length > 0 && pool.length > 0) {
        const idx = Math.floor(Math.random() * mutated.hook.length);
        const pitch = mutated.hook[idx];
        const scaleIdx = findScaleIndex(pitch, pool);
        if (scaleIdx !== -1) {
            const shift = Math.random() > 0.5 ? 1 : -1;
            const targetIdx = Math.max(0, Math.min(pool.length - 1, scaleIdx + shift));
            mutated.hook[idx] = pool[targetIdx];
        }
    }
    
    const divisions = tuning.divisions;
    
    mutated.connector = [];
    if (mutated.hook.length >= 4) {
        mutated.connector.push(mutated.hook[2], mutated.hook[3]);
        const dir = mutated.hook[3] - mutated.hook[2];
        const stepSize = 12.0 / divisions;
        const target = mutated.hook[3] + (dir >= 0 ? 1 : -1) * stepSize * (Math.random() > 0.5 ? 2 : 1);
        mutated.connector.push(findClosest(target, pool));
    } else {
        mutated.connector.push(...mutated.hook);
    }
    
    mutated.cadence = [];
    if (mutated.hook.length >= 4) {
        const reversed = [...mutated.hook].reverse();
        mutated.cadence.push(reversed[0]);
        for (let i = 1; i < reversed.length; i++) {
            const interval = reversed[i] - reversed[i - 1];
            const halvedTarget = mutated.cadence[i - 1] + (interval * 0.5);
            mutated.cadence.push(findClosest(halvedTarget, pool));
        }
    } else {
        mutated.cadence.push(...mutated.hook);
    }
    
    return mutated;
}

function generateSeedMotif(pool, size, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const motif = [];
    if (pool.length === 0) return motif;

    // Check if we have any chromatic chord tones relative to base key major/minor scale
    const keyRoot = Number(state.baseKey) || 60;
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none');
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    const chromaticChordTones = (chordTones || []).filter(ct => !isBaseScaleTone(ct));
    const isTest = state.melodySettings && state.melodySettings.genre === 'none';

    // Note 1: Must be a chord tone (root, 3rd, or 5th), prioritizing chromatic chord tones
    let note1;
    if (chromaticChordTones.length > 0) {
        note1 = isTest ? chromaticChordTones[0] : chromaticChordTones[Math.floor(Math.random() * chromaticChordTones.length)];
    } else {
        note1 = chordTones && chordTones.length > 0 ? 
            (isTest ? chordTones[0] : chordTones[Math.floor(Math.random() * chordTones.length)]) : 
            (isTest ? pool[0] : pool[Math.floor(Math.random() * pool.length)]);
    }
    motif.push(note1);

    // Note 2: Within major 3rd (±4 semitones) of Note 1, stepwise preferred
    const candidates2 = scalePitches.filter(p => Math.abs(p - note1) <= 4.01);
    const stepCandidates2 = candidates2.filter(p => Math.abs(p - note1) <= 2.01);
    let note2 = note1;
    if (isTest) {
        note2 = stepCandidates2.length > 0 ? stepCandidates2[0] : (candidates2.length > 0 ? candidates2[0] : note1);
    } else {
        note2 = candidates2.length > 0 ? candidates2[Math.floor(Math.random() * candidates2.length)] : note1;
        if (stepCandidates2.length > 0 && Math.random() < 0.7) {
            note2 = stepCandidates2[Math.floor(Math.random() * stepCandidates2.length)];
        }
    }
    motif.push(note2);

    // Note 3: Within perfect 4th (±5 semitones) of Note 2. If it leaps, resolve toward chord root (note1)
    const candidates3 = scalePitches.filter(p => Math.abs(p - note2) <= 5.01);
    const stepCandidates3 = candidates3.filter(p => Math.abs(p - note2) <= 2.01);
    let note3 = note2;
    if (isTest) {
        note3 = stepCandidates3.length > 0 ? stepCandidates3[0] : (candidates3.length > 0 ? candidates3[0] : note2);
    } else {
        note3 = candidates3.length > 0 ? candidates3[Math.floor(Math.random() * candidates3.length)] : note2;
        if (stepCandidates3.length > 0 && Math.random() < 0.7) {
            note3 = stepCandidates3[Math.floor(Math.random() * stepCandidates3.length)];
        }
        const isLeap = Math.abs(note3 - note2) > 2.01;
        if (isLeap) {
            const closerCandidates = candidates3.filter(p => Math.abs(p - note1) < Math.abs(note2 - note1));
            if (closerCandidates.length > 0) {
                note3 = closerCandidates[Math.floor(Math.random() * closerCandidates.length)];
            }
        }
    }
    motif.push(note3);

    // Note 4: Must resolve contrary to overall direction
    const overallDirection = note3 - note1;
    let note4 = note3;
    if (overallDirection > 0) {
        const downCandidates = scalePitches.filter(p => p < note3 && p >= note3 - 2.01);
        if (downCandidates.length > 0) note4 = downCandidates[0];
    } else if (overallDirection < 0) {
        const upCandidates = scalePitches.filter(p => p > note3 && p <= note3 + 2.01);
        if (upCandidates.length > 0) note4 = upCandidates[0];
    } else {
        if (isTest) {
            const idx = findScaleIndex(note3, scalePitches);
            note4 = idx !== -1 && idx > 0 ? scalePitches[idx - 1] : note3;
        } else {
            note4 = findClosestStep(note3, scalePitches, divisions);
        }
    }
    motif.push(note4);

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

function findScaleIndex(pitch, scalePitches) {
    if (!scalePitches) return -1;
    for (let i = 0; i < scalePitches.length; i++) {
        if (Math.abs(scalePitches[i] - pitch) < 0.01) {
            return i;
        }
    }
    return -1;
}

// Helper to deduce if a pitch is a leading tone relative to a key
function isLeadingTone(pitch, keyRoot, periodSize) {
    const pc = (pitch % periodSize + periodSize) % periodSize;
    const keyPc = (keyRoot % periodSize + periodSize) % periodSize;
    const diff = (pc - keyPc + periodSize) % periodSize;
    return Math.abs(diff - 11) < 1.01 || Math.abs(diff - 11.5) < 0.51;
}

function applySequence(motif, pool, shiftSteps) {
    return motif.map(note => {
        const idx = findScaleIndex(note, pool);
        if (idx === -1) return note;
        const targetIdx = Math.max(0, Math.min(pool.length - 1, idx + shiftSteps));
        return pool[targetIdx];
    });
}

function findClosest(val, array) {
    if (array.length === 0) return val;
    return array.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
}

function findClosestStep(prev, scalePitches, divisions) {
    if (scalePitches.length === 0) return prev;
    const idx = findScaleIndex(prev, scalePitches);
    if (idx === -1) {
        const closest = findClosest(prev, scalePitches);
        const cIdx = findScaleIndex(closest, scalePitches);
        return cIdx !== -1 ? scalePitches[cIdx] : scalePitches[0];
    }
    const direction = Math.random() > 0.5 ? 1 : -1;
    const step = Math.random() > 0.5 ? 2 : 1;
    let newIdx = idx + direction * step;
    if (newIdx < 0 || newIdx >= scalePitches.length) {
        newIdx = idx - direction * step;
    }
    return scalePitches[Math.max(0, Math.min(scalePitches.length - 1, newIdx))];
}

function isDominantChord(chordObj) {
    if (!chordObj || !chordObj.symbol) return false;
    const sym = chordObj.symbol.toLowerCase();
    return sym.includes('v') || sym.includes('vii') || sym.includes('7') || sym.includes('dom') || sym.includes('dim') || sym.includes('°') || sym.includes('ø');
}

function selectWeightedPitch(candidates, weights) {
    const settings = state.melodySettings;
    if (settings && settings.genre === 'none') {
        let maxW = -1;
        let bestIdx = 0;
        for (let i = 0; i < weights.length; i++) {
            if (weights[i] > maxW) {
                maxW = weights[i];
                bestIdx = i;
            }
        }
        return candidates[bestIdx];
    }
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) return candidates[Math.floor(Math.random() * candidates.length)];
    let r = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

function getCommonTones(notesA, notesB, periodSize) {
    if (!notesA || !notesB) return [];
    const pcsA = notesA.map(n => (n % periodSize + periodSize) % periodSize);
    const pcsB = notesB.map(n => (n % periodSize + periodSize) % periodSize);
    const commons = pcsA.filter(pc => pcsB.includes(pc));
    return notesA.filter(n => commons.includes((n % periodSize + periodSize) % periodSize));
}

function applyGenreRules(pitch, genre, step, scalePitches, divisions) {
    if (genre === 'blues') {
        if (step % 4 === 2 && Math.random() < 0.4) {
            return pitch - 0.5 * (12 / divisions);
        }
    }
    return pitch;
}

function applyOrnaments(pitch, stepTime, noteDuration, genre, intensity, inst, bus, playToneFn) {
    if (Math.random() > intensity) return;

    if (genre === 'classical' && Math.random() < 0.5) {
        const gracePitch = pitch - 1;
        playToneFn(midiToFreq(gracePitch), stepTime - 0.05, 0.04, inst, bus);
    } else if (genre === 'blues' && Math.random() < 0.4) {
        const bendPitch = pitch - 0.5;
        playToneFn(midiToFreq(bendPitch), stepTime, noteDuration * 0.3, inst, bus);
    }
}

// Generate phrase-wide beat subdivision blueprints
function generatePhraseSubdivisions(genre) {
    if (genre === 'none') {
        return Array(16).fill(4);
    }
    const profiles = ['acceleration', 'deceleration', 'syncopatedAlternation', 'tripletSwing'];
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    const subs = [];
    
    // Fill 16 beats (4 chords * 4 beats)
    for (let i = 0; i < 16; i++) {
        if (profile === 'acceleration') {
            if (i < 4) {
                subs.push(Math.random() < 0.7 ? 2 : 1);
            } else if (i < 9) {
                subs.push(Math.random() < 0.6 ? 4 : 3);
            } else if (i < 13) {
                subs.push(Math.random() < 0.5 ? 6 : 8);
            } else {
                subs.push(Math.random() < 0.7 ? 2 : 1);
            }
        } else if (profile === 'deceleration') {
            if (i < 6) {
                subs.push(Math.random() < 0.7 ? 4 : 6);
            } else if (i < 12) {
                subs.push(Math.random() < 0.6 ? 3 : 2);
            } else {
                subs.push(1);
            }
        } else if (profile === 'syncopatedAlternation') {
            subs.push(i % 2 === 0 ? 2 : 4);
        } else {
            subs.push(Math.random() < 0.7 ? 3 : 6);
        }
    }
    return subs;
}

function generateMotifFamilyFromUser(userMotif, pool, activeChordTones, validPitches, tuning) {
    const keyRoot = Number(state.baseKey) || 60;
    const divisions = tuning.divisions;
    
    // Sort notes chronologically
    const sortedNotes = [...userMotif.notes]
        .filter(n => !n.voiceIndex) // voiceIndex 0 or undefined
        .sort((a, b) => a.time - b.time);

    // Extract pitch values conformed to the current chord key/pool
    const hook = sortedNotes.map(n => {
        let rawPitch = keyRoot + (n.pitchOffset || 0);
        return findClosest(rawPitch, validPitches);
    });

    const hookRhythm = Array(16).fill(0);
    sortedNotes.forEach(n => {
        const step = Math.round((n.time % 4.0) * 4) % 16;
        hookRhythm[step] = 1;
    });

    if (hookRhythm.every(r => r === 0)) {
        hookRhythm[0] = 1;
    }

    // Connectors and Cadences can be retrograde or inverted variations
    const connector = hook.map((p, idx) => {
        const shift = idx % 2 === 0 ? 2 : -2;
        return findClosest(p + shift, validPitches);
    });

    const cadence = [...hook].reverse().map((p, idx) => {
        const shift = idx % 2 === 0 ? -1 : 1;
        return findClosest(p + shift, validPitches);
    });

    return { hook, connector, cadence, hookRhythm };
}

