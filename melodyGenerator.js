import { defaultContext } from './melodyContext.js';
import { scheduleMelody as schedMelody } from './melodyScheduler.js';

let activeContext = defaultContext();
let testContext = null;

export function setTestContext(ctx) {
    testContext = ctx;
}

export function clearMelodyMemory() {
    activeContext = defaultContext();
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
