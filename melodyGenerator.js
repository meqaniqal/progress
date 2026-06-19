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


// Cache for motif memory across iterations
// Structure: { keyString: { hook: [], connector: [], cadence: [], hookRhythm: [] } }
let motifCache = {};

// Countermelody phrase direction memory (Change 2)
let counterPhraseDirectionBias = 0;    // +1 ascending, -1 descending, 0 neutral
let counterPhraseStepsRemaining = 0;   // steps left in the current direction commitment
let counterLastPitch = null;           // one-step-back memory for no-return guard

// ── SongFormCoordinator state (Change 4) ─────────────────────────────────
let songFormSection = 'A';           // Current section: 'A', 'B', or 'A_prime'
let sectionAMotifFamily = null;      // Stored motif family from section A
let sectionARhythmTemplate = null;   // Stored rhythm template from section A
let sectionAAestheticMode = null;    // Stored aesthetic mode from section A
let sectionAChordRootPitch = null;   // Absolute root pitch of the first chord in section A
                                     // (used for transposition in A')

// Phrase and surprise state tracking
let stepsSinceLastSurprise = 10;
let noteCountThisPhrase = 0;
let forceContraryNext = false;
let forceTonicNext = false;
let globalPrevPitch = null;
let globalPrevCounterPitch = null;
let globalLastInterval = 0;
let globalMelodyHistory = [];
let phraseLocalScaleOffset = -1;
let globalPrevPitchIsColor = false;

// Macro Planner State Caches
let macroTargetPlan = null;
let phraseHighestPitch = null;
let songHighestPitch = null;
let peakPitchHitsCount = 0;

let activeAestheticMode = 'cantabile';
let phraseActivityCurve = [];
let phraseRhythmTemplate = [];
let phraseCounterRhythmTemplate = [];
let globalPrevAnchor = null;
let phraseRhythmicMotif = null;
let previousAbsIndex = -1;
let progressionLoopCounter = 0;
let prevSlotEndedWithRun = false;
let prevSlotRunRemainingLength = 0;
let prevSlotLastPitch = null;
let globalLastMelodyNoteTime = -999;
let globalLastCountermelodyNoteTime = -999;

// Narrative State Tracker

let narrativeState = {
    consecutiveSteps: 0,
    lowRegisterBars: 0,
    motifRepeats: 0,
    phraseSubdivisions: []
};

export function clearMelodyMemory() {
    motifCache = {};
    counterPhraseDirectionBias = 0;
    counterPhraseStepsRemaining = 0;
    counterLastPitch = null;
    songFormSection = 'A';
    sectionAMotifFamily = null;
    sectionARhythmTemplate = null;
    sectionAAestheticMode = null;
    sectionAChordRootPitch = null;
    stepsSinceLastSurprise = 10;
    noteCountThisPhrase = 0;
    forceContraryNext = false;
    forceTonicNext = false;
    globalPrevPitch = null;
    globalPrevCounterPitch = null;
    globalLastInterval = 0;
    globalMelodyHistory = [];
    phraseLocalScaleOffset = -1;
    globalPrevPitchIsColor = false;
    macroTargetPlan = null;
    phraseHighestPitch = null;
    songHighestPitch = null;
    peakPitchHitsCount = 0;
    activeAestheticMode = 'cantabile';
    phraseActivityCurve = [];
    phraseRhythmTemplate = [];
    phraseCounterRhythmTemplate = [];
    globalPrevAnchor = null;
    phraseRhythmicMotif = null;
    previousAbsIndex = -1;
    progressionLoopCounter = 0;
    prevSlotEndedWithRun = false;
    prevSlotRunRemainingLength = 0;
    prevSlotLastPitch = null;
    globalLastMelodyNoteTime = -999;
    globalLastCountermelodyNoteTime = -999;

    narrativeState = {
        consecutiveSteps: 0,
        lowRegisterBars: 0,
        motifRepeats: 0,
        phraseSubdivisions: []
    };
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
        if (!macroTargetPlan || macroTargetPlan.length !== totalChords) {
            macroTargetPlan = planMacroMelodyTargets(totalChords, keyRoot, divisions, state.mode || 'major', settings);
        }
    }

    // Reset phrase bound motif index at phrase start boundaries
    if (absIndex % 4 === 0) {
        noteCountThisPhrase = 0;
        phraseHighestPitch = null;
        peakPitchHitsCount = 0;
        narrativeState.phraseSubdivisions = generatePhraseSubdivisions(settings.genre);

        const localChance = settings.variationDepth >= 0.4 ? (settings.variationDepth * 0.6) : 0.0;
        if (settings.genre !== 'none' && Math.random() < localChance) {
            phraseLocalScaleOffset = Math.floor(Math.random() * 4);
        } else {
            phraseLocalScaleOffset = -1;
        }

        // --- Pass 0: Phrase-Level Aesthetic Mode Selection & Activity Curve ---
        phraseActivityCurve = [];
        for (let i = 0; i < 4; i++) {
            const slotIdx = absIndex + i;
            if (slotIdx >= totalChords) {
                phraseActivityCurve.push(0.5);
                continue;
            }
            const prog = slotIdx / Math.max(1, totalChords);
            const tcVal = settings.tensionCurve === 'arch' ? Math.sin(prog * Math.PI) : 0.5;

            let role = 'statement';
            if (settings.macroPlannerEnabled && macroTargetPlan && macroTargetPlan[slotIdx]) {
                role = macroTargetPlan[slotIdx].role;
            }

            let baseActivity = 0.5;
            if (role === 'climax') baseActivity = 0.9;
            else if (role === 'build') baseActivity = 0.75;
            else if (role === 'release') baseActivity = 0.35;
            else if (role === 'resolution') baseActivity = 0.2;
            else if (role === 'statement') baseActivity = 0.55;

            const slotActivity = Math.max(0.2, Math.min(1.0, settings.density * 0.4 + baseActivity * 0.6 + (tcVal - 0.5) * 0.2));
            phraseActivityCurve.push(slotActivity);
        }

        const firstProg = absIndex / Math.max(1, totalChords);
        const firstTcVal = settings.tensionCurve === 'arch' ? Math.sin(firstProg * Math.PI) : 0.5;
        const firstSlotTension = Math.max(0.0, Math.min(1.0, settings.density * 0.4 + firstTcVal * 0.6));
        const firstSlotRole = (settings.macroPlannerEnabled && macroTargetPlan && macroTargetPlan[absIndex]) ? macroTargetPlan[absIndex].role : 'statement';

        const keyRootLocal = chordObj.key !== undefined ? Number(chordObj.key) : (Number(state.baseKey) || 60);
        const baseChordKeyLocal = chordObj.key !== undefined ? Number(chordObj.key) : keyRootLocal;
        const parsed = deduceChordRootAndQuality(chordObj.symbol, baseChordKeyLocal, divisions);
        const quality = parsed ? parsed.quality : 'major';

        let mode = 'cantabile';
        if (quality === 'major') {
            mode = (firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
        } else if (quality === 'minor') {
            mode = (firstSlotRole === 'build' || (absIndex % 4 >= 1 && firstSlotTension > 0.6)) ? 'sighs' : 'cantabile';
        } else if (quality === 'minor7') {
            mode = (firstSlotTension < 0.3) ? 'cantabile' : 'sighs';
        } else if (quality === 'dominant') {
            mode = (firstSlotRole === 'climax' || firstSlotTension > 0.6) ? 'virtuoso' : 'declamatory';
        } else if (quality === 'diminished') {
            mode = (firstSlotRole === 'climax' || firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'sighs';
        } else if (quality === 'augmented') {
            mode = (firstSlotRole === 'climax' || firstSlotTension > 0.6) ? 'virtuoso' : 'sighs';
        } else if (quality === 'suspended') {
            mode = (firstSlotRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
        }

        if (settings.macroPlannerEnabled) {
            if (firstSlotRole === 'resolution') {
                mode = 'cantabile';
            } else if (firstSlotRole === 'climax') {
                if (quality !== 'diminished' && quality !== 'augmented') {
                    mode = 'virtuoso';
                } else {
                    mode = 'sighs';
                }
            } else if (firstSlotRole === 'release') {
                if (mode === 'virtuoso' || mode === 'declamatory') {
                    mode = (quality === 'minor' || quality === 'minor7' || quality === 'diminished') ? 'sighs' : 'cantabile';
                }
            }
        }

        // Density Escalation: if density is high, escalate cantabile/sighs to virtuoso/declamatory to allow fast note runs
        if (settings.density > 0.8 && settings.genre !== 'none') {
            mode = 'virtuoso';
        } else if (settings.density > 0.65 && settings.genre !== 'none') {
            if (mode === 'cantabile' || mode === 'sighs') {
                mode = Math.random() > 0.5 ? 'virtuoso' : 'declamatory';
            }
        }

        if (settings.genre === 'none') {
            mode = 'cantabile';
        }
        activeAestheticMode = mode;

        // ── Countermelody direction planning (Change 2) ─────────────────────────
        // At the start of each phrase, decide which direction the countermelody
        // should travel. Contrary motion is the default: if the melody is heading
        // toward a higher anchor, the countermelody heads down, and vice versa.
        if (absIndex % 4 === 0) {
            // `plannedAnchor1` for this slot is computed in Phase A below, but we
            // can use `globalPrevAnchor` as a proxy for the outgoing melodic pitch.
            const melodicOutgoing = globalPrevAnchor !== null ? globalPrevAnchor : (keyRoot + 12);
            const melodicIncoming = keyRoot + 12; // conservative: assume melody targets octave above root

            // Contrary motion: melody going up → counter goes down, and vice versa.
            if (melodicIncoming > melodicOutgoing + 1.0) {
                counterPhraseDirectionBias = -1;
            } else if (melodicIncoming < melodicOutgoing - 1.0) {
                counterPhraseDirectionBias = 1;
            } else {
                // Melody is staying level: alternate phrase-to-phrase
                counterPhraseDirectionBias = -counterPhraseDirectionBias || 1;
            }
            // Commit to this direction for at least 6 notes before reconsidering.
            counterPhraseStepsRemaining = 6;
        }
    }

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
                restProbability = Math.max(0.0, Math.min(0.125, restProbability));
            } else if (activeRole === 'release' || activeRole === 'resolution') {
                activeDensity = Math.min(0.35, activeDensity);
                restProbability = Math.max(0.45, restProbability);
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
    let scaleIntervals = getScaleIntervals(chordMode, settings.genre);

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
    const globalScaleIntervals = getScaleIntervals(state.mode || 'major', settings.genre);
    const globalScalePitchesRaw = buildScalePitches(keyRoot, globalScaleIntervals, divisions, melodyRangeStart, melodyRangeEnd, periodSize);
    const globalScalePitches = adjustScalePitches(globalScalePitchesRaw);
    const globalScalePcSet = new Set(globalScalePitches.map(p => Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100));

    // Dynamic Scale Center Selection: Local Chord-Scale vs Global Scale (phrase-level, and bypass during recapitulation)
    let isLocalScale = false;
    const isRecap = (progressVal > 0.9);
    const parsedChord = deduceChordRootAndQuality(chordObj.symbol, baseChordKey, divisions);
    if (parsedChord && phraseLocalScaleOffset !== -1 && (absIndex % 4) === phraseLocalScaleOffset && !isRecap && settings.genre !== 'none') {
        const candidateMode = getLocalScaleMode(parsedChord.quality, settings.genre);
        const candidateIntervals = getScaleIntervals(candidateMode, settings.genre);
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
            const isChromaticChordTone = !globalScalePcSet.has(ctPc);
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
            const evolveRoll = Math.random();
            if (evolveRoll < 0.15) {
                // 15% chance: Completely regenerate
                const baseRhythmTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre);
                phraseRhythmTemplate = baseRhythmTemplate.map(val => {
                    if (val === 0) {
                        const fillProb = settings.density > 0.4 ? Math.min(1.0, (settings.density - 0.4) / 0.5) : 0.0;
                        if (Math.random() < fillProb) return 1;
                    }
                    return val;
                });
                phraseRhythmicMotif = generateRhythmicMotif(activeAestheticMode);
            } else if (evolveRoll < 0.60) {
                // 45% chance: Evolve existing template and motif
                if (phraseRhythmTemplate && phraseRhythmTemplate.length > 0) {
                    phraseRhythmTemplate = phraseRhythmTemplate.map((val, idx) => {
                        if (idx === 0) return val; // Keep downbeat stable
                        if (Math.random() < 0.15) {
                            return val === 1 ? 0 : 1;
                        }
                        return val;
                    });
                }
                if (phraseRhythmicMotif) {
                    const motifRoll = Math.random();
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
            const baseRhythmTemplate = generateRhythmTemplate(activeAestheticMode, settings.density, settings.genre);
            
            // Dynamically open up rests in the template based on settings.density
            phraseRhythmTemplate = baseRhythmTemplate.map(val => {
                if (val === 0 && settings.genre !== 'none') {
                    const fillProb = settings.density > 0.4 ? Math.min(1.0, (settings.density - 0.4) / 0.5) : 0.0;
                    if (Math.random() < fillProb) {
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

            phraseRhythmicMotif = generateRhythmicMotif(activeAestheticMode);
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
            const isChromaticChordTone = !counterGlobalScalePcSet.has(ctPc);
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
            return !globalScalePcSet.has(pc);
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

    // ── SongFormCoordinator: store Section A material (Change 4C) ─────────────
    if (songFormSection === 'A' && absIndex === 0) {
        // Store on the very first slot of Section A.
        sectionAMotifFamily = {
            hook:        [...motifFamily.hook],
            connector:   [...motifFamily.connector],
            cadence:     [...motifFamily.cadence],
            hookRhythm:  [...motifFamily.hookRhythm],
        };
        sectionARhythmTemplate = phraseRhythmTemplate.length > 0
            ? [...phraseRhythmTemplate]
            : null;
        sectionAAestheticMode = activeAestheticMode;
        // Record the pitch class of the current chord root for A' transposition.
        sectionAChordRootPitch = chordKey;
    }

    // ── SongFormCoordinator: recall Section A in A' (Change 4D) ──────────────
    if (songFormSection === 'A_prime' && sectionAMotifFamily !== null && absIndex % 4 === 0) {
        const pitchDelta = chordKey - sectionAChordRootPitch;

        // Find the shift in scale-degree steps (not semitones) within validPitches.
        // We want to move each pitch by the number of scale steps corresponding
        // to the root-to-root interval, staying diatonic to the current key.
        const referenceShiftSteps = (() => {
            // Find the scale index of the reference pitch (keyRoot) and of
            // (keyRoot + pitchDelta) within globalScalePitches, then return the
            // difference in index.
            const refPitch = keyRoot;
            const shiftedPitch = keyRoot + pitchDelta;
            const refIdx = findScaleIndex(findClosest(refPitch, globalScalePitches), globalScalePitches, divisions);
            const shiftedIdx = findScaleIndex(findClosest(shiftedPitch, globalScalePitches), globalScalePitches, divisions);
            if (refIdx === -1 || shiftedIdx === -1) return 0;
            return shiftedIdx - refIdx;
        })();

        // Transpose each motif cell by the computed scale-step shift.
        const recallHook = applySequence(sectionAMotifFamily.hook, validPitches, referenceShiftSteps, divisions);
        const recallConnector = applySequence(sectionAMotifFamily.connector, validPitches, referenceShiftSteps, divisions);
        const recallCadence = applySequence(sectionAMotifFamily.cadence, validPitches, referenceShiftSteps, divisions);

        // Override the active motif family for this phrase with the recalled material.
        motifFamily = {
            hook:       recallHook,
            connector:  recallConnector,
            cadence:    recallCadence,
            hookRhythm: [...sectionAMotifFamily.hookRhythm], // rhythm is recalled exactly
        };
        motifCache[`${state.baseKey}_${state.mode}`] = motifFamily;

        // Restore section A's rhythm template so the rhythmic shape is recognizable.
        if (sectionARhythmTemplate !== null) {
            phraseRhythmTemplate = [...sectionARhythmTemplate];
            // Counter template is rebuilt from the melody template in the existing
            // countermelody template derivation block (Change 3C), so no action needed here.
        }

        // Log the recall for diagnostics.
        if (typeof console !== 'undefined') {
            console.log(`[SongForm] A' recall at absIndex ${absIndex}: rootShift=${referenceShiftSteps} steps`);
        }
    }

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

    plannedAnchor1 = getConstrainedAnchorGlobal(lastAnchor, target1Raw, anchor1Limit, globalScalePitches, validPitches, activeChordTones, divisions);
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
        plannedAnchor2 = getConstrainedAnchorGlobal(plannedAnchor1, target2Raw, anchor2Limit, globalScalePitches, validPitches, activeChordTones, divisions);
    }

    if (!justLooped && prevSlotEndedWithRun && settings.genre !== 'none' && prevSlotLastPitch !== null) {
        plannedAnchor1 = findClosest(prevSlotLastPitch, validPitches);
    } else {
        plannedAnchor1 = enforceChordToneOnDownbeat(plannedAnchor1, activeChordTones, validPitches, periodSize, divisions);
    }
    if (plannedAnchor2 !== null) {
        plannedAnchor2 = enforceChordToneOnDownbeat(plannedAnchor2, activeChordTones, validPitches, periodSize, divisions);
    }

    // Phase B: Rhythmic Motif Variation (Bar-by-bar mutation)
    let slotRhythmTemplate = [...phraseRhythmTemplate];
    if (absIndex % 4 !== 0 && settings.genre !== 'none' && phraseRhythmTemplate.length > 0) {
        const barIdx = absIndex % 4;
        const mutationProb = barIdx === 2 ? 0.25 : 0.15; // Higher mutation/extension on climax bar 2
        slotRhythmTemplate = phraseRhythmTemplate.map((val, idx) => {
            if (idx === 0) return val; // Keep downbeat stable
            if (Math.random() < mutationProb) {
                return val === 1 ? 0 : 1;
            }
            return val;
        });
        
        // Bar 3 (resolution) should have a slight breathing/fading space towards the end
        if (barIdx === 3) {
            for (let idx = 12; idx < 16; idx++) {
                if (Math.random() < 0.7) {
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
            const counterOverlapProb = settings.countermelodyMode === 'harmonize' ? 0.5 : 0.15;
            slotCounterRhythmTemplate = new Array(16).fill(0);
            for (let i = 0; i < 16; i++) {
                if (slotRhythmTemplate[i] === 0) {
                    // Melody is silent here — countermelody has higher play probability
                    slotCounterRhythmTemplate[i] = Math.random() < 0.65 ? 1 : 0;
                } else {
                    // Melody is active here — countermelody plays only occasionally
                    slotCounterRhythmTemplate[i] = Math.random() < counterOverlapProb ? 1 : 0;
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
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none');
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    let sliceMotif = [];
    if (settings.genre !== 'none') {
        if (narrativeState.motifRepeats > 2) {
            const roll = Math.random();
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
    if (isSurpriseEligible && Math.random() < surpriseQuotient && stepsSinceLastSurprise >= 8) {
        hasSurprise = true;
        surpriseType = Math.random();
    }

    const useSimpleMode = settings.variationDepth < 0.3 || settings.genre === 'none';
    if (useSimpleMode) {
        hasSurprise = false;
        phraseLocalScaleOffset = -1;
    }


    let slotHasFlourish = false;
    let runStartStep = -1;
    let runLength = 0;

    const shortestLimitStep = settings.shortestNoteLimit || 16;
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
                    const roll = Math.random();
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
            (isClimaxBar && hasHighTension && Math.random() < 0.4) ||
            (hasHighTension && Math.random() < 0.15)
        );

        runStartStep = -1;
        runLength = 0;
        if (prevSlotEndedWithRun && settings.genre !== 'none') {
            slotHasFlourish = true;
            runStartStep = 0;
            runLength = prevSlotRunRemainingLength;
        } else if (slotHasFlourish) {
            // 50% chance to start at the end of the slot and cross the boundary
            if (Math.random() < 0.5) {
                runLength = stepsPerBeat * (1 + Math.floor(Math.random() * 2));
                runStartStep = totalSteps - runLength;
            } else {
                runStartStep = Math.floor(stepsPerBeat * (1 + Math.random()));
                runLength = stepsPerBeat * (1 + Math.floor(Math.random() * 2));
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
            if (plays) {
                if (g.sub === 0 || settings.genre === 'none' || g.subdivision !== 4) {
                    noteCountThisPhrase++;
                }
            }
        }

        // Gap filling should only engage at very high density settings.
        // At moderate density the template IS the rhythmic hook; don't fill it.
        if (settings.genre !== 'none' && settings.density > 0.75) {
            const activeIndices = [];
            for (let i = 0; i < gridSteps.length; i++) {
                if (stepPlaysMap[gridSteps[i].step]) {
                    activeIndices.push(i);
                }
            }
            for (let k = 0; k < activeIndices.length - 1; k++) {
                const idx1 = activeIndices[k];
                const idx2 = activeIndices[k + 1];
                const g1 = gridSteps[idx1];
                const g2 = gridSteps[idx2];
                const gapBeats = (g2.stepTime - g1.stepTime) / beatDuration;
                if (gapBeats > 1.05) {
                    const stepsBetween = idx2 - idx1;
                    if (stepsBetween > 1) {
                        const addProb = (settings.density - 0.75) / 0.25;
                        if (Math.random() < addProb) {
                            if (stepsBetween === 4) {
                                stepPlaysMap[gridSteps[idx1 + 2].step] = true;
                            } else if (stepsBetween > 4) {
                                const mid = Math.floor(stepsBetween / 2);
                                stepPlaysMap[gridSteps[idx1 + mid].step] = true;
                                if (Math.random() < 0.5) {
                                    stepPlaysMap[gridSteps[idx1 + Math.floor(mid / 2)].step] = true;
                                }
                            } else {
                                stepPlaysMap[gridSteps[idx1 + 1].step] = true;
                            }
                        }
                    }
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
                    if (Math.random() < 0.75) {
                        const clusterType = Math.random();
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

            // Build isolatedCounterStepsSet
            const counterActiveSteps = gridSteps.filter(g => {
                if (!settings.countermelodyEnabled) return false;
                if (settings.genre === 'none') return false;
                const counterTemplateStep = Math.floor(g.sixteenthStep * (4 / stepsPerBeat)) % 16;
                return slotCounterRhythmTemplate[counterTemplateStep] === 1;
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

                    const warpProfileRoll = Math.random();
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
                    playCounter = (g.sixteenthStep % 2 === 0 && Math.random() < 0.6) || (g.sixteenthStep % 4 === 3 && Math.random() < 0.4);
                }
            } else {
                if (settings.countermelodyEnabled) {
                    const mode = settings.countermelodyMode || 'contrary';
                    if (mode === 'harmonize') {
                        if (melodyPlays && Math.random() < 0.6) playCounter = true;
                    } else {
                        const activeDensityVal = settings.density !== undefined ? settings.density : 0.5;
                        const playProb = 0.25 + activeDensityVal * 0.2;
                        if (Math.random() < playProb) playCounter = true;
                    }
                }
            }

            const stepPos = g.sixteenthStep / totalSteps;
            const activeTransition = transitionPitches.find(t => Math.abs(stepPos - t.startTime) < (0.5 / totalSteps));

            let pitch = prevPitch;
            if (melodyPlays) {
                // Pre-gate isolated notes / cluster role constraint
                const isIsolated = isolatedStepsSet.has(g.step);
                let effectiveValidPitches = validPitches;
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
                            const nextScaleIntervals = nextChordObj ? getScaleIntervals(deduceSourceMode(nextChordObj.symbol, state.mode || 'major') || state.mode || 'major', settings.genre) : globalScaleIntervals;
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

                // Color tone constraint (Pass 2)
                const canUseColorTone = isPassingContext(gridSteps, gIndex, stepPlaysMap, activeChordTones)
                    && !isIsolated
                    && g.beat !== 0 && g.beat !== 2;

                if (!canUseColorTone && settings.genre !== 'none') {
                    effectiveValidPitches = effectiveValidPitches.filter(p => {
                        const pc = Math.round(((p % periodSize + periodSize) % periodSize) * 100) / 100;
                        return globalScalePcSet.has(pc) || chordTonePcSet.has(pc);
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

                    const stepDir = resolutionTarget > prevPitch ? 1 : (resolutionTarget < prevPitch ? -1 : (Math.random() > 0.5 ? 1 : -1));
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
                                const dir = nextAnchorIdx > prevIdx ? 1 : (nextAnchorIdx < prevIdx ? -1 : (Math.random() > 0.5 ? 1 : -1));
                                const nextIdx = Math.max(0, Math.min(effectiveValidPitches.length - 1, prevIdx + dir + bias));
                                connectivePitch = effectiveValidPitches[nextIdx];
                            } else {
                                connectivePitch = findClosestStep(prevPitch, effectiveValidPitches, divisions);
                            }
                        } else if (slotAestheticMode === 'sighs') {
                            const wasLeap = Math.abs(lastInterval) >= 4;
                            if (!wasLeap && prevIdx !== -1) {
                                const leapAmount = 4 + Math.floor(Math.random() * 3);
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

                            if (Math.random() < slotActivity * 0.25) {
                                const octaveShift = Math.random() > 0.5 ? periodSize : -periodSize;
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

                pitch = applyGenreRules(pitch, settings.genre, g.sixteenthStep, effectiveValidPitches, divisions, chromaticProb);

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
                prevPitch = pitch;
                const pitchPc = Math.round(((pitch % periodSize + periodSize) % periodSize) * 100) / 100;
                prevPitchIsColor = !globalScalePcSet.has(pitchPc) && !chordTonePcSet.has(pitchPc);
            }

            if (settings.countermelodyEnabled) {
                let counterPlays = false;
                if (settings.genre === 'none') {
                    counterPlays = playCounter;
                } else {
                    const counterTemplateStep = Math.floor(g.sixteenthStep * (4 / stepsPerBeat)) % 16;
                    counterPlays = slotCounterRhythmTemplate[counterTemplateStep] === 1;
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
                    counterPlays = Math.random() < 0.15;
                }

                if (counterPlays) {
                    const counterInst = state.instruments.countermelody || 'sine';
                    let counterPitch = prevCounterPitch;

                    if (settings.genre === 'none') {
                        const mode = settings.countermelodyMode || 'contrary';

                        if (mode === 'call-response' && melodyHistory.length > 0) {
                            const quoteIndex = g.step % Math.max(1, melodyHistory.length);
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
                            const index = findScaleIndex(pitch, validPitches, divisions);
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
                                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);
                            }
                        } else {
                            const melodyMoved = lastInterval !== 0;
                            if (melodyMoved && Math.random() < 0.8) {
                                const contraryDirection = lastInterval > 0 ? -1 : 1;
                                let idx = findScaleIndex(prevCounterPitch, counterValidPitches, divisions);
                                if (idx === -1) {
                                    idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches, divisions);
                                }
                                const stepShift = Math.random() > 0.5 ? 2 : 1;
                                let newIdx = idx + contraryDirection * stepShift;
                                if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                                    newIdx = idx - contraryDirection * stepShift;
                                }
                                counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                            } else {
                                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);
                            }
                        }
                    } else {
                        if (slotAestheticMode === 'cantabile') {
                            const melodyMoved = lastInterval !== 0;
                            if (melodyMoved) {
                                const contraryDirection = lastInterval > 0 ? -1 : 1;
                                let idx = findScaleIndex(prevCounterPitch, counterValidPitches, divisions);
                                if (idx === -1) idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches, divisions);
                                let newIdx = idx + contraryDirection * (Math.random() > 0.5 ? 2 : 1);
                                counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                            } else {
                                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);
                            }
                        } else if (slotAestheticMode === 'sighs') {
                            if (counterActiveChordTones.length > 0) {
                                counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
                            } else {
                                counterPitch = findClosest(keyRoot - periodSize, counterValidPitches);
                            }
                        } else if (slotAestheticMode === 'declamatory') {
                            if (counterActiveChordTones.length > 0 && Math.random() < 0.6) {
                                counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
                            } else {
                                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);
                            }
                        } else if (slotAestheticMode === 'virtuoso') {
                            counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);
                        }
                    }

                    // Snap if countermelody is isolated (when genre not none) or unconditionally on a downbeat
                    const isIsolatedCounter = isolatedCounterStepsSet.has(g.step) && settings.genre !== 'none';
                    const isDownbeatCounter = (g.beat === 0 || g.beat === 2) && g.sub === 0;
                    if (isIsolatedCounter || isDownbeatCounter) {
                        const counterStableTones = getStableTones(counterActiveChordTones, chordKey, keyRoot, periodSize, counterValidPitches);
                        counterPitch = findClosest(counterPitch, counterStableTones);
                    }

                    counterPitch = findClosest(counterPitch, counterValidPitches);

                    if (Math.abs(counterPitch - prevCounterPitch) < 0.01 && counterValidPitches.length > 1) {
                        const idx = findScaleIndex(counterPitch, counterValidPitches, divisions);
                        if (idx !== -1) {
                            const dir = counterPhraseDirectionBias !== 0 ? counterPhraseDirectionBias : (Math.random() > 0.5 ? 1 : -1);
                            let newIdx = idx + dir;
                            if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                                newIdx = idx - dir;
                            }
                            counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                        }
                    }

                    if (melodyPlays && pitch !== null) {
                        const rangeLimit = 3.1 * (12 / divisions);
                        const counterCandidates = counterValidPitches.filter(p => Math.abs(p - counterPitch) <= rangeLimit);
                        if (counterCandidates.length > 0) {
                            const weights = counterCandidates.map(p => {
                                let w = 1.0;
                                if (Math.abs(p - pitch) <= 5.0) {
                                    w *= 0.1;
                                }

                                const pc = (p % periodSize + periodSize) % periodSize;
                                const roundedPc = Math.round(pc * 100) / 100;
                                const isDiatonic = globalScalePcSet.has(roundedPc);
                                const isChordTone = chordTonePcSet.has(roundedPc);

                                if (!isDiatonic && !isChordTone) {
                                    const tension = currentTension;
                                    const penalty = 0.2 + (tension * 0.5);
                                    w *= penalty;
                                } else if (isChordTone) {
                                    w *= 1.25;
                                }

                                return w;
                            });
                            counterPitch = selectWeightedPitch(counterCandidates, weights);
                        }
                    }

                    counterScheduled.push({
                        pitch: counterPitch,
                        stepTime: g.stepTime,
                        noteDuration: g.noteDuration,
                        counterInst,
                        step: g.step
                    });
                    // Update direction memory (Change 2)
                    counterLastPitch = prevCounterPitch;
                    prevCounterPitch = counterPitch;
                    if (counterPhraseStepsRemaining > 0) {
                        counterPhraseStepsRemaining--;
                    } else {
                        // Direction commitment expired: check if we should reverse.
                        // Reverse if we've traveled more than 5 scale steps from phrase start
                        // in the committed direction (prevents runaway drift to register extremes).
                        const counterIdx = findScaleIndex(counterPitch, counterValidPitches, divisions);
                        const counterBottom = findScaleIndex(counterValidPitches[0], counterValidPitches, divisions);
                        const counterTop = findScaleIndex(counterValidPitches[counterValidPitches.length - 1], counterValidPitches, divisions);
                        if (counterIdx <= counterBottom + 1 || counterIdx >= counterTop - 1) {
                            counterPhraseDirectionBias = -counterPhraseDirectionBias;
                            counterPhraseStepsRemaining = 4; // brief re-commitment after reversal
                        }
                    }
                }
            }
        }

        applyMotivicFlexing(melodyScheduled, globalScalePcSet, chordTonePcSet, periodSize, divisions);
    }

    // --- Empty Slot Mitigation Fallback ---
    // If no melody notes were scheduled, and the genre is not 'none',
    // force a single note on an occasional downbeat or a random active step to ensure minimal melodic activity.
    if (melodyScheduled.length === 0 && settings.genre !== 'none') {
        const motifNote = sliceMotif[0];
        let pitch = findClosest(motifNote, validPitches);
        pitch = applyGenreRules(pitch, settings.genre, 0, validPitches, divisions, chromaticProb);
        pitch = findClosest(pitch, validPitches);

        const melodyInst = state.instruments.melody || 'sine';
        // Occasional downbeat fallback (35% chance), otherwise place on a random step (e.g. step 2, 4, or 8)
        const useDownbeat = Math.random() < 0.35;
        const targetStep = useDownbeat ? 0 : [2, 4, 6, 8][Math.floor(Math.random() * 4)];
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
        const counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions);

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
        const stableTones = activeChordTones.length > 0
            ? activeChordTones
            : validPitches;
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
                    const idx = findScaleIndex(n.pitch, validPitches, divisions);
                    if (idx !== -1) {
                        let dir = (n.pitch - prev >= 0) ? 1 : -1;
                        if (dir === 0) dir = 1;
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

    // Play/Schedule all collected melody notes
    melodyScheduled.forEach((n, idx) => {
        let pitch = n.pitch;

        const nextTime = (idx < melodyScheduled.length - 1) ? melodyScheduled[idx + 1].stepTime : (time + chordSlotDuration);
        const gapAfter = nextTime - (n.stepTime + n.noteDuration);

        playToneFn(midiToFreq(pitch), n.stepTime, n.noteDuration, n.melodyInst, 'melody', 0, 1.0, { gapAfter, step: n.step });
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
        globalPrevPitchIsColor = !globalScalePcSet.has(finalPc) && !chordTonePcSet.has(finalPc);
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
        prevSlotRunRemainingLength = stepsPerBeat * (1 + Math.floor(Math.random() * 2));
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
    console.group(`🎵 [Melody Generator] Slot ${absIndex}: ${chordObj.symbol} (Key: ${chordKey})`);
    console.log(`Aesthetic Mode: ${slotAestheticMode} | Slot Activity: ${slotActivity.toFixed(2)}`);
    console.log(`Settings -> Density: ${settings.density} | Rests: ${settings.restProbability} | Shortest Limit: ${settings.shortestNoteLimit || 16}`);
    console.log(`Voiced Chord Notes passed: [${(chordNotes || []).join(', ')}]`);
    if (melodyScheduled.length > 0) {
        console.log("Melody Notes Scheduled:");
        melodyScheduled.forEach((n, idx) => {
            const isChordTone = chordTonePcSet.has(Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100);
            const isScaleTone = globalScalePcSet.has(Math.round(((n.pitch % periodSize + periodSize) % periodSize) * 100) / 100);
            console.log(`  └─ Note #${idx + 1} at Step ${n.step} (${n.sixteenthStep % 16}/16): Pitch ${n.pitch} (dur: ${n.noteDuration.toFixed(2)}s) [ChordTone: ${isChordTone}, ScaleTone: ${isScaleTone}, Anchor1: ${n.isAnchor1Step}, Anchor2: ${n.isAnchor2Step}]`);
        });
    } else {
        console.log("  └─ No Melody Notes Scheduled (all rests or blocked by limit)");
    }
    if (counterScheduled.length > 0) {
        console.log("Countermelody Notes Scheduled:");
        counterScheduled.forEach((n, idx) => {
            console.log(`  └─ Note #${idx + 1} at Step ${n.step}: Pitch ${n.pitch} (dur: ${n.noteDuration.toFixed(2)}s)`);
        });
    }
    console.groupEnd();
}
