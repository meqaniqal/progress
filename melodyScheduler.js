import { state } from './store.js';
import { getChordNotes, getEffectiveTuning, midiToFreq, deduceSourceMode, getBassNote } from './theory.js';
import { playTone } from './synth.js';

import {
    getScaleIntervals,
    buildScalePitches,
    findScaleIndex,
    isLeadingTone,
    findClosest,
    findClosestStep,
    isDominantChord,
    selectWeightedPitch,
    getStableTones,
    enforceChordToneOnDownbeat,
    isChordTonePC,
    planPhraseStructuralSkeleton,
    getConstrainedAnchorGlobal,
    isPassingContext,
    getPreferredIntervalBias,
    deduceChordRootAndQuality,
    getLocalScaleMode,
    planMacroMelodyTargets,
    findDirectedStep
} from './melodyTuning.js';

import {
    generatePhraseSubdivisions,
    generateRhythmTemplate
} from './melodyRhythm.js';

import {
    generateMotifFamily,
    mutateMotifFamily,
    generateMotifFamilyFromUser,
    applyInversion,
    applyRetrograde,
    applySequence,
    generateRhythmicMotif,
    realizeMotifinContext,
    applyRhythmicVariation,
    applyPartialRecall,
    applyMotivicExtension
} from './melodyMotifs.js';

import {
    applyGenreRules,
    applyOrnaments,
    applyMotivicFlexing
} from './melodyGenreRules.js';


import { createRNG } from './melodyRandom.js';
import { defaultContext } from './melodyContext.js';
import { determineAestheticMode, planCountermelodyDirection, handleSongForm, resolveMotifFamily } from './melodyMacro.js';
import { generateCountermelodyNote } from './melodyCountermelody.js';

const MAX_COUNTER_NOTES_PER_SLOT = 8;



/**
 * Main entry point to generate and schedule melody and countermelody notes for a chord slot.
 */
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
    if (!settings || !settings.enabled) return;

    // Debug logging commented out but can be reactivated if needed for debugging
    // console.log(`[MelodyGen] Entry - globalPrevPitch: ${globalPrevPitch}`);

    // Check if we should disable during Arpeggiators
    const hasArp = chordObj.arpSettings && chordObj.arpSettings.pattern !== 'none';
    if (hasArp && settings.behaviorDuringArp === 'off') return;

    // Check if we should disable during transitions
    const hasTransition = chordObj.chordPattern && chordObj.chordPattern.transitions && chordObj.chordPattern.transitions.length > 0;
    if (hasTransition && settings.behaviorDuringTransitions === 'off') return;

    const rng = context.rng;

    let {
        motifCache,
        counterPhraseDirectionBias,
        counterPhraseStepsRemaining,
        counterLastPitch,
        songFormSection,
        sectionAMotifFamily,
        sectionARhythmTemplate,
        sectionAAestheticMode,
        sectionAChordRootPitch,
        stepsSinceLastSurprise,
        noteCountThisPhrase,
        forceContraryNext,
        forceTonicNext,
        globalPrevPitch,
        globalPrevCounterPitch,
        globalLastInterval,
        globalMelodyHistory,
        phraseLocalScaleOffset,
        globalPrevPitchIsColor,
        macroTargetPlan,
        phraseHighestPitch,
        songHighestPitch,
        peakPitchHitsCount,
        activeAestheticMode,
        phraseActivityCurve,
        phraseRhythmTemplate,
        phraseCounterRhythmTemplate,
        globalPrevAnchor,
        phraseRhythmicMotif,
        previousAbsIndex,
        progressionLoopCounter,
        prevSlotEndedWithRun,
        prevSlotRunRemainingLength,
        prevSlotLastPitch,
        globalLastMelodyNoteTime,
        globalLastCountermelodyNoteTime,
        narrativeState
    } = context;

    // Determine EDO tuning and key
    const tuning = getEffectiveTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const keyRoot = chordObj.key !== undefined ? Number(chordObj.key) : (Number(state.baseKey) || 60);

    if (divisions === 12 && chordNotes) {
        chordNotes = chordNotes.map((n, i) => {
            if (chordObj.customNotes && chordObj.customNotes[i]) {
                const customNote = chordObj.customNotes[i];
                if (customNote && customNote.isMicrotonal) return n;
            }
            return Math.round(n);
        });
    }

    // Initialize macro Target Plan if enabled
    if (settings.macroPlannerEnabled) {
        macroTargetPlan = planMacroMelodyTargets(totalChords, keyRoot, divisions, state.mode || 'major', settings);
    }

    // Reset phrase bound motif index at phrase start boundaries and select phrase aesthetic mode
    determineAestheticMode(context, absIndex, totalChords, settings, chordObj, divisions, keyRoot);
    activeAestheticMode = context.activeAestheticMode;
    phraseActivityCurve = context.phraseActivityCurve;
    phraseRhythmTemplate = context.phraseRhythmTemplate;
    phraseCounterRhythmTemplate = context.phraseCounterRhythmTemplate;
    phraseLocalScaleOffset = context.phraseLocalScaleOffset;
    narrativeState = context.narrativeState;
    noteCountThisPhrase = context.noteCountThisPhrase;
    phraseHighestPitch = context.phraseHighestPitch;
    peakPitchHitsCount = context.peakPitchHitsCount;

    // Plan countermelody direction
    planCountermelodyDirection(context, absIndex, keyRoot);
    counterPhraseDirectionBias = context.counterPhraseDirectionBias;
    counterPhraseStepsRemaining = context.counterPhraseStepsRemaining;

    // --- 5. Multi-Parameter Tension Curve Automation ---
    const progressVal = absIndex / Math.max(1, totalChords);
    const tensionCurveValue = settings.tensionCurve === 'arch' ? Math.sin(progressVal * Math.PI) : 0.5;
    const currentTension = Math.max(0.0, Math.min(1.0, settings.density * 0.4 + tensionCurveValue * 0.6));

    let slotAestheticMode = activeAestheticMode;
    if (absIndex % 4 !== 0 && settings.macroPlannerEnabled && macroTargetPlan && macroTargetPlan[absIndex]) {
        const slotRole = macroTargetPlan[absIndex].role;
        if (slotRole === 'climax') {
            slotAestheticMode = 'virtuoso';
        } else if (slotRole === 'resolution') {
            slotAestheticMode = 'cantabile';
        }
    }
    const slotActivity = (phraseActivityCurve && phraseActivityCurve.length > (absIndex % 4)) ? phraseActivityCurve[absIndex % 4] : currentTension;

    // Automation mappings (enforce 0.2 density floor so slots aren't fully silent)
    let activeDensity = Math.max(0.2, settings.density * (0.3 + currentTension * 0.7));
    let ornamentProb = currentTension * (settings.ornamentIntensity || 0.5);
    let restProbability = settings.restProbability;

    let macroSlotTarget = null;
    let activeRole = 'statement';
    if (settings.macroPlannerEnabled && macroTargetPlan) {
        macroSlotTarget = macroTargetPlan[absIndex];
        if (macroSlotTarget) {
            activeRole = macroSlotTarget.role;
            if (activeRole === 'climax' || activeRole === 'build') {
                activeDensity = Math.max(0.65, activeDensity);
                restProbability = settings.restProbability * 0.4;
            } else if (activeRole === 'release' || activeRole === 'resolution') {
                activeDensity = Math.min(0.35, activeDensity);
                restProbability = Math.max(settings.restProbability, 0.45 + (settings.restProbability * 0.55));
            }
        }
    }


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

    const baseChordKey = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;
    let chordKey = baseChordKey;
    let chordMode = deduceSourceMode(chordObj.symbol, state.mode || 'major') || state.mode || 'major';
    let scaleIntervals = getScaleIntervals(chordMode, settings.genre, divisions);

    // Calculate custom offsets for pitch classes based on the difference between custom chordNotes and standard chord notes
    const pcOffsets = {};
    const standardNotes = getChordNotes(chordObj.symbol, baseChordKey, divisions) || [];
    if (standardNotes.length > 0 && chordNotes && chordNotes.length > 0) {
        chordNotes.forEach(customNote => {
            const customPc = (customNote % periodSize + periodSize) % periodSize;
            let bestStdNote = null;
            let minDiff = Infinity;
            standardNotes.forEach(stdNote => {
                const stdPc = (stdNote % periodSize + periodSize) % periodSize;
                let diff = Math.abs(customPc - stdPc);
                if (diff > periodSize / 2) diff = periodSize - diff;
                if (diff < minDiff) {
                    minDiff = diff;
                    bestStdNote = stdNote;
                }
            });
            if (bestStdNote !== null && minDiff < 1.5) {
                const stdPc = (bestStdNote % periodSize + periodSize) % periodSize;
                const pcDiff = customPc - stdPc;
                let normPcDiff = pcDiff;
                while (normPcDiff > periodSize / 2) normPcDiff -= periodSize;
                while (normPcDiff < -periodSize / 2) normPcDiff += periodSize;
                pcOffsets[Math.round(stdPc * 100) / 100] = normPcDiff;
            }
        });
    }

    const adjustScalePitches = (pitches) => {
        return pitches.map(p => {
            const pc = (p % periodSize + periodSize) % periodSize;
            let matchedOffset = 0;
            let minDiff = Infinity;
            for (const stdPcStr in pcOffsets) {
                const stdPc = parseFloat(stdPcStr);
                let diff = Math.abs(pc - stdPc);
                if (diff > periodSize / 2) diff = periodSize - diff;
                if (diff < minDiff && diff < 0.1) {
                    minDiff = diff;
                    matchedOffset = pcOffsets[stdPcStr];
                }
            }
            return p + matchedOffset;
        });
    };

    // Build global pools for Melody
    const globalScaleIntervals = getScaleIntervals(state.mode || 'major', settings.genre, divisions);
    const globalScalePitchesRaw = buildScalePitches(keyRoot, globalScaleIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
    const globalScalePitches = adjustScalePitches(globalScalePitchesRaw);
    const globalScalePcSet = new Set(globalScalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

    // Dynamic Scale Center Selection: Local Chord-Scale vs Global Scale (phrase-level, and bypass during recapitulation)
    let isLocalScale = false;
    const isRecap = (progressVal > 0.9);
    const parsedChord = deduceChordRootAndQuality(chordObj.symbol, baseChordKey, divisions);
    if (parsedChord && phraseLocalScaleOffset !== -1 && (absIndex % 4) === phraseLocalScaleOffset && !isRecap && settings.genre !== 'none') {
        const candidateMode = getLocalScaleMode(parsedChord.quality, settings.genre);
        const candidateIntervals = getScaleIntervals(candidateMode, settings.genre, divisions);
        const candidateScalePitchesRaw = buildScalePitches(parsedChord.rootPitch, candidateIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
        const candidateScalePitches = adjustScalePitches(candidateScalePitchesRaw);
        const candidateScalePcSet = new Set(candidateScalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

        // Overlap compatibility check: count how many pitch classes are shared with globalScalePitches
        let sharedCount = 0;
        candidateScalePcSet.forEach(pc => {
            if (globalScalePcSet.has(pc)) sharedCount++;
        });

        if (sharedCount >= 3) {
            isLocalScale = true;
            chordKey = parsedChord.rootPitch;
            chordMode = candidateMode;
            scaleIntervals = candidateIntervals;
        }
    }

    let scalePitches;
    if (isLocalScale) {
        const localScalePitchesRaw = buildScalePitches(chordKey, scaleIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
        scalePitches = adjustScalePitches(localScalePitchesRaw);
    } else {
        scalePitches = globalScalePitches;
    }

    const activeScalePcSet = new Set(scalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

    const activeChordTones = (chordNotes || []).map(n => {
        let note = n;
        while (note < melodyRangeStart) note += periodSize;
        while (note > melodyRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);
    // Prune scale pitches that clash (are within 0.5 semitones) with chromatic chord tones
    const prunedScalePitches = scalePitches.filter(sp => {
        return !activeChordTones.some(ct => {
            const ctPc = Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100;
            const isChromaticChordTone = !activeScalePcSet.has(ctPc);
            if (isChromaticChordTone) {
                const diff = Math.abs(sp - ct);
                return diff > 0.01 && diff < 0.5;
            }
            return false;
        });
    });

    const validPitches = Array.from(new Set([...prunedScalePitches, ...activeChordTones])).sort((a, b) => a - b);

    let justLooped = false;
    if (previousAbsIndex !== -1 && absIndex < previousAbsIndex) {
        progressionLoopCounter++;
        justLooped = true;

        // ── SongFormCoordinator: section assignment (Change 4B) ──────────────────
        // Map loop count to section in a repeating A / B / A' / A / B / A' pattern.
        // Loop 0 → A (generate and store)
        // Loop 1 → B (generate fresh, different material)
        // Loop 2 → A' (recall section A material with transposition)
        const sectionCycle = progressionLoopCounter % 3;
        songFormSection = ['A', 'B', 'A_prime'][sectionCycle];

        globalLastMelodyNoteTime = -999;
        globalLastCountermelodyNoteTime = -999;

        if (settings.genre !== 'none') {
            if (songFormSection === 'B') {
                // Generate completely fresh material for Section B
                const baseRhythmTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre, rng);
                phraseRhythmTemplate = baseRhythmTemplate.map(val => {
                    if (val === 0) {
                        const fillProb = settings.density > 0.4 ? Math.min(1.0, (settings.density - 0.4) / 0.5) : 0.0;
                        if (rng.next() < fillProb) return 1;
                    }
                    return val;
                });
                phraseRhythmicMotif = generateRhythmicMotif(activeAestheticMode, rng);
            } else {
                const evolveRoll = rng.next();
                if (evolveRoll < 0.15) {
                    // 15% chance: Completely regenerate
                    const baseRhythmTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre, rng);
                    phraseRhythmTemplate = baseRhythmTemplate.map(val => {
                        if (val === 0) {
                            const fillProb = settings.density > 0.4 ? Math.min(1.0, (settings.density - 0.4) / 0.5) : 0.0;
                            if (rng.next() < fillProb) return 1;
                        }
                        return val;
                    });
                    phraseRhythmicMotif = generateRhythmicMotif(activeAestheticMode, rng);
                } else if (evolveRoll < 0.60) {
                    // 45% chance: Evolve existing template and motif
                    if (phraseRhythmTemplate && phraseRhythmTemplate.length > 0) {
                        phraseRhythmTemplate = phraseRhythmTemplate.map((val, idx) => {
                            if (idx === 0) return val; // Keep downbeat stable
                            if (rng.next() < 0.15) {
                                return val === 1 ? 0 : 1;
                            }
                            return val;
                        });
                    }
                    if (phraseRhythmicMotif) {
                        const motifRoll = rng.next();
                        if (motifRoll < 0.33) {
                            phraseRhythmicMotif = applyRhythmicVariation(phraseRhythmicMotif);
                        } else if (motifRoll < 0.66) {
                            phraseRhythmicMotif = applyPartialRecall(phraseRhythmicMotif);
                        } else {
                            phraseRhythmicMotif = applyMotivicExtension(phraseRhythmicMotif, globalLastInterval || 0);
                        }
                    }
                }
                // 40% chance: Keep stable
            }

            // Recompute countermelody based on mutated/regenerated phraseRhythmTemplate
            const counterOffset = (settings.countermelodyMode === 'harmonize') ? 0 : 8;
            phraseCounterRhythmTemplate = new Array(16).fill(0);
            for (let i = 0; i < 16; i++) {
                phraseCounterRhythmTemplate[i] = phraseRhythmTemplate[(i + counterOffset) % 16];
            }
        }
    }
    previousAbsIndex = absIndex;

    if (absIndex % 4 === 0) {
        if (!justLooped || !phraseRhythmTemplate || phraseRhythmTemplate.length === 0) {
            const baseRhythmTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre, rng);
            
            // Dynamically open up rests in the template based on settings.density
            phraseRhythmTemplate = baseRhythmTemplate.map(val => {
                if (val === 0 && settings.genre !== 'none') {
                    const fillProb = settings.density > 0.4 ? Math.min(1.0, (settings.density - 0.4) / 0.5) : 0.0;
                    if (rng.next() < fillProb) {
                        return 1;
                    }
                }
                return val;
            });

            const counterOffset = (settings.countermelodyMode === 'harmonize') ? 0 : 8;
            phraseCounterRhythmTemplate = new Array(16).fill(0);
            for (let i = 0; i < 16; i++) {
                phraseCounterRhythmTemplate[i] = phraseRhythmTemplate[(i + counterOffset) % 16];
            }

            phraseRhythmicMotif = generateRhythmicMotif(activeAestheticMode, rng);
        }
    }

    // Build pools for Countermelody
    const counterGlobalScalePitchesRaw = buildScalePitches(keyRoot, globalScaleIntervals, divisions, counterRangeStart, counterRangeEnd, periodSize);
    const counterGlobalScalePitches = adjustScalePitches(counterGlobalScalePitchesRaw);
    const counterGlobalScalePcSet = new Set(counterGlobalScalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

    let counterScalePitches;
    if (isLocalScale) {
        const counterLocalScalePitchesRaw = buildScalePitches(chordKey, scaleIntervals, divisions, counterRangeStart, counterRangeEnd, periodSize);
        counterScalePitches = adjustScalePitches(counterLocalScalePitchesRaw);
    } else {
        counterScalePitches = counterGlobalScalePitches;
    }

    const counterActiveScalePcSet = new Set(counterScalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

    const counterActiveChordTones = (chordNotes || []).map(n => {
        let note = n;
        while (note < counterRangeStart) note += periodSize;
        while (note > counterRangeEnd) note -= periodSize;
        return note;
    }).filter(n => n >= counterRangeStart && n <= counterRangeEnd);

    // Prune counter scale pitches that clash with chromatic chord tones
    const counterPrunedScalePitches = counterScalePitches.filter(sp => {
        return !counterActiveChordTones.some(ct => {
            const ctPc = Math.round(((ct % periodSize + periodSize) % periodSize) * 100) / 100;
            const isChromaticChordTone = !counterActiveScalePcSet.has(ctPc);
            if (isChromaticChordTone) {
                const diff = Math.abs(sp - ct);
                return diff > 0.01 && diff < 1.1;
            }
            return false;
        });
    });

    const counterValidPitches = Array.from(new Set([...counterPrunedScalePitches, ...counterActiveChordTones])).sort((a, b) => a - b);

    const chordTonePcSet = new Set((chordNotes || []).map(n => Math.round(((n % periodSize + periodSize) % periodSize) * 100) / 100));

    // Retrieve previous/next chord notes
    const prevChordNotes = prevChordObj ? getChordNotes(prevChordObj, prevChordObj.key !== undefined ? Number(prevChordObj.key) : state.baseKey, divisions) : [];
    const nextChordNotes = nextChordObj ? getChordNotes(nextChordObj, nextChordObj.key !== undefined ? Number(nextChordObj.key) : state.baseKey, divisions) : [];

    const getDistinctiveNextTone = () => {
        if (!nextChordNotes || nextChordNotes.length === 0) return null;
        const chromaticNextTones = nextChordNotes.filter(n => {
            const pc = Math.round(((n % periodSize + periodSize) % periodSize) * 100) / 100;
            return !activeScalePcSet.has(pc);
        });
        if (chromaticNextTones.length > 0) return chromaticNextTones[0];

        const newNextTones = nextChordNotes.filter(n => {
            const pc = Math.round(((n % periodSize + periodSize) % periodSize) * 100) / 100;
            return !chordTonePcSet.has(pc);
        });
        if (newNextTones.length > 0) return newNextTones[0];

        return nextChordNotes[0];
    };

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
        motifFamily = resolveMotifFamily(context, state, settings, pool, activeChordTones, validPitches, tuning, rng, chordObj, narrativeState);
    }

    // ── SongFormCoordinator recall and store logic ──
    context.phraseRhythmTemplate = phraseRhythmTemplate;
    context.phraseCounterRhythmTemplate = phraseCounterRhythmTemplate;
    motifFamily = handleSongForm(context, absIndex, chordKey, keyRoot, divisions, settings, validPitches, globalScalePitches, motifFamily);
    sectionAMotifFamily = context.sectionAMotifFamily;
    sectionARhythmTemplate = context.sectionARhythmTemplate;
    sectionAAestheticMode = context.sectionAAestheticMode;
    sectionAChordRootPitch = context.sectionAChordRootPitch;
    phraseRhythmTemplate = context.phraseRhythmTemplate;
    phraseCounterRhythmTemplate = context.phraseCounterRhythmTemplate;
    motifCache = context.motifCache;

    const hookRhythm = motifFamily.hookRhythm || [1, 0, 1, 0];

    let currentCell = motifFamily.hook;
    if (progressVal >= 0.75) {
        currentCell = motifFamily.cadence;
    } else if (progressVal >= 0.25 && progressVal < 0.75) {
        currentCell = motifFamily.connector;
    }

    // Define targetPitch and anchors early
    const melodyMid = 73;
    let targetPitch = melodyMid;
    if (settings.macroPlannerEnabled && macroSlotTarget) {
        targetPitch = findClosest(macroSlotTarget.targetPitch, validPitches);
    } else {
        if (progressVal < 0.65) {
            const t = progressVal / 0.65;
            targetPitch = melodyRangeStart + 2 + t * (melodyRangeEnd - (melodyRangeStart + 2));
        } else {
            const t = (progressVal - 0.65) / 0.35;
            const resolveTarget = keyRoot + 12;
            targetPitch = melodyRangeEnd - t * (melodyRangeEnd - resolveTarget);
        }
    }

    let target1Raw = targetPitch;
    if (settings.macroPlannerEnabled && macroSlotTarget) {
        target1Raw = macroSlotTarget.targetPitch;
    }

    // Phase A: Stateful Anchor Planning (bar-by-bar)
    let plannedAnchor1 = null;
    let plannedAnchor2 = null;

    let anchor1Limit = activeRole === 'climax' ? 5 : 3;
    let lastAnchor = globalPrevAnchor;
    if (lastAnchor === null || absIndex === 0) {
        lastAnchor = keyRoot + 12;
    }

    plannedAnchor1 = getConstrainedAnchorGlobal(lastAnchor, target1Raw, anchor1Limit, globalScalePitches, validPitches, activeChordTones, divisions, chordObj, periodSize);
    globalPrevAnchor = plannedAnchor1;

    let target2Raw = targetPitch;
    if (settings.macroPlannerEnabled && macroSlotTarget) {
        if (nextChordObj && macroTargetPlan && macroTargetPlan[absIndex + 1]) {
            target2Raw = macroTargetPlan[absIndex + 1].targetPitch;
        } else {
            target2Raw = target1Raw;
        }
    }

    if (beats >= 2 && ['build', 'climax', 'statement'].includes(activeRole)) {
        let anchor2Limit = activeRole === 'climax' ? 5 : 3;
        plannedAnchor2 = getConstrainedAnchorGlobal(plannedAnchor1, target2Raw, anchor2Limit, globalScalePitches, validPitches, activeChordTones, divisions, chordObj, periodSize);
    }

    if (!justLooped && prevSlotEndedWithRun && settings.genre !== 'none' && prevSlotLastPitch !== null) {
        plannedAnchor1 = findClosest(prevSlotLastPitch, validPitches);
    } else {
        plannedAnchor1 = enforceChordToneOnDownbeat(plannedAnchor1, activeChordTones, validPitches, periodSize, divisions, chordObj);
    }
    if (plannedAnchor2 !== null) {
        plannedAnchor2 = enforceChordToneOnDownbeat(plannedAnchor2, activeChordTones, validPitches, periodSize, divisions, chordObj);
    }

    // Phase B: Rhythmic Motif Variation (Bar-by-bar mutation)
    let slotRhythmTemplate = [...phraseRhythmTemplate];

    if (absIndex % 4 !== 0 && settings.genre !== 'none' && phraseRhythmTemplate.length > 0) {
        const barIdx = absIndex % 4;
        const mutationProb = barIdx === 2 ? 0.25 : 0.15; // Higher mutation/extension on climax bar 2
        slotRhythmTemplate = slotRhythmTemplate.map((val, idx) => {
            if (idx === 0) return val; // Keep downbeat stable
            if (rng.next() < mutationProb) {
                return val === 1 ? 0 : 1;
            }
            return val;
        });
        
        // Bar 3 (resolution) should have a slight breathing/fading space towards the end
        if (barIdx === 3) {
            for (let idx = 12; idx < 16; idx++) {
                if (rng.next() < 0.7) {
                    slotRhythmTemplate[idx] = 0;
                }
            }
        }
    }

    let slotCounterRhythmTemplate = [...phraseCounterRhythmTemplate];
    if (slotRhythmTemplate.length > 0) {
        if (settings.genre !== 'none') {
            // Build a complementary countermelody rhythm template (Change 3C).
            // Primary rule: play in melody rests. Secondary rule: occasional shared beat.
            const density = settings.density !== undefined ? settings.density : 0.5;
            // At high density, reduce countermelody probability to avoid overcrowding
            const densityFactor = density >= 0.8 ? (1.0 - (density - 0.8) * 2.0) : 1.0; // at density=1.0, factor is 0.6
            const baseCounterProb = (0.2 + density * 0.45) * densityFactor; // at density=1.0: 0.65 * 0.6 = 0.39
            const counterOverlapProb = settings.countermelodyMode === 'harmonize' 
                ? (0.2 + density * 0.3) * densityFactor
                : (0.05 + density * 0.1) * densityFactor; // at density=1.0: 0.15 * 0.6 = 0.09
            slotCounterRhythmTemplate = new Array(16).fill(0);
            for (let i = 0; i < 16; i++) {
                if (slotRhythmTemplate[i] === 0) {
                    // Melody is silent here — countermelody has higher play probability
                    slotCounterRhythmTemplate[i] = rng.next() < baseCounterProb ? 1 : 0;
                } else {
                    // Melody is active here — countermelody plays only occasionally
                    slotCounterRhythmTemplate[i] = rng.next() < counterOverlapProb ? 1 : 0;
                }
            }
            // Always ensure step 0 of the countermelody is active (anchor downbeat)
            slotCounterRhythmTemplate[0] = 1;
        } else {
            const counterOffset = (settings.countermelodyMode === 'harmonize') ? 0 : 8;
            slotCounterRhythmTemplate = new Array(16).fill(0);
            for (let i = 0; i < 16; i++) {
                slotCounterRhythmTemplate[i] = slotRhythmTemplate[(i + counterOffset) % 16];
            }
        }
    }

    // Transpose active cell to chord anchor (fallback for genre === 'none')
    const anchorTarget = globalPrevPitch !== null ? globalPrevPitch : (keyRoot + 12);
    const chordToneAnchor = activeChordTones.length > 0 ? findClosest(anchorTarget, activeChordTones) : keyRoot;
    const transpositionOffset = chordToneAnchor - currentCell[0];

    // Helper to check if a pitch belongs to the base key scale
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none', divisions);
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    let sliceMotif = [];
    if (settings.genre !== 'none') {
        if (narrativeState.motifRepeats > 2) {
            const roll = rng.next();
            if (roll < 0.4) phraseRhythmicMotif = applyRhythmicVariation(phraseRhythmicMotif);
            else if (roll < 0.7) phraseRhythmicMotif = applyPartialRecall(phraseRhythmicMotif);
            else phraseRhythmicMotif = applyMotivicExtension(phraseRhythmicMotif, globalLastInterval);
        }
        if (phraseRhythmicMotif) {
            sliceMotif = realizeMotifinContext(phraseRhythmicMotif, plannedAnchor1, validPitches, divisions);
        }
    } else {
        sliceMotif = currentCell.map(note => {
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

        // Apply variation transformations for genre === 'none'
        if (narrativeState.motifRepeats > 2) {
            const choice = rng.next();
            if (choice < 0.33) {
                sliceMotif = applyInversion(sliceMotif, pool);
            } else if (choice < 0.66) {
                sliceMotif = applyRetrograde(sliceMotif);
            } else {
                sliceMotif = applySequence(sliceMotif, pool, rng.next() > 0.5 ? 2 : -2);
            }
        } else if (settings.variationDepth > 0) {
            const variationRoll = (absIndex % 4);
            if (variationRoll === 1 && settings.variationDepth > 0.3) {
                sliceMotif = applyInversion(sliceMotif, pool);
            } else if (variationRoll === 2 && settings.variationDepth > 0.5) {
                sliceMotif = applyRetrograde(sliceMotif);
            } else if (variationRoll === 3 && settings.variationDepth > 0.7) {
                sliceMotif = applySequence(sliceMotif, pool, rng.next() > 0.5 ? 2 : -2);
            }
        }
    }

    const isConsequentPhrase = (absIndex % 2 === 1);

    let prevPitch = globalPrevPitch !== null ? globalPrevPitch : (melodyRangeStart + 6);
    let prevCounterPitch = globalPrevCounterPitch !== null ? globalPrevCounterPitch : counterRangeStart + 6;
    let lastInterval = globalLastInterval;

    const melodyHistory = globalMelodyHistory;
    const debugNotes = [];

    // Arrays to collect scheduled notes before playing them (to apply resolution rules reliably)
    const melodyScheduled = [];
    const counterScheduled = [];



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

    let hasSurprise = false;
    let surpriseType = null;
    const isSurpriseEligible = settings.genre !== 'none' && settings.variationDepth >= 0.5;
    if (isSurpriseEligible && rng.next() < surpriseQuotient && stepsSinceLastSurprise >= 8) {
        hasSurprise = true;
        surpriseType = rng.next();
    }

    const useSimpleMode = settings.variationDepth < 0.3 || settings.genre === 'none';
    if (useSimpleMode) {
        hasSurprise = false;
        phraseLocalScaleOffset = -1;
    }


    let slotHasFlourish = false;
    let runStartStep = -1;
    let runLength = 0;

    const shortestLimitStep = settings.maxNoteSpeed || settings.shortestNoteLimit || 16;
    let stepsPerBeat = 4;
    if (shortestLimitStep === 32) stepsPerBeat = 8;
    else if (shortestLimitStep === 64) stepsPerBeat = 16;
    const totalSteps = beats * stepsPerBeat;
    const beatDuration = chordSlotDuration / beats;
    const maxSteps = Math.round(chordSlotDuration / (15 / bpm));

    // Schedule beat by beat to allow rate variation
    // Schedule beat by beat to allow rate variation or adapt polyphonic motif directly
    const isPolyphonicMotif = settings.seedSource === 'motif' && activeMotif && settings.midiExtractionMode === 'polyphonic';

    if (isPolyphonicMotif) {
        const motifLengthBeats = Math.max(...activeMotif.notes.map(n => n.time + n.duration), 4.0);
        const reps = Math.ceil(beats / motifLengthBeats);

        for (let r = 0; r < reps; r++) {
            activeMotif.notes.forEach(note => {
                let noteBeat = note.time + r * motifLengthBeats;
                // Apply variation timing shift if variationDepth > 0
                if (settings.variationDepth > 0 && rng.next() < settings.variationDepth * 0.2) {
                    const shiftOptions = [-0.25, 0.25, -0.125, 0.125];
                    const shift = shiftOptions[Math.floor(rng.next() * shiftOptions.length)];
                    noteBeat = Math.max(0, noteBeat + shift);
                }
                if (noteBeat >= beats) return;

                const stepTime = time + noteBeat * beatDuration;
                const noteDuration = note.duration * beatDuration * 0.95;

                // Conform pitch
                let rawPitch = chordKey + (note.pitchOffset || 0);

                // Apply variation pitch shift if variationDepth > 0
                if (settings.variationDepth > 0 && rng.next() < settings.variationDepth * 0.3) {
                    const scaleDegreeShift = rng.next() > 0.5 ? 1 : -1;
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
                        step: Math.round(noteBeat * 4),
                        sixteenthStep: Math.round(noteBeat * 4),
                        isAnchor1Step: false,
                        isAnchor2Step: false
                    });
                }
            });
        }
        melodyScheduled.sort((a, b) => a.stepTime - b.stepTime);
        counterScheduled.sort((a, b) => a.stepTime - b.stepTime);
    } else {
        let prevPitchIsColor = globalPrevPitchIsColor;

        // Phase A: Build the rhythm grid (one loop, replaces both grid computations)
        const gridSteps = [];
        for (let beat = 0; beat < beats; beat++) {
            let subdivision = 4;
            if (settings.genre !== 'none') {
                if (slotAestheticMode === 'cantabile' || slotAestheticMode === 'sighs') {
                    subdivision = slotActivity > 0.6 ? 2 : 1;
                } else if (slotAestheticMode === 'declamatory') {
                    const declPattern = [1, 2, 4, 2];
                    subdivision = declPattern[beat % declPattern.length];
                } else if (slotAestheticMode === 'virtuoso') {
                    const roll = rng.next();
                    if (shortestLimitStep === 64) {
                        if (roll < 0.50) subdivision = 16;
                        else if (roll < 0.75) subdivision = 12;
                        else if (roll < 0.85) subdivision = 8;
                        else if (roll < 0.95) subdivision = 4;
                        else subdivision = 2;
                    } else if (shortestLimitStep === 32) {
                        if (roll < 0.50) subdivision = 8;
                        else if (roll < 0.75) subdivision = 6;
                        else if (roll < 0.85) subdivision = 4;
                        else if (roll < 0.95) subdivision = 3;
                        else subdivision = 2;
                    } else if (shortestLimitStep === 16 || shortestLimitStep === 1) {
                        if (roll < 0.50) subdivision = 4;
                        else if (roll < 0.75) subdivision = 3;
                        else if (roll < 0.90) subdivision = 2;
                        else subdivision = 1;
                    } else {
                        if (roll < 0.50) subdivision = 8;
                        else if (roll < 0.75) subdivision = 6;
                        else if (roll < 0.85) subdivision = 4;
                        else if (roll < 0.95) subdivision = 3;
                        else subdivision = 2;
                    }
                }
            } else {
                const progressInPhrase = ((absIndex % 4) * beats + beat) / (4 * beats);
                const subIdx = Math.floor(progressInPhrase * narrativeState.phraseSubdivisions.length);
                subdivision = narrativeState.phraseSubdivisions[subIdx] || 4;
                if (currentTension < 0.25) {
                    if (subdivision > 3) subdivision = 3;
                } else if (currentTension < 0.55) {
                    if (subdivision > 6) subdivision = 6;
                }
            }
            if (settings.macroPlannerEnabled && macroSlotTarget) {
                if (macroSlotTarget.role === 'climax' || macroSlotTarget.role === 'build') {
                    if (subdivision < 4) subdivision = 4;
                } else if (macroSlotTarget.role === 'release' || macroSlotTarget.role === 'resolution') {
                    subdivision = 2;
                }
            }

            // Skip odd beats for 1/2 Note limit (value 2) to ensure notes are at least 1/2 note (2 beats) long
            if ((shortestLimitStep === 2 || shortestLimitStep === 11 || shortestLimitStep === 13) && beat % 2 !== 0) {
                continue;
            }

            let maxAllowedSubdivision = 4;
            if (shortestLimitStep === 64) maxAllowedSubdivision = 16;                               // 1/64 Note
            else if (shortestLimitStep === 32) maxAllowedSubdivision = 8;                                // 1/32 Note
            else if (shortestLimitStep === 16 || shortestLimitStep === 1) maxAllowedSubdivision = 4;      // 1/16 Note
            else if (shortestLimitStep === 12) maxAllowedSubdivision = 3;                            // 1/12 Note (1/8 Triplet)
            else if (shortestLimitStep === 8 || shortestLimitStep === 3 || shortestLimitStep === 9) maxAllowedSubdivision = 2; // 1/8 Note (and legacy 9)
            else if (shortestLimitStep === 6 || shortestLimitStep === 4 || shortestLimitStep === 10) maxAllowedSubdivision = 1; // 1/6 Note / 1/4 Note (and legacy 10)
            else if (shortestLimitStep === 4 || shortestLimitStep === 5 || shortestLimitStep === 12) maxAllowedSubdivision = 1; // 1/4 Note
            else if (shortestLimitStep === 2 || shortestLimitStep === 13) maxAllowedSubdivision = 1; // 1/2 Note
            else maxAllowedSubdivision = 1;

            if (subdivision > maxAllowedSubdivision) subdivision = maxAllowedSubdivision;

            let subStepDuration = beatDuration / subdivision;
            if (shortestLimitStep === 2 || shortestLimitStep === 11 || shortestLimitStep === 13) {
                subStepDuration = (beatDuration * 2) / subdivision;
            }

            for (let sub = 0; sub < subdivision; sub++) {
                const step = beat * 96 + Math.round((sub / subdivision) * 96);
                const sixteenthStep = beat * stepsPerBeat + Math.round((sub / subdivision) * stepsPerBeat);
                if (sixteenthStep >= totalSteps) continue;

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
                        if (sub === 0) noteDurMultiplier = 1.2;
                        else if (sub === 1) { stepOffsetInBeat = 0.4; noteDurMultiplier = 0.8; }
                        else if (sub === 2) { stepOffsetInBeat = 0.7; noteDurMultiplier = 0.9; }
                    }
                }

                gridSteps.push({
                    step,
                    sixteenthStep,
                    beat,
                    sub,
                    subdivision,
                    stepTime: time + (beat * beatDuration) + (stepOffsetInBeat * beatDuration),
                    noteDuration: subStepDuration * noteDurMultiplier,
                    isAnchor1Step: (beat === 0 && sub === 0),
                    isAnchor2Step: (beat === 2 && sub === 0 && beats >= 2 && ['build', 'climax', 'statement'].includes(activeRole))
                });
            }
        }

        // Phase B: Linear play + isolation flagging (one pass over gridSteps, one short pass over the result)
        const isClimaxBar = (absIndex % 4 === 2);
        const hasHighTension = currentTension > 0.6;
        const canFlourish = ['virtuoso', 'declamatory'].includes(slotAestheticMode);
        
        slotHasFlourish = settings.genre !== 'none' && canFlourish && (
            (isClimaxBar && hasHighTension && rng.next() < 0.4) ||
            (hasHighTension && rng.next() < 0.15)
        );

        runStartStep = -1;
        runLength = 0;
        if (prevSlotEndedWithRun && settings.genre !== 'none') {
            slotHasFlourish = true;
            runStartStep = 0;
            runLength = prevSlotRunRemainingLength;
        } else if (slotHasFlourish) {
            // 50% chance to start at the end of the slot and cross the boundary
            if (rng.next() < 0.5) {
                runLength = stepsPerBeat * (1 + Math.floor(rng.next() * 2));
                runStartStep = totalSteps - runLength;
            } else {
                runStartStep = Math.floor(stepsPerBeat * (1 + rng.next()));
                runLength = stepsPerBeat * (1 + Math.floor(rng.next() * 2));
            }
        }

        const stepPlaysMap = {};
        for (const g of gridSteps) {
            const isAnchor = g.isAnchor1Step || g.isAnchor2Step;
            let plays = true;
            if (isAnchor) {
                plays = true;
            } else if (settings.genre !== 'none') {
                const templateStep = Math.floor(g.sixteenthStep * (4 / stepsPerBeat)) % 16;
                plays = slotRhythmTemplate[templateStep] === 1;
                if (slotHasFlourish && g.sixteenthStep >= runStartStep && g.sixteenthStep < runStartStep + runLength) {
                    plays = true;
                }
            } else {
                if (g.sixteenthStep === totalSteps - 1) plays = false;
            }
            stepPlaysMap[g.step] = plays;
        }
        const maskedSteps = new Set();

        // First Pass (Rests): Apply layered masking rules based on restProbability
        {
            const restProb = restProbability !== undefined ? restProbability : 0.2;

            if (restProb > 0.0 && restProb <= 0.3) {
                // Low Rest Probability: Micro-rests (breath marks) - turn individual active steps into rests
                let lastWasMasked = false;
                for (let i = 0; i < gridSteps.length; i++) {
                    const g = gridSteps[i];
                    if (g.isAnchor1Step || g.isAnchor2Step) continue;
                    if (stepPlaysMap[g.step]) {
                        if (!lastWasMasked && rng.next() < restProb) {
                            maskedSteps.add(g.step);
                            lastWasMasked = true;
                        } else {
                            lastWasMasked = false;
                        }
                    } else {
                        lastWasMasked = false;
                    }
                }
            } else if (restProb > 0.3 && restProb <= 0.7) {
                // Mid Rest Probability: Group-rests (mask 2 to 4 contiguous steps)
                let skipUntilIndex = -1;
                const maskContiguousProb = (restProb - 0.3) * 0.5 + 0.1;
                for (let i = 0; i < gridSteps.length; i++) {
                    if (i < skipUntilIndex) continue;
                    const g = gridSteps[i];
                    if (g.isAnchor1Step || g.isAnchor2Step) continue;
                    if (stepPlaysMap[g.step]) {
                        if (rng.next() < maskContiguousProb) {
                            const groupSize = Math.floor(rng.next() * 3) + 2; // 2, 3, or 4 steps
                            for (let k = 0; k < groupSize && (i + k) < gridSteps.length; k++) {
                                const targetStep = gridSteps[i + k];
                                if (!targetStep.isAnchor1Step && !targetStep.isAnchor2Step) {
                                    maskedSteps.add(targetStep.step);
                                }
                            }
                            skipUntilIndex = i + groupSize;
                        }
                    }
                }
            } else if (restProb > 0.7) {
                // High Rest Probability: Heavy masking, keep only isolated structural notes at key anchor beats
                const keepProb = Math.max(0.05, 1.0 - (restProb - 0.7) / 0.3);
                for (let i = 0; i < gridSteps.length; i++) {
                    const g = gridSteps[i];
                    const isKeyAnchor = g.isAnchor1Step || g.isAnchor2Step || (g.sub === 0 && g.beat % 2 === 0);
                    if (!isKeyAnchor) {
                        if (rng.next() > keepProb) {
                            maskedSteps.add(g.step);
                        }
                    }
                }
            }

            for (const step of maskedSteps) {
                stepPlaysMap[step] = false;
            }
        }

        // Second Pass (Density): Thin out if low density, fill in if high density
        {
            const dens = settings.density !== undefined ? settings.density : 0.5;
            for (const g of gridSteps) {
                if (g.isAnchor1Step || g.isAnchor2Step) continue;
                if (maskedSteps.has(g.step)) continue; // Keep rests intact
                
                const isCurrentlyActive = stepPlaysMap[g.step];
                if (isCurrentlyActive) {
                    if (dens < 0.5) {
                        const keepProb = dens * 2.0;
                        if (rng.next() > keepProb) {
                            stepPlaysMap[g.step] = false;
                        }
                    }
                } else {
                    if (dens > 0.5) {
                        const fillProb = (dens - 0.5) / 0.5;
                        if (rng.next() < fillProb) {
                            stepPlaysMap[g.step] = true;
                        }
                    }
                }
            }
        }

        // Count notes in the final stepPlaysMap
        for (const g of gridSteps) {
            if (stepPlaysMap[g.step]) {
                if (g.sub === 0 || settings.genre === 'none' || g.subdivision !== 4) {
                    noteCountThisPhrase++;
                }
            }
        }

        const activeStepsBeforeCluster = gridSteps.filter(g => stepPlaysMap[g.step]);
        const initialIsolatedSet = new Set();
        if (settings.genre !== 'none') {
            const gapThreshold = beatDuration * 0.95;
            activeStepsBeforeCluster.forEach((g, idx) => {
                const prevTime = idx > 0 ? activeStepsBeforeCluster[idx - 1].stepTime : globalLastMelodyNoteTime;
                const nextTime = idx < activeStepsBeforeCluster.length - 1 ? activeStepsBeforeCluster[idx + 1].stepTime : (time + chordSlotDuration);
                
                const spaceBefore = g.stepTime - prevTime;
                const spaceAfter = nextTime - g.stepTime;

                if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
                    initialIsolatedSet.add(g.step);
                }
            });

            for (let i = 0; i < gridSteps.length; i++) {
                const g = gridSteps[i];
                if (!stepPlaysMap[g.step]) continue;

                if (initialIsolatedSet.has(g.step)) {
                    if (rng.next() < 0.75) {
                        const clusterType = rng.next();
                        let role;
                        if (clusterType < 0.45) role = 'reinforce';
                        else if (clusterType < 0.75) {
                            if (g.sixteenthStep >= totalSteps * 0.6 && nextChordObj) {
                                role = 'foreshadow';
                            } else {
                                role = 'reinforce';
                            }
                        } else role = 'commontone';

                        const activatedSteps = [];
                        if (clusterType < 0.4) {
                            if (i > 0) activatedSteps.push(gridSteps[i - 1]);
                            if (i < gridSteps.length - 1) activatedSteps.push(gridSteps[i + 1]);
                        } else if (clusterType < 0.7) {
                            if (i < gridSteps.length - 2) activatedSteps.push(gridSteps[i + 1], gridSteps[i + 2]);
                        } else {
                            if (i > 2) activatedSteps.push(gridSteps[i - 1], gridSteps[i - 2]);
                        }

                        activatedSteps.forEach(neighbor => {
                            stepPlaysMap[neighbor.step] = true;
                        });

                        const allClusterSteps = [g, ...activatedSteps].sort((a, b) => a.stepTime - b.stepTime);
                        const M = allClusterSteps.length;

                        if (role === 'foreshadow') {
                            if (M === 2) {
                                allClusterSteps[0].clusterRole = 'reinforce';
                                allClusterSteps[1].clusterRole = 'foreshadow_note';
                            } else if (M >= 3) {
                                allClusterSteps[0].clusterRole = 'reinforce';
                                allClusterSteps[1].clusterRole = 'foreshadow_note';
                                for (let j = 2; j < M; j++) {
                                    allClusterSteps[j].clusterRole = 'foreshadow_glue';
                                }
                            } else {
                                allClusterSteps[0].clusterRole = 'foreshadow_note';
                            }
                        } else {
                            allClusterSteps.forEach((step, idx) => {
                                if (idx === 0) {
                                    step.clusterRole = 'reinforce';
                                } else {
                                    step.clusterRole = role;
                                }
                            });
                        }
                    }
                }
            }
        }

        const activeSteps = gridSteps.filter(g => stepPlaysMap[g.step]);
        const isolatedStepsSet = new Set();
        const isolatedCounterStepsSet = new Set();
        if (settings.genre !== 'none') {
            const gapThreshold = beatDuration * 0.95;
            activeSteps.forEach((g, idx) => {
                const prevTime = idx > 0 ? activeSteps[idx - 1].stepTime : globalLastMelodyNoteTime;
                const nextTime = idx < activeSteps.length - 1 ? activeSteps[idx + 1].stepTime : (time + chordSlotDuration);
                const spaceBefore = g.stepTime - prevTime;
                const spaceAfter = nextTime - g.stepTime;

                if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
                    isolatedStepsSet.add(g.step);
                }
            });

            let prevFilterCounterTemplateStep = null;
            const counterActiveSteps = gridSteps.filter(g => {
                if (!settings.countermelodyEnabled) return false;
                if (settings.genre === 'none') return false;
                const counterTemplateStep = Math.floor(g.sixteenthStep * (4 / stepsPerBeat)) % 16;
                const active = (slotCounterRhythmTemplate[counterTemplateStep] === 1) && (counterTemplateStep !== prevFilterCounterTemplateStep);
                prevFilterCounterTemplateStep = counterTemplateStep;
                return active;
            });
            if (settings.countermelodyEnabled) {
                counterActiveSteps.forEach((g, idx) => {
                    const prevTime = idx > 0 ? counterActiveSteps[idx - 1].stepTime : globalLastCountermelodyNoteTime;
                    const nextTime = idx < counterActiveSteps.length - 1 ? counterActiveSteps[idx + 1].stepTime : (time + chordSlotDuration);
                    const spaceBefore = g.stepTime - prevTime;
                    const spaceAfter = nextTime - g.stepTime;

                    if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
                        isolatedCounterStepsSet.add(g.step);
                    }
                });
            }

            // Rubato / Timing Warp for Flourish Runs
            if (slotHasFlourish) {
                const runSteps = activeSteps.filter(g => g.sixteenthStep >= runStartStep && g.sixteenthStep < runStartStep + runLength);
                if (runSteps.length > 2) {
                    const N = runSteps.length;
                    const t_start = runSteps[0].stepTime;
                    const lastIdx = activeSteps.indexOf(runSteps[N - 1]);
                    const t_next = (lastIdx < activeSteps.length - 1) ? activeSteps[lastIdx + 1].stepTime : (time + chordSlotDuration);
                    const D = t_next - t_start;

                    const warpProfileRoll = rng.next();
                    let warpFn;
                    if (warpProfileRoll < 0.5) {
                        // Arch (slow-fast-slow)
                        const A = -0.12;
                        warpFn = (x) => x - A * Math.sin(2 * Math.PI * x);
                    } else if (warpProfileRoll < 0.75) {
                        // Accelerando
                        warpFn = (x) => Math.pow(x, 1.25);
                    } else {
                        // Decelerando
                        warpFn = (x) => Math.pow(x, 0.8);
                    }

                    for (let i = 0; i < N; i++) {
                        const x = i / N;
                        runSteps[i].stepTime = t_start + D * warpFn(x);
                    }
                }
            }

            // Legato note duration scaling
            for (let i = 0; i < activeSteps.length; i++) {
                const current = activeSteps[i];
                const nextTime = (i < activeSteps.length - 1) ? activeSteps[i + 1].stepTime : (time + chordSlotDuration);
                const gap = nextTime - current.stepTime;
                const mult = Math.max(0.4, 0.9 - (settings.rests || 0.1) * 0.5);
                current.noteDuration = gap * mult;
            }
        }

        // Phase C: Playback / Pitch Selection Pass
        let prevCounterTemplateStep = null;
        let counterNoteCount = 0;
        let prevWasBlue = false;
        let lastBluePitch = null;
        let b5ResolutionDirection = null;
        let b3ResolutionForced = false;
        for (let gIndex = 0; gIndex < gridSteps.length; gIndex++) {
            const g = gridSteps[gIndex];
            let melodyPlays = stepPlaysMap[g.step];
            let playCounter = false;

            if (settings.countermelodyEnabled && settings.countermelodyMode === 'call-response') {
                const stepProgress = g.sixteenthStep / totalSteps;
                if (stepProgress < dialogueSplitTime) {
                    playCounter = false;
                } else {
                    melodyPlays = false;
                    playCounter = (g.sixteenthStep % 2 === 0 && rng.next() < 0.6) || (g.sixteenthStep % 4 === 3 && rng.next() < 0.4);
                }
            } else {
                if (settings.countermelodyEnabled) {
                    const mode = settings.countermelodyMode || 'contrary';
                    if (mode === 'harmonize') {
                        if (melodyPlays && rng.next() < 0.6) playCounter = true;
                    } else {
                        const activeDensityVal = settings.density !== undefined ? settings.density : 0.5;
                        const playProb = 0.25 + activeDensityVal * 0.2;
                        if (rng.next() < playProb) playCounter = true;
                    }
                }
            }

            const stepPos = g.sixteenthStep / totalSteps;
            const activeTransition = transitionPitches.find(t => Math.abs(stepPos - t.startTime) < (0.5 / totalSteps));

            let pitch = prevPitch;
            if (melodyPlays) {
                let effectiveValidPitches = validPitches;
                const semitone = 12 / divisions;
                if (b5ResolutionDirection !== null && lastBluePitch !== null) {
                    pitch = lastBluePitch + b5ResolutionDirection;
                    b5ResolutionDirection = null;
                } else if (b3ResolutionForced && lastBluePitch !== null) {
                    pitch = lastBluePitch + semitone;
                    b3ResolutionForced = false;
                } else {
                    // Pre-gate isolated notes / cluster role constraint
                    const isIsolated = isolatedStepsSet.has(g.step);
                    effectiveValidPitches = validPitches;
                if (settings.genre !== 'none') {
                    const nextChordTones = (nextChordNotes || []).map(n => {
                        let note = n;
                        while (note < melodyRangeStart) note += periodSize;
                        while (note > melodyRangeEnd) note -= periodSize;
                        return note;
                    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);

                    if (g.clusterRole) {
                        const nextChordTonePcSet = new Set((nextChordNotes || []).map(n => Math.round(((n % periodSize + periodSize) % periodSize) * 100) / 100));
                        if (g.clusterRole === 'reinforce') {
                            effectiveValidPitches = validPitches.filter(p => {
                                const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
                                return chordTonePcSet.has(pc);
                            });
                        } else if (g.clusterRole === 'foreshadow_note') {
                            effectiveValidPitches = nextChordTones.length > 0 ? nextChordTones : validPitches;
                        } else if (g.clusterRole === 'foreshadow_glue') {
                            const nextScaleIntervals = nextChordObj ? getScaleIntervals(deduceSourceMode(nextChordObj.symbol, state.mode || 'major') || state.mode || 'major', settings.genre, divisions) : globalScaleIntervals;
                            const nextScalePitchesRaw = buildScalePitches(nextChordObj && nextChordObj.key !== undefined ? Number(nextChordObj.key) : keyRoot, nextScaleIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
                            effectiveValidPitches = adjustScalePitches(nextScalePitchesRaw);
                        } else if (g.clusterRole === 'commontone') {
                            effectiveValidPitches = validPitches.filter(p => {
                                const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
                                return chordTonePcSet.has(pc) && nextChordTonePcSet.has(pc);
                            });
                        }
                        if (effectiveValidPitches.length === 0) {
                            effectiveValidPitches = validPitches.filter(p => {
                                const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
                                return chordTonePcSet.has(pc);
                            });
                        }
                    } else if (isIsolated) {
                        effectiveValidPitches = getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches);
                    }
                }
                if (effectiveValidPitches.length === 0) {
                    effectiveValidPitches = validPitches;
                }

                if (prevWasBlue && lastBluePitch !== null) {
                    effectiveValidPitches = effectiveValidPitches.filter(p => Math.abs(p - (lastBluePitch - 1)) > 0.01);
                }

                // Color tone constraint (Pass 2)
                const canUseColorTone = isPassingContext(gridSteps, gIndex, stepPlaysMap, activeChordTones)
                    && !isIsolated
                    && g.beat !== 0 && g.beat !== 2;

                if (!canUseColorTone && settings.genre !== 'none') {
                    effectiveValidPitches = effectiveValidPitches.filter(p => {
                        const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
                        return activeScalePcSet.has(pc) || chordTonePcSet.has(pc);
                    });
                }

                if (g.clusterRole === 'foreshadow_note' && settings.genre !== 'none') {
                    const nextTone = getDistinctiveNextTone();
                    if (nextTone !== null) {
                        let target = nextTone;
                        while (target < melodyRangeStart) target += periodSize;
                        while (target > melodyRangeEnd) target -= periodSize;
                        pitch = findClosest(target, effectiveValidPitches);
                    } else {
                        pitch = plannedAnchor1;
                    }
                } else if (g.clusterRole === 'foreshadow_glue' && settings.genre !== 'none') {
                    const nextChordTones = (nextChordNotes || []).map(n => {
                        let note = n;
                        while (note < melodyRangeStart) note += periodSize;
                        while (note > melodyRangeEnd) note -= periodSize;
                        return note;
                    }).filter(n => n >= melodyRangeStart && n <= melodyRangeEnd);
                    const resolutionTarget = nextChordTones.length > 0 ? findClosest(prevPitch, nextChordTones) : prevPitch;

                    const nextScaleIntervals = nextChordObj ? getScaleIntervals(deduceSourceMode(nextChordObj.symbol, state.mode || 'major') || state.mode || 'major', settings.genre, divisions) : globalScaleIntervals;
                    const nextScalePitchesRaw = buildScalePitches(nextChordObj && nextChordObj.key !== undefined ? Number(nextChordObj.key) : keyRoot, nextScaleIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
                    const nextScalePitches = adjustScalePitches(nextScalePitchesRaw);

                    const stepDir = resolutionTarget > prevPitch ? 1 : (resolutionTarget < prevPitch ? -1 : (rng.next() > 0.5 ? 1 : -1));
                    const prevIdxInNextScale = findScaleIndex(findClosest(prevPitch, nextScalePitches), nextScalePitches, divisions);
                    let gluePitch = prevPitch;
                    if (prevIdxInNextScale !== -1) {
                        const glueIdx = Math.max(0, Math.min(nextScalePitches.length - 1, prevIdxInNextScale + stepDir));
                        gluePitch = nextScalePitches[glueIdx];
                    } else {
                        gluePitch = prevPitch + stepDir * (12 / divisions);
                    }
                    pitch = findClosest(gluePitch, effectiveValidPitches);
                } else if (g.isAnchor1Step && plannedAnchor1 !== null) {
                    pitch = plannedAnchor1;
                } else if (g.isAnchor2Step && plannedAnchor2 !== null) {
                    pitch = plannedAnchor2;
                } else if (g.sixteenthStep === 0 && forceTonicNext) {
                    pitch = findClosest(chordKey + 12, effectiveValidPitches);
                    forceTonicNext = false;
                } else {
                    // Connective Fill
                    let connectivePitch = prevPitch;
                    const prevIdx = findScaleIndex(prevPitch, effectiveValidPitches, divisions);

                    if (settings.genre === 'none') {
                        let motifNote;
                        if (g.subdivision >= 4 && g.sub > 0) {
                            const dir = lastInterval >= 0 ? 1 : -1;
                            motifNote = prevIdx !== -1 ? effectiveValidPitches[Math.max(0, Math.min(effectiveValidPitches.length - 1, prevIdx + dir))] : sliceMotif[noteCountThisPhrase % sliceMotif.length];
                        } else {
                            motifNote = sliceMotif[noteCountThisPhrase % sliceMotif.length];
                        }
                        connectivePitch = motifNote;
                    } else {
                        const nextAnchor = (g.beat < 2 && plannedAnchor2 !== null) ? plannedAnchor2 : plannedAnchor1;
                        const nextAnchorIdx = findScaleIndex(nextAnchor, effectiveValidPitches, divisions);

                        if (slotAestheticMode === 'cantabile') {
                            if (prevIdx !== -1 && nextAnchorIdx !== -1) {
                                const bias = getPreferredIntervalBias(activeRole, slotAestheticMode);
                                const dir = nextAnchorIdx > prevIdx ? 1 : (nextAnchorIdx < prevIdx ? -1 : (rng.next() > 0.5 ? 1 : -1));
                                const nextIdx = Math.max(0, Math.min(effectiveValidPitches.length - 1, prevIdx + dir + bias));
                                connectivePitch = effectiveValidPitches[nextIdx];
                            } else {
                                connectivePitch = findClosestStep(prevPitch, effectiveValidPitches, divisions);
                            }
                        } else if (slotAestheticMode === 'sighs') {
                            const wasLeap = Math.abs(lastInterval) >= 4;
                            if (!wasLeap && prevIdx !== -1) {
                                const leapAmount = 4 + Math.floor(rng.next() * 3);
                                let leapIdx = Math.min(effectiveValidPitches.length - 1, prevIdx + leapAmount);
                                let attempts = 0;
                                while (attempts < 3 && chordTonePcSet.has(Math.round(((effectiveValidPitches[leapIdx] % periodSize + periodSize) % periodSize) * 100) / 100)) {
                                    leapIdx = Math.max(0, leapIdx - 1);
                                    attempts++;
                                }
                                connectivePitch = effectiveValidPitches[leapIdx];
                            } else {
                                if (prevIdx !== -1) {
                                    connectivePitch = effectiveValidPitches[Math.max(0, prevIdx - 1)];
                                } else {
                                    connectivePitch = findClosest(prevPitch - 1, effectiveValidPitches);
                                }
                            }
                        } else if (slotAestheticMode === 'virtuoso') {
                            const dir = lastInterval >= 0 ? 1 : -1;
                            if (prevIdx !== -1) {
                                const nextIdx = Math.max(0, Math.min(effectiveValidPitches.length - 1, prevIdx + dir));
                                connectivePitch = effectiveValidPitches[nextIdx];
                            } else {
                                connectivePitch = findClosestStep(prevPitch, effectiveValidPitches, divisions);
                            }
                        } else if (slotAestheticMode === 'declamatory') {
                            const cellOffsets = [0, 2, 1];
                            const cellStep = g.sixteenthStep % cellOffsets.length;
                            const cellOffset = cellOffsets[cellStep];

                            const anchor1Idx = findScaleIndex(plannedAnchor1, effectiveValidPitches, divisions);
                            if (anchor1Idx !== -1) {
                                let targetIdx = Math.max(0, Math.min(effectiveValidPitches.length - 1, anchor1Idx + cellOffset));
                                connectivePitch = effectiveValidPitches[targetIdx];
                            } else {
                                connectivePitch = plannedAnchor1;
                            }

                            if (rng.next() < slotActivity * 0.25) {
                                const octaveShift = rng.next() > 0.5 ? periodSize : -periodSize;
                                let shifted = connectivePitch + octaveShift;
                                if (shifted >= melodyRangeStart && shifted <= melodyRangeEnd) {
                                    connectivePitch = findClosest(shifted, effectiveValidPitches);
                                }
                            }
                        }
                    }

                    pitch = findClosest(connectivePitch, effectiveValidPitches);
                }
                stepsSinceLastSurprise++;

                if (lastInterval !== 0 && (Math.abs(lastInterval) > 4 || forceContraryNext) && !(melodyScheduled.length === 0 && settings.macroPlannerEnabled && macroSlotTarget)) {
                    const contraryDirection = lastInterval > 0 ? -1 : 1;
                    const currentInterval = pitch - prevPitch;
                    const resolvesContrary = (lastInterval > 0 && currentInterval < 0) || (lastInterval < 0 && currentInterval > 0);
                    if (!resolvesContrary) {
                        const candidates = effectiveValidPitches.filter(p => contraryDirection > 0 ? p > prevPitch : p < prevPitch);
                        if (candidates.length > 0) {
                            pitch = contraryDirection > 0 ? candidates[0] : candidates[candidates.length - 1];
                        }
                    }
                    forceContraryNext = false;
                }

                pitch = findClosest(pitch, effectiveValidPitches);

                // Downbeat/Anchor Chord Tone Enforcement for structural notes (subdivision <= 2)
                const isDownbeatStep = g.sixteenthStep === 0 || g.sixteenthStep === Math.floor(totalSteps / 2);
                if (isDownbeatStep && g.subdivision <= 2 && settings.genre !== 'none') {
                    const stableTones = getStableTones(activeChordTones, chordKey, keyRoot, periodSize, effectiveValidPitches);
                    pitch = findClosest(pitch, stableTones);
                }

                // Prevent repeated identical pitches for melody by forcing stepwise movement
                if (!g.isAnchor1Step && !g.isAnchor2Step && Math.abs(pitch - prevPitch) < 0.01 && effectiveValidPitches.length > 1 && settings.genre !== 'none') {
                    const idx = findScaleIndex(pitch, effectiveValidPitches, divisions);
                    if (idx !== -1) {
                        const dir = lastInterval >= 0 ? 1 : -1;
                        let newIdx = idx + dir;
                        if (newIdx < 0 || newIdx >= effectiveValidPitches.length) {
                            newIdx = idx - dir;
                        }
                        pitch = effectiveValidPitches[Math.max(0, Math.min(effectiveValidPitches.length - 1, newIdx))];
                    }
                }

                // Snap if isolated (already pre-gated, but kept as safety snap)
                if (isolatedStepsSet.has(g.step)) {
                    const stableTones = getStableTones(activeChordTones, chordKey, keyRoot, periodSize, effectiveValidPitches);
                    pitch = findClosest(pitch, stableTones);
                }
                }

                if (settings.macroPlannerEnabled && macroSlotTarget) {
                    if (phraseHighestPitch !== null && pitch === phraseHighestPitch) {
                        peakPitchHitsCount++;
                        if (peakPitchHitsCount > 2) {
                            const idx = findScaleIndex(pitch, validPitches, divisions);
                            if (idx !== -1 && idx > 0) {
                                pitch = validPitches[idx - 1];
                            }
                        }
                    }
                    if (phraseHighestPitch === null || pitch > phraseHighestPitch) {
                        phraseHighestPitch = pitch;
                        peakPitchHitsCount = 1;
                        if (songHighestPitch === null || pitch > songHighestPitch) {
                            songHighestPitch = pitch;
                        }
                    }
                }
                
                // Voice-leading collision prevention (Change 5B - Voice-leading check)
                const edoStep = periodSize / divisions;
                if (prevPitch !== null && Math.abs(pitch - prevPitch) > 0.01 && Math.abs(pitch - prevPitch) < 0.99 * edoStep) {
                    let currentIdx = effectiveValidPitches.indexOf(pitch);
                    if (currentIdx === -1) {
                        let minDiff = Infinity;
                        for (let k = 0; k < effectiveValidPitches.length; k++) {
                            const diff = Math.abs(effectiveValidPitches[k] - pitch);
                            if (diff < minDiff) {
                                minDiff = diff;
                                currentIdx = k;
                            }
                        }
                    }
                    if (currentIdx !== -1) {
                        const dir = pitch > prevPitch ? 1 : -1;
                        let targetIdx = currentIdx + dir;
                        if (targetIdx < 0 || targetIdx >= effectiveValidPitches.length) {
                            targetIdx = currentIdx - dir;
                        }
                        const oldPitch = pitch;
                        pitch = effectiveValidPitches[Math.max(0, Math.min(effectiveValidPitches.length - 1, targetIdx))];
                    }
                }

                const scalePitch = pitch;
                let isAltered = false;
                if (!prevWasBlue) {
                    const semitone = 12 / divisions;
                    const proposedBluePitch = scalePitch - semitone;
                    
                    // b5 is pc=6, b3 is pc=3 relative to chord root (chordKey)
                    const proposedPc = (proposedBluePitch - chordKey % 12 + 12) % 12;
                    let canApplyBlue = false;
                    let isB5 = Math.abs(proposedPc - 6) < 0.1;
                    let isB3 = Math.abs(proposedPc - 3) < 0.1;

                    if (isB5) {
                        // b5 must be in the middle of a chromatic run (prev note must be 1 semitone away)
                        if (prevPitch !== null && Math.abs(Math.abs(prevPitch - proposedBluePitch) - semitone) < 0.05) {
                            canApplyBlue = true;
                            b5ResolutionDirection = proposedBluePitch - prevPitch; // continue same direction
                        }
                    } else if (isB3) {
                        // b3 is a start note, followed by a half-step above
                        canApplyBlue = true;
                        b3ResolutionForced = true;
                    }

                    if (canApplyBlue) {
                        pitch = applyGenreRules(pitch, settings.genre, g.sixteenthStep, effectiveValidPitches, divisions, chromaticProb, rng);
                        if (pitch !== scalePitch) {
                            isAltered = true;
                            lastBluePitch = pitch;
                        } else {
                            b5ResolutionDirection = null;
                            b3ResolutionForced = false;
                        }
                    }
                }
                prevWasBlue = isAltered;

                const melodyInst = state.instruments.melody || 'sine';

                melodyScheduled.push({
                    pitch,
                    stepTime: g.stepTime,
                    noteDuration: g.noteDuration,
                    melodyInst,
                    step: g.sixteenthStep,
                    sixteenthStep: g.sixteenthStep,
                    isAnchor1Step: g.isAnchor1Step,
                    isAnchor2Step: g.isAnchor2Step,
                    isIsolated: isolatedStepsSet.has(g.step)
                });

                const isStep = Math.abs(pitch - prevPitch) <= 2.1 * (12 / divisions);
                if (isStep) {
                    narrativeState.consecutiveSteps++;
                } else {
                    narrativeState.consecutiveSteps = 0;
                }

                lastInterval = pitch - prevPitch;
                prevPitch = scalePitch;
                const pitchPc = Math.round(((pitch % periodSize + periodSize) % periodSize) * 100) / 100;
                prevPitchIsColor = !activeScalePcSet.has(pitchPc) && !chordTonePcSet.has(pitchPc);
            }

            if (settings.countermelodyEnabled) {
                let counterPlays = false;
                if (settings.genre === 'none') {
                    counterPlays = playCounter;
                } else {
                    const counterTemplateStep = Math.floor(g.sixteenthStep * (4 / stepsPerBeat)) % 16;
                    counterPlays = (slotCounterRhythmTemplate[counterTemplateStep] === 1) && (counterTemplateStep !== prevCounterTemplateStep);
                    prevCounterTemplateStep = counterTemplateStep;
                }

                // ── Melody-awareness gate (Change 3B) ────────────────────────────────────
                // When melody is playing, sharply reduce countermelody probability.
                // Exception: 'harmonize' mode is supposed to double the melody.
                // Exception: 'call-response' mode manages its own split-time logic above.
                if (
                    counterPlays &&
                    melodyPlays &&
                    settings.countermelodyMode !== 'harmonize' &&
                    settings.countermelodyMode !== 'call-response'
                ) {
                    // 15% chance to keep the countermelody active when melody is playing.
                    // This allows occasional harmonic touches without cluttering the texture.
                    counterPlays = rng.next() < 0.15;
                }

                if (counterPlays && counterNoteCount < MAX_COUNTER_NOTES_PER_SLOT) {
                    const slotState = { g, melodyPlays, pitch, lastInterval, prevCounterPitch, counterValidPitches, divisions, keyRoot, periodSize, settings, slotAestheticMode, counterActiveChordTones, isolatedCounterStepsSet, chordKey, validPitches, activeScalePcSet, chordTonePcSet, currentTension, activeTransition, state, counterScheduled, melodyHistory };
                    generateCountermelodyNote(context, slotState);
                    counterNoteCount++;
                    prevCounterPitch = slotState.prevCounterPitch;
                    counterPhraseDirectionBias = context.counterPhraseDirectionBias;
                    counterPhraseStepsRemaining = context.counterPhraseStepsRemaining;
                    counterLastPitch = context.counterLastPitch;
                }
            }
        }

        applyMotivicFlexing(melodyScheduled, activeScalePcSet, chordTonePcSet, periodSize, divisions);
    }

    // --- Empty Slot Mitigation Fallback ---
    // If no melody notes were scheduled, and the genre is not 'none',
    // force a single note on an occasional downbeat or a random active step to ensure minimal melodic activity.
    if (melodyScheduled.length === 0 && settings.genre !== 'none') {
        const motifNote = sliceMotif[0];
        let pitch = findClosest(motifNote, validPitches);
        pitch = applyGenreRules(pitch, settings.genre, 0, validPitches, divisions, chromaticProb, rng);
        pitch = findClosest(pitch, validPitches);

        const melodyInst = state.instruments.melody || 'sine';
        // Occasional downbeat fallback (35% chance), otherwise place on a random step (e.g. step 2, 4, or 8)
        const useDownbeat = rng.next() < 0.35;
        const targetStep = useDownbeat ? 0 : [2, 4, 6, 8][Math.floor(rng.next() * 4)];
        const stepTime = time + (targetStep * (chordSlotDuration / totalSteps));
        const noteDuration = (chordSlotDuration / beats) * 0.9; // Approximate quarter note duration

        melodyScheduled.push({
            pitch,
            stepTime,
            noteDuration,
            melodyInst,
            step: targetStep,
            sixteenthStep: targetStep,
            isAnchor1Step: false,
            isAnchor2Step: false
        });
    }

    // --- Countermelody Empty Slot Mitigation Fallback ---
    if (settings.countermelodyEnabled && counterScheduled.length === 0 && settings.genre !== 'none') {
        const counterInst = state.instruments.countermelody || 'sine';
        const targetStep = 8;
        const stepTime = time + (targetStep * (chordSlotDuration / totalSteps));
        const noteDuration = (chordSlotDuration / beats) * 0.9;
        const counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);

        counterScheduled.push({
            pitch: counterPitch,
            stepTime,
            noteDuration,
            counterInst,
            step: targetStep
        });
        counterLastPitch = prevCounterPitch;
        prevCounterPitch = counterPitch;
    }




    // --- Apply Resolution Rules on the actual notes scheduled ---

    // Rule A: consequent phrase ending note resolves to root/3rd
    if (melodyScheduled.length > 0 && isConsequentPhrase && !isDominantChord(chordObj)) {
        const finalNote = melodyScheduled[melodyScheduled.length - 1];
        // All user-provided chord tones are stable resolution targets.
        // Use them directly rather than re-filtering through interval heuristics.
        let stableTones = activeChordTones.length > 0
            ? activeChordTones
            : validPitches;
        if (activeChordTones.length > 0) {
            const rootAndThird = activeChordTones.filter(ct => {
                const pc = ((ct % periodSize) + periodSize) % periodSize;
                const chordRootPc = ((chordKey % periodSize) + periodSize) % periodSize;
                const diff = (pc - chordRootPc + periodSize) % periodSize;
                return Math.abs(diff) < 0.01 || Math.abs(diff - 3) < 0.01 || Math.abs(diff - 4) < 0.01;
            });
            if (rootAndThird.length > 0) {
                stableTones = rootAndThird;
            }
        }
        if (stableTones.length > 0) {
            finalNote.pitch = findClosest(finalNote.pitch, stableTones);
        }
    }

    // --- Post-Processing: Foreshadowing & Repeated Pitch Prevention ---
    if (melodyScheduled.length > 0) {
        const beatLen = 60 / bpm;
        const nextChordNotes = nextChordObj ? getChordNotes(nextChordObj, nextChordObj.key !== undefined ? Number(nextChordObj.key) : state.baseKey, divisions) : [];

        // Helper to find closest octave equivalent in EDO system
        const getClosestOctaveEquivalent = (pitch, targetPitch, periodSize) => {
            const diff = pitch - targetPitch;
            const k = Math.round(diff / periodSize);
            return targetPitch + k * periodSize;
        };

        for (let i = 0; i < melodyScheduled.length; i++) {
            const n = melodyScheduled[i];
            const nextTime = (i < melodyScheduled.length - 1) ? melodyScheduled[i + 1].stepTime : (time + chordSlotDuration);

            // Ensure note duration does not overlap with the next scheduled note
            if (n.stepTime + n.noteDuration > nextTime) {
                n.noteDuration = Math.max(0.01, nextTime - n.stepTime);
            }

            const silenceDuration = nextTime - (n.stepTime + n.noteDuration);

            // 0. Sanitation Pass: Resolve passing/color notes (non-chord tones that are also non-scale tones)
            if (settings.genre !== 'none' && settings.genre !== 'jazz' && settings.genre !== 'blues') {
                const pc = Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100;
                const isColorTone = !chordTonePcSet.has(pc) && !activeScalePcSet.has(pc);
                if (isColorTone && activeChordTones.length > 0) {
                    const nextActiveNote = (i < melodyScheduled.length - 1) ? melodyScheduled[i + 1] : null;
                    const isNextClose = nextActiveNote && (nextActiveNote.sixteenthStep - n.sixteenthStep <= 4);
                    
                    if (!isNextClose) {
                        n.pitch = findClosest(n.pitch, activeChordTones);
                    } else {
                        const nextPc = Math.round(((nextActiveNote.pitch % periodSize + periodSize) % periodSize) * 100) / 100;
                        const isNextChordTone = chordTonePcSet.has(nextPc);
                        const isStepwise = Math.abs(n.pitch - nextActiveNote.pitch) <= 2.01;
                        
                        if (!isNextChordTone || !isStepwise) {
                            n.pitch = findClosest(n.pitch, activeChordTones);
                        }
                    }
                }
            }

            // 1. Foreshadowing / Anticipation / Resolution for long silences
            // Avoid hijacking downbeats or early notes; only apply if the note is late in the slot (sixteenthStep >= 12)
            const isConsequentFinal = (i === melodyScheduled.length - 1) && isConsequentPhrase && !isDominantChord(chordObj);
            if (silenceDuration > 0.6 * beatLen && !isConsequentFinal && n.sixteenthStep >= 12) {
                if (nextChordObj && nextChordNotes.length > 0) {
                    const candidatePitches = nextChordNotes.map(ct => getClosestOctaveEquivalent(n.pitch, ct, periodSize));
                    let target = findClosest(n.pitch, candidatePitches);
                    while (target < melodyRangeStart) target += periodSize;
                    while (target > melodyRangeEnd) target -= periodSize;
                    n.pitch = target;
                } else {
                    const stableTones = getStableTones(activeChordTones, chordKey, keyRoot, periodSize, validPitches);
                    if (stableTones.length > 0) {
                        const candidatePitches = stableTones.map(st => getClosestOctaveEquivalent(n.pitch, st, periodSize));
                        let target = findClosest(n.pitch, candidatePitches);
                        n.pitch = findClosest(target, validPitches);
                    }
                }
            }

            // 2. Repeated Pitch Prevention (check against previous note's pitch within the current slot)
            if (i > 0 && !isConsequentFinal) {
                const prev = melodyScheduled[i - 1].pitch;
                if (prev !== null && Math.abs(n.pitch - prev) < 0.01 && validPitches.length > 1) {
                    const edoStep = periodSize / divisions;
                    const idx = findScaleIndex(n.pitch, validPitches, divisions);
                    if (idx !== -1) {
                        let dir = (n.pitch - prev >= 0) ? 1 : -1;
                        if (dir === 0) dir = 1;
                        let targetPitch = null;
                        for (let d of [dir, -dir]) {
                            let stepOffset = d;
                            while (true) {
                                let newIdx = idx + stepOffset;
                                if (newIdx < 0 || newIdx >= validPitches.length) break;
                                const cand = validPitches[newIdx];
                                const diff = Math.abs(cand - prev);
                                if (diff > 0.01 && diff >= 0.99 * edoStep) {
                                    targetPitch = cand;
                                    break;
                                }
                                stepOffset += d;
                            }
                            if (targetPitch !== null) break;
                        }
                        if (targetPitch !== null) {
                            n.pitch = targetPitch;
                        } else {
                            let newIdx = idx + dir;
                            if (newIdx < 0 || newIdx >= validPitches.length) {
                                newIdx = idx - dir;
                            }
                            n.pitch = validPitches[Math.max(0, Math.min(validPitches.length - 1, newIdx))];
                        }
                    }
                }
            }
        }
    }

    // Play/Schedule all collected melody notes
    melodyScheduled.forEach((n, idx) => {
        let pitch = n.pitch;

        const nextTime = (idx < melodyScheduled.length - 1) ? melodyScheduled[idx + 1].stepTime : (time + chordSlotDuration);
        const gapAfter = nextTime - (n.stepTime + n.noteDuration);

        playToneFn(midiToFreq(pitch), n.stepTime, n.noteDuration, n.melodyInst, 'melody', 0, 1.0, { gapAfter, step: n.step });
        const prevNote = idx > 0 ? melodyScheduled[idx - 1] : null;
        const spaceBefore = prevNote ? (n.stepTime - (prevNote.stepTime + prevNote.noteDuration)) : 1.0;
        if (!n.isIsolated && spaceBefore >= 0.08) {
            applyOrnaments(n.pitch, n.stepTime, n.noteDuration, settings.genre, ornamentProb, n.melodyInst, 'melody', playToneFn, rng, validPitches);
        }
        debugNotes.push({ step: n.step, type: 'Melody', pitch: n.pitch });
        melodyHistory.push(n.pitch);
        if (melodyHistory.length > 32) {
            melodyHistory.shift();
        }
    });

    // Play/Schedule all collected countermelody notes
    counterScheduled.forEach((n, idx) => {
        const nextTime = (idx < counterScheduled.length - 1) ? counterScheduled[idx + 1].stepTime : (time + chordSlotDuration);
        if (n.stepTime + n.noteDuration > nextTime) {
            n.noteDuration = Math.max(0.01, nextTime - n.stepTime);
        }
        const gapAfter = nextTime - (n.stepTime + n.noteDuration);

        playToneFn(midiToFreq(n.pitch), n.stepTime, n.noteDuration, n.counterInst, 'countermelody', 0, 1.0, { gapAfter, step: n.step });
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
        const finalPc = Math.round(((finalNote.pitch % periodSize + periodSize) % periodSize) * 100) / 100;
        globalPrevPitchIsColor = !activeScalePcSet.has(finalPc) && !chordTonePcSet.has(finalPc);
    } else {
        globalPrevPitchIsColor = false;
    }

    globalPrevPitch = prevPitch;
    globalPrevCounterPitch = prevCounterPitch;
    globalLastInterval = lastInterval;
    
    if (melodyScheduled.length > 0) {
        globalLastMelodyNoteTime = melodyScheduled[melodyScheduled.length - 1].stepTime;
    }
    if (counterScheduled.length > 0) {
        globalLastCountermelodyNoteTime = counterScheduled[counterScheduled.length - 1].stepTime;
    }

    if (settings.genre !== 'none' && slotHasFlourish && runStartStep + runLength >= totalSteps) {
        prevSlotEndedWithRun = true;
        prevSlotRunRemainingLength = stepsPerBeat * (1 + Math.floor(rng.next() * 2));
        if (melodyScheduled.length > 0) {
            prevSlotLastPitch = melodyScheduled[melodyScheduled.length - 1].pitch;
        } else {
            prevSlotLastPitch = null;
        }
    } else {
        prevSlotEndedWithRun = false;
        prevSlotRunRemainingLength = 0;
        prevSlotLastPitch = null;
    }

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

    // Detailed melody generator diagnostics for real-time monitoring in browser console
    const showLogs = typeof navigator !== 'undefined' && (!/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.location.search.includes('debug=1')));
    if (showLogs) {
        console.group(`🎵 Slot ${absIndex} (${chordObj.symbol}, Key ${chordKey}): ${slotAestheticMode} | Act ${slotActivity.toFixed(2)} | Den ${settings.density} | Rests ${settings.restProbability} | Limit ${settings.maxNoteSpeed || settings.shortestNoteLimit || 16} | Chords: [${(chordNotes || []).join(', ')}]`);
        if (melodyScheduled.length > 0) {
            const mStr = melodyScheduled.map(n => {
                const isChordTone = chordTonePcSet.has(Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100);
                const isScaleTone = activeScalePcSet.has(Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100);
                const type = isChordTone ? 'Chord' : (isScaleTone ? 'Scale' : 'Color');
                const flags = [type];
                if (n.isAnchor1Step) flags.push('A1');
                if (n.isAnchor2Step) flags.push('A2');
                return `${n.pitch}@${n.step}(${n.noteDuration.toFixed(2)}s)[${flags.join(',')}]`;
            }).join(', ');
            console.log(`Melody: ${mStr}`);
        } else {
            console.log("Melody: none");
        }
        if (counterScheduled.length > 0) {
            const cStr = counterScheduled.map(n => `${n.pitch}@${n.step}(${n.noteDuration.toFixed(2)}s)`).join(', ');
            console.log(`Counter: ${cStr}`);
        }
        console.groupEnd();
    }

    // Write back updated state to the context object before exiting
    context.motifCache = motifCache;
    context.counterPhraseDirectionBias = counterPhraseDirectionBias;
    context.counterPhraseStepsRemaining = counterPhraseStepsRemaining;
    context.counterLastPitch = counterLastPitch;
    context.songFormSection = songFormSection;
    context.sectionAMotifFamily = sectionAMotifFamily;
    context.sectionARhythmTemplate = sectionARhythmTemplate;
    context.sectionAAestheticMode = sectionAAestheticMode;
    context.sectionAChordRootPitch = sectionAChordRootPitch;
    context.stepsSinceLastSurprise = stepsSinceLastSurprise;
    context.noteCountThisPhrase = noteCountThisPhrase;
    context.forceContraryNext = forceContraryNext;
    context.forceTonicNext = forceTonicNext;
    context.globalPrevPitch = globalPrevPitch;
    context.globalPrevCounterPitch = globalPrevCounterPitch;
    context.globalLastInterval = globalLastInterval;
    context.globalMelodyHistory = globalMelodyHistory;
    context.phraseLocalScaleOffset = phraseLocalScaleOffset;
    context.globalPrevPitchIsColor = globalPrevPitchIsColor;
    context.macroTargetPlan = macroTargetPlan;
    context.phraseHighestPitch = phraseHighestPitch;
    context.songHighestPitch = songHighestPitch;
    context.peakPitchHitsCount = peakPitchHitsCount;
    context.activeAestheticMode = activeAestheticMode;
    context.phraseActivityCurve = phraseActivityCurve;
    context.phraseRhythmTemplate = phraseRhythmTemplate;
    context.phraseCounterRhythmTemplate = phraseCounterRhythmTemplate;
    context.globalPrevAnchor = globalPrevAnchor;
    context.phraseRhythmicMotif = phraseRhythmicMotif;
    context.previousAbsIndex = previousAbsIndex;
    context.progressionLoopCounter = progressionLoopCounter;
    context.prevSlotEndedWithRun = prevSlotEndedWithRun;
    context.prevSlotRunRemainingLength = prevSlotRunRemainingLength;
    context.prevSlotLastPitch = prevSlotLastPitch;
    context.globalLastMelodyNoteTime = globalLastMelodyNoteTime;
    context.globalLastCountermelodyNoteTime = globalLastCountermelodyNoteTime;
    context.narrativeState = narrativeState;
}
