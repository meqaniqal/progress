import { midiToFreq } from './theory.js';
import { findScaleIndex, findClosest } from './melodyTuning.js';

export function applyGenreRules(pitch, genre, step, scalePitches, divisions, chromaticProb = 0.0, rng = null) {
    const randVal = () => (rng ? rng.next() : Math.random());
    if (genre === 'jazz') {
        const prob = 0.15 + chromaticProb;
        if (step % 8 === 4 && randVal() < prob) {
            const idx = findScaleIndex(pitch, scalePitches, divisions);
            if (idx !== -1 && idx < scalePitches.length - 1) {
                return scalePitches[idx + 1];
            }
        }
    }
    if (genre === 'blues') {
        const prob = 0.2 + chromaticProb;
        if (step % 4 === 2 && randVal() < prob) {
            return pitch - 0.5 * (12 / divisions);
        }
    }
    return pitch;
}

export function applyOrnaments(pitch, stepTime, noteDuration, genre, intensity, inst, bus, playToneFn, rng = null) {
    const randVal = () => (rng ? rng.next() : Math.random());
    if (randVal() > intensity) return;

    if (genre === 'classical' && randVal() < 0.5) {
        const gracePitch = pitch - 1;
        playToneFn(midiToFreq(gracePitch), stepTime - 0.05, 0.04, inst, bus);
    } else if (genre === 'blues' && randVal() < 0.4) {
        const bendPitch = pitch - 0.5;
        playToneFn(midiToFreq(bendPitch), stepTime, noteDuration * 0.3, inst, bus);
    }
}

export function applyMotivicFlexing(scheduled, activeScalePcSet, chordTonePcSet, periodSize, divisions) {
    for (let i = 0; i < scheduled.length - 1; i++) {
        const note = scheduled[i];
        const next = scheduled[i + 1];
        if (note.isIsolated) continue;

        const pc = Math.round(((note.pitch % periodSize + periodSize) % periodSize) * 100) / 100;
        const isTense = !activeScalePcSet.has(pc) && !chordTonePcSet.has(pc);
        if (!isTense) continue;

        const stepSize = 12 / divisions;
        const interval = next.pitch - note.pitch;
        const isWholeStepAway = Math.abs(Math.abs(interval) - 2 * stepSize) < 0.05;

        if (isWholeStepAway && note.noteDuration > stepSize * 0.2) {
            const passingPitch = note.pitch + (interval > 0 ? stepSize : -stepSize);
            const splitDuration = note.noteDuration * 0.6;
            scheduled.splice(i + 1, 0, {
                ...note,
                pitch: passingPitch,
                stepTime: note.stepTime + splitDuration,
                noteDuration: note.noteDuration * 0.4,
                isIsolated: false
            });
            note.noteDuration = splitDuration;
            i++; // don't re-process the note we just inserted
        } else {
            const shift = note.noteDuration * 0.3;
            note.stepTime += shift;
            note.noteDuration -= shift;
        }
    }
}
