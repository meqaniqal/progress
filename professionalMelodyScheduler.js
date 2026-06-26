// NOTE: Melody construction is strictly CHORD-DRIVEN. 
// The global scale/key from the chord chooser is NOT the source of truth for melody generation.
// Pitch selection is guided primarily by the chord notes themselves and surrounding chords as context.
import { state } from './store.js';
import { getChordNotes, getEffectiveTuning, midiToFreq, deduceSourceMode } from './theory.js';
import { playTone } from './synth.js';
import {
    getScaleIntervals,
    buildScalePitches,
    findScaleIndex,
    findClosest,
    findClosestStep,
    isPassingContext,
    getLocalScaleMode,
    getStableTones
} from './melodyTuning.js';
import { generateRhythmTemplate } from './melodyRhythm.js';
import { generateCountermelodyNote } from './melodyCountermelody.js';
import { applyOrnaments, applyMotivicFlexing } from './melodyGenreRules.js';

// --- Stage 0: Phrase Architecture Planning (64-step phrase) ---
function easeInQuad(x) { return x * x; }
function easeOutQuad(x) { return 1 - (1 - x) * (1 - x); }
function easeInCubic(x) { return x * x * x; }
function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }

function planPhraseArchitecture(context, absIndex, settings, chordNotes, stepsPerBeat, beats) {
    const rng = context.rng;
    const arch = context.proPhraseArch;
    
    // Total steps for a 4-bar phrase dynamically scales with stepsPerBeat and beats
    arch.phraseLengthSteps = 4 * beats * stepsPerBeat;
    arch.cadenceStartStep = arch.phraseLengthSteps - stepsPerBeat;

    // 1. Contour selection
    const rand = rng.next();
    if (rand < 0.40) arch.contourShape = 'ARCH';
    else if (rand < 0.60) arch.contourShape = 'ASCENDING';
    else if (rand < 0.80) arch.contourShape = 'DESCENDING';
    else arch.contourShape = 'INV_ARCH';

    // 2. Phrase Type / Cadence Target
    if (Math.floor(absIndex / 4) % 2 === 0) {
        arch.phraseType = 'ANTECEDENT';
        arch.cadenceTarget = 'HALF';
        arch.cadenceMelodyDeg = 2;
    } else {
        arch.phraseType = 'CONSEQUENT';
        arch.cadenceTarget = 'AUTHENTIC';
        arch.cadenceMelodyDeg = 1;
    }

    // 3. Climax Placement (around 60% of the phrase steps)
    let climaxRatio = 0.6;
    if (arch.contourShape === 'ARCH') climaxRatio = 0.55 + rng.next() * 0.15;
    arch.climaxStep = Math.round(climaxRatio * arch.phraseLengthSteps);

    // 4. Climax Pitch
    const rangeMin = settings.rangeMin || 48;
    const rangeMax = settings.rangeMax || 72;
    const tessituraCenter = (rangeMin + rangeMax) / 2;
    arch.climaxPitch = rangeMax - 4;

    // 5. Tension Curve
    arch.tensionCurve = [];
    for (let step = 0; step < arch.phraseLengthSteps; step++) {
        const progress = step / arch.phraseLengthSteps;
        let baseTension = Math.sin(progress * Math.PI);
        if (step >= arch.cadenceStartStep) {
            const cadenceProgress = (step - arch.cadenceStartStep) / (arch.phraseLengthSteps - arch.cadenceStartStep);
            baseTension = Math.max(baseTension, Math.sin(cadenceProgress * Math.PI));
        }
        arch.tensionCurve.push(baseTension);
    }

    // Reset trackers
    const reg = context.proRegisterTracker;
    reg.phrasePeak = rangeMin;
    reg.phraseFloor = rangeMax;
    reg.climaxDelivered = false;
    reg.stepsAtPeak = 0;
    reg.recent = [];
    reg.lastLeapStep = -1;
}

function computeContourTarget(step, arch, tessituraCenter) {
    const progress = step / arch.phraseLengthSteps;
    const climaxProgress = arch.climaxStep / arch.phraseLengthSteps;

    if (progress < climaxProgress) {
        const t = progress / climaxProgress;
        return lerp(tessituraCenter, arch.climaxPitch, easeInQuad(t));
    } else {
        const t = (progress - climaxProgress) / (1.0 - climaxProgress);
        return lerp(arch.climaxPitch, tessituraCenter - 2, easeOutQuad(t));
    }
}

export function scheduleMelody(
    context,
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
    if (!settings || !settings.enabled) return [];

    const rng = context.rng;
    const divisions = state.divisions || 12;
    const semitone = 12 / divisions;

    const arch = context.proPhraseArch;
    const tension = context.proTensionTracker;
    const reg = context.proRegisterTracker;
    const rhythm = context.proRhythmicCohesion;

    const shortestLimitStep = settings.maxNoteSpeed || settings.shortestNoteLimit || 16;
    let stepsPerBeat = 4;
    if (shortestLimitStep === 32) stepsPerBeat = 8;
    else if (shortestLimitStep === 64) stepsPerBeat = 16;

    // Plan phrase arch at start of a 4-bar phrase
    const isNewPhrase = (absIndex % 4 === 0) || arch.climaxStep === null;
    if (isNewPhrase) {
        planPhraseArchitecture(context, absIndex, settings, chordNotes, stepsPerBeat, beats);
    }

    // Rhythm: Use dynamic subdivisions and templates for rich, active rhythms
    const totalSteps = beats * stepsPerBeat;
    const stepDuration = chordSlotDuration / totalSteps;

    // Build the grid steps
    const gridSteps = [];
    for (let step = 0; step < totalSteps; step++) {
        const stepTime = time + step * stepDuration;
        gridSteps.push({
            step,
            sixteenthStep: (absIndex % 4) * totalSteps + step, // Global step index in 4-bar phrase
            stepTime,
            noteDuration: stepDuration,
            beat: Math.floor(step / stepsPerBeat)
        });
    }

    const activeMotif = state.userMotifs && settings.activeMotifId ? state.userMotifs.find(m => m.id === settings.activeMotifId) : null;
    const useMotifRhythm = settings.seedSource === 'motif' && activeMotif;

    // Determine plays map based on density and rest probability
    const stepPlaysMap = {};
    const playProb = 0.1 + settings.density * 0.9;

    if (useMotifRhythm) {
        gridSteps.forEach(g => {
            stepPlaysMap[g.step] = false;
        });
        const motifLengthBeats = Math.max(...activeMotif.notes.map(n => n.time + n.duration), 4.0);
        const slotStartBeatInPhrase = (absIndex % 4) * beats;
        activeMotif.notes.forEach(note => {
            const reps = Math.ceil(16.0 / motifLengthBeats);
            for (let r = 0; r < reps; r++) {
                const noteBeat = note.time + r * motifLengthBeats;
                if (noteBeat >= slotStartBeatInPhrase && noteBeat < slotStartBeatInPhrase + beats) {
                    const relativeBeat = noteBeat - slotStartBeatInPhrase;
                    const targetStep = Math.round(relativeBeat * stepsPerBeat);
                    if (targetStep >= 0 && targetStep < totalSteps) {
                        stepPlaysMap[targetStep] = true;
                    }
                }
            }
        });
    } else {
        gridSteps.forEach(g => {
            let allowed = true;
            let stepMaxSpeed = shortestLimitStep;

            // 80% chance of max speed, 20% chance of 1 level below (when not at maximum density settings).
            if (settings.density < 0.95 && rng.next() < 0.20) {
                if (shortestLimitStep === 64) stepMaxSpeed = 32;
                else if (shortestLimitStep === 32) stepMaxSpeed = 16;
                else if (shortestLimitStep === 16) stepMaxSpeed = 8;
                else if (shortestLimitStep === 8) stepMaxSpeed = 4;
            }

            if (shortestLimitStep === 12) {
                if (g.step % 2 !== 0) allowed = false;
            } else if (shortestLimitStep === 6) {
                if (g.step % 4 !== 0) allowed = false;
            } else {
                const stepInterval = (4 * stepsPerBeat) / stepMaxSpeed;
                if (g.step % stepInterval !== 0) allowed = false;
            }

            const isPlaying = allowed && (rng.next() < playProb && rng.next() >= settings.restProbability);
            stepPlaysMap[g.step] = isPlaying;
        });
    }

    // Chromatic Support Gate: Pre-pass to ensure blue notes are surrounded by active steps
    if (settings.genre === 'blues') {
        for (let i = 1; i < gridSteps.length - 1; i++) {
            const stepVal = gridSteps[i].step;
            if (stepPlaysMap[stepVal]) {
                // If it is a weak beat and we have a chance to inflect, force the surrounding notes
                if (stepVal % 4 === 2 && rng.next() < 0.3) {
                    stepPlaysMap[gridSteps[i - 1].step] = true;
                    stepPlaysMap[gridSteps[i + 1].step] = true;
                }
            }
        }
    }

    const chordRoot = chordNotes.length > 0 ? chordNotes[0] : 60;
    const chordTonePcSet = new Set(chordNotes.map(n => Math.round(((n % 12 + 12) % 12) * 100) / 100));
    
    const rangeMin = settings.rangeMin || 48;
    const rangeMax = settings.rangeMax || 72;
    const tessituraCenter = (rangeMin + rangeMax) / 2;

    const scaleMode = getLocalScaleMode(chordObj.quality || 'major', settings.genre);
    const intervals = getScaleIntervals(scaleMode, settings.genre, divisions);
    const validPitches = buildScalePitches(chordRoot, intervals, divisions, rangeMin, rangeMax, 12);
    const activeScalePcSet = new Set(validPitches.map(p => Math.round(((p % 12 + 12) % 12) * 100) / 100));

    const melodyScheduled = [];
    const counterScheduled = [];
    let prevPitch = context.globalPrevPitch !== null ? context.globalPrevPitch : tessituraCenter;
    let prevCounterPitch = context.globalPrevCounterPitch !== null ? context.globalPrevCounterPitch : tessituraCenter - 12;

    let forcedResolutionPitch = null;
    let lastBluePitch = null;
    let b5ResolutionDirection = null;
    let b3ResolutionForced = false;
    let prevWasBlue = false;

    // NCT Tracking
    let currentNCTType = 'NONE';
    let nextNCTResolutionStep = -1;
    let nctTargetPitch = null;

    gridSteps.forEach((g, gIndex) => {
        let melodyPlays = stepPlaysMap[g.step];
        let playCounter = false;

        // Countermelody play triggers
        if (settings.countermelodyEnabled) {
            const activeDensityVal = settings.density !== undefined ? settings.density : 0.5;
            const counterPlayProb = 0.25 + activeDensityVal * 0.15;
            if (rng.next() < counterPlayProb) playCounter = true;
        }

        let pitch = prevPitch;
        if (melodyPlays) {
            let effectiveValidPitches = validPitches;
            const isIsolated = (gIndex > 0 && !stepPlaysMap[gridSteps[gIndex - 1].step]) && 
                               (gIndex < gridSteps.length - 1 && !stepPlaysMap[gridSteps[gIndex + 1].step]);

            const chordTones = validPitches.filter(p => chordTonePcSet.has(Math.round(((p % 12 + 12) % 12) * 100) / 100));

            // Stage 2: Non-Chord Tone (NCT) taxonomy pre-gating
            if (isIsolated) {
                effectiveValidPitches = chordTones.length > 0 ? chordTones : validPitches;
            } else if (g.step % 4 === 0) {
                // Downbeats prefer chord tones
                if (tension.value > 0.4 && rng.next() < 0.2 && chordTones.includes(prevPitch)) {
                    effectiveValidPitches = [prevPitch];
                    currentNCTType = 'SUSPENSION';
                    nextNCTResolutionStep = g.sixteenthStep + 1;
                    nctTargetPitch = prevPitch - semitone;
                } else {
                    effectiveValidPitches = chordTones.length > 0 ? chordTones : validPitches;
                }
            } else if (g.step % 2 === 1) {
                // Weak beats allow passing tones and neighbors
                if (rng.next() < 0.4) {
                    currentNCTType = 'PASSING_TONE';
                } else if (rng.next() < 0.2) {
                    const neighborDir = tension.value > 0.5 ? 1 : -1;
                    const neighborCandidates = [prevPitch + neighborDir * semitone, prevPitch + neighborDir * 2 * semitone].filter(p => p >= rangeMin && p <= rangeMax);
                    // Constrain neighbor tones to current chord/scale context to avoid off-key notes
                    if (chordTones.length > 0) {
                        // Prefer chord tones that are stepwise from prevPitch
                        const stepwiseChordTones = chordTones.filter(p => Math.abs(p - prevPitch) <= 2 * semitone);
                        effectiveValidPitches = stepwiseChordTones.length > 0 ? stepwiseChordTones : chordTones;
                    } else {
                        effectiveValidPitches = neighborCandidates.length > 0 ? neighborCandidates : validPitches;
                    }
                    currentNCTType = 'NEIGHBOR_TONE';
                }
            }

            if (effectiveValidPitches.length === 0) {
                effectiveValidPitches = validPitches;
            }

            // Stage 3: Pitch Selection
            if (b5ResolutionDirection !== null && lastBluePitch !== null) {
                pitch = lastBluePitch + b5ResolutionDirection;
                b5ResolutionDirection = null;
            } else if (b3ResolutionForced && lastBluePitch !== null) {
                pitch = lastBluePitch + semitone;
                b3ResolutionForced = false;
            } else if (forcedResolutionPitch !== null) {
                pitch = findClosest(forcedResolutionPitch, effectiveValidPitches);
                forcedResolutionPitch = null;
            } else if (nextNCTResolutionStep === g.sixteenthStep && nctTargetPitch !== null) {
                pitch = findClosest(nctTargetPitch, effectiveValidPitches);
                nextNCTResolutionStep = -1;
                nctTargetPitch = null;
                currentNCTType = 'NONE';
            } else {
                // Steer towards phrase arch climax
                if (g.sixteenthStep === arch.climaxStep && !reg.climaxDelivered) {
                    pitch = findClosest(arch.climaxPitch, effectiveValidPitches);
                    reg.climaxDelivered = true;
                } else {
                    const contourTarget = computeContourTarget(g.sixteenthStep, arch, tessituraCenter);
                    pitch = findClosest(contourTarget, effectiveValidPitches);
                }
            }

            // Prevent excessive pitch repetitions
            let repeats = 0;
            for (let i = melodyScheduled.length - 1; i >= 0; i--) {
                if (melodyScheduled[i].pitch === prevPitch) {
                    repeats++;
                } else {
                    break;
                }
            }
            const maxRepeatsAllowed = stepsPerBeat >= 8 ? 1 : 2;
            if (repeats >= maxRepeatsAllowed && pitch === prevPitch) {
                const contourTarget = computeContourTarget(g.sixteenthStep, arch, tessituraCenter);
                const direction = contourTarget >= prevPitch ? 1 : -1;
                const prevPrevPitch = melodyScheduled.length >= 2 ? melodyScheduled[melodyScheduled.length - 2].pitch : null;

                let directionalPitches = effectiveValidPitches.filter(p => {
                    if (prevPrevPitch !== null && p === prevPrevPitch) return false;
                    return direction > 0 ? p > prevPitch : p < prevPitch;
                });

                if (directionalPitches.length === 0) {
                    directionalPitches = effectiveValidPitches.filter(p => {
                        if (prevPrevPitch !== null && p === prevPrevPitch) return false;
                        return direction > 0 ? p < prevPitch : p > prevPitch;
                    });
                }

                if (directionalPitches.length === 0) {
                    directionalPitches = effectiveValidPitches.filter(p => direction > 0 ? p > prevPitch : p < prevPitch);
                }
                if (directionalPitches.length === 0) {
                    directionalPitches = effectiveValidPitches.filter(p => direction > 0 ? p < prevPitch : p > prevPitch);
                }

                if (directionalPitches.length > 0) {
                    pitch = findClosest(prevPitch, directionalPitches);
                }
            }

            // Leap contrary resolution constraint
            if (Math.abs(pitch - prevPitch) >= 4 * semitone) {
                forcedResolutionPitch = pitch - Math.sign(pitch - prevPitch) * semitone * 2;
            }

            // Stage 4: Blues Chromatic Alterations
            const hasStepwiseSupport = (gIndex > 0 && stepPlaysMap[gridSteps[gIndex - 1].step]) &&
                                       (gIndex < gridSteps.length - 1 && stepPlaysMap[gridSteps[gIndex + 1].step]);

            if (settings.genre === 'blues' && !prevWasBlue && hasStepwiseSupport) {
                const proposedBlue = pitch - semitone;
                const proposedPc = Math.round((((proposedBlue - chordRoot) % 12 + 12) % 12) * 100) / 100;
                const isB5 = Math.abs(proposedPc - 6) < 0.1;
                const isB3 = Math.abs(proposedPc - 3) < 0.1;

                if (isB5 && Math.abs(Math.abs(prevPitch - proposedBlue) - semitone) < 0.05) {
                    pitch = proposedBlue;
                    b5ResolutionDirection = proposedBlue - prevPitch;
                    prevWasBlue = true;
                    lastBluePitch = pitch;
                } else if (isB3) {
                    pitch = proposedBlue;
                    b3ResolutionForced = true;
                    prevWasBlue = true;
                    lastBluePitch = pitch;
                }
            } else {
                prevWasBlue = false;
            }

            // Stage 6: Tension update
            let currentTension = 0.0;
            if (currentNCTType !== 'NONE') {
                currentTension += 0.25;
            }
            if (pitch > tessituraCenter + 7) {
                currentTension += 0.15;
            }
            tension.value = lerp(tension.value, currentTension, 0.3);

            // Stage 8: Cadential Resolution at end of phrase
            const stepsFromEnd = arch.phraseLengthSteps - g.sixteenthStep;
            if (stepsFromEnd <= 2) {
                if (arch.cadenceTarget === 'AUTHENTIC' && stepsFromEnd === 1) {
                    pitch = findClosest(chordRoot, effectiveValidPitches);
                } else if (arch.cadenceTarget === 'HALF' && stepsFromEnd === 1) {
                    pitch = findClosest(chordRoot + 7, effectiveValidPitches);
                }
            }

            const melodyInst = state.instruments.melody || 'sine';
            melodyScheduled.push({
                pitch,
                stepTime: g.stepTime,
                noteDuration: g.noteDuration,
                melodyInst,
                step: g.step,
                sixteenthStep: g.sixteenthStep,
                isIsolated,
                isAnchor1Step: g.step === 0,
                isAnchor2Step: (arch.phraseLengthSteps - g.sixteenthStep <= 2)
            });

            prevPitch = pitch;
        }

        // Schedule countermelody using legacy countermelody generator
        if (playCounter) {
            const counterInst = state.instruments.countermelody || 'sine';
            const counterValidPitches = buildScalePitches(chordRoot - 12, intervals, divisions, rangeMin - 12, rangeMax - 12, 12);
            const counterActiveChordTones = getStableTones(chordNotes.map(n => n - 12), chordRoot - 12, chordRoot - 12, 12, counterValidPitches);
            const slotState = {
                g,
                melodyPlays,
                pitch,
                lastInterval: 0,
                prevCounterPitch,
                counterValidPitches,
                divisions,
                keyRoot: chordRoot,
                periodSize: 12,
                settings,
                slotAestheticMode: 'cantabile',
                counterActiveChordTones,
                isolatedCounterStepsSet: new Set(),
                chordKey: chordRoot,
                validPitches,
                activeScalePcSet,
                chordTonePcSet,
                currentTension: tension.value,
                activeTransition: null,
                state,
                counterScheduled,
                melodyHistory: []
            };
            generateCountermelodyNote(context, slotState);
            prevCounterPitch = slotState.prevCounterPitch;
        }
    });

    // Post-process flexing
    if (settings.genre !== 'classical') {
        applyMotivicFlexing(melodyScheduled, activeScalePcSet, chordTonePcSet, 12, divisions);
    }

    // Play/Schedule all notes
    melodyScheduled.forEach((n, idx) => {
        const nextTime = (idx < melodyScheduled.length - 1) ? melodyScheduled[idx + 1].stepTime : (time + chordSlotDuration);
        const gapAfter = nextTime - (n.stepTime + n.noteDuration);
        playToneFn(midiToFreq(n.pitch), n.stepTime, n.noteDuration, n.melodyInst, 'melody', 0, 1.0, { gapAfter, step: n.step, isAnchor1Step: n.isAnchor1Step, isAnchor2Step: n.isAnchor2Step });
        
        const prevNote = idx > 0 ? melodyScheduled[idx - 1] : null;
        const spaceBefore = prevNote ? (n.stepTime - (prevNote.stepTime + prevNote.noteDuration)) : 1.0;
        const isDownbeat = (n.step % stepsPerBeat === 0);
        if (!n.isIsolated && spaceBefore >= 0.08 && isDownbeat) {
            applyOrnaments(n.pitch, n.stepTime, n.noteDuration, settings.genre, settings.ornamentIntensity, n.melodyInst, 'melody', playToneFn, rng, validPitches);
        }
    });

    counterScheduled.forEach((n, idx) => {
        const nextTime = (idx < counterScheduled.length - 1) ? counterScheduled[idx + 1].stepTime : (time + chordSlotDuration);
        const gapAfter = nextTime - (n.stepTime + n.noteDuration);
        playToneFn(midiToFreq(n.pitch), n.stepTime, n.noteDuration, n.counterInst, 'countermelody', 0, 1.0, { gapAfter, step: n.step });
    });

    if (melodyScheduled.length > 0) {
        context.globalPrevPitch = melodyScheduled[melodyScheduled.length - 1].pitch;
    }
    context.globalPrevCounterPitch = prevCounterPitch;

    return melodyScheduled;
}
