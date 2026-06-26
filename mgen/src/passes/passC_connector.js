// Pass C - Connector Layer
// Generates connective motion between structural points
// Fills gaps between structural notes (Pass A) and cadence notes (Pass B)

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass C: Connector Layer Generator.
 * Generates connective motion between structural points.
 * Uses stepwise motion primarily, with occasional skips.
 */
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminishedWH: [0, 2, 3, 5, 6, 8, 9, 11],
  altered: [0, 1, 3, 4, 6, 8, 10],
};

function getLocalScaleMode(quality, genre) {
  if (genre === 'jazz' || genre === 'blues') {
    if (quality === 'minor7') return 'dorian';
    if (quality === 'dominant') return 'mixolydian';
    if (quality === 'diminished') return 'diminishedWH';
    if (quality === 'augmented') return 'wholeTone';
  }
  const map = {
    'minor':      'minor',
    'minor7':     'dorian',
    'dominant':   'mixolydian',
    'diminished': 'diminishedWH',
    'augmented':  'wholeTone',
    'suspended':  'mixolydian',
    'major':      'major',
  };
  return map[quality] || 'major';
}

function buildScalePitches(keyRoot, intervals, divisions = 12, start = 60, end = 84) {
  const pitches = [];
  const periodSize = 12;
  const stepSize = 12.0 / divisions;
  
  for (let oct = -5; oct <= 5; oct++) {
    const octOffset = oct * periodSize;
    for (const interval of intervals) {
      const pitch = keyRoot + octOffset + interval * stepSize;
      if (pitch >= start && pitch <= end) {
        pitches.push(pitch);
      }
    }
  }
  return [...new Set(pitches)].sort((a, b) => a - b);
}

function getActiveChordAtTime(chords, time) {
  if (!chords || chords.length === 0) return null;
  let activeChord = chords[0];
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const nextC = chords[i + 1];
    const start = c.beatStart !== undefined ? c.beatStart : (c._beatStart !== undefined ? c._beatStart : 0);
    const duration = c.duration || 2;
    const nextStart = nextC ? (nextC.beatStart !== undefined ? nextC.beatStart : nextC._beatStart) : start + duration;
    if (time >= start - 0.001 && time < nextStart - 0.001) {
      activeChord = c;
      break;
    }
  }
  return activeChord;
}

function snapPitchToLocalScale(pitch, chord, genre = 'none', divisions = 12) {
  if (!chord) return pitch;
  const qualityMap = { 
    'maj': 'major', 
    'maj7': 'major', 
    'min': 'minor', 
    '7': 'dominant', 
    'dim': 'diminished', 
    'aug': 'augmented', 
    'min7': 'minor7',
    'suspended': 'suspended'
  };
  const normalizedQuality = qualityMap[chord.quality] || chord.quality;
  const mode = getLocalScaleMode(normalizedQuality, genre);
  const intervals = SCALES[mode] || SCALES['major'];
  
  let chordRoot = 60;
  if (chord.notes && chord.notes.length > 0) {
    chordRoot = chord.notes[0];
  } else if (chord.root) {
    const MIDI_TO_NOTE_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = chord.root.replace(/[#b]$/, '');
    const accidental = chord.root.match(/[#b]+/);
    const baseIndex = MIDI_TO_NOTE_NAME.indexOf(note);
    if (baseIndex !== -1) {
      let offset = baseIndex;
      if (accidental) {
        for (const ch of accidental[0]) {
          offset += (ch === '#') ? 1 : -1;
        }
      }
      chordRoot = 60 + (offset - 0);
    }
  }

  const validPitches = buildScalePitches(chordRoot, intervals, divisions, 48, 96);
  if (validPitches.length === 0) return pitch;

  let closest = validPitches[0];
  let minDiff = Math.abs(validPitches[0] - pitch);
  for (let i = 1; i < validPitches.length; i++) {
    const diff = Math.abs(validPitches[i] - pitch);
    if (diff < minDiff) {
      minDiff = diff;
      closest = validPitches[i];
    }
  }
  return closest;
}

/**
 * Pass C: Connector Layer Generator.
 * Generates connective motion between structural points.
 * Uses stepwise motion primarily, with occasional skips.
 */
export class ConnectorPlanner {
  /**
   * @param {Object} options - Pass-specific options
   * @param {number} [options.stepProbability=0.7] - Probability of stepwise motion
   * @param {number} [options.skipProbability=0.2] - Probability of skip motion
   * @param {number} [options.leapProbability=0.1] - Probability of leap motion
   */
  constructor(options = {}) {
    this.stepProbability = options.stepProbability || 0.7;
    this.skipProbability = options.skipProbability || 0.2;
    this.leapProbability = options.leapProbability || 0.1;
  }

  /**
   * Execute Pass C: Generate connector layer.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes (Pass A + Pass B)
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Connector layer result
   */
  async execute(config, previousNotes, context = {}) {
    const notes = [];
    const options = config.options || {};
    const safeMode = options.safeMode || false;

    // Sort previous notes by time
    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);

    // Generate connectors between consecutive structural/cadence points
    for (let i = 0; i < sortedNotes.length - 1; i++) {
      const currentNote = sortedNotes[i];
      const nextNote = sortedNotes[i + 1];

      const connectors = this._generateConnectors(currentNote, nextNote, safeMode, config);
      notes.push(...connectors);
    }

    return new PassResult(
      'PassC_Connector',
      notes,
      new EvaluationMetrics('PassC_Connector', 1.0, [], true),
      {
        connectorCount: notes.length,
        structuralNoteCount: previousNotes.length,
      }
    );
  }

  /**
   * Generate connective notes between two structural points.
   * Uses stepwise motion primarily, with occasional skips.
   * @param {MelodyNote} startNote - Starting structural/cadence note
   * @param {MelodyNote} endNote - Ending structural/cadence note
   * @param {boolean} safeMode - Whether to execute under Safe Mode
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]} Connective notes
   * @private
   */
  _generateConnectors(startNote, endNote, safeMode = false, config = {}) {
    const connectors = [];
    const startPitch = startNote.pitch;
    const endPitch = endNote.pitch;
    const startTime = startNote.startTime;
    const endTime = endNote.startTime;

    // Calculate distance and direction
    const distance = endPitch - startPitch;
    const direction = Math.sign(distance);
    const absDistance = Math.abs(distance);

    // Skip connectors for same-pitch gaps (no point connecting to yourself)
    if (absDistance === 0) {
      return connectors;
    }

    const options = config.options || {};
    const density = options.density !== undefined ? options.density : 0.5;

    // Determine number of connector notes based on distance and density (cap to 1 in safeMode)
    let numConnectors;
    if (safeMode) {
      numConnectors = Math.min(Math.max(1, Math.floor(absDistance / 2)), 1);
    } else if (density > 0.7) {
      numConnectors = Math.min(Math.floor(absDistance), absDistance <= 1 ? 2 : 6);
    } else if (density < 0.3) {
      numConnectors = Math.min(Math.floor(absDistance / 3), 1);
    } else {
      numConnectors = Math.min(Math.floor(absDistance / 2), absDistance <= 1 ? 2 : 4);
    }

    if (numConnectors === 0) {
      return connectors;
    }

    // Generate stepwise or skip motion
    let currentPitch = startPitch;
    const timeStep = (endTime - startTime) / (numConnectors + 1);

    for (let i = 0; i < numConnectors; i++) {
      const timePosition = startTime + timeStep * (i + 1);

      // Determine motion type (always stepwise in safeMode)
      const motionType = safeMode ? 'step' : this._selectMotionType();

      let stepSize;
      if (safeMode || motionType === 'step') {
        stepSize = direction * 1;
      } else {
        switch (motionType) {
          case 'skip':
            stepSize = direction * (2 + Math.floor(Math.random() * 2));
            break;
          case 'leap':
            stepSize = direction * (3 + Math.floor(Math.random() * 4));
            break;
          default:
            stepSize = direction * 1;
        }
      }

      currentPitch += stepSize;
      const activeChord = getActiveChordAtTime(config.chords, timePosition);
      let snappedPitch = snapPitchToLocalScale(currentPitch, activeChord, options.genre || 'none', options.divisions || 12);

      if ((direction > 0 && snappedPitch > endPitch) || (direction < 0 && snappedPitch < endPitch)) {
        snappedPitch = endPitch;
      }
      currentPitch = snappedPitch;

      connectors.push(
        new MelodyNote(currentPitch, timePosition, timeStep * 0.8, 'connector', {
          motionType,
          connectsStart: startNote.pitch,
          connectsEnd: endPitch,
        })
      );
    }

    return connectors;
  }

  /**
   * Select motion type based on probabilities.
   * @returns {string} Motion type: 'step', 'skip', or 'leap'
   * @private
   */
  _selectMotionType() {
    const rand = Math.random();
    if (rand < this.stepProbability) {
      return 'step';
    } else if (rand < this.stepProbability + this.skipProbability) {
      return 'skip';
    } else {
      return 'leap';
    }
  }
}

export default ConnectorPlanner;
