import { state } from './store.js';
import { getScaleIntervals, findScaleIndex, findClosest, findClosestStep } from './melodyTuning.js';

export function generateMotifFamily(pool, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const hook = generateSeedMotif(pool, 4, chordTones, scalePitches, tuning);
    
    // Generate hook rhythmic skeleton
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

export function mutateMotifFamily(motifFamily, pool, tuning) {
    const mutated = {
        hook: [...motifFamily.hook],
        connector: [...motifFamily.connector],
        cadence: [...motifFamily.cadence],
        hookRhythm: [...motifFamily.hookRhythm]
    };
    
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

export function generateSeedMotif(pool, size, chordTones, scalePitches, tuning) {
    const divisions = tuning.divisions;
    const periodSize = tuning.periodSize;
    const motif = [];
    if (pool.length === 0) return motif;

    const keyRoot = Number(state.baseKey) || 60;
    const baseScaleIntervals = getScaleIntervals(state.mode || 'major', 'none');
    const isBaseScaleTone = (pitch) => {
        const pc = (pitch % periodSize + periodSize) % periodSize;
        const diff = (pc - (keyRoot % periodSize) + periodSize) % periodSize;
        return baseScaleIntervals.some(interval => Math.abs(interval - diff) < 0.01);
    };

    const chromaticChordTones = (chordTones || []).filter(ct => !isBaseScaleTone(ct));
    const isTest = state.melodySettings && state.melodySettings.genre === 'none';

    let note1;
    if (chromaticChordTones.length > 0) {
        note1 = isTest ? chromaticChordTones[0] : chromaticChordTones[Math.floor(Math.random() * chromaticChordTones.length)];
    } else {
        note1 = chordTones && chordTones.length > 0 ? 
            (isTest ? chordTones[0] : chordTones[Math.floor(Math.random() * chordTones.length)]) : 
            (isTest ? pool[0] : pool[Math.floor(Math.random() * pool.length)]);
    }
    motif.push(note1);

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

export function generateMotifFamilyFromUser(userMotif, pool, activeChordTones, validPitches, tuning) {
    const keyRoot = Number(state.baseKey) || 60;
    
    const sortedNotes = [...userMotif.notes]
        .filter(n => !n.voiceIndex)
        .sort((a, b) => a.time - b.time);

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

export function applyInversion(motif, pool) {
    if (motif.length === 0) return motif;
    const center = motif[0];
    return motif.map(p => {
        const inverted = center - (p - center);
        return findClosest(inverted, pool);
    });
}

export function applyRetrograde(motif) {
    return [...motif].reverse();
}

export function applySequence(motif, pool, shiftSteps) {
    return motif.map(p => {
        const idx = findScaleIndex(p, pool);
        if (idx !== -1) {
            const nextIdx = Math.max(0, Math.min(pool.length - 1, idx + shiftSteps));
            return pool[nextIdx];
        }
        return p;
    });
}

export function generateRhythmicMotif(aestheticMode) {
    const MOTIF_LIBRARY = {
        cantabile: [
            { steps: [0, 4, 6, 8], directions: [0, 1, 2, 1] },
            { steps: [0, 2, 8, 12], directions: [0, 1, 2, 1] },
        ],
        declamatory: [
            { steps: [0, 1, 4, 8], directions: [0, 0, 1, -1] },
        ],
        sighs: [
            { steps: [0, 6], directions: [0, 3] },
        ],
        virtuoso: [
            { steps: [0, 1, 2, 3, 4, 5, 6, 7], directions: [0, 1, 2, 3, 4, 3, 2, 1] },
        ],
    };
    const pool = MOTIF_LIBRARY[aestheticMode] || MOTIF_LIBRARY.cantabile;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function realizeMotifinContext(rhythmicMotif, anchorPitch, validPitches) {
    const anchorIdx = findScaleIndex(anchorPitch, validPitches);
    if (anchorIdx === -1) return rhythmicMotif.steps.map(() => anchorPitch);
    return rhythmicMotif.directions.map(delta => {
        const idx = Math.max(0, Math.min(validPitches.length - 1, anchorIdx + delta));
        return validPitches[idx];
    });
}

export function applyRhythmicVariation(rhythmicMotif) {
    const shifted = { ...rhythmicMotif };
    shifted.steps = rhythmicMotif.steps.map(s => (s + 2) % 16);
    return shifted;
}

export function applyPartialRecall(rhythmicMotif, n = 3) {
    return {
        steps: rhythmicMotif.steps.slice(0, n),
        directions: rhythmicMotif.directions.slice(0, n),
    };
}

export function applyMotivicExtension(rhythmicMotif, lastDirection) {
    const delta = lastDirection > 0 ? 1 : -1;
    const lastStep = rhythmicMotif.steps[rhythmicMotif.steps.length - 1] || 0;
    return {
        steps: [...rhythmicMotif.steps, (lastStep + 2) % 16],
        directions: [...rhythmicMotif.directions, delta],
    };
}
