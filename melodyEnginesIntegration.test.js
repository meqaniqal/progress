import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { state } from './store.js';
import { pregenerateMgenMelody } from './mgenEngine.js';

describe('Melody Engines Integration Check', () => {
    let mockPlayTone;
    let playedNotes;

    beforeEach(() => {
        playedNotes = [];
        mockPlayTone = (freq, startTime, duration, inst, bus) => {
            playedNotes.push({ freq, startTime, duration, inst, bus });
        };
        clearMelodyMemory();
    });

    const engines = ['progress', 'pro', 'mgen'];
    const chordProgressions = [
        // Standard Major Progression
        [
            { symbol: 'I', duration: 4, key: 60 },
            { symbol: 'IV', duration: 4, key: 65 },
            { symbol: 'V', duration: 4, key: 67 },
            { symbol: 'I', duration: 4, key: 60 }
        ],
        // Jazz turnaround with seventh chords
        [
            { symbol: 'ii7', duration: 2, key: 62 },
            { symbol: 'V7', duration: 2, key: 67 },
            { symbol: 'Imaj7', duration: 4, key: 60 }
        ],
        // Microtonally shifted or edited chords
        [
            { symbol: 'I', duration: 4, key: 60.5 },
            { symbol: 'IV', duration: 4, key: 65.2 },
            { symbol: 'V', duration: 4, key: 67.8 }
        ]
    ];

    engines.forEach(engine => {
        describe(`Engine: ${engine}`, () => {
            beforeEach(() => {
                state.melodySettings = {
                    enabled: true,
                    genre: 'jazz',
                    engine: engine,
                    density: 0.7,
                    restProbability: 0.1,
                    rangeMin: 60,
                    rangeMax: 84,
                    phraseStructure: 'period',
                    allowAsymmetry: false
                };
                state.divisions = 12;
            });

            chordProgressions.forEach((prog, progIdx) => {
                test(`should generate melody without crashing for progression ${progIdx}`, async () => {
                    const totalChords = prog.length;
                    let currentTime = 0;

                    state.currentProgression = prog;
                    state.temporarySwaps = {};

                    if (engine === 'mgen') {
                        await pregenerateMgenMelody(state);
                    }

                    for (let i = 0; i < totalChords; i++) {
                        const chordObj = prog[i];
                        const nextChordObj = i < totalChords - 1 ? prog[i + 1] : null;
                        const prevChordObj = i > 0 ? prog[i - 1] : null;
                        const chordNotes = [chordObj.key, chordObj.key + 4, chordObj.key + 7];

                        state.currentProgression = prog;
                        state.temporarySwaps = {};

                        await scheduleMelody(
                            currentTime,
                            chordObj,
                            nextChordObj,
                            prevChordObj,
                            chordObj.duration,
                            chordObj.duration,
                            120,
                            i,
                            totalChords,
                            chordNotes,
                            mockPlayTone
                        );

                        currentTime += chordObj.duration;
                    }

                    // There should be played tones registered in the mock player
                    expect(playedNotes.length).toBeGreaterThan(0);
                });
            });
        });
    });
});
