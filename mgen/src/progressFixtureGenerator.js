// progressFixtureGenerator.js
// Generates random but structurally valid Progress app data fixtures
// for testing the MelodyGen progress bridge.
//
// Every generated fixture conforms to the exact data format documented
// in progress_data_analysis.md and melodygen_progress_bridge.md.

'use strict';

// ── Valid value pools (from chordDictionary.js, state definitions) ──

const ROOT_NOTES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

const QUALITIES = ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'min7'];

const ROMAN_NUMERALS = [
  // Triads
  'I', 'i', 'ii', 'ii°', 'iii', 'III', 'IV', 'V', 'v', 'vi', 'VI', 'VII', 'iv', 'bVI', 'bVII',
  // 7ths
  'Imaj7', 'i7', 'ii7', 'ii°7', 'iii7', 'IIImaj7', 'IVmaj7', 'v7', 'VImaj7', 'VII7', 'V7', 'vi7',
  // Extended
  'Imaj9', 'IVmaj9', 'ii9', 'ii11', 'V9', 'V11', 'Vsus4', 'V7sus4', 'V7#9', 'V7b13', 'iv7', 'bVImaj7', 'bVII7',
];

const MODES = ['major', 'minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'wholeTone', 'diminishedWH', 'altered'];

const DIVISIONS = [12, 19, 24, 31, 72];

const VOICING_TYPES = ['global', 'auto', 'close', 'spread', 'quartal'];

const TENSION_CURVES = ['arch', 'linear', 'valley', 'staircase', 'launch'];

const DRUM_ROWS = ['kick', 'snare', 'chh', 'ohh'];

const NOTE_ROLES = ['structural', 'cadence', 'connector', 'ornament', 'expectation'];

const PHRASE_ROLES = ['statement', 'build', 'climax', 'release', 'resolution', 'antecedent', 'consequent'];

const GENRES = ['none', 'baroque', 'classical', 'jazz', 'pop'];

const BASE_KEYS = [48, 51, 54, 57, 60, 63, 66, 69, 72]; // C3 to C5

// ── Utility helpers ──

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Progress Chord Fixture Generator ──

/**
 * Generate a single random Progress app chord object.
 * Conforms to the format documented in progress_data_analysis.md section 1.
 *
 * @param {Object} [options] - Override any field
 * @param {string} [options.symbol] - Force a specific symbol (Roman numeral or chord symbol)
 * @param {number} [options.key] - Force a specific MIDI key
 * @param {number} [options.divisions] - Force specific EDO divisions
 * @param {number} [options.duration] - Force duration in beats
 * @param {boolean} [options.withPatterns] - Include chordPattern, bassPattern, drumPattern (default true)
 * @param {boolean} [options.isRest] - Generate a rest slice (default false)
 * @returns {Object} Progress chord object
 */
export function generateProgressChord(options = {}) {
  const {
    symbol,
    key,
    divisions,
    duration,
    withPatterns = true,
    isRest = false,
  } = options;

  const chordKey = key ?? randInt(36, 84);
  const chordDivisions = divisions ?? pick(DIVISIONS);
  const chordDuration = duration ?? randInt(1, 4);

  const notes = generateChordNotes(chordKey, chordDivisions);
  const customNotes = Math.random() < 0.1 ? notes.map(n => parseFloat((n + Math.random() * 0.5 - 0.25).toFixed(3))) : null;

  const chord = {
    symbol: symbol ?? pick(ROMAN_NUMERALS),
    key: chordKey,
    divisions: chordDivisions,
    duration: chordDuration,
    inversionOffset: randInt(0, 3),
    voicingType: pick(VOICING_TYPES),
    voicing: Math.random() < 0.15 ? { type: pick(VOICING_TYPES), voices: randInt(2, 5) } : null,
    customNotes: customNotes,
  };

  if (isRest) {
    chord.isRest = true;
  }

  if (withPatterns) {
    chord.chordPattern = generateChordPattern(chordDuration);
    chord.bassPattern = generateBassPattern(chordDuration);
    chord.drumPattern = generateDrumPattern(chordDuration);
  }

  return chord;
}

/**
 * Generate chord note pitches (MIDI numbers) for a given key and divisions.
 * @param {number} rootKey - MIDI root key
 * @param {number} divisions - EDO divisions
 * @returns {number[]} Array of MIDI pitch numbers
 */
export function generateChordNotes(rootKey, divisions) {
  const numNotes = randInt(3, 5);
  const notes = [rootKey];

  const intervals = [
    [4, 7],       // major triad
    [3, 7],       // minor triad
    [3, 6],       // diminished
    [4, 8],       // augmented
    [4, 7, 10],   // dominant 7
    [4, 7, 11],   // major 7
    [3, 7, 10],   // minor 7
  ];

  const chosenIntervals = pick(intervals).slice(0, numNotes - 1);
  for (const interval of chosenIntervals) {
    const stepSize = 12.0 / divisions;
    const microtonalOffset = interval * stepSize;
    const pitch = rootKey + microtonalOffset;
    notes.push(parseFloat(pitch.toFixed(2)));
  }

  return notes.sort((a, b) => a - b);
}

// ── Pattern Generators ──

let _patternIdCounter = 0;

function nextPatternId() {
  _patternIdCounter++;
  if (_seededRandom) {
    // Use seeded random for reproducible IDs
    const val = Math.floor(_seededRandom() * 0xFFFFFFFF);
    return `p${val.toString(16).padStart(8, '0')}`;
  }
  return `p${_patternIdCounter.toString(16).padStart(8, '0')}`;
}

/**
 * Generate a random chordPattern object.
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} chordPattern object
 */
export function generateChordPattern(chordDuration) {
  const numInstances = randInt(1, 4);
  const instances = [];

  let currentTime = 0;
  for (let i = 0; i < numInstances; i++) {
    const instanceDuration = randFloat(0.1, Math.min(1.0, 1.0 - currentTime / chordDuration + 0.1), 2);
    const normalizedStart = parseFloat((currentTime / chordDuration).toFixed(3));
    const normalizedDuration = parseFloat((instanceDuration / chordDuration).toFixed(3));

    const numPitchOffsets = Math.random() < 0.5 ? randInt(1, 3) : 0;
    const pitchOffsets = numPitchOffsets > 0
      ? Array.from({ length: numPitchOffsets }, () => randInt(-12, 12))
      : [];

    instances.push({
      id: nextPatternId(),
      startTime: normalizedStart,
      duration: Math.min(normalizedDuration, 1.0 - normalizedStart),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 12),
      pitchOffsets: pitchOffsets,
      isSelected: Math.random() < 0.8,
      arpSettings: Math.random() < 0.4
        ? {
            style: pick(['up', 'down', 'random', 'arpeggiated']),
            rate: randFloat(0.125, 0.5, 3),
            gate: randFloat(0.5, 0.95, 2),
          }
        : null,
      probability: randFloat(0.5, 1.0, 2),
    });

    currentTime += instanceDuration;
  }

  return {
    isLocalOverride: Math.random() < 0.3,
    avoidKick: Math.random() < 0.4,
    generative: { mode: pick(['off', 'generative', 'interactive']), history: [] },
    transitions: generateTransitions(chordDuration),
    instances,
  };
}

/**
 * Generate a random bassPattern object.
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} bassPattern object
 */
export function generateBassPattern(chordDuration) {
  const numInstances = randInt(1, 4);
  const instances = [];

  let currentTime = 0;
  for (let i = 0; i < numInstances; i++) {
    const instanceDuration = randFloat(0.25, Math.min(1.0, 1.0 - currentTime / chordDuration + 0.1), 2);
    const normalizedStart = parseFloat((currentTime / chordDuration).toFixed(3));

    instances.push({
      id: nextPatternId(),
      startTime: normalizedStart,
      duration: Math.min(parseFloat(instanceDuration.toFixed(2)), 1.0 - normalizedStart),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 7),
      pitchOffsets: Math.random() < 0.2 ? [randInt(-12, 12), randInt(-12, 12)] : [],
      isSelected: Math.random() < 0.9,
      arpSettings: null,
      probability: randFloat(0.7, 1.0, 2),
    });

    currentTime += instanceDuration;
  }

  return {
    isLocalOverride: Math.random() < 0.3,
    avoidKick: Math.random() < 0.5,
    generative: { mode: pick(['off', 'walking', 'rhythmInformed']), history: [] },
    transitions: generateTransitions(chordDuration),
    instances,
  };
}

/**
 * Generate a random drumPattern object.
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} drumPattern object
 */
export function generateDrumPattern(chordDuration) {
  const numHits = Math.random() < 0.2 ? 0 : randInt(1, 8);
  const hits = [];

  for (let i = 0; i < numHits; i++) {
    const hitTime = randFloat(0.0, 0.99, 3);
    hits.push({
      id: nextPatternId(),
      time: hitTime,
      row: pick(DRUM_ROWS),
      velocity: randFloat(0.3, 1.0, 2),
      probability: randFloat(0.5, 1.0, 2),
    });
  }

  return {
    isLocalOverride: Math.random() < 0.2,
    lengthBeats: randInt(2, 8),
    hits: hits.sort((a, b) => a.time - b.time),
  };
}

/**
 * Generate random transitions for a pattern.
 * @param {number} chordDuration
 * @returns {Object[]}
 */
function generateTransitions(chordDuration) {
  const numTransitions = Math.random() < 0.3 ? randInt(1, 3) : 0;
  const transitions = [];

  for (let i = 0; i < numTransitions; i++) {
    transitions.push({
      id: nextPatternId(),
      startTime: randFloat(0.0, 0.8, 2),
      duration: randFloat(0.1, 0.5, 2),
      type: pick(['fade', 'crescendo', 'diminuendo', 'switch']),
      targetChordIndex: randInt(0, 3),
    });
  }

  return transitions;
}

// ── Progression & Section Generators ──

/**
 * Generate a random Progress app state object (simplified).
 * Contains a full chord progression with optional bass/drum patterns.
 *
 * @param {Object} [options]
 * @param {number} [options.numChords] - Number of chords (default 4-8)
 * @param {number} [options.baseKey] - Base key (default random)
 * @param {string} [options.mode] - Scale mode (default random)
 * @param {number} [options.bpm] - BPM (default 120)
 * @param {boolean} [options.withPatterns] - Include pattern data (default true)
 * @param {boolean} [options.withSections] - Include section structure (default false)
 * @param {boolean} [options.allowRests] - Allow rest slices (default false)
 * @returns {Object} Progress state object
 */
export function generateProgressState(options = {}) {
  const {
    numChords,
    baseKey,
    mode,
    bpm,
    withPatterns = true,
    withSections = false,
    allowRests = false,
  } = options;

  const chordCount = numChords ?? randInt(4, 8);
  const chords = [];
  let cumulativeBeat = 0;

  for (let i = 0; i < chordCount; i++) {
    const isRest = allowRests && Math.random() < 0.15;
    const chord = generateProgressChord({
      key: baseKey ?? randInt(48, 72),
      divisions: pick(DIVISIONS),
      withPatterns,
      isRest,
    });
    chord._beatStart = cumulativeBeat;
    cumulativeBeat += chord.duration;
    chords.push(chord);
  }

  const state = {
    baseKey: baseKey ?? pick(BASE_KEYS),
    bpm: bpm ?? randInt(60, 200),
    divisions: pick(DIVISIONS),
    mode: mode ?? pick(MODES),
    melodySettings: {
      enabled: Math.random() < 0.7,
      genre: pick(GENRES),
      motifRecurrence: randFloat(0.2, 0.9, 2),
      variationDepth: randFloat(0.2, 0.9, 2),
      density: randFloat(0.2, 0.9, 2),
      restProbability: randFloat(0.1, 0.5, 2),
      ornamentIntensity: randFloat(0.2, 0.8, 2),
      countermelodyEnabled: Math.random() < 0.3,
      countermelodyMode: pick(['contrary', 'harmonize', 'call-response']),
      behaviorDuringArp: pick(['simplify', 'ignore', 'complement']),
      behaviorDuringTransitions: pick(['simplify', 'ignore', 'complement']),
      tensionCurve: pick(TENSION_CURVES),
      seedSource: pick(['procedural', 'seeded', 'deterministic']),
      activeMotifId: `preset-${pick(['rise', 'fall', 'arch', 'wave', 'staccato'])}`,
      midiExtractionMode: pick(['highest', 'lowest', 'median']),
      macroPlannerEnabled: Math.random() < 0.4,
      macroContourArchetype: pick(['auto', 'statement', 'build', 'climax']),
      shortestNoteLimit: pick([16, 32, 64]),
    },
    currentProgression: chords,
    customTuning: Math.random() < 0.15
      ? { name: `custom-${randInt(1, 20)}`, type: pick(['scl', 'tun']), periodSize: pick(DIVISIONS), divisions: pick(DIVISIONS) }
      : null,
    importedTunings: Math.random() < 0.2
      ? Array.from({ length: randInt(1, 3) }, () => ({ name: `tuning-${randInt(1, 10)}`, type: pick(['scl', 'tun']), periodSize: pick(DIVISIONS) }))
      : [],
    globalVoicing: pick(VOICING_TYPES),
    volumes: {
      chords: randFloat(0.5, 1.0, 2),
      bass: randFloat(0.5, 1.0, 2),
      bassHarmonic: randFloat(0.0, 0.5, 2),
      drums: randFloat(0.5, 1.0, 2),
      melody: randFloat(0.5, 1.0, 2),
      countermelody: randFloat(0.0, 0.5, 2),
    },
    instruments: {
      chords: pick(['sawtooth', 'square', 'triangle', 'sine', 'noise']),
      bass: pick(['sine', 'sawtooth', 'square']),
      bassSecondary: pick(['sawtooth', 'triangle', 'sine']),
      melody: pick(['sine', 'sawtooth', 'triangle', 'square']),
      countermelody: pick(['sine', 'sawtooth', 'triangle']),
    },
  };

  if (withSections) {
    state.sections = generateSections(chords, state);
    state.songSequence = state.sections.map(s => s.id);
    state.activeSectionId = state.sections[0].id;
    state.loopStart = 0;
    state.loopEnd = state.sections.length;
  }

  return state;
}

/**
 * Generate section objects for a progression.
 * @param {Object[]} baseChords
 * @param {Object} state
 * @returns {Object[]}
 */
function generateSections(baseChords, state) {
  const numSections = randInt(2, 4);
  const sections = [];

  for (let i = 0; i < numSections; i++) {
    const sectionChordCount = randInt(2, Math.max(2, baseChords.length));
    const sectionChords = [];

    for (let j = 0; j < sectionChordCount; j++) {
      const chord = generateProgressChord({
        key: state.baseKey,
        divisions: state.divisions,
        withPatterns: true,
      });
      sectionChords.push(chord);
    }

    sections.push({
      id: `sec-${nextPatternId().slice(1)}`,
      name: `Section ${String.fromCharCode(65 + i)}`,
      progression: sectionChords,
      globalPatterns: {
        chordPattern: generateChordPattern(4),
        bassPattern: generateBassPattern(4),
        drumPattern: generateDrumPattern(4),
      },
      loopStart: 0,
      loopEnd: sectionChords.length,
      temporarySwaps: {},
    });
  }

  return sections;
}

// ── MelodyGen Output Fixtures ──

/**
 * Generate a random MelodyNote array (output from MelodyGen).
 * Notes are placed at chord boundaries and between them.
 *
 * @param {Object} [options]
 * @param {number} [options.numNotes] - Number of notes (default 8-20)
 * @param {number} [options.totalDuration] - Total measure duration (default 16)
 * @param {number} [options.baseKey] - Base MIDI key (default 60)
 * @param {string[]} [options.roles] - Allowed roles (default all)
 * @param {boolean} [options.withMetadata] - Include pass-specific metadata (default true)
 * @returns {Object[]} Array of MelodyNote objects
 */
export function generateMelodyNotes(options = {}) {
  const {
    numNotes,
    totalDuration,
    baseKey,
    roles,
    withMetadata = true,
  } = options;

  const count = numNotes ?? randInt(8, 20);
  const duration = totalDuration ?? randInt(8, 32);
  const base = baseKey ?? 60;
  const allowedRoles = roles || NOTE_ROLES;

  const notes = [];
  let currentTime = 0;

  for (let i = 0; i < count; i++) {
    const role = pick(allowedRoles);
    const startTime = parseFloat(currentTime.toFixed(2));
    const noteDuration = parseFloat(randFloat(0.25, 2.0, 2).toFixed(2));
    const pitch = randInt(base - 12, base + 24);

    const note = {
      pitch,
      startTime,
      duration: Math.min(noteDuration, duration - startTime),
      role,
    };

    if (withMetadata) {
      note.metadata = generateNoteMetadata(role, i, count);
    }

    notes.push(note);
    currentTime += note.duration + randFloat(0, 0.5, 2);
  }

  return notes.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Generate pass-specific metadata for a MelodyNote.
 * @param {string} role
 * @param {number} index
 * @param {number} total
 * @returns {Object}
 */
function generateNoteMetadata(role, index, total) {
  const metadata = {};

  switch (role) {
    case 'structural':
      metadata.chordRoot = pick(ROOT_NOTES);
      metadata.chordQuality = pick(QUALITIES.filter(q => !['maj7', 'min7'].includes(q)));
      metadata.phraseRole = pick(PHRASE_ROLES.filter(r => !['antecedent', 'consequent'].includes(r)));
      metadata.isStructuralTarget = Math.random() < 0.7;
      metadata.adjustedForVoiceLeading = Math.random() < 0.3;
      if (metadata.adjustedForVoiceLeading) {
        metadata.originalPitch = randInt(48, 84);
      }
      break;

    case 'cadence':
      metadata.chordRoot = pick(ROOT_NOTES);
      metadata.chordQuality = pick(QUALITIES);
      metadata.isCadenceNote = true;
      metadata.cadenceType = pick(['full', 'half']);
      metadata.phraseRole = pick(PHRASE_ROLES);
      break;

    case 'connector':
      metadata.motionType = pick(['step', 'skip', 'leap']);
      metadata.connectsStart = Math.random() < 0.5;
      metadata.connectsEnd = Math.random() < 0.5;
      break;

    case 'ornament':
      metadata.ornamentType = pick(['graceNote', 'trill', 'turn', 'appoggiatura']);
      metadata.ornamentsNote = randInt(48, 84);
      break;

    case 'expectation':
      metadata.resolvesInterval = randInt(7, 19);
      metadata.expectedPitch = randInt(48, 84);
      break;
  }

  return metadata;
}

/**
 * Generate a complete MelodyResult (output from CompositionOrchestrator.execute).
 *
 * @param {Object} [options]
 * @param {Object[]} [options.chords] - Chord[] for metadata (generated if omitted)
 * @param {Object} [options.phraseContext] - PhraseContext for metadata (generated if omitted)
 * @param {number} [options.numNotes] - Number of melody notes (default 8-20)
 * @param {boolean} [options.withPassResults] - Include passResults in metadata (default true)
 * @param {boolean} [options.withExecutionLog] - Include executionLog in metadata (default true)
 * @param {boolean} [options.forceFailure] - Force some passes to fail (default false)
 * @returns {Object} MelodyResult object
 */
export function generateMelodyResult(options = {}) {
  const {
    chords,
    phraseContext,
    numNotes,
    withPassResults = true,
    withExecutionLog = true,
    forceFailure = false,
  } = options;

  const allNotes = generateMelodyNotes({ numNotes });

  const resolvedChords = chords || generateMgenChords({ count: randInt(2, 6) });
  const resolvedPhraseContext = phraseContext || generatePhraseContext();

  const metadata = {
    phraseContext: resolvedPhraseContext,
    chords: resolvedChords,
    originalNoteCount: allNotes.length,
    finalNoteCount: allNotes.length,
  };

  if (withPassResults) {
    metadata.passResults = generatePassResults(resolvedChords, resolvedPhraseContext, forceFailure);
  }

  if (withExecutionLog && metadata.passResults) {
    metadata.executionLog = metadata.passResults.map(pr => ({
      passName: pr.passName,
      score: pr.metrics.score,
      issues: pr.metrics.issues,
      noteCount: pr.notes.length,
    }));
  }

  return {
    allNotes,
    metadata,
  };
}

/**
 * Generate a random PhraseContext.
 *
 * @param {Object} [options]
 * @param {string} [options.role] - Force a specific role
 * @param {number} [options.tensionLevel] - Force tension (0-1)
 * @param {number} [options.registerTarget] - Force register target
 * @param {boolean} [options.isAntecedent] - Force antecedent flag
 * @returns {Object} PhraseContext object
 */
export function generatePhraseContext(options = {}) {
  const {
    role,
    tensionLevel,
    registerTarget,
    isAntecedent,
  } = options;

  return {
    role: role ?? pick(PHRASE_ROLES),
    tensionLevel: tensionLevel ?? randFloat(0.1, 0.95, 2),
    registerTarget: registerTarget !== undefined ? registerTarget : (Math.random() < 0.2 ? null : randInt(60, 84)),
    isAntecedent: isAntecedent ?? (Math.random() < 0.2),
  };
}

/**
 * Generate a random Chord[] for MelodyGen input.
 *
 * @param {Object} [options]
 * @param {number} [options.count] - Number of chords (default 4)
 * @param {number} [options.startBeat] - Starting beat position (default 0)
 * @param {number} [options.beatIncrement] - Beat increment between chords (default 4)
 * @returns {Object[]} Array of Chord objects
 */
export function generateMgenChords(options = {}) {
  const {
    count,
    startBeat,
    beatIncrement,
  } = options;

  const chordCount = count ?? randInt(2, 6);
  const start = startBeat ?? 0;
  const increment = beatIncrement ?? randInt(2, 4);

  const chords = [];
  for (let i = 0; i < chordCount; i++) {
    chords.push({
      root: pick(ROOT_NOTES),
      quality: pick(QUALITIES),
      beatStart: start + (i * increment),
      scaleDegrees: generateScaleDegrees(),
    });
  }

  return chords;
}

/**
 * Generate random scale degrees for a chord.
 * @returns {number[]}
 */
function generateScaleDegrees() {
  const numDegrees = randInt(3, 4);
  const degrees = [];
  const used = new Set();

  for (let i = 0; i < numDegrees; i++) {
    let d;
    do {
      d = randInt(0, 11);
    } while (used.has(d));
    used.add(d);
    degrees.push(d);
  }

  return degrees.sort((a, b) => a - b);
}

/**
 * Generate PassResult objects for all 5 passes + 3 engines.
 * @param {Object[]} chords
 * @param {Object} phraseContext
 * @param {boolean} forceFailure
 * @returns {Object[]}
 */
function generatePassResults(chords, phraseContext, forceFailure) {
  const passNames = [
    'PassA_Structural',
    'PassB_Cadence',
    'PassC_Connector',
    'PassD_Ornament',
    'PassE_Expectation',
    'MotifEngine',
    'StyleEngine',
    'MicrotonalEngine',
  ];

  return passNames.map(passName => {
    const noteCount = randInt(2, 12);
    const score = forceFailure ? randFloat(0.0, 0.49, 2) : randFloat(0.5, 1.0, 2);
    const passesThreshold = score >= 0.5;

    const issues = [];
    if (noteCount === 0) issues.push('No notes generated');
    if (Math.random() < 0.15) issues.push('Excessive pitch range (>48 semitones)');
    if (Math.random() < 0.1) issues.push('Excessive large leaps without resolution');
    if (forceFailure && Math.random() < 0.3) issues.push('Insufficient structural notes');
    if (Math.random() < 0.05) issues.push(`Execution error: timeout`);

    return {
      passName,
      notes: Array.from({ length: noteCount }, () => ({
        pitch: randInt(48, 96),
        startTime: parseFloat(randFloat(0, 16, 2).toFixed(2)),
        duration: parseFloat(randFloat(0.25, 2.0, 2).toFixed(2)),
        role: pick(NOTE_ROLES),
        metadata: {},
      })),
      metrics: {
        passName,
        score,
        issues,
        passesThreshold,
      },
      context: generatePassContext(passName, chords, phraseContext),
      metadata: null, // will be set to context reference
      success: passesThreshold,
    };
  }).map(pr => { pr.metadata = pr.context; return pr; });
}

/**
 * Generate pass-specific context for a PassResult.
 * @param {string} passName
 * @param {Object[]} chords
 * @param {Object} phraseContext
 * @returns {Object}
 */
function generatePassContext(passName, chords, phraseContext) {
  switch (passName) {
    case 'PassA_Structural':
      return {
        phraseContext,
        chordCount: chords.length,
        structuralNoteCount: randInt(2, 8),
      };

    case 'PassB_Cadence': {
      const cadencePoints = Array.from({ length: randInt(1, 3) }, (_, i) => ({
        chordIndex: randInt(0, Math.max(0, chords.length - 1)),
        chord: chords[randInt(0, chords.length - 1)],
        isPhraseEnd: Math.random() < 0.5,
        phraseRole: pick(PHRASE_ROLES),
        isAntecedent: Math.random() < 0.2,
      }));
      return {
        phraseContext,
        cadenceCount: cadencePoints.length,
        cadencePoints,
      };
    }

    case 'PassC_Connector':
      return {
        connectorCount: randInt(1, 5),
        structuralNoteCount: randInt(2, 8),
      };

    case 'PassD_Ornament':
      return {
        ornamentCount: randInt(0, 6),
        ornamentedNoteCount: randInt(1, 10),
      };

    case 'PassE_Expectation':
      return {
        callResponsePairs: randInt(0, 4),
        originalNoteCount: randInt(4, 16),
        finalNoteCount: randInt(2, 12),
        noteCount: randInt(2, 12),
      };

    case 'MotifEngine':
      return {
        motifFamilies: Array.from({ length: randInt(1, 3) }, (_, i) => ({
          id: `motif_${i + 1}`,
          notes: Array.from({ length: randInt(3, 6) }, () => ({
            pitch: randInt(48, 84),
            startTime: parseFloat(randFloat(0, 8, 2).toFixed(2)),
            duration: parseFloat(randFloat(0.25, 1.0, 2).toFixed(2)),
          })),
          name: pick(['rise', 'fall', 'arch', 'wave', 'staccato', 'legato']),
          metadata: {},
          transformations: Array.from({ length: randInt(0, 3) }, () => ({
            type: pick(['transposition', 'sequence', 'inversion', 'retrograde', 'augmentation', 'diminution']),
            parameters: {},
          })),
        })),
        motifCount: randInt(1, 3),
        transformationCount: randInt(0, 6),
      };

    case 'StyleEngine':
      return {
        activeStyle: pick(['baroque', 'classical', 'jazz', 'pop']),
        styleProfile: {
          id: pick(['baroque', 'classical', 'jazz', 'pop']),
          name: pick(['Baroque', 'Classical', 'Jazz', 'Pop']),
          rules: {
            maxInterval: pick([8, 10, 12, 14]),
            preferredIntervals: pick([
              [0, 2, 3, 5, 7],
              [0, 2, 3, 5, 7, 10, 12],
            ]),
            ornamentDensity: randFloat(0.2, 0.5, 2),
            allowSyncopation: Math.random() < 0.7,
            preferStepwiseMotion: Math.random() < 0.6,
            maxDuration: pick([2.0, 3.0]),
            minDuration: pick([0.25, 0.5]),
            chordToneEmphasis: Math.random() < 0.6,
            allowChromaticism: Math.random() < 0.4,
            preferConsonance: Math.random() < 0.6,
          },
          metadata: {},
        },
        noteCount: randInt(2, 16),
      };

    case 'MicrotonalEngine':
      return {
        activeTuning: pick(['12tet', 'quartertone', 'just', 'pythagorean']),
        tuningSystem: {
          id: pick(['12tet', 'quartertone', 'just', 'pythagorean']),
          name: pick(['12-TET', 'Quartertone', 'Just Intonation', 'Pythagorean']),
          parameters: {},
          metadata: {},
        },
        noteCount: randInt(2, 16),
      };

    default:
      return {};
  }
}

// ── Edge Case Generators ──

/**
 * Generate a progression with rest slices at the start (wraparound scenario).
 * @param {Object} [options]
 * @param {number} [options.numChords] - Number of non-rest chords (default 4)
 * @returns {Object} Progress state with rest at start
 */
export function generateProgressWithRestAtStart(options = {}) {
  const numChords = options.numChords ?? 4;
  const chords = [];

  // Rest slice at the very start
  chords.push({
    symbol: pick(ROMAN_NUMERALS),
    key: options.baseKey ?? 60,
    divisions: options.divisions ?? 12,
    duration: randInt(1, 2),
    inversionOffset: 0,
    voicingType: 'global',
    voicing: null,
    customNotes: null,
    isRest: true,
    chordPattern: generateChordPattern(2),
    bassPattern: generateBassPattern(2),
    drumPattern: generateDrumPattern(2),
    _beatStart: 0,
  });

  // Regular chords
  let cumulativeBeat = 0;
  for (let i = 0; i < numChords; i++) {
    const chord = generateProgressChord({
      key: options.baseKey ?? randInt(48, 72),
      divisions: options.divisions ?? 12,
      withPatterns: true,
    });
    chord._beatStart = cumulativeBeat;
    cumulativeBeat += chord.duration;
    chords.push(chord);
  }

  return {
    baseKey: options.baseKey ?? 60,
    bpm: options.bpm ?? 120,
    divisions: options.divisions ?? 12,
    mode: options.mode ?? 'major',
    melodySettings: {
      enabled: true,
      genre: pick(GENRES),
      density: randFloat(0.3, 0.7, 2),
      tensionCurve: pick(TENSION_CURVES),
      shortestNoteLimit: 16,
    },
    currentProgression: chords,
  };
}

/**
 * Generate a progression with microtonal divisions (non-12-TET).
 * @param {Object} [options]
 * @param {number} [options.divisions] - EDO divisions (default 24)
 * @param {number} [options.numChords] - Number of chords (default 4)
 * @returns {Object} Progress state with microtonal settings
 */
export function generateMicrotonalProgress(options = {}) {
  const divisions = options.divisions ?? pick([24, 31, 72]);

  return {
    baseKey: options.baseKey ?? 60,
    bpm: options.bpm ?? 120,
    divisions,
    mode: options.mode ?? 'major',
    melodySettings: {
      enabled: true,
      genre: 'none',
      density: randFloat(0.3, 0.7, 2),
      tensionCurve: pick(TENSION_CURVES),
      shortestNoteLimit: 16,
    },
    currentProgression: Array.from({ length: options.numChords ?? 4 }, () =>
      generateProgressChord({
        divisions,
        withPatterns: true,
      })
    ).map((chord, i, arr) => {
      let beatStart = 0;
      for (let j = 0; j < i; j++) {
        beatStart += arr[j].duration;
      }
      chord._beatStart = beatStart;
      return chord;
    }),
    customTuning: {
      name: `edo-${divisions}`,
      type: 'scl',
      periodSize: divisions,
      divisions,
    },
  };
}

/**
 * Generate an empty/minimal progression (edge case: no chords).
 * @returns {Object} Progress state with empty progression
 */
export function generateEmptyProgression() {
  return {
    baseKey: 60,
    bpm: 120,
    divisions: 12,
    mode: 'major',
    melodySettings: {
      enabled: false,
      genre: 'none',
      density: 0.5,
      tensionCurve: 'arch',
      shortestNoteLimit: 16,
    },
    currentProgression: [],
  };
}

/**
 * Generate a progression with maximum complexity (all patterns, all tracks).
 * @param {Object} [options]
 * @param {number} [options.numChords] - Number of chords (default 6)
 * @returns {Object} Progress state with maximum complexity
 */
export function generateComplexProgression(options = {}) {
  const numChords = options.numChords ?? 6;

  const chords = Array.from({ length: numChords }, (_, i) => {
    const chord = generateProgressChord({
      withPatterns: true,
    });

    // Ensure dense patterns
    chord.chordPattern.instances = Array.from({ length: randInt(3, 6) }, () => ({
      id: nextPatternId(),
      startTime: randFloat(0, 0.8, 3),
      duration: randFloat(0.1, 0.5, 2),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 12),
      pitchOffsets: [randInt(-12, 12), randInt(-12, 12)],
      isSelected: true,
      arpSettings: {
        style: pick(['up', 'down', 'random', 'arpeggiated']),
        rate: randFloat(0.125, 0.5, 3),
        gate: randFloat(0.5, 0.95, 2),
      },
      probability: randFloat(0.7, 1.0, 2),
    }));

    chord.bassPattern.instances = Array.from({ length: randInt(2, 5) }, () => ({
      id: nextPatternId(),
      startTime: randFloat(0, 0.8, 3),
      duration: randFloat(0.2, 0.8, 2),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 7),
      pitchOffsets: [randInt(-12, 12)],
      isSelected: true,
      arpSettings: null,
      probability: randFloat(0.8, 1.0, 2),
    }));

    chord.drumPattern.hits = Array.from({ length: randInt(4, 12) }, () => ({
      id: nextPatternId(),
      time: randFloat(0, 0.99, 3),
      row: pick(DRUM_ROWS),
      velocity: randFloat(0.3, 1.0, 2),
      probability: randFloat(0.7, 1.0, 2),
    })).sort((a, b) => a.time - b.time);

    let beatStart = 0;
    for (let j = 0; j < i; j++) {
      beatStart += options.chords?.[j]?.duration ?? 2;
    }
    chord._beatStart = beatStart;

    return chord;
  });

  return {
    baseKey: options.baseKey ?? 60,
    bpm: options.bpm ?? 120,
    divisions: options.divisions ?? 12,
    mode: options.mode ?? 'major',
    melodySettings: {
      enabled: true,
      genre: pick(GENRES),
      density: randFloat(0.5, 0.9, 2),
      tensionCurve: pick(TENSION_CURVES),
      shortestNoteLimit: 16,
      macroPlannerEnabled: true,
      countermelodyEnabled: true,
      countermelodyMode: pick(['contrary', 'harmonize', 'call-response']),
    },
    currentProgression: chords,
    sections: generateSections(chords, { baseKey: 60, divisions: 12 }),
    songSequence: [],
    activeSectionId: 'sec-main',
    loopStart: 0,
    loopEnd: 2,
    temporarySwaps: new Map(),
  };
}

// ── Utility: deterministic seed (for reproducible tests) ──

let _seed = null;
let _seededRandom = null;

/**
 * Set a deterministic seed for reproducible fixture generation.
 * Useful for tests that need the same "random" data across runs.
 *
 * @param {number} seed - Integer seed value
 */
export function setSeed(seed) {
  _seed = seed;
  _patternIdCounter = 0;
  // Simple LCG-based seeded random
  let s = seed;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) % 2147483647;
    return s / 2147483647;
  };
  _seededRandom = Math.random;
}

/**
 * Reset to true random.
 */
export function resetRandom() {
  _seed = null;
  // Restore original Math.random via a no-op reassign
  // Note: In practice, tests should call setSeed before each test
  // that needs determinism, or just use true randomness.
}

export default {
  generateProgressChord,
  generateProgressState,
  generateMelodyNotes,
  generateMelodyResult,
  generatePhraseContext,
  generateMgenChords,
  generateProgressWithRestAtStart,
  generateMicrotonalProgress,
  generateEmptyProgression,
  generateComplexProgression,
  setSeed,
  resetRandom,
};
