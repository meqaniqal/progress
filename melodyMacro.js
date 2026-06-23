import { generatePhraseSubdivisions } from './melodyRhythm.js';
import { deduceChordRootAndQuality, findScaleIndex, findClosest } from './melodyTuning.js';
import { applySequence, generateMotifFamily, mutateMotifFamily } from './melodyMotifs.js';

export function determineAestheticMode(context, absIndex, totalChords, settings, chordObj, divisions, keyRoot) {
    if (absIndex % 4 === 0) {
        context.noteCountThisPhrase = 0;
        context.phraseHighestPitch = null;
        context.peakPitchHitsCount = 0;
        context.narrativeState.phraseSubdivisions = generatePhraseSubdivisions(settings.genre, context.rng);

        const localChance = settings.variationDepth >= 0.4 ? (settings.variationDepth * 0.6) : 0.0;
        if (settings.genre !== 'none' && context.rng.next() < localChance) {
            context.phraseLocalScaleOffset = Math.floor(context.rng.next() * 4);
        } else {
            context.phraseLocalScaleOffset = -1;
        }

        // --- Pass 0: Phrase-Level Aesthetic Mode Selection & Activity Curve ---
        context.phraseActivityCurve = [];
        for (let i = 0; i < 4; i++) {
            const slotIdx = absIndex + i;
            if (slotIdx >= totalChords) {
                context.phraseActivityCurve.push(0.5);
                continue;
            }
            const prog = slotIdx / Math.max(1, totalChords);
            const tcVal = settings.tensionCurve === 'arch' ? Math.sin(prog * Math.PI) : 0.5;

            let role = 'statement';
            if (settings.macroPlannerEnabled && context.macroTargetPlan && context.macroTargetPlan[slotIdx]) {
                role = context.macroTargetPlan[slotIdx].role;
            }

            let baseActivity = 0.5;
            if (role === 'climax') baseActivity = 0.9;
            else if (role === 'build') baseActivity = 0.75;
            else if (role === 'release') baseActivity = 0.35;
            else if (role === 'resolution') baseActivity = 0.2;
            else if (role === 'statement') baseActivity = 0.55;

            const slotActivity = Math.max(0.2, Math.min(1.0, settings.density * 0.4 + baseActivity * 0.6 + (tcVal - 0.5) * 0.2));
            context.phraseActivityCurve.push(slotActivity);
        }

        const firstProg = absIndex / Math.max(1, totalChords);
        const firstTcVal = settings.tensionCurve === 'arch' ? Math.sin(firstProg * Math.PI) : 0.5;
        const firstSlotTension = Math.max(0.0, Math.min(1.0, settings.density * 0.4 + firstTcVal * 0.6));
        const firstSlotRole = (settings.macroPlannerEnabled && context.macroTargetPlan && context.macroTargetPlan[absIndex]) ? context.macroTargetPlan[absIndex].role : 'statement';

        const baseChordKeyLocal = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;
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
                mode = context.rng.next() > 0.5 ? 'virtuoso' : 'declamatory';
            }
        }

        if (settings.genre === 'none') {
            mode = 'cantabile';
        }
        context.activeAestheticMode = mode;
    }
}

export function planCountermelodyDirection(context, absIndex, keyRoot) {
    if (absIndex % 4 === 0) {
        const melodicOutgoing = context.globalPrevAnchor !== null ? context.globalPrevAnchor : (keyRoot + 12);
        const melodicIncoming = keyRoot + 12;

        if (melodicIncoming > melodicOutgoing + 1.0) {
            context.counterPhraseDirectionBias = -1;
        } else if (melodicIncoming < melodicOutgoing - 1.0) {
            context.counterPhraseDirectionBias = 1;
        } else {
            context.counterPhraseDirectionBias = -context.counterPhraseDirectionBias || 1;
        }
        context.counterPhraseStepsRemaining = 6;
    }
}

export function handleSongForm(context, absIndex, chordKey, keyRoot, divisions, settings, validPitches, pool, motifFamily) {
    // ── SongFormCoordinator: store Section A material (Change 4C) ─────────────
    if (context.songFormSection === 'A' && absIndex === 0) {
        context.sectionAMotifFamily = {
            hook:        [...motifFamily.hook],
            connector:   [...motifFamily.connector],
            cadence:     [...motifFamily.cadence],
            hookRhythm:  [...motifFamily.hookRhythm],
        };
        context.sectionARhythmTemplate = context.phraseRhythmTemplate.length > 0
            ? [...context.phraseRhythmTemplate]
            : null;
        context.sectionAAestheticMode = context.activeAestheticMode;
        context.sectionAChordRootPitch = chordKey;
    }

    // ── SongFormCoordinator: recall Section A in A' (Change 4D) ──────────────
    if (context.songFormSection === 'A_prime' && context.sectionAMotifFamily !== null && absIndex % 4 === 0) {
        const pitchDelta = chordKey - context.sectionAChordRootPitch;

        const referenceShiftSteps = (() => {
            const refPitch = keyRoot;
            const shiftedPitch = keyRoot + pitchDelta;
            const refIdx = findScaleIndex(findClosest(refPitch, pool), pool, divisions);
            const shiftedIdx = findScaleIndex(findClosest(shiftedPitch, pool), pool, divisions);
            if (refIdx === -1 || shiftedIdx === -1) return 0;
            return shiftedIdx - refIdx;
        })();

        const recallHook = applySequence(context.sectionAMotifFamily.hook, validPitches, referenceShiftSteps, divisions);
        const recallConnector = applySequence(context.sectionAMotifFamily.connector, validPitches, referenceShiftSteps, divisions);
        const recallCadence = applySequence(context.sectionAMotifFamily.cadence, validPitches, referenceShiftSteps, divisions);

        const recalledMotifFamily = {
            hook:       recallHook,
            connector:  recallConnector,
            cadence:    recallCadence,
            hookRhythm: [...context.sectionAMotifFamily.hookRhythm],
        };

        if (context.sectionARhythmTemplate !== null) {
            context.phraseRhythmTemplate = [...context.sectionARhythmTemplate];
        }

        const showLogs = typeof navigator !== 'undefined' && (!/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.location.search.includes('debug=1')));
        if (showLogs && typeof console !== 'undefined') {
            console.log(`[SongForm] A' recall at absIndex ${absIndex}: rootShift=${referenceShiftSteps} steps`);
        }

        return recalledMotifFamily;
    }

    return motifFamily;
}

export function getSectionNameType(state, chordObj) {
    let sectionName = 'default';
    if (state && state.sections) {
        for (const secId in state.sections) {
            const sec = state.sections[secId];
            if (sec && sec.progression && sec.progression.includes(chordObj)) {
                sectionName = sec.name || 'default';
                break;
            }
        }
    }
    
    // Normalize section name to type (e.g. verse1 -> verse, chorus2 -> chorus)
    const nameLower = sectionName.toLowerCase();
    if (nameLower.includes('verse')) return 'verse';
    if (nameLower.includes('chorus')) return 'chorus';
    if (nameLower.includes('bridge')) return 'bridge';
    if (nameLower.includes('intro')) return 'intro';
    if (nameLower.includes('outro')) return 'outro';
    return nameLower;
}

export function resolveMotifFamily(context, state, settings, pool, activeChordTones, validPitches, tuning, rng, chordObj, narrativeState) {
    // Genre switch check
    if (settings.genre !== context.previousGenre) {
        context.motifCache = {};
        context.previousGenre = settings.genre;
    }

    const sectionType = getSectionNameType(state, chordObj);
    const motifKey = `${sectionType}_${state.baseKey}_${state.mode}`;

    // Cross-type motif mixing (10% chance)
    let resolvedKey = motifKey;
    if (rng.next() < 0.10) {
        const cachedKeys = Object.keys(context.motifCache).filter(k => k.endsWith(`_${state.baseKey}_${state.mode}`) && !k.startsWith(`${sectionType}_`));
        if (cachedKeys.length > 0) {
            resolvedKey = cachedKeys[Math.floor(rng.next() * cachedKeys.length)];
        }
    }

    let motifFamily = context.motifCache[resolvedKey];
    if (!motifFamily || (settings.genre !== 'none' && rng.next() < (1.0 - settings.motifRecurrence))) {
        motifFamily = generateMotifFamily(pool, activeChordTones, validPitches, tuning, rng);
        context.motifCache[motifKey] = motifFamily; // Store under original key
        narrativeState.motifRepeats = 0;
    } else {
        narrativeState.motifRepeats++;
        if (settings.genre !== 'none' && rng.next() < 0.3) {
            motifFamily = mutateMotifFamily(motifFamily, validPitches, tuning, rng);
            context.motifCache[resolvedKey] = motifFamily; // Update resolved cache entry
        }
    }

    return motifFamily;
}
