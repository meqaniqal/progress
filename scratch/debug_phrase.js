import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';

for (let i = 0; i < 100; i++) {
    clearMelodyMemory();
    state.baseKey = 60;
    state.mode = 'major';
    state.divisions = 12;
    state.instruments = { melody: 'sine' };
    state.melodySettings = {
        enabled: true,
        genre: 'generic',
        motifRecurrence: 0.8,
        variationDepth: 0.5,
        density: 1.0,
        restProbability: 0.0,
        ornamentIntensity: 0.0,
        countermelodyEnabled: false,
        behaviorDuringArp: 'simplify',
        behaviorDuringTransitions: 'simplify',
        tensionCurve: 'flat'
    };

    const playedNotes = [];
    const mockPlayTone = (freq, startTime, duration, inst, bus) => {
        const midi = Math.round(12 * Math.log2(freq / 440) + 69);
        playedNotes.push({ midi, startTime, duration, inst, bus });
    };

    const chordObj = { symbol: 'I', duration: 4, key: 60 };
    scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 1, 4, [60, 64, 67], mockPlayTone);

    const melodyNotes = playedNotes.filter(n => n.bus === 'melody');
    if (melodyNotes.length === 0) {
        console.log(`Iteration ${i} generated 0 notes!`);
        process.exit(1);
    }
}
console.log("All 100 iterations generated notes successfully!");
