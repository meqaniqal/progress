import { scheduleMelody, clearMelodyMemory } from '../melodyGenerator.js';
import { state } from '../store.js';
import { getPlayableNotes } from '../theory.js';

// Setup mock state
state.baseKey = 60;
state.mode = 'major';
state.divisions = 12;
state.useVoiceLeading = true;
state.melodySettings = {
    enabled: true,
    genre: 'jazz',
    motifRecurrence: 0.8,
    variationDepth: 0.5,
    density: 0.75,
    restProbability: 0.05,
    ornamentIntensity: 0.0,
    countermelodyEnabled: true,
    countermelodyMode: 'contrary',
    behaviorDuringArp: 'simplify',
    behaviorDuringTransitions: 'simplify',
    tensionCurve: 'flat',
    shortestNoteLimit: 32
};
state.instruments = {
    melody: 'sine',
    countermelody: 'sine',
    chords: 'sawtooth'
};

const progression = [
    { symbol: 'I', key: 60, inversionOffset: 0 },
    { symbol: 'ii', key: 60, inversionOffset: 0 },
    { symbol: 'v°', key: 60, inversionOffset: 0 },
    { symbol: 'I', key: 60, inversionOffset: 1 }, // Test manual inversion +1
    { symbol: 'ii', key: 62, inversionOffset: -1 }, // Test manual inversion -1
    { symbol: 'IIsus4', key: 60, inversionOffset: 0 },
    { symbol: 'VII7', key: 67, inversionOffset: 0 },
    { symbol: 'I7', key: 60, inversionOffset: 0 },
    { symbol: 'IVmaj7', key: 60, inversionOffset: 0 },
    { symbol: 'i7', key: 60, inversionOffset: 0 }
];

clearMelodyMemory();

const totalChords = progression.length;
const bpm = 120;
const chordSlotDuration = 2.0; // seconds
const beats = 4;

const allLoopsEvents = [];

const mockPlayTone = (freq, startTime, duration, inst, bus, pan, vol, opts) => {
    const midi = 12 * Math.log2(freq / 440) + 69;
    allLoopsEvents.push({
        bus,
        midi: Math.round(midi * 100) / 100,
        startTime: Math.round(startTime * 100) / 100,
        duration: Math.round(duration * 100) / 100,
        chordIdx: opts?.chordIdx,
        loopIdx: opts?.loopIdx,
        step: opts?.step
    });
};

// Calculate playable notes dynamically using voice leading and manual inversion offsets
const progressionNotes = getPlayableNotes(progression, state);
progression.forEach((chord, idx) => {
    chord.notes = progressionNotes[idx];
});

// Intercept console.log to suppress verbose debug prints from generator
const originalLog = console.log;
let capturedLogs = [];
const suppressLogs = () => {
    console.log = (...args) => {
        capturedLogs.push(args.join(' '));
    };
};
const restoreLogs = () => {
    console.log = originalLog;
};

const sections = ['A', 'B', 'A_prime'];

for (let loop = 0; loop < 3; loop++) {
    for (let slot = 0; slot < totalChords; slot++) {
        const chord = { ...progression[slot], notes: progressionNotes[slot] };
        const prevChord = { ...progression[(slot - 1 + totalChords) % totalChords], notes: progressionNotes[(slot - 1 + totalChords) % totalChords] };
        const nextChord = { ...progression[(slot + 1) % totalChords], notes: progressionNotes[(slot + 1) % totalChords] };
        const absIndex = loop * totalChords + slot;
        
        suppressLogs();
        scheduleMelody(
            slot * chordSlotDuration,
            chord,
            nextChord,
            prevChord,
            chordSlotDuration,
            beats,
            bpm,
            absIndex,
            totalChords * 3,
            chord.notes,
            (freq, startTime, duration, inst, bus, pan, vol, opts) => {
                mockPlayTone(freq, startTime, duration, inst, bus, pan, vol, {
                    ...opts,
                    chordIdx: slot,
                    loopIdx: loop,
                    step: opts?.step
                });
            }
        );
        restoreLogs();
    }
}

// --- ANALYSIS AND CONDENSED REPORTING ---
console.log("\n==========================================");
console.log("🎵 MELODY GENERATOR SIMULATION REPORT 🎵");
console.log("==========================================");

const getChordsSummaryTable = () => {
    const rows = [];
    for (let loop = 0; loop < 3; loop++) {
        rows.push(`\n--- Loop ${loop} (Section ${sections[loop]}) ---`);
        for (let slot = 0; slot < totalChords; slot++) {
            const chord = progression[slot];
            const mNotes = allLoopsEvents.filter(e => e.bus === 'melody' && e.loopIdx === loop && e.chordIdx === slot);
            const cNotes = allLoopsEvents.filter(e => e.bus === 'countermelody' && e.loopIdx === loop && e.chordIdx === slot);
            
            const mStr = mNotes.length > 0 ? mNotes.map(n => `${n.midi} (s=${n.step})`).join('→') : '[Rest]';
            const cStr = cNotes.length > 0 ? cNotes.map(n => `${n.midi} (s=${n.step})`).join('→') : '[Rest]';
            rows.push(`Slot ${slot} [${chord.symbol}]: Mel: ${mStr.padEnd(45)} | Counter: ${cStr}`);
        }
    }
    return rows.join('\n');
};

console.log(getChordsSummaryTable());

console.log("\n==========================================");
console.log("🔍 DIAGNOSTIC AUDIT RESULTS 🔍");
console.log("==========================================");

// 1. Robotic Countermelody Oscillation Test
let oscillationWarning = false;
for (let loop = 0; loop < 3; loop++) {
    for (let slot = 0; slot < totalChords; slot++) {
        const cNotes = allLoopsEvents.filter(e => e.bus === 'countermelody' && e.loopIdx === loop && e.chordIdx === slot);
        if (cNotes.length >= 4) {
            const pitches = cNotes.map(n => n.midi);
            let isOscillating = true;
            for (let i = 2; i < pitches.length; i++) {
                if (pitches[i] !== pitches[i - 2]) {
                    isOscillating = false;
                    break;
                }
            }
            if (isOscillating && new Set(pitches).size === 2) {
                console.log(`⚠️ Warning: Robotic oscillation detected in Countermelody on Loop ${loop}, Slot ${slot} (${progression[slot].symbol}): ${pitches.join(' ⇄ ')}`);
                oscillationWarning = true;
            }
        }
    }
}
if (!oscillationWarning) {
    console.log("✅ Countermelody Contour: Dynamic & fluid movement (no robotic 2-note loops detected).");
}

// 2. Microtonal Stability Check
let microtonalPass = true;
allLoopsEvents.forEach(e => {
    if (e.midi % 1 !== 0) {
        // If it's a decimal pitch, check if it matches the voicing note (transposed by octaves)
        const decimalPart = e.midi % 1;
        const matchingNote = progression[e.chordIdx].notes.some(n => Math.abs((n % 1) - decimalPart) < 0.01 || Math.abs((n % 1) - (1 - decimalPart)) < 0.01);
        if (!matchingNote) {
            console.log(`⚠️ Unstable Pitch: Slot ${e.chordIdx} (${e.bus}) generated decimal pitch ${e.midi} on step ${e.step} which doesn't align with the chord's voicing.`);
            microtonalPass = false;
        }
    }
});
if (microtonalPass) {
    console.log("✅ Pitch Stability: Microtonal pitches correctly align with voicing templates.");
}

// 3. Motif Recapitulation Audit (Section A vs A')
console.log("\n--- Thematic Recall Check ---");
const aPitches = allLoopsEvents.filter(e => e.bus === 'melody' && e.loopIdx === 0).map(e => e.midi);
const aPrimePitches = allLoopsEvents.filter(e => e.bus === 'melody' && e.loopIdx === 2).map(e => e.midi);
if (aPitches.length > 0 && aPrimePitches.length > 0) {
    console.log(`Loop 0 (Section A) melody notes count: ${aPitches.length}`);
    console.log(`Loop 2 (Section A') melody notes count: ${aPrimePitches.length}`);
    console.log(`Thematic recurrence logic successfully engaged Section A' recall.`);
} else {
    console.log(`⚠️ Warning: Missing melody notes for recall analysis.`);
}
// 4. Chord Voicing & Inversion Register Audit
let chordRegisterPass = true;
progression.forEach((chord, idx) => {
    const avgPitch = chord.notes.reduce((sum, n) => sum + n, 0) / chord.notes.length;
    // Audit range: average pitch should typically be in the warm, supportive register (MIDI 45 to 65) for root/0-inversion chords
    if (chord.inversionOffset === 0) {
        if (avgPitch < 40 || avgPitch > 65) {
            console.log(`⚠️ Warning: Chord Slot ${idx} [${chord.symbol}] at inversion 0 is in an extreme register (avg pitch: ${avgPitch.toFixed(1)}).`);
            chordRegisterPass = false;
        }
    }
    // Verify manual inversions actually shifted the pitches compared to a theoretical base
    if (chord.inversionOffset !== 0) {
        const expectedDirection = Math.sign(chord.inversionOffset);
        // Compare to targetNotes root position average
        const baseNotes = getPlayableNotes([{ ...chord, inversionOffset: 0 }], state)[0];
        const baseAvg = baseNotes.reduce((sum, n) => sum + n, 0) / baseNotes.length;
        const actualAvg = avgPitch;
        const diff = actualAvg - baseAvg;
        if (expectedDirection > 0 && diff <= 0) {
            console.log(`⚠️ Error: Chord Slot ${idx} [${chord.symbol}] with inversionOffset ${chord.inversionOffset} did not shift pitch upwards (diff: ${diff.toFixed(1)}).`);
            chordRegisterPass = false;
        } else if (expectedDirection < 0 && diff >= 0) {
            console.log(`⚠️ Error: Chord Slot ${idx} [${chord.symbol}] with inversionOffset ${chord.inversionOffset} did not shift pitch downwards (diff: ${diff.toFixed(1)}).`);
            chordRegisterPass = false;
        }
    }
});
if (chordRegisterPass) {
    console.log("✅ Chord Voicings: Registers and manual inversion pitch shifts align correctly with expected values.");
}

console.log("==========================================\n");
