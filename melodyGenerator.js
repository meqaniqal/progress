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
        // Clear legacy engine stale state that professional mode reads
        // to prevent cross-engine contamination when switching engines without stopping
        const context = testContext || activeContext;
        if (context !== testContext) {
            context.globalPrevPitch = null;
            context.globalPrevCounterPitch = null;
        }
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

/**
 * Score a generated melody for benchmarking purposes.
 * Mirrors orchestrator._evaluateMelodyGlobally() for cross-engine comparison.
 * @param {Object[]} notes - Notes with pitch and role properties
 * @returns {{ score: number, issues: string[], noteCount: number }}
 */
export function scoreNotes(notes) {
  if (!notes || notes.length === 0) return { score: 0, issues: ['no-notes'], noteCount: 0 };
  let score = 1.0;
  const issues = [];

  const pitchCounts = {};
  notes.forEach(n => { pitchCounts[n.pitch] = (pitchCounts[n.pitch] || 0) + 1; });
  const uniqueRatio = Object.keys(pitchCounts).length / notes.length;
  if (uniqueRatio < 0.25) { issues.push('low-pitch-diversity'); score -= 0.2; }

  let uncompensatedLeaps = 0;
  for (let i = 1; i < notes.length - 1; i++) {
    const interval1 = notes[i].pitch - notes[i-1].pitch;
    const interval2 = notes[i+1].pitch - notes[i].pitch;
    if (Math.abs(interval1) > 7 && Math.sign(interval1) === Math.sign(interval2)) {
      uncompensatedLeaps++;
    }
  }
  if (uncompensatedLeaps > 2) { issues.push('excessive-uncompensated-leaps'); score -= 0.15; }

  const intervals = [];
  for (let i = 1; i < notes.length; i++) { intervals.push(notes[i].pitch - notes[i-1].pitch); }
  let repetitionCount = 0;
  for (let i = 0; i < intervals.length - 3; i++) {
    for (let j = i + 2; j < intervals.length - 1; j++) {
      if (intervals[i] === intervals[j] && intervals[i+1] === intervals[j+1]) {
        repetitionCount++;
      }
    }
  }
  if (repetitionCount > notes.length * 0.5) { issues.push('excessive-repetition'); score -= 0.15; }
  else if (repetitionCount === 0 && notes.length > 8) { issues.push('low-motivic-coherence'); score -= 0.1; }

  return { score: Math.max(0, Math.min(1, score)), issues, noteCount: notes.length };
}
