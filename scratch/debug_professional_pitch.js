// Diagnostic: trace off-key notes in professional mode to their source
import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';

state.baseKey = 60;
state.mode = 'major';
state.divisions = 12;
state.melodySettings = {
    enabled: true,
    engine: 'pro',
    genre: 'blues',
    density: 0.9,
    restProbability: 0.0,
    rangeMin: 60,
    rangeMax: 84,
    phraseStructure: 'period',
    allowAsymmetry: false
};
state.divisions = 12;

const progression = [
    { symbol: 'I',  duration: 4, key: 60 },
    { symbol: 'IV', duration: 4, key: 65 },
    { symbol: 'I',  duration: 2, key: 60 },
    { symbol: 'V',  duration: 2, key: 67 },
    { symbol: 'I',  duration: 4, key: 60 },
];
const chordNotesMap = { 60: [60, 64, 67], 65: [65, 69, 72], 67: [67, 71, 74] };

for (let run = 0; run < 3; run++) {
    console.log(`\n=== Run ${run + 1} ===`);
    for (let i = 0; i < progression.length; i++) {
        clearMelodyMemory();
        const chordObj = progression[i];
        const nextChordObj = i < progression.length - 1 ? progression[i + 1] : null;
        const prevChordObj = i > 0 ? progression[i - 1] : null;
        const chordNotes = chordNotesMap[chordObj.key] || [chordObj.key, chordObj.key + 4, chordObj.key + 7];

        const result = scheduleMelody(
            i * chordObj.duration,
            chordObj,
            nextChordObj,
            prevChordObj,
            chordObj.duration,
            chordObj.duration,
            120,
            i,
            progression.length,
            chordNotes,
            () => {}
        );

        const rootPc = chordObj.key % 12;
        const chordPcs = [0, 4, 7].map(iv => (rootPc + iv) % 12);
        const scalePcs = [0, 2, 4, 5, 7, 9, 11].map(iv => (rootPc + iv) % 12);

        result.forEach(note => {
            const pc = Math.round(((note.pitch % 12 + 12) % 12) * 100) / 100;
            const isChordTone = chordPcs.some(cp => Math.abs(cp - pc) < 0.1);
            const isScaleTone = scalePcs.some(sp => Math.abs(sp - pc) < 0.1);

            if (!isChordTone && !isScaleTone) {
                // Check if it's a blue note (b3=3, b5=6)
                const isBlue = (pc === 3 || pc === 6);
                // Check cadence (last 2 steps of phrase)
                const stepsFromEnd = progression.length * 16 - note.step;
                const isCadence = stepsFromEnd <= 2;
                // Check if it's on a weak beat
                const isWeakBeat = note.step % 4 !== 0;

                console.log(`  chord=${chordObj.symbol} pitch=${note.pitch} (pc=${pc}) step=${note.step} role="${note.clusterRole || 'none'}" isBlue=${isBlue} isCadence=${isCadence} isWeakBeat=${isWeakBeat}`);
            }
        });
    }
}
