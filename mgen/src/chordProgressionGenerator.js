// chordProgressionGenerator.js
// Generates random but structurally valid chord progressions for the
// MelodyGen pipeline. Produces Chord[] arrays compatible with
// CompositionOrchestrator, with optional bass and drum track data.
//
// This module is independent of the web UI and can be tested with Jest.

import { Chord, PhraseContext, GenerationConfig } from './interfaces.js';
import { preprocessProgressData } from './progressBridge.js';

// ── Valid value pools ──

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const QUALITIES = ['maj', 'min', 'dim', 'aug', '7', 'maj7'];

const PHRASE_ROLES = ['statement', 'build', 'climax', 'release', 'resolution'];

const TUNING_SYSTEMS = ['12tet', 'quartertone', 'just', 'pythagorean'];

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

// ── Scale degree calculation (mirrors app.js getScaleDegrees) ──

function getScaleDegrees(root, quality) {
  const rootIndex = ROOT_NOTES.indexOf(root);
  const degrees = [rootIndex];
  if (quality === 'maj' || quality === '7' || quality === 'maj7') {
    degrees.push((rootIndex + 4) % 12);
    degrees.push((rootIndex + 7) % 12);
  } else if (quality === 'min') {
    degrees.push((rootIndex + 3) % 12);
    degrees.push((rootIndex + 7) % 12);
  } else if (quality === 'dim') {
    degrees.push((rootIndex + 3) % 12);
    degrees.push((rootIndex + 6) % 12);
  } else if (quality === 'aug') {
    degrees.push((rootIndex + 4) % 12);
    degrees.push((rootIndex + 8) % 12);
  }
  return degrees;
}

// ── Key signature / scale mapping ──

// Diatonic scale degrees for each key (major)
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]; // C major: C D E F G A B

// Diatonic scale degrees for each key (natural minor)
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // C minor: C D Eb F G Ab Bb

/**
 * Determine the key signature (set of valid pitch classes) from the first chord.
 * Uses major key signature by default, falling back to minor if the chord is minor.
 * @param {string} root - Chord root (e.g., 'C', 'G', 'F#')
 * @param {string} quality - Chord quality (e.g., 'maj', 'min')
 * @returns {number[]} Array of valid pitch classes (0-11)
 */
function _getKeySignature(root, quality) {
  const rootIndex = ROOT_NOTES.indexOf(root);
  const scale = quality === 'min' || quality === 'dim' || quality === 'min7' ? NATURAL_MINOR_SCALE : MAJOR_SCALE;
  return scale.map(degree => (rootIndex + degree) % 12);
}

/**
 * Constrain a chord root to fit within a key signature.
 * If the root is already in the key, return it unchanged.
 * Otherwise, find the closest pitch class that IS in the key.
 * @param {string} root - The chord root to constrain
 * @param {number[]} keySignature - Array of valid pitch classes (0-11)
 * @param {number} keyRootIndex - Index of the key root in ROOT_NOTES
 * @returns {string} Constrained root note name
 */
function _constrainToKey(root, keySignature, keyRootIndex) {
  const rootIndex = ROOT_NOTES.indexOf(root);
  const rootPitchClass = rootIndex % 12;

  // If already in key, return unchanged
  if (keySignature.includes(rootPitchClass)) {
    return root;
  }

  // Find the closest pitch class that IS in the key
  let closestPC = keySignature[0];
  let closestDist = 12;
  for (const pc of keySignature) {
    const dist = Math.min(Math.abs(pc - rootPitchClass), 12 - Math.abs(pc - rootPitchClass));
    if (dist < closestDist) {
      closestDist = dist;
      closestPC = pc;
    }
  }

  return ROOT_NOTES[closestPC];
}

// ── Chord generation ──

/**
 * Generate a random Chord for use with CompositionOrchestrator.
 *
 * @param {number} beatStart - Beat position where this chord begins
 * @returns {Chord} A random Chord instance
 */
export function generateRandomChord(beatStart) {
  const root = pick(ROOT_NOTES);
  const quality = pick(QUALITIES);
  const scaleDegrees = getScaleDegrees(root, quality);
  return new Chord(root, quality, beatStart, scaleDegrees);
}

/**
 * Generate a random Chord constrained to a specific key signature.
 *
 * @param {number} beatStart - Beat position where this chord begins
 * @param {string} keyRoot - Key root (e.g., 'C', 'G')
 * @param {string} keyQuality - Key quality ('maj' or 'min')
 * @returns {Chord} A random Chord instance constrained to the key
 */
export function generateRandomChordInKey(beatStart, keyRoot, keyQuality) {
  const keySignature = _getKeySignature(keyRoot, keyQuality);
  const keyRootIndex = ROOT_NOTES.indexOf(keyRoot);
  const root = _constrainToKey(pick(ROOT_NOTES), keySignature, keyRootIndex);
  const quality = pick(QUALITIES);
  const scaleDegrees = getScaleDegrees(root, quality);
  return new Chord(root, quality, beatStart, scaleDegrees);
}

/**
 * Generate a random chord progression as Chord[] array.
 *
 * @param {Object} [options]
 * @param {number} [options.count] - Number of chords (default 4)
 * @param {number} [options.beatIncrement] - Beats between chords (default 2)
 * @param {number} [options.startBeat] - Starting beat (default 0)
 * @returns {Chord[]} Array of Chord objects
 */
export function generateRandomProgression(options = {}) {
  const { count, beatIncrement, startBeat, keyRoot, keyQuality } = {
    count: 4,
    beatIncrement: 2,
    startBeat: 0,
    keyRoot: null,
    keyQuality: null,
    ...options,
  };

  const chords = [];
  for (let i = 0; i < count; i++) {
    if (keyRoot && keyQuality) {
      chords.push(generateRandomChordInKey(startBeat + i * beatIncrement, keyRoot, keyQuality));
    } else {
      chords.push(generateRandomChord(startBeat + i * beatIncrement));
    }
  }
  return chords;
}

// ── Bass track fixture ──

/**
 * Generate a random bass track object (Progress app format) for bridge preprocessing.
 *
 * @param {number} totalDuration - Total duration in beats
 * @returns {Object} Bass track with instances
 */
export function generateRandomBassTrack(totalDuration) {
  const numInstances = randInt(1, Math.max(2, Math.floor(totalDuration / 2)));
  const instances = [];
  let currentTime = 0;

  for (let i = 0; i < numInstances; i++) {
    const instanceDuration = randFloat(0.5, Math.min(2.0, totalDuration - currentTime), 2);
    const normalizedStart = parseFloat((currentTime / totalDuration).toFixed(3));
    const normalizedDuration = parseFloat((instanceDuration / totalDuration).toFixed(3));

    instances.push({
      id: `bass-${i}`,
      startTime: normalizedStart,
      duration: Math.min(normalizedDuration, 1.0 - normalizedStart),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 7),
      pitchOffsets: Math.random() < 0.2 ? [randInt(-12, 12), randInt(-12, 12)] : [],
      isSelected: true,
      arpSettings: null,
      probability: randFloat(0.8, 1.0, 2),
    });

    currentTime += instanceDuration;
  }

  return { instances };
}

// ── Complex chord pattern generation ──

let _cpIdCounter = 0;
function nextCpId() {
  _cpIdCounter++;
  return `cp${_cpIdCounter.toString(16).padStart(8, '0')}`;
}

/**
 * Generate a complex chordPattern with multiple instances, arpeggios,
 * pitch offsets, and transitions - matching what the Progress app produces.
 * This exercises the bridge's event boundary collection and slicing.
 *
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} chordPattern object with rich structure
 */
export function generateComplexChordPattern(chordDuration) {
  const numInstances = randInt(3, 8);
  const instances = [];
  let currentTime = 0;

  for (let i = 0; i < numInstances; i++) {
    const maxRemaining = 1.0 - (currentTime / chordDuration);
    const instanceDuration = randFloat(0.1, Math.max(0.1, maxRemaining + 0.1), 3);
    const normalizedStart = parseFloat((currentTime / chordDuration).toFixed(3));
    const normalizedDuration = parseFloat(
      Math.min(instanceDuration / chordDuration, 1.0 - normalizedStart).toFixed(3)
    );

    // Multiple pitch offsets (user-adjusted note pitches within the chord)
    const numPitchOffsets = randInt(1, 4);
    const pitchOffsets = Array.from(
      { length: numPitchOffsets },
      () => randInt(-12, 12)
    );

    // Arpeggio settings on ~50% of instances
    const arpSettings = Math.random() < 0.5
      ? {
          style: pick(['up', 'down', 'random', 'arpeggiated']),
          rate: randFloat(0.125, 0.5, 3),
          gate: randFloat(0.5, 0.95, 2),
        }
      : null;

    instances.push({
      id: nextCpId(),
      startTime: normalizedStart,
      duration: normalizedDuration,
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 12),
      pitchOffsets: pitchOffsets,
      isSelected: Math.random() < 0.85,
      arpSettings,
      probability: randFloat(0.5, 1.0, 2),
    });

    currentTime += instanceDuration;
  }

  // Generate transitions (fade, crescendo, diminuendo, switch)
  const numTransitions = Math.random() < 0.5 ? randInt(1, 3) : 0;
  const transitions = Array.from({ length: numTransitions }, () => ({
    id: nextCpId(),
    startTime: randFloat(0.0, 0.8, 2),
    duration: randFloat(0.1, 0.5, 2),
    type: pick(['fade', 'crescendo', 'diminuendo', 'switch']),
    targetChordIndex: randInt(0, 3),
  }));

  return {
    isLocalOverride: Math.random() < 0.3,
    avoidKick: Math.random() < 0.4,
    generative: { mode: pick(['off', 'generative', 'interactive']), history: [] },
    transitions,
    instances,
  };
}

// ── Bass track fixture ──

/**
 * Generate a complex bassPattern with multiple instances, pitch offsets,
 * and variable timing - matching what the Progress app produces.
 * The bridge resolves these to effective chord roots at event boundaries.
 *
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} bassPattern object with rich structure
 */
export function generateComplexBassPattern(chordDuration) {
  const numInstances = randInt(2, 6);
  const instances = [];
  let currentTime = 0;

  for (let i = 0; i < numInstances; i++) {
    const maxRemaining = 1.0 - (currentTime / chordDuration);
    const instanceDuration = randFloat(0.25, Math.max(0.25, maxRemaining + 0.1), 2);
    const normalizedStart = parseFloat((currentTime / chordDuration).toFixed(3));

    // Multiple pitch offsets for polyphonic bass
    const numPitchOffsets = Math.random() < 0.3 ? randInt(1, 3) : 0;
    const pitchOffsets = numPitchOffsets > 0
      ? Array.from({ length: numPitchOffsets }, () => randInt(-12, 12))
      : [];

    instances.push({
      id: nextCpId(),
      startTime: normalizedStart,
      duration: Math.min(
        parseFloat(instanceDuration.toFixed(2)),
        1.0 - normalizedStart
      ),
      type: pick(['chord', 'note']),
      pitchOffset: randInt(-12, 7),
      pitchOffsets: pitchOffsets,
      isSelected: Math.random() < 0.9,
      arpSettings: null,
      probability: randFloat(0.7, 1.0, 2),
    });

    currentTime += instanceDuration;
  }

  // Walking/rhythm-informed generative mode
  const numTransitions = Math.random() < 0.3 ? randInt(1, 2) : 0;
  const transitions = Array.from({ length: numTransitions }, () => ({
    id: nextCpId(),
    startTime: randFloat(0.0, 0.8, 2),
    duration: randFloat(0.1, 0.5, 2),
    type: pick(['fade', 'crescendo', 'diminuendo', 'switch']),
    targetChordIndex: randInt(0, 3),
  }));

  return {
    isLocalOverride: Math.random() < 0.3,
    avoidKick: Math.random() < 0.5,
    generative: { mode: pick(['off', 'walking', 'rhythmInformed']), history: [] },
    transitions,
    instances,
  };
}

// ── Drum track fixture ──

/**
 * Generate a complex drumPattern with hits across multiple rows
 * (kick, snare, chh, ohh) at various time positions.
 * The bridge collects these as event boundaries for chord slicing.
 *
 * @param {number} chordDuration - Duration of the parent chord in beats
 * @returns {Object} drumPattern object with rich structure
 */
export function generateComplexDrumPattern(chordDuration) {
  const numHits = randInt(4, Math.max(8, Math.floor(chordDuration * 6)));
  const hits = [];

  for (let i = 0; i < numHits; i++) {
    hits.push({
      id: nextCpId(),
      time: randFloat(0, 0.99, 3),
      row: pick(['kick', 'snare', 'chh', 'ohh']),
      velocity: randFloat(0.3, 1.0, 2),
      probability: randFloat(0.7, 1.0, 2),
    });
  }

  return {
    isLocalOverride: Math.random() < 0.2,
    lengthBeats: randInt(2, 8),
    hits: hits.sort((a, b) => a.time - b.time),
  };
}

// ── Full pipeline: fixturegen → bridge → mgen ──

/**
 * Generate a random chord progression, optionally with bass and drum tracks,
 * run it through the progress bridge, and return the Chord[] for MelodyGen.
 *
 * By default generates COMPLEX chord patterns with:
 * - Multiple instances per chord (3-8) with user-adjusted pitch offsets
 * - Arpeggiated slices (up/down/random/arpeggiated styles)
 * - Transition blocks (fade, crescendo, diminuendo, switch)
 * - Dense bass patterns with pitch offsets
 * - Multi-row drum patterns (kick, snare, chh, ohh)
 *
 * The bridge collects all event boundaries across tracks, slices chords at
 * those boundaries, and resolves bass notes to effective roots.
 *
 * @param {Object} [options]
 * @param {number} [options.count] - Number of chords (default 4)
 * @param {number} [options.beatIncrement] - Beats between chords (default 2)
 * @param {number} [options.startBeat] - Starting beat (default 0)
 * @param {boolean} [options.withBass] - Include bass track (default true)
 * @param {boolean} [options.withDrums] - Include drum track (default true)
 * @param {boolean} [options.complexPatterns] - Use complex patterns with arps/transitions (default true)
 * @returns {{ chords: Chord[], progressData: Object }} Chords and raw progress data
 */
export function generateProgressionWithTracks(options = {}) {
  const { count, beatIncrement, startBeat, withBass, withDrums, complexPatterns } = {
    count: 4,
    beatIncrement: 2,
    startBeat: 0,
    withBass: true,
    withDrums: true,
    complexPatterns: true,
    ...options,
  };

  const chords = generateRandomProgression({ count, beatIncrement, startBeat });
  const totalDuration = startBeat + count * beatIncrement;

  // Derive a key signature from the first chord to constrain all subsequent chords
  const firstChord = chords[0];
  const keyRootIndex = ROOT_NOTES.indexOf(firstChord.root);
  const keySignature = _getKeySignature(firstChord.root, firstChord.quality);

  // Build Progress app format data for bridge preprocessing
  // Each chord gets a complex chordPattern with multiple instances,
  // arpeggios, pitch offsets, and transitions - matching what the
  // Progress app produces when a user adjusts notes, arpeggiates,
  // and adds transitions.
  const progressData = {
    chords: chords.map((chord, i) => {
      // Constrain chord roots to the key signature of the first chord
      const constrainedRoot = _constrainToKey(chord.root, keySignature, keyRootIndex);
      const constrainedQuality = chord.quality;
      const constrainedScaleDegrees = getScaleDegrees(constrainedRoot, constrainedQuality);
      const rootMidi = 60 + (keyRootIndex + (ROOT_NOTES.indexOf(constrainedRoot) - keyRootIndex + 12) % 12);

      const progressChord = {
        symbol: `${constrainedRoot}${constrainedQuality}`,
        key: rootMidi,
        divisions: 12,
        duration: beatIncrement,
        notes: constrainedScaleDegrees.map(d => rootMidi + d),
        _beatStart: chord.beatStart,
      };

      // Always include a chordPattern (Progress app always has one)
      if (complexPatterns) {
        progressChord.chordPattern = generateComplexChordPattern(beatIncrement);
      } else {
        progressChord.chordPattern = {
          isLocalOverride: false,
          avoidKick: false,
          generative: { mode: 'off', history: [] },
          transitions: [],
          instances: [{
            id: nextCpId(),
            startTime: 0,
            duration: 1,
            type: 'chord',
            pitchOffset: 0,
            pitchOffsets: [],
            isSelected: true,
            arpSettings: null,
            probability: 1,
          }],
        };
      }

      if (withBass) {
        progressChord.bassPattern = generateComplexBassPattern(beatIncrement);
      }

      if (withDrums) {
        progressChord.drumPattern = generateComplexDrumPattern(beatIncrement);
      }

      return progressChord;
    }),
  };

  // Run through bridge to get sliced Chord[]
  const processedChords = preprocessProgressData(progressData);

  return {
    chords: processedChords,
    progressData,
    rawChords: chords,
  };
}

/**
 * Generate a random PhraseContext for use with the progression.
 *
 * @param {Object} [options]
 * @param {string} [options.role] - Force a phrase role
 * @param {number} [options.tensionLevel] - Force tension (0-1)
 * @param {boolean} [options.isAntecedent] - Force antecedent flag
 * @returns {PhraseContext}
 */
export function generateRandomPhraseContext(options = {}) {
  const { role, tensionLevel, isAntecedent } = {
    role: pick(PHRASE_ROLES),
    tensionLevel: randFloat(0.2, 0.9, 2),
    isAntecedent: Math.random() < 0.3,
    ...options,
  };

  return new PhraseContext(role, tensionLevel, undefined, isAntecedent);
}

/**
 * Build a GenerationConfig from a generated progression.
 *
 * @param {Chord[]} chords - Chord progression
 * @param {PhraseContext} phraseContext - Phrase context
 * @returns {GenerationConfig}
 */
export function buildGenerationConfig(chords, phraseContext) {
  return new GenerationConfig(chords, phraseContext);
}

export default {
  generateRandomChord,
  generateRandomChordInKey,
  generateRandomProgression,
  generateComplexChordPattern,
  generateComplexBassPattern,
  generateComplexDrumPattern,
  generateProgressionWithTracks,
  generateRandomPhraseContext,
  buildGenerationConfig,
};
