import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';

clearMelodyMemory();
state.baseKey = 60;
state.mode = 'major';
state.divisions = 12;
state.melodySettings = {
    enabled: true,
    genre: 'none',
    motifRecurrence: 0.8,
    variationDepth: 0.5,
    density: 0.9,
    restProbability: 0.1,
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

const chordObj = { symbol: 'I', duration: 4 };
scheduleMelody(0, chordObj, null, null, 2.0, 4, 120, 0, 1, [60, 64, 67], mockPlayTone);

console.log("Played notes:", playedNotes.map(n => n.midi));
