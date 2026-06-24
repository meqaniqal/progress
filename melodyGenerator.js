import { defaultContext } from './melodyContext.js';
import { scheduleMelody as schedMelody } from './melodyScheduler.js';
import { scheduleMelody as schedProMelody } from './professionalMelodyScheduler.js';
import { state } from './store.js';
import { clearMgenCache, scheduleMgenMelody } from './mgenEngine.js';

let activeContext = defaultContext();
let testContext = null;

export function setTestContext(ctx) {
    testContext = ctx;
}

export function clearMelodyMemory() {
    activeContext = defaultContext();
    clearMgenCache();
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
    playToneFn,
    voiceEvents = []
) {
    if (!state.melodySettings || !state.melodySettings.enabled) {
        return;
    }

    if (state.melodySettings.engine === 'mgen') {
        return scheduleMgenMelody(
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
            playToneFn,
            voiceEvents
        );
    }

    if (state.melodySettings.engine === 'pro') {
        const context = testContext || activeContext;
        return schedProMelody(
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
            playToneFn,
            voiceEvents
        );
    }

    const context = testContext || activeContext;
    const startTime = performance.now();
    const result = schedMelody(
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
        playToneFn,
        voiceEvents
    );
    const elapsed = performance.now() - startTime;
    if (elapsed > 15) {
        import('./modalController.js').then(m => m.showPerformanceWarning('legacy', elapsed));
    }
    return result;
}
