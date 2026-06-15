import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';
import fs from 'fs';

clearMelodyMemory();
state.baseKey = 60; // C
state.mode = 'major';
state.divisions = 12;
state.melodySettings = {
    enabled: true,
    genre: 'pop', // Test pop genre
    motifRecurrence: 0.8,
    variationDepth: 0.5,
    density: 0.9,      // High density
    restProbability: 0.1,
    ornamentIntensity: 0.5,
    countermelodyEnabled: false,
    behaviorDuringArp: 'simplify',
    behaviorDuringTransitions: 'simplify',
    tensionCurve: 'arch',
    shortestNoteLimit: 16 // 16th notes
};

const playedNotes = [];
const mockPlayTone = (freq, startTime, duration, inst, bus, pan) => {
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    playedNotes.push({ midi, startTime: parseFloat(startTime.toFixed(3)), duration: parseFloat(duration.toFixed(3)), inst, bus, pan });
};

const progression = [
    { symbol: 'I', duration: 4, key: 60 },   // C major (notes: 60, 64, 67)
    { symbol: 'V', duration: 4, key: 60 },   // G major (notes: 55, 59, 62)
    { symbol: 'vi', duration: 4, key: 60 },  // A minor (notes: 57, 60, 64)
    { symbol: 'IV', duration: 4, key: 60 }   // F major (notes: 53, 57, 60)
];

const logLines = [];
logLines.push("=== Melody Generator Diagnostic Log ===");
logLines.push(`BPM: 120, Density: ${state.melodySettings.density}, Shortest Limit: ${state.melodySettings.shortestNoteLimit}\n`);

let currentTime = 0.0;
progression.forEach((chordObj, index) => {
    logLines.push(`--- Chord Index ${index}: ${chordObj.symbol} (Key Root: ${chordObj.key}) ---`);
    
    // Simulate notes to play based on standard chord voicings
    let notes = [];
    if (chordObj.symbol === 'I') notes = [60, 64, 67];
    else if (chordObj.symbol === 'V') notes = [55, 59, 62, 67];
    else if (chordObj.symbol === 'vi') notes = [57, 60, 64];
    else if (chordObj.symbol === 'IV') notes = [53, 57, 60, 65];

    const prevChord = index > 0 ? progression[index - 1] : null;
    const nextChord = index < progression.length - 1 ? progression[index + 1] : null;

    const startNoteIdx = playedNotes.length;

    scheduleMelody(
        currentTime,
        chordObj,
        nextChord,
        prevChord,
        2.0, // chordSlotDuration (2 seconds)
        4,   // beats
        120, // bpm
        index,
        progression.length,
        notes,
        mockPlayTone,
        []
    );

    const chordNotesGenerated = playedNotes.slice(startNoteIdx);
    chordNotesGenerated.forEach(n => {
        logLines.push(`  Step Time: ${n.startTime}s, Pitch: ${n.midi} (Duration: ${n.duration}s)`);
    });
    
    currentTime += 2.0;
});

fs.writeFileSync('scratch/melody_run_log.txt', logLines.join('\n'));
console.log("Diagnostic complete! Log written to scratch/melody_run_log.txt");
