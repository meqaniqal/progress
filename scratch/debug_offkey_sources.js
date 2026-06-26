// Verify neighbor tone fix reduces off-key notes
import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';

const progression = [
    { symbol: 'I',  duration: 4, key: 60 },
    { symbol: 'IV', duration: 4, key: 65 },
    { symbol: 'V',  duration: 4, key: 67 },
    { symbol: 'I',  duration: 4, key: 60 },
];
const chordNotesMap = { 60: [60, 64, 67], 65: [65, 69, 72], 67: [67, 71, 74] };

console.log('=== Professional mode: 10 runs, off-key rate ===');
let totalOffKey = 0;
let totalNotes = 0;

for (let run = 0; run < 10; run++) {
    clearMelodyMemory();
    state.melodySettings = {
        enabled: true, engine: 'pro', genre: 'none', density: 0.8,
        restProbability: 0.0, rangeMin: 60, rangeMax: 84,
        phraseStructure: 'period', allowAsymmetry: false, macroPlannerEnabled: false
    };
    state.divisions = 12;

    let runOffKey = 0;
    let runNotes = 0;

    for (let i = 0; i < progression.length; i++) {
        const chordObj = progression[i];
        const nextChordObj = i < progression.length - 1 ? progression[i + 1] : null;
        const prevChordObj = i > 0 ? progression[i - 1] : null;
        const chordNotes = chordNotesMap[chordObj.key] || [chordObj.key, chordObj.key + 4, chordObj.key + 7];

        const result = scheduleMelody(
            i * chordObj.duration, chordObj, nextChordObj, prevChordObj,
            chordObj.duration, chordObj.duration, 120, i, progression.length,
            chordNotes, () => {}
        );

        if (!result) continue;
        const rootPc = chordObj.key % 12;
        const chordPcs = [0, 4, 7].map(iv => (rootPc + iv) % 12);
        const scalePcs = [0, 2, 4, 5, 7, 9, 11].map(iv => (rootPc + iv) % 12);

        result.forEach(note => {
            runNotes++;
            const pc = Math.round(((note.pitch % 12 + 12) % 12) * 100) / 100;
            const isChordTone = chordPcs.some(cp => Math.abs(cp - pc) < 0.1);
            const isScaleTone = scalePcs.some(sp => Math.abs(sp - pc) < 0.1);
            if (!isChordTone && !isScaleTone) {
                runOffKey++;
            }
        });
    }

    totalOffKey += runOffKey;
    totalNotes += runNotes;
    console.log(`  Run ${run + 1}: ${runNotes} notes, ${runOffKey} off-key (${(runOffKey/runNotes*100).toFixed(1)}%)`);
}

console.log(`\n  Average: ${totalNotes} notes, ${totalOffKey} off-key (${(totalOffKey/totalNotes*100).toFixed(1)}%)`);
