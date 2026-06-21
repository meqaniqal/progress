import { defaultContext } from './melodyContext.js';
import { scheduleMelody as schedMelody } from './melodyScheduler.js';
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
    if (state.melodySettings && state.melodySettings.enabled && state.melodySettings.engine === 'mgen') {
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

    const context = testContext || activeContext;
    return schedMelody(
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
