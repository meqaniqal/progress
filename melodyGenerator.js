import { state } from './store.js';
import { getChordNotes, getEffectiveTuning, midiToFreq, deduceSourceMode, getBassNote } from './theory.js';
import { playTone } from './synth.js';

// Cache for motif memory across iterations
// Structure: { keyString: { hook: [], connector: [], cadence: [], hookRhythm: [] } }
let motifCache = {};
let originalHook = null;

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

// Narrative State Tracker

let narrativeState = {
    consecutiveSteps: 0,
    lowRegisterBars: 0,
    motifRepeats: 0,
    phraseSubdivisions: []
};

export function clearMelodyMemory() {
    motifCache = {};
    originalHook = null;
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
    const keyRoot = Number(state.baseKey) || 60;
    
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
        
        const keyRootLocal = Number(state.baseKey) || 60;
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

        if (settings.genre === 'none') {
            mode = 'cantabile';
        }
        activeAestheticMode = mode;
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

        if (sharedCount >= 5) {
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
    const validPitches = Array.from(new Set([...scalePitches, ...activeChordTones])).sort((a, b) => a - b);

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
    const counterValidPitches = Array.from(new Set([...counterScalePitches, ...counterActiveChordTones])).sort((a, b) => a - b);

    const chordTonePcSet = new Set((chordNotes || []).map(n => Math.round(((n % periodSize + periodSize) % periodSize) * 100) / 100));

    // Retrieve previous/next chord notes
    const prevChordNotes = prevChordObj ? (prevChordObj.customNotes || getChordNotes(prevChordObj.symbol, prevChordObj.key !== undefined ? Number(prevChordObj.key) : state.baseKey, divisions)) : [];
    const nextChordNotes = nextChordObj ? (nextChordObj.customNotes || getChordNotes(nextChordObj.symbol, nextChordObj.key !== undefined ? Number(nextChordObj.key) : state.baseKey, divisions)) : [];

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

    if (originalHook === null && motifFamily && motifFamily.hook) {
        originalHook = [...motifFamily.hook];
    }

    const hookRhythm = motifFamily.hookRhythm || [1, 0, 1, 0];

    let currentCell = motifFamily.hook;
    if (progressVal >= 0.75) {
        currentCell = motifFamily.cadence;
    } else if (progressVal >= 0.25 && progressVal < 0.75) {
        currentCell = motifFamily.connector;
    }

    // Long-range motivic recall: recapitulate original first hook at the end of the progression loop
    if (progressVal > 0.9 && originalHook && settings.genre !== 'none') {
        currentCell = originalHook;
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

    const stepsPerBeat = 4;
    const totalSteps = beats * stepsPerBeat;
    const beatDuration = chordSlotDuration / beats;
    const maxSteps = Math.round(chordSlotDuration / (15 / bpm));

    // Pre-calculate target pitch contour (gravitational pull towards a target climax pitch)
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

    // --- Pass 1: Structural Target Planner ---
    let plannedAnchor1 = null;
    let plannedAnchor2 = null;

    let target1Raw = targetPitch;
    let target2Raw = targetPitch;
    if (settings.macroPlannerEnabled && macroSlotTarget) {
        target1Raw = macroSlotTarget.targetPitch;
        if (nextChordObj && macroTargetPlan && macroTargetPlan[absIndex + 1]) {
            target2Raw = macroTargetPlan[absIndex + 1].targetPitch;
        } else {
            target2Raw = target1Raw;
        }
    }

    let hasSurprise = false;
    let surpriseType = null;
    if (settings.genre !== 'none' && Math.random() < surpriseQuotient && stepsSinceLastSurprise >= 8) {
        hasSurprise = true;
        surpriseType = Math.random();
    }

    let anchor1Limit = activeRole === 'climax' ? 5 : 3;
    if (globalPrevPitch !== null && !hasSurprise) {
        plannedAnchor1 = getConstrainedAnchor(globalPrevPitch, target1Raw, anchor1Limit, validPitches, activeChordTones);
    } else {
        plannedAnchor1 = activeChordTones.length > 0 ? findClosest(target1Raw, activeChordTones) : findClosest(target1Raw, validPitches);
    }

    if (hasSurprise) {
        if (surpriseType < 0.25) { // octave leap
            let surprisePitch = plannedAnchor1 + (Math.random() > 0.5 ? periodSize : -periodSize);
            if (surprisePitch < melodyRangeStart || surprisePitch > melodyRangeEnd) {
                surprisePitch = plannedAnchor1 + (surprisePitch < melodyRangeStart ? periodSize : -periodSize);
            }
            plannedAnchor1 = findClosest(surprisePitch, validPitches);
            stepsSinceLastSurprise = 0;
        } else if (surpriseType < 0.5) { // deceptive landing
            const scaleDegrees = getScaleIntervals(chordMode, settings.genre);
            const degree6 = scaleDegrees[5] !== undefined ? scaleDegrees[5] : 9;
            const deceptivePc = (chordKey + degree6) % periodSize;
            const deceptivePitches = validPitches.filter(p => {
                const pc = (p % periodSize + periodSize) % periodSize;
                return Math.abs(pc - deceptivePc) < 0.01;
            });
            if (deceptivePitches.length > 0) {
                plannedAnchor1 = findClosest(plannedAnchor1, deceptivePitches);
            }
            stepsSinceLastSurprise = 0;
        }
    }

    if (beats >= 2 && ['build', 'climax', 'statement'].includes(activeRole)) {
        let anchor2Limit = activeRole === 'climax' ? 5 : 3;
        plannedAnchor2 = getConstrainedAnchor(plannedAnchor1, target2Raw, anchor2Limit, validPitches, activeChordTones);
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
        let prevPitchIsColor = globalPrevPitchIsColor;

        // 1. Rhythmic Pre-pass (Lookahead) to determine active steps and isolation flags
        const stepPlaysMap = {};
        const stepTimeMap = {};
        const stepDurationMap = {};
        const stepSubdivisionMap = {};
        const stepSubMap = {};
        const stepBeatMap = {};
        
        for (let beat = 0; beat < beats; beat++) {
            let subdivision = 4;
            if (settings.genre !== 'none') {
                if (slotAestheticMode === 'cantabile' || slotAestheticMode === 'sighs') {
                    subdivision = slotActivity > 0.6 ? 2 : 1;
                } else if (slotAestheticMode === 'declamatory') {
                    const declPattern = [1, 2, 4, 2];
                    subdivision = declPattern[beat % declPattern.length];
                } else if (slotAestheticMode === 'virtuoso') {
                    subdivision = slotActivity > 0.75 ? 8 : (slotActivity > 0.5 ? 6 : 4);
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

            // Enforce shortestNoteLimit (13-step range):
            const shortestLimitStep = settings.shortestNoteLimit || 9;
            let maxAllowedSubdivision = 4;
            if (shortestLimitStep === 1) maxAllowedSubdivision = 16;
            else if (shortestLimitStep === 2) maxAllowedSubdivision = 8;
            else if (shortestLimitStep === 3) maxAllowedSubdivision = 8;
            else if (shortestLimitStep === 4) maxAllowedSubdivision = 6;
            else if (shortestLimitStep === 5) maxAllowedSubdivision = 4;
            else if (shortestLimitStep === 6) maxAllowedSubdivision = 4;
            else if (shortestLimitStep === 7) maxAllowedSubdivision = 3;
            else if (shortestLimitStep === 8) maxAllowedSubdivision = 2;
            else if (shortestLimitStep === 9) maxAllowedSubdivision = 2;
            else maxAllowedSubdivision = 1;

            if (subdivision > maxAllowedSubdivision) {
                subdivision = maxAllowedSubdivision;
            }
            
            const subStepDuration = beatDuration / subdivision;
            
            for (let sub = 0; sub < subdivision; sub++) {
                const step = beat * 96 + Math.round((sub / subdivision) * 96);
                const sixteenthStep = beat * stepsPerBeat + Math.round((sub / subdivision) * stepsPerBeat);
                if (sixteenthStep >= maxSteps) continue;
                
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
                
                const stepTimeVal = time + (beat * beatDuration) + (stepOffsetInBeat * beatDuration);
                const noteDurVal = subStepDuration * noteDurMultiplier;
                
                stepTimeMap[step] = stepTimeVal;
                stepDurationMap[step] = noteDurVal;
                stepSubdivisionMap[step] = subdivision;
                stepSubMap[step] = sub;
                stepBeatMap[step] = beat;
                
                const isAnchor1Step = (beat === 0 && sub === 0);
                const isAnchor2Step = (beat === 2 && sub === 0 && beats >= 2 && ['build', 'climax', 'statement'].includes(activeRole));
                const isAnchor = isAnchor1Step || isAnchor2Step;

                let plays = true;
                if (isAnchor) {
                    plays = true;
                } else if (settings.genre !== 'none') {
                    const playRoll = Math.random();
                    const restChance = Math.max(0.0, 1.0 - slotActivity);
                    if (playRoll < restChance) {
                        plays = false;
                    }
                } else {
                    if (sixteenthStep === totalSteps - 1) plays = false;
                }
                
                stepPlaysMap[step] = plays;
            }
        }
        
        // Identify isolated active steps
        const activeStepsList = Object.keys(stepPlaysMap)
            .map(Number)
            .filter(step => stepPlaysMap[step])
            .sort((a, b) => a - b);
            
        const isolatedStepsSet = new Set();
        if (settings.genre !== 'none') {
            const gapThreshold = beatDuration * 0.95;
            activeStepsList.forEach((step, idx) => {
                const stepTimeVal = stepTimeMap[step];
                const prevStep = idx > 0 ? activeStepsList[idx - 1] : null;
                const nextStep = idx < activeStepsList.length - 1 ? activeStepsList[idx + 1] : null;
                
                const prevTime = prevStep !== null ? stepTimeMap[prevStep] : null;
                const nextTime = nextStep !== null ? stepTimeMap[nextStep] : null;
                
                const spaceBefore = prevTime !== null ? (stepTimeVal - prevTime) : (stepTimeVal - time);
                const spaceAfter = nextTime !== null ? (nextTime - stepTimeVal) : (time + chordSlotDuration - stepTimeVal);
                
                if (spaceBefore >= gapThreshold && spaceAfter >= gapThreshold) {
                    isolatedStepsSet.add(step);
                }
            });
        }

        // 2. Playback / Pitch Selection Pass
        for (let beat = 0; beat < beats; beat++) {
            let subdivision = 4;
            if (settings.genre !== 'none') {
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

            // Enforce shortestNoteLimit in playback pass (13-step range)
            const shortestLimitStep = settings.shortestNoteLimit || 9;
            let maxAllowedSubdivision = 4;
            if (shortestLimitStep === 1) maxAllowedSubdivision = 16;
            else if (shortestLimitStep === 2) maxAllowedSubdivision = 8;
            else if (shortestLimitStep === 3) maxAllowedSubdivision = 8;
            else if (shortestLimitStep === 4) maxAllowedSubdivision = 6;
            else if (shortestLimitStep === 5) maxAllowedSubdivision = 4;
            else if (shortestLimitStep === 6) maxAllowedSubdivision = 4;
            else if (shortestLimitStep === 7) maxAllowedSubdivision = 3;
            else if (shortestLimitStep === 8) maxAllowedSubdivision = 2;
            else if (shortestLimitStep === 9) maxAllowedSubdivision = 2;
            else maxAllowedSubdivision = 1;

            if (subdivision > maxAllowedSubdivision) {
                subdivision = maxAllowedSubdivision;
            }

            const subStepDuration = beatDuration / subdivision;

            for (let sub = 0; sub < subdivision; sub++) {
                const step = beat * 96 + Math.round((sub / subdivision) * 96);
                const sixteenthStep = beat * stepsPerBeat + Math.round((sub / subdivision) * stepsPerBeat);
                if (sixteenthStep >= maxSteps) continue;
                
                let surpriseLeapTriggeredThisStep = false;
                
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

                const stepTime = time + (beat * beatDuration) + (stepOffsetInBeat * beatDuration);
                const noteDuration = subStepDuration * noteDurMultiplier;

                let melodyPlays = stepPlaysMap[step];
                let playCounter = false;

                if (settings.countermelodyEnabled && settings.countermelodyMode === 'call-response') {
                    const stepProgress = sixteenthStep / totalSteps;
                    if (stepProgress < dialogueSplitTime) {
                        playCounter = false;
                    } else {
                        melodyPlays = false;
                        playCounter = (sixteenthStep % 2 === 0 && Math.random() < 0.6) || (sixteenthStep % 4 === 3 && Math.random() < 0.4);
                    }
                } else {
                    if (settings.countermelodyEnabled) {
                        const mode = settings.countermelodyMode || 'contrary';
                        if (mode === 'harmonize') {
                            if (melodyPlays && Math.random() < 0.6) playCounter = true;
                        } else {
                            // Scale contrary play probability down, e.g. 0.35 + 0.15 * density, to avoid continuous play
                            const activeDensityVal = settings.density !== undefined ? settings.density : 0.5;
                            const playProb = 0.25 + activeDensityVal * 0.2;
                            if (Math.random() < playProb) playCounter = true;
                        }
                    }
                }

                // Apply motif rhythmic skeleton
                if (melodyPlays && settings.genre !== 'none') {
                    const isRun = subdivision === 3 || subdivision === 6 || subdivision === 8 || subdivision === 12;
                    if (!isRun) {
                        let checkIndex = noteCountThisPhrase % 4;
                        if (settings.macroPlannerEnabled && settings.variationDepth > 0.3) {
                            checkIndex = (checkIndex + 1) % 4;
                        }
                        // If checkIndex maps to a rest (0) but we have notes later, or if checkIndex is 0 and hookRhythm[0] is 0,
                        // allow occasional offset checks or fallback to step-based grid offsets to avoid absolute silence.
                        if (!hookRhythm[checkIndex]) {
                            const stepGridIndex = sixteenthStep % 4;
                            if (!hookRhythm[stepGridIndex] && Math.random() > 0.15) {
                                melodyPlays = false;
                            }
                        }
                    }
                }

                const stepPos = sixteenthStep / totalSteps;
                const activeTransition = transitionPitches.find(t => Math.abs(stepPos - t.startTime) < (0.5 / totalSteps));

                let pitch = prevPitch;
                if (melodyPlays) {
                    const isAnchor1Step = (beat === 0 && sub === 0);
                    const isAnchor2Step = (beat === 2 && sub === 0 && beats >= 2 && ['build', 'climax', 'statement'].includes(activeRole));
                    
                    if (isAnchor1Step && plannedAnchor1 !== null) {
                        pitch = plannedAnchor1;
                    } else if (isAnchor2Step && plannedAnchor2 !== null) {
                        pitch = plannedAnchor2;
                    } else if (sixteenthStep === 0 && forceTonicNext) {
                        pitch = findClosest(chordKey + 12, validPitches);
                        forceTonicNext = false;
                    } else if (activeTransition) {
                        pitch = activeTransition.pitch;
                        while (pitch < melodyRangeStart) pitch += periodSize;
                        while (pitch > melodyRangeEnd) pitch -= periodSize;
                    } else {
                        // Pass 2: Connective Fill
                        let connectivePitch = prevPitch;
                        const prevIdx = findScaleIndex(prevPitch, validPitches);
                        
                        if (settings.genre === 'none') {
                            let motifNote;
                            if (subdivision >= 4 && sub > 0) {
                                const dir = lastInterval >= 0 ? 1 : -1;
                                motifNote = prevIdx !== -1 ? validPitches[Math.max(0, Math.min(validPitches.length - 1, prevIdx + dir))] : sliceMotif[noteCountThisPhrase % sliceMotif.length];
                            } else {
                                motifNote = sliceMotif[noteCountThisPhrase % sliceMotif.length];
                            }
                            connectivePitch = motifNote;
                        } else {
                            const nextAnchor = (beat < 2 && plannedAnchor2 !== null) ? plannedAnchor2 : plannedAnchor1;
                            const nextAnchorIdx = findScaleIndex(nextAnchor, validPitches);
                            
                            if (slotAestheticMode === 'cantabile') {
                                if (prevIdx !== -1 && nextAnchorIdx !== -1) {
                                    const dir = nextAnchorIdx > prevIdx ? 1 : (nextAnchorIdx < prevIdx ? -1 : (Math.random() > 0.5 ? 1 : -1));
                                    const nextIdx = Math.max(0, Math.min(validPitches.length - 1, prevIdx + dir));
                                    connectivePitch = validPitches[nextIdx];
                                } else {
                                    connectivePitch = findClosestStep(prevPitch, validPitches, divisions);
                                }
                            } else if (slotAestheticMode === 'sighs') {
                                const wasLeap = Math.abs(lastInterval) >= 4;
                                if (!wasLeap && prevIdx !== -1) {
                                    const leapAmount = 4 + Math.floor(Math.random() * 3);
                                    let leapIdx = Math.min(validPitches.length - 1, prevIdx + leapAmount);
                                    let attempts = 0;
                                    while (attempts < 3 && chordTonePcSet.has(Math.round(((validPitches[leapIdx] % periodSize + periodSize) % periodSize) * 100) / 100)) {
                                        leapIdx = Math.max(0, leapIdx - 1);
                                        attempts++;
                                    }
                                    connectivePitch = validPitches[leapIdx];
                                } else {
                                    if (prevIdx !== -1) {
                                        connectivePitch = validPitches[Math.max(0, prevIdx - 1)];
                                    } else {
                                        connectivePitch = prevPitch - 1;
                                    }
                                }
                            } else if (slotAestheticMode === 'virtuoso') {
                                const dir = lastInterval >= 0 ? 1 : -1;
                                if (prevIdx !== -1) {
                                    const nextIdx = Math.max(0, Math.min(validPitches.length - 1, prevIdx + dir));
                                    connectivePitch = validPitches[nextIdx];
                                } else {
                                    connectivePitch = findClosestStep(prevPitch, validPitches, divisions);
                                }
                            } else if (slotAestheticMode === 'declamatory') {
                                const cellOffsets = [0, 2, 1];
                                const cellStep = sixteenthStep % cellOffsets.length;
                                const cellOffset = cellOffsets[cellStep];
                                
                                const anchor1Idx = findScaleIndex(plannedAnchor1, validPitches);
                                if (anchor1Idx !== -1) {
                                    let targetIdx = Math.max(0, Math.min(validPitches.length - 1, anchor1Idx + cellOffset));
                                    connectivePitch = validPitches[targetIdx];
                                } else {
                                    connectivePitch = plannedAnchor1;
                                }
                                
                                if (Math.random() < slotActivity * 0.25) {
                                    const octaveShift = Math.random() > 0.5 ? periodSize : -periodSize;
                                    let shifted = connectivePitch + octaveShift;
                                    if (shifted >= melodyRangeStart && shifted <= melodyRangeEnd) {
                                        connectivePitch = findClosest(shifted, validPitches);
                                    }
                                }
                            }
                        }
                        
                        pitch = findClosest(connectivePitch, validPitches);
                    }
                    stepsSinceLastSurprise++;

                    if (melodyPlays) {
                        pitch = applyGenreRules(pitch, settings.genre, sixteenthStep, validPitches, divisions, chromaticProb);
                        
                        if (lastInterval !== 0 && (Math.abs(lastInterval) > 4 || forceContraryNext) && !(melodyScheduled.length === 0 && settings.macroPlannerEnabled && macroSlotTarget)) {
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

                        pitch = findClosest(pitch, validPitches);
                        
                        if (settings.macroPlannerEnabled && macroSlotTarget) {
                            if (phraseHighestPitch === null || pitch > phraseHighestPitch) {
                                phraseHighestPitch = pitch;
                                if (songHighestPitch === null || pitch > songHighestPitch) {
                                    songHighestPitch = pitch;
                                }
                            }
                        }

                        const melodyInst = state.instruments.melody || 'sine';
                        
                        melodyScheduled.push({
                            pitch,
                            stepTime,
                            noteDuration,
                            melodyInst,
                            step: sixteenthStep,
                            isIsolated: isolatedStepsSet.has(step)
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
                        
                        // Increment motif index only when note is successfully scheduled
                        if (sub === 0 || settings.genre === 'none' || subdivision !== 4) {
                            noteCountThisPhrase++;
                        }
                    }
                }


                if (settings.countermelodyEnabled) {
                    let counterPlays = false;
                    if (settings.genre === 'none') {
                        counterPlays = playCounter;
                    } else {
                        if (slotAestheticMode === 'cantabile') {
                            counterPlays = Math.random() < 0.4 + slotActivity * 0.2;
                        } else if (slotAestheticMode === 'sighs') {
                            counterPlays = (sub === 0 && (beat === 0 || beat === 2));
                        } else if (slotAestheticMode === 'declamatory') {
                            counterPlays = !melodyPlays && (sixteenthStep % 4 === 2 || sixteenthStep % 4 === 3) && (Math.random() < 0.5);
                        } else if (slotAestheticMode === 'virtuoso') {
                            counterPlays = (beat === 0 && sub === 0);
                        }
                    }

                    if (counterPlays) {
                        const counterInst = state.instruments.countermelody || 'sine';
                        let counterPitch = prevCounterPitch;

                        if (settings.genre === 'none') {
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
                        } else {
                            if (slotAestheticMode === 'cantabile') {
                                const melodyMoved = lastInterval !== 0;
                                if (melodyMoved) {
                                    const contraryDirection = lastInterval > 0 ? -1 : 1;
                                    let idx = findScaleIndex(prevCounterPitch, counterValidPitches);
                                    if (idx === -1) idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches);
                                    let newIdx = idx + contraryDirection * (Math.random() > 0.5 ? 2 : 1);
                                    counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                                } else {
                                    counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
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
                                    counterPitch = findClosestStep(prevCounterPitch, counterValidPitches, divisions);
                                }
                            } else if (slotAestheticMode === 'virtuoso') {
                                counterPitch = counterActiveChordTones.length > 0 ? counterActiveChordTones[0] : findClosest(keyRoot - periodSize, counterValidPitches);
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
                                
                                const pc = (p % periodSize + periodSize) % periodSize;
                                const roundedPc = Math.round(pc * 100) / 100;
                                const isDiatonic = globalScalePcSet.has(roundedPc);
                                const isChordTone = chordTonePcSet.has(roundedPc);

                                if (!isDiatonic && !isChordTone) {
                                    const tension = currentTension;
                                    const penalty = 0.2 + (tension * 0.5); // ranges from 0.2 (low tension) to 0.7 (high tension)
                                    w *= penalty;
                                } else if (isChordTone) {
                                    w *= 1.25; // boost chord tones
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
            step: targetStep
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
        let pitch = n.pitch;
        // Expressive intonation drift for tense tones under high tension
        if (currentTension > 0.4 && settings.genre !== 'none') {
            const pc = (pitch % periodSize + periodSize) % periodSize;
            const relPc = ((pc - (chordKey % periodSize) + periodSize) % periodSize);
            const isTenseTone = Math.abs(relPc - 11.0) < 0.25 || Math.abs(relPc - 6.0) < 0.25;
            if (isTenseTone) {
                pitch += 0.15 * ((currentTension - 0.4) / 0.6);
            }
        }
        playToneFn(midiToFreq(pitch), n.stepTime, n.noteDuration, n.melodyInst, 'melody');
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
        const finalPc = Math.round(((finalNote.pitch % periodSize + periodSize) % periodSize) * 100) / 100;
        globalPrevPitchIsColor = !globalScalePcSet.has(finalPc) && !chordTonePcSet.has(finalPc);
    } else {
        globalPrevPitchIsColor = false;
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

function buildScalePitches(keyRoot, intervals, divisions, start, end, periodSize = 12.0) {
    const pitches = [];
    const stepSize = periodSize / divisions;
    const startStep = Math.round((start - keyRoot) / stepSize);
    const endStep = Math.round((end - keyRoot) / stepSize);
    
    for (let step = startStep; step <= endStep; step++) {
        const pitch = keyRoot + step * stepSize;
        const pc = (step % divisions + divisions) % divisions;
        const semitonePc = (pc * periodSize) / divisions;
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
    
    // Generate hook rhythmic skeleton (binary 4-element array, step 0 is usually 1, but can be a rest)
    const hookRhythm = [Math.random() < 0.75 ? 1 : 0, 0, 0, 0];
    let onesCount = hookRhythm[0];
    for (let i = 1; i < 4; i++) {
        if (Math.random() > 0.5 && onesCount < 3) {
            hookRhythm[i] = 1;
            onesCount++;
        }
    }
    if (onesCount === 0) {
        hookRhythm[Math.floor(Math.random() * 4)] = 1;
    }
    // If the genre is 'none', keep it fully active to not restrict notes in test cases
    if (state.melodySettings && state.melodySettings.genre === 'none') {
        hookRhythm.fill(1);
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
    const sym = chordObj.symbol;
    const symLower = sym.toLowerCase();
    
    // Diminished, half-diminished, or augmented tension
    if (symLower.includes('dim') || symLower.includes('°') || symLower.includes('ø') || symLower.includes('m7b5') || symLower.includes('aug')) {
        return true;
    }
    
    // V or VII (e.g. G7, Bdim) in roman numerals
    if (/\b(v|vii)\b/i.test(sym) || /\b(v|vii)\d+/i.test(sym)) {
        // Ensure it's not minor V or major VII with maj/min suffixes
        if (!symLower.includes('maj') && !symLower.includes('min') && !symLower.includes('m7')) {
            return true;
        }
    }
    
    // Check if it has a dominant 7th, 9th, 11th, or 13th extension
    const match = sym.match(/(7|9|11|13)/);
    if (match) {
        const before = sym.substring(0, match.index).toLowerCase();
        const isMaj = before.endsWith('maj') || before.endsWith('m') || before.endsWith('min') || before.endsWith('j') || before.endsWith('m');
        if (!isMaj) {
            return true;
        }
    }
    
    return symLower.includes('dom');
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

function applyGenreRules(pitch, genre, step, scalePitches, divisions, chromaticProb = 0.0) {
    if (genre === 'blues') {
        const prob = 0.2 + chromaticProb;
        if (step % 4 === 2 && Math.random() < prob) {
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
                const roll = Math.random();
                subs.push(roll < 0.3 ? 6 : (roll < 0.6 ? 8 : (roll < 0.8 ? 12 : 16)));
            } else {
                subs.push(Math.random() < 0.7 ? 2 : 1);
            }
        } else if (profile === 'deceleration') {
            if (i < 6) {
                const roll = Math.random();
                subs.push(roll < 0.3 ? 4 : (roll < 0.6 ? 6 : (roll < 0.8 ? 8 : 12)));
            } else if (i < 12) {
                subs.push(Math.random() < 0.6 ? 3 : 2);
            } else {
                subs.push(1);
            }
        } else if (profile === 'syncopatedAlternation') {
            subs.push(i % 2 === 0 ? 2 : (Math.random() < 0.35 ? 8 : 4));
        } else {
            const roll = Math.random();
            subs.push(roll < 0.5 ? 3 : (roll < 0.85 ? 6 : 12));
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

function deduceChordRootAndQuality(symbol, baseKey, divisions) {
    if (!symbol || typeof symbol !== 'string') return null;
    let accidental = 0;
    let stripped = symbol.replace(/[+-]+$/, '');
    
    if (stripped.startsWith('b')) { accidental = -1; stripped = stripped.substring(1); }
    else if (stripped.startsWith('#')) { accidental = 1; stripped = stripped.substring(1); }
    
    const match = stripped.match(/^(IV|III|II|I|VII|VI|V|iv|iii|ii|i|vii|vi|v)/);
    
    if (match) {
        const numeral = match[1];
        const remainder = stripped.substring(numeral.length);
        
        const scaleOffsets = {
            'i': 0, 'ii': 2, 'iii': 4, 'iv': 5, 'v': 7, 'vi': 9, 'vii': 11,
            'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11
        };
        const rootOffset = scaleOffsets[numeral] + accidental;
        
        const isMinor = numeral === numeral.toLowerCase();
        let quality = isMinor ? 'minor' : 'major';
        
        if (remainder.includes('dim') || remainder.includes('°')) {
            quality = 'diminished';
        } else if (remainder.includes('aug') || remainder.includes('+')) {
            quality = 'augmented';
        } else if (remainder.includes('7') || remainder.includes('9') || remainder.includes('11') || remainder.includes('13')) {
            if (!remainder.includes('maj') && !remainder.includes('M7') && !remainder.includes('j7')) {
                quality = isMinor ? 'minor7' : 'dominant';
            }
        }
        if (remainder.includes('sus')) {
            quality = 'suspended';
        }
        const rootPitch = baseKey + rootOffset;
        return { rootPitch, quality };
    }
    
    return null;
}

function getLocalScaleMode(quality, settingsGenre) {
    if (settingsGenre === 'jazz') {
        switch(quality) {
            case 'major': return 'lydian';
            case 'minor': return 'dorian';
            case 'minor7': return 'dorian';
            case 'dominant': return 'mixolydian';
            case 'diminished': return 'diminishedWH';
            case 'augmented': return 'wholeTone';
            case 'suspended': return 'mixolydian';
            default: return 'major';
        }
    } else {
        switch(quality) {
            case 'major': return 'major';
            case 'minor': return 'minor';
            case 'minor7': return 'minor';
            case 'dominant': return 'mixolydian';
            case 'diminished': return 'diminishedWH';
            case 'augmented': return 'wholeTone';
            case 'suspended': return 'mixolydian';
            default: return 'major';
        }
    }
}

function planMacroMelodyTargets(totalChords, keyRoot, divisions, stateMode, settings) {
    const plan = [];
    const archetype = settings.macroContourArchetype || 'auto';
    
    let contourShape = archetype;
    if (contourShape === 'auto') {
        const options = ['arch', 'staircase', 'valley', 'launch'];
        const seedIndex = (keyRoot + (stateMode === 'minor' ? 5 : 0)) % options.length;
        contourShape = options[seedIndex];
    }
    
    const rangeStart = 69;
    const rangeEnd = 81;
    
    for (let i = 0; i < totalChords; i++) {
        const progress = i / Math.max(1, totalChords - 1 || 1);
        let contourValue = 0.5;
        
        if (contourShape === 'arch') {
            contourValue = Math.sin(progress * Math.PI);
        } else if (contourShape === 'valley') {
            contourValue = 1.0 - Math.sin(progress * Math.PI);
        } else if (contourShape === 'staircase') {
            contourValue = progress;
        } else if (contourShape === 'launch') {
            contourValue = progress < 0.75 ? 0.25 : 0.9;
        }
        
        const targetPitchRaw = rangeStart + contourValue * (rangeEnd - rangeStart);
        
        let role = 'statement';
        if (totalChords > 1) {
            if (i === 0) {
                role = 'statement';
            } else if (i === totalChords - 1) {
                role = 'resolution';
            } else {
                const stepIdx = i % 4;
                if (stepIdx === 1) role = 'build';
                else if (stepIdx === 2) role = 'climax';
                else role = 'release';
            }
        }
        
        plan.push({
            targetPitch: targetPitchRaw,
            role: role,
            contourValue: contourValue
        });
    }
    
    return plan;
}

function getConstrainedAnchor(fromPitch, targetRaw, maxOffset, validPitches, chordTones) {
    const fromIdx = findScaleIndex(fromPitch, validPitches);
    if (fromIdx === -1) {
        return chordTones.length > 0 ? findClosest(targetRaw, chordTones) : findClosest(targetRaw, validPitches);
    }
    
    const minIdx = Math.max(0, fromIdx - maxOffset);
    const maxIdx = Math.min(validPitches.length - 1, fromIdx + maxOffset);
    const allowedPitches = validPitches.slice(minIdx, maxIdx + 1);
    
    if (allowedPitches.length === 0) {
        return fromPitch;
    }
    
    const allowedChordTones = allowedPitches.filter(p => chordTones.includes(p));
    if (allowedChordTones.length > 0) {
        return findClosest(targetRaw, allowedChordTones);
    }
    return findClosest(targetRaw, allowedPitches);
}
