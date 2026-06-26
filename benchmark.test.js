import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { pregenerateMgenMelody, clearMgenCache } from './mgenEngine.js';
import { state } from './store.js';
import { createRNG } from './melodyRandom.js';
import { defaultContext } from './melodyContext.js';
import { getChordNotes, deduceSourceMode, SCALES } from './theory.js';

// Helper to determine valid pitch classes for a given chord and mode
function getActiveScaleAndChordPcs(chordObj, globalScaleName = 'major', songKey = 60, divisions = 12) {
    const chordNotes = getChordNotes(chordObj.symbol, songKey, divisions) || [];
    const chordPcs = new Set(chordNotes.map(n => Math.round(((n % 12 + 12) % 12) * 100) / 100));

    const localMode = deduceSourceMode(chordObj.symbol, globalScaleName);
    const scaleIntervals = SCALES[localMode] || SCALES[globalScaleName] || SCALES['major'];
    
    // Scale root is chord key if it's a local scale swap, otherwise song key
    const baseKey = chordObj.key !== undefined ? chordObj.key : 60;
    const scaleRoot = localMode !== globalScaleName ? baseKey : songKey;
    const scalePcs = new Set(scaleIntervals.map(interval => Math.round((((scaleRoot + interval) % 12 + 12) % 12) * 100) / 100));

    return new Set([...chordPcs, ...scalePcs]);
}

// ── Fixed test progressions (same input for every benchmark run) ──
const TEST_PROGRESSIONS = [
    {
        name: 'major', scale: 'major', chords: [
            { symbol: 'I', duration: 4, key: 60 },
            { symbol: 'IV', duration: 4, key: 65 },
            { symbol: 'V', duration: 4, key: 67 },
            { symbol: 'I', duration: 4, key: 60 }
        ]
    },
    {
        name: 'jazz', scale: 'major', chords: [
            { symbol: 'ii7', duration: 2, key: 62 },
            { symbol: 'V7', duration: 2, key: 67 },
            { symbol: 'Imaj7', duration: 4, key: 60 }
        ]
    },
    {
        name: 'blues', scale: 'major', chords: [
            { symbol: 'I', duration: 4, key: 60 },
            { symbol: 'IV', duration: 4, key: 65 },
            { symbol: 'I', duration: 2, key: 60 },
            { symbol: 'V7', duration: 2, key: 67 },
            { symbol: 'I', duration: 4, key: 60 }
        ]
    },
    {
        name: 'minor', scale: 'minor', chords: [
            { symbol: 'i', duration: 4, key: 60 },
            { symbol: 'iv', duration: 4, key: 65 },
            { symbol: 'V', duration: 4, key: 67 },
            { symbol: 'i', duration: 4, key: 60 }
        ]
    },
    {
        name: 'modal', scale: 'major', chords: [
            { symbol: 'D', duration: 4, key: 62 },
            { symbol: 'A', duration: 4, key: 69 },
            { symbol: 'G', duration: 4, key: 67 },
            { symbol: 'D', duration: 4, key: 62 }
        ]
    }
];

// ── Scoring function — mirrors orchestrator's _evaluateMelodyGlobally ──
// Check if structural/cadence notes land on the active chord's notes
function checkHarmonicCorrectness(notes, chords) {
  if (!notes || !chords || notes.length === 0) return { score: 0, issues: ['no-data'] };
  let correctCount = 0;
  let totalStructural = 0;

  notes.forEach(note => {
    if (note.role !== 'structural' && note.role !== 'cadence') return;
    totalStructural++;
    // Find active chord at note.startTime
    let activeChord = chords[0];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const nextC = chords[i + 1];
      const chordDuration = c.duration || 2;
      const nextStart = nextC ? nextC.beatStart : c.beatStart + chordDuration;
      if (note.startTime >= c.beatStart && note.startTime < nextStart) {
        activeChord = c;
        break;
      }
    }
    // Check if note pitch matches any of the active chord's notes
    if (activeChord.notes && activeChord.notes.length > 0) {
      const isChordTone = activeChord.notes.some(n => Math.abs(n - note.pitch) < 0.5);
      if (isChordTone) correctCount++;
    }
  });

  if (totalStructural === 0) return { score: 1.0, issues: [] };
  const ratio = correctCount / totalStructural;
  const issues = ratio < 0.5 ? ['low-harmonic-correctness'] : [];
  return { score: ratio, issues, correctCount, totalStructural };
}

// ── Scoring function — mirrors orchestrator's _evaluateMelodyGlobally ──
function scoreNotes(notes, chords = []) {
    if (!notes || notes.length === 0) return { score: 0, issues: ['no-notes'] };
    let score = 1.0;
    const issues = [];

    // Pitch diversity
    const pitchCounts = {};
    notes.forEach(n => { pitchCounts[n.pitch] = (pitchCounts[n.pitch] || 0) + 1; });
    const uniqueRatio = Object.keys(pitchCounts).length / notes.length;
    if (uniqueRatio < 0.25) { issues.push('low-pitch-diversity'); score -= 0.2; }

    // Uncompensated leaps
    let uncompensatedLeaps = 0;
    for (let i = 1; i < notes.length - 1; i++) {
        const interval1 = notes[i].pitch - notes[i - 1].pitch;
        const interval2 = notes[i + 1].pitch - notes[i].pitch;
        if (Math.abs(interval1) > 7 && Math.sign(interval1) === Math.sign(interval2)) {
            uncompensatedLeaps++;
        }
    }
    if (uncompensatedLeaps > 2) { issues.push('excessive-uncompensated-leaps'); score -= 0.15; }

    // Motivic coherence (interval repetition)
    const intervals = [];
    for (let i = 1; i < notes.length; i++) { intervals.push(notes[i].pitch - notes[i - 1].pitch); }
    let repetitionCount = 0;
    for (let i = 0; i < intervals.length - 3; i++) {
        for (let j = i + 2; j < intervals.length - 1; j++) {
            if (intervals[i] === intervals[j] && intervals[i + 1] === intervals[j + 1]) {
                repetitionCount++;
            }
        }
    }
    if (repetitionCount > notes.length * 0.5) { issues.push('excessive-repetition'); score -= 0.15; }
    else if (repetitionCount === 0 && notes.length > 8) { issues.push('low-motivic-coherence'); score -= 0.1; }

    // Harmonic correctness (structural/cadence notes should be chord tones)
    const harmonic = checkHarmonicCorrectness(notes, chords);
    if (harmonic.score < 0.5) {
        issues.push(...harmonic.issues);
        score -= 0.3;
    }

    return { score: Math.max(0, Math.min(1, score)), issues, noteCount: notes.length };
}

// ── Run all 3 engines on all progressions, return structured results ──
async function benchmarkAllEngines() {
    const results = {};
    const engines = ['progress', 'pro', 'mgen'];

    for (const engine of engines) {
        results[engine] = {};
        for (const prog of TEST_PROGRESSIONS) {
            const rng = createRNG(42); // Fixed seed for reproducibility
            const context = defaultContext(rng);
            const playedNotes = [];
            const mockPlayTone = (freq, startTime, duration, inst, bus, pan = 0, vol = 1.0, extraParams = {}) => {
                const midi = 12 * Math.log2(freq / 440) + 69;
                const role = extraParams.clusterRole || 
                             (extraParams.isAnchor1Step ? 'structural' : 
                              (extraParams.isAnchor2Step ? 'cadence' : 'connector'));
                playedNotes.push({ midi, startTime, duration, pitch: midi, role });
            };

            state.melodySettings = {
                enabled: true, engine, genre: 'none', density: 0.5,
                restProbability: 0.1, rangeMin: 60, rangeMax: 84
            };
            state.mode = prog.scale || 'major';
            state.divisions = 12;
            state.bpm = 120;
            state.instruments = { melody: 'sine' };
            
            // Populate notes and beatStart on chord objects so mgen and other engines can see them
            let cumulativeBeats = 0;
            const songKey = prog.chords[0].key !== undefined ? prog.chords[0].key : 60;
            prog.chords.forEach(c => {
                c.notes = getChordNotes(c.symbol, songKey, 12) || [];
                c.beatStart = cumulativeBeats;
                cumulativeBeats += c.duration;
            });
            
            state.currentProgression = prog.chords;
            state.temporarySwaps = {};

            const startTime = performance.now();

            if (engine === 'mgen') {
                await pregenerateMgenMelody(state);
            }

            let currentTime = 0;
            const slotTimes = [];
            for (let i = 0; i < prog.chords.length; i++) {
                const chordObj = prog.chords[i];
                const nextChordObj = i < prog.chords.length - 1 ? prog.chords[i + 1] : null;
                const prevChordObj = i > 0 ? prog.chords[i - 1] : null;
                const chordNotes = chordObj.notes;
                
                slotTimes.push({
                    start: currentTime,
                    end: currentTime + chordObj.duration,
                    chordObj
                });

                await scheduleMelody(
                    currentTime, chordObj, nextChordObj, prevChordObj,
                    chordObj.duration, chordObj.duration, 120, i, prog.chords.length,
                    chordNotes, mockPlayTone
                );
                currentTime += chordObj.duration;
            }

            const elapsed = performance.now() - startTime;
            const scored = scoreNotes(playedNotes, prog.chords);

            // Compute off-key notes based on slot rules
            let offKeyCount = 0;
            const offKeyNotes = [];
            for (const note of playedNotes) {
                const slot = slotTimes.find(s => note.startTime >= s.start - 0.001 && note.startTime < s.end - 0.001);
                if (slot) {
                    const songKey = prog.chords[0].key !== undefined ? prog.chords[0].key : 60;
                    const validPcs = getActiveScaleAndChordPcs(slot.chordObj, prog.scale || 'major', songKey);
                    const notePc = Math.round(((note.midi % 12 + 12) % 12) * 100) / 100;
                    let matched = false;
                    for (const pc of validPcs) {
                        if (Math.abs(pc - notePc) < 0.05) {
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        offKeyCount++;
                        offKeyNotes.push({ midi: Math.round(note.midi * 10) / 10, time: Math.round(note.startTime * 100) / 100 });
                    }
                }
            }

            results[engine][prog.name] = {
                score: scored.score,
                noteCount: scored.noteCount,
                issues: scored.issues,
                executionTimeMs: parseFloat(elapsed.toFixed(2)),
                playedNoteCount: playedNotes.length,
                offKeyCount,
                offKeyRatio: playedNotes.length > 0 ? parseFloat((offKeyCount / playedNotes.length).toFixed(3)) : 0,
                offKeyNotes
            };

            clearMelodyMemory();
        }
    }

    return results;
}

// ── Test: baseline scores exist and are reasonable ──
describe('Melody Engine Benchmark — Baseline', () => {
    let baseline;

    beforeAll(async () => {
        baseline = await benchmarkAllEngines();
    });

    afterAll(() => {
        console.log("BENCHMARK RESULTS WITH OFF-KEY METRICS:");
        console.log(JSON.stringify(baseline, null, 2));
    });

    test('all engines produce non-zero scores', () => {
        for (const engine of ['progress', 'pro', 'mgen']) {
            for (const prog of TEST_PROGRESSIONS) {
                expect(baseline[engine][prog.name].score).toBeGreaterThan(0);
            }
        }
    });

    test('all engines produce notes', () => {
        for (const engine of ['progress', 'pro', 'mgen']) {
            for (const prog of TEST_PROGRESSIONS) {
                expect(baseline[engine][prog.name].playedNoteCount).toBeGreaterThan(0);
            }
        }
    });

    test('baseline results are captured for comparison', () => {
        expect(Object.keys(baseline)).toEqual(['progress', 'pro', 'mgen']);
    });
});

// ── Export for reuse in other test files ──
export { benchmarkAllEngines, scoreNotes, TEST_PROGRESSIONS };
