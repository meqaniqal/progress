import { findClosest, findScaleIndex, findDirectedStep, getStableTones, selectWeightedPitch } from './melodyTuning.js';

export function generateCountermelodyNote(context, slotState) {
    let { 
        counterPhraseDirectionBias, 
        counterPhraseStepsRemaining, 
        counterLastPitch, 
        rng 
    } = context;

    let { 
        g, 
        melodyPlays, 
        pitch, 
        lastInterval, 
        prevCounterPitch, 
        counterValidPitches, 
        divisions, 
        keyRoot, 
        periodSize, 
        settings, 
        slotAestheticMode, 
        counterActiveChordTones, 
        isolatedCounterStepsSet, 
        chordKey, 
        validPitches, 
        activeScalePcSet, 
        chordTonePcSet, 
        currentTension, 
        activeTransition, 
        state, 
        counterScheduled 
    } = slotState;

    const counterInst = state.instruments.countermelody || 'sine';
    let counterPitch = prevCounterPitch;

    if (settings.genre === 'none') {
        const mode = settings.countermelodyMode || 'contrary';

        if (mode === 'call-response' && slotState.melodyHistory.length > 0) {
            const quoteIndex = g.step % Math.max(1, slotState.melodyHistory.length);
            const quotePitch = slotState.melodyHistory[quoteIndex];
            counterPitch = findClosest(quotePitch - periodSize, counterValidPitches);

            const lastCallPitch = slotState.melodyHistory[slotState.melodyHistory.length - 1];
            const lastPc = (lastCallPitch % periodSize + periodSize) % periodSize;
            const isTense = [6, 10, 11].includes((lastPc - (chordKey % periodSize) + periodSize) % periodSize);

            if (isTense && counterActiveChordTones.length > 0 && rng.next() < 0.7) {
                const stableTones = counterActiveChordTones.filter(ct => {
                    const pcDiff = ((ct % periodSize) - (chordKey % periodSize) + periodSize) % periodSize;
                    return [0, 3, 4, 7].includes(pcDiff);
                });
                if (stableTones.length > 0) {
                    counterPitch = findClosest(counterPitch, stableTones);
                }
            }
        } else if (activeTransition && mode === 'harmonize') {
            const targetHarm = activeTransition.pitch + (rng.next() > 0.5 ? 4 : 3);
            counterPitch = findClosest(targetHarm - periodSize, counterValidPitches);
        } else if (mode === 'harmonize' && melodyPlays) {
            const index = findScaleIndex(pitch, validPitches, divisions);
            if (index !== -1) {
                const shift = rng.next() > 0.5 ? 2 : 4;
                let targetIndex = index - shift;
                if (targetIndex < 0) targetIndex = 0;
                counterPitch = findClosest(validPitches[targetIndex] - periodSize, counterValidPitches);
            } else {
                counterPitch = findClosest(pitch - periodSize, counterValidPitches);
            }
        } else if (mode === 'call-response') {
            if (counterActiveChordTones.length > 0 && rng.next() < 0.6) {
                counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
            } else {
                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);
            }
        } else {
            const melodyMoved = lastInterval !== 0;
            if (melodyMoved && rng.next() < 0.8) {
                const contraryDirection = lastInterval > 0 ? -1 : 1;
                let idx = findScaleIndex(prevCounterPitch, counterValidPitches, divisions);
                if (idx === -1) {
                    idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches, divisions);
                }
                const stepShift = rng.next() > 0.5 ? 2 : 1;
                let newIdx = idx + contraryDirection * stepShift;
                if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                    newIdx = idx - contraryDirection * stepShift;
                }
                counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
            } else {
                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);
            }
        }
    } else {
        if (slotAestheticMode === 'cantabile') {
            const melodyMoved = lastInterval !== 0;
            if (melodyMoved) {
                const contraryDirection = lastInterval > 0 ? -1 : 1;
                let idx = findScaleIndex(prevCounterPitch, counterValidPitches, divisions);
                if (idx === -1) idx = findScaleIndex(findClosest(prevCounterPitch, counterValidPitches), counterValidPitches, divisions);
                let newIdx = idx + contraryDirection * (rng.next() > 0.5 ? 2 : 1);
                counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
            } else {
                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);
            }
        } else if (slotAestheticMode === 'sighs') {
            if (counterActiveChordTones.length > 0) {
                counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
            } else {
                counterPitch = findClosest(keyRoot - periodSize, counterValidPitches);
            }
        } else if (slotAestheticMode === 'declamatory') {
            if (counterActiveChordTones.length > 0 && rng.next() < 0.6) {
                counterPitch = findClosest(prevCounterPitch, counterActiveChordTones);
            } else {
                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);
            }
        } else if (slotAestheticMode === 'virtuoso') {
            // 70% stepwise, 20% leaps, 10% rest (stet on prev pitch)
            const virtuosoRoll = rng.next();
            if (virtuosoRoll < 0.70) {
                counterPitch = findDirectedStep(prevCounterPitch, counterValidPitches, counterPhraseDirectionBias, counterLastPitch, divisions, rng);
            } else if (virtuosoRoll < 0.90) {
                // Occasional leap: jump 2-4 scale degrees
                const idx = findScaleIndex(prevCounterPitch, counterValidPitches, divisions);
                if (idx !== -1) {
                    const leapSize = Math.floor(rng.next() * 3) + 2; // 2, 3, or 4
                    const dir = rng.next() > 0.5 ? 1 : -1;
                    let newIdx = idx + dir * leapSize;
                    if (newIdx < 0 || newIdx >= counterValidPitches.length) {
                        newIdx = idx - dir * leapSize;
                    }
                    counterPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, newIdx))];
                } else {
                    counterPitch = findClosest(prevCounterPitch, counterValidPitches);
                }
            } else {
                // 10% chance: hold previous pitch (rest-like effect)
                counterPitch = prevCounterPitch;
            }
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
            const dir = counterPhraseDirectionBias !== 0 ? counterPhraseDirectionBias : (rng.next() > 0.5 ? 1 : -1);
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
                const isDiatonic = activeScalePcSet.has(roundedPc);
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
            counterPitch = selectWeightedPitch(counterCandidates, weights, rng);
        }
    }
    
    // Polyphonic collision check (Change 5B - Polyphonic check, relaxed)
    // Only nudge if countermelody would land within 1 EDO step of melody note
    // (prevents grating beats while allowing more pitch freedom)
    if (melodyPlays && pitch !== null) {
        const edoStep = periodSize / divisions;
        const diff = Math.abs(counterPitch - pitch);
        if (diff > 0.01 && diff <= 1.0 * edoStep) {
            const idx = findScaleIndex(counterPitch, counterValidPitches, divisions);
            if (idx !== -1) {
                const dir = counterPitch > pitch ? 1 : -1;
                let targetIdx = idx + dir;
                if (targetIdx < 0 || targetIdx >= counterValidPitches.length) {
                    targetIdx = idx - dir;
                }
                // Only apply nudge if it doesn't land on the melody pitch (unison is OK)
                const nudgedPitch = counterValidPitches[Math.max(0, Math.min(counterValidPitches.length - 1, targetIdx))];
                if (Math.abs(nudgedPitch - pitch) > 0.01) {
                    counterPitch = nudgedPitch;
                }
            }
        }
    }

    let counterNoteDuration = g.noteDuration;
    // Apply minimum duration to prevent machine-gun effect
    const beatDuration = 60 / (state.bpm || 120);
    const minCounterDuration = beatDuration * 0.5; // minimum half a beat
    if (counterNoteDuration < minCounterDuration) {
        counterNoteDuration = minCounterDuration * (0.8 + rng.next() * 0.4); // 0.8-1.2x the minimum
    }

    counterScheduled.push({
        pitch: counterPitch,
        stepTime: g.stepTime,
        noteDuration: counterNoteDuration,
        counterInst,
        step: g.step
    });

    // Update direction memory (Change 2)
    counterLastPitch = prevCounterPitch;
    prevCounterPitch = counterPitch;
    if (counterPhraseStepsRemaining > 0) {
        counterPhraseStepsRemaining--;
    } else {
        const counterIdx = findScaleIndex(counterPitch, counterValidPitches, divisions);
        const counterBottom = findScaleIndex(counterValidPitches[0], counterValidPitches, divisions);
        const counterTop = findScaleIndex(counterValidPitches[counterValidPitches.length - 1], counterValidPitches, divisions);
        if (counterIdx <= counterBottom + 1 || counterIdx >= counterTop - 1) {
            counterPhraseDirectionBias = -counterPhraseDirectionBias;
            counterPhraseStepsRemaining = 4;
        }
    }

    // Write back updated properties
    context.counterPhraseDirectionBias = counterPhraseDirectionBias;
    context.counterPhraseStepsRemaining = counterPhraseStepsRemaining;
    context.counterLastPitch = counterLastPitch;

    slotState.prevCounterPitch = prevCounterPitch;
}
