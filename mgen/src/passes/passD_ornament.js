// Pass D - Ornament Layer
// Adds melodic ornaments: grace notes, trills, turns, appoggiaturas
// Enhances structural melody with expressive embellishments

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass D: Ornament Layer Generator.
 * Adds melodic ornaments to structural melody.
 * Respects phrase role and cadential context.
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

export class OrnamentPlanner {
  /**
   * @param {Object} options - Pass-specific options
   * @param {number} [options.ornamentDensity=0.3] - Probability of ornamenting each note
   * @param {string[]} [options.allowedOrnaments=['graceNote', 'trill', 'turn', 'appoggiatura']]
   */
  constructor(options = {}) {
    this.ornamentDensity = options.ornamentDensity || 0.3;
    this.allowedOrnaments = options.allowedOrnaments || ['graceNote', 'trill', 'turn', 'appoggiatura'];
  }

  async execute(config, previousNotes, context = {}) {
    const ornaments = [];
    const options = config.options || {};

    if (options.density !== undefined) {
      this.ornamentDensity = options.density;
    }

    if (options.safeMode) {
      // Under Safe Mode, skip generating ornaments entirely
      return new PassResult(
        'PassD_Ornament',
        [],
        new EvaluationMetrics('PassD_Ornament', 1.0, [], true),
        {
          ornamentCount: 0,
          structuralNoteCount: previousNotes.length,
        }
      );
    }

    // Sort notes by time
    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);

    // Track consecutive same-pitch ornaments to break repetition
    let consecutiveSamePitchCount = 0;
    let lastOrnamentedPitch = null;

    // Attempt to ornament each structural note (not connectors)
    for (const note of sortedNotes) {
      if (note.role === 'connector') {
        continue; // Don't ornament connectors
      }

      // Skip ornament if 3+ consecutive ornaments target the same pitch
      if (note.pitch === lastOrnamentedPitch) {
        consecutiveSamePitchCount++;
        if (consecutiveSamePitchCount >= 3) {
          continue; // Skip to break repetition
        }
      } else {
        consecutiveSamePitchCount = 0;
        lastOrnamentedPitch = note.pitch;
      }

      const ornamentedNotes = this._attemptOrnament(note, config);
      if (ornamentedNotes) {
        ornaments.push(...ornamentedNotes);
      }
    }

    return new PassResult(
      'PassD_Ornament',
      ornaments,
      new EvaluationMetrics('PassD_Ornament', 1.0, [], true),
      {
        ornamentCount: ornaments.length,
        ornamentedNoteCount: ornaments.length / 2, // Each ornament adds ~2 notes
      }
    );
  }

  /**
   * Attempt to ornament a single structural note.
   * @param {MelodyNote} note - Structural note to ornament
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]|null} Ornamented notes or null
   * @private
   */
  _attemptOrnament(note, config) {
    // Random chance to ornament based on density
    if (Math.random() > this.ornamentDensity) {
      return null;
    }

    // Select ornament type
    const ornamentType = this.allowedOrnaments[
      Math.floor(Math.random() * this.allowedOrnaments.length)
    ];

    // Generate ornament notes based on type
    switch (ornamentType) {
      case 'graceNote':
        return this._generateGraceNote(note, config);
      case 'trill':
        return this._generateTrill(note, config);
      case 'turn':
        return this._generateTurn(note, config);
      case 'appoggiatura':
        return this._generateAppoggiatura(note, config);
      default:
        return null;
    }
  }

  /**
   * Generate a grace note before the target note.
   * @param {MelodyNote} note - Target note
   * @param {GenerationConfig} [config={}] - Generation configuration
   * @returns {MelodyNote[]} Grace note and target
   * @private
   */
  _generateGraceNote(note, config = {}) {
    const chords = config.chords || [];
    const activeChord = getActiveChordAtTime(chords, note.startTime);
    const options = config.options || {};
    let gracePitch = note.pitch - 1;
    gracePitch = snapPitchToLocalScale(gracePitch, activeChord, options.genre || 'none', options.divisions || 12);
    const graceDuration = note.duration * 0.2;

    return [
      new MelodyNote(
        gracePitch,
        note.startTime - graceDuration,
        graceDuration,
        'ornament',
        {
          ornamentType: 'graceNote',
          ornamentsNote: note.pitch,
        }
      ),
      note,
    ];
  }

  /**
   * Generate a trill (rapid alternation between note and upper neighbor).
   * @param {MelodyNote} note - Target note
   * @param {GenerationConfig} [config={}] - Generation configuration
   * @returns {MelodyNote[]} Trill notes
   * @private
   */
  _generateTrill(note, config = {}) {
    const chords = config.chords || [];
    const activeChord = getActiveChordAtTime(chords, note.startTime);
    const options = config.options || {};
    const upperNeighbor = snapPitchToLocalScale(note.pitch + 2, activeChord, options.genre || 'none', options.divisions || 12);

    const trillNotes = [];
    const numTrills = 4;
    const trillDuration = note.duration / numTrills;

    for (let i = 0; i < numTrills; i++) {
      const pitch = i % 2 === 0 ? note.pitch : upperNeighbor;
      trillNotes.push(
        new MelodyNote(
          pitch,
          note.startTime + trillDuration * i,
          trillDuration,
          'ornament',
          {
            ornamentType: 'trill',
            ornamentsNote: note.pitch,
          }
        )
      );
    }

    return trillNotes;
  }

  /**
   * Generate a turn (upper neighbor - target - lower neighbor - target).
   * @param {MelodyNote} note - Target note
   * @param {GenerationConfig} [config={}] - Generation configuration
   * @returns {MelodyNote[]} Turn notes
   * @private
   */
  _generateTurn(note, config = {}) {
    const chords = config.chords || [];
    const activeChord = getActiveChordAtTime(chords, note.startTime);
    const options = config.options || {};
    const upperNeighbor = snapPitchToLocalScale(note.pitch + 2, activeChord, options.genre || 'none', options.divisions || 12);
    const lowerNeighbor = snapPitchToLocalScale(note.pitch - 2, activeChord, options.genre || 'none', options.divisions || 12);
    const turnDuration = note.duration / 4;

    return [
      new MelodyNote(upperNeighbor, note.startTime, turnDuration, 'ornament', {
        ornamentType: 'turn',
        ornamentsNote: note.pitch,
      }),
      new MelodyNote(note.pitch, note.startTime + turnDuration, turnDuration, 'ornament', {
        ornamentType: 'turn',
        ornamentsNote: note.pitch,
      }),
      new MelodyNote(lowerNeighbor, note.startTime + turnDuration * 2, turnDuration, 'ornament', {
        ornamentType: 'turn',
        ornamentsNote: note.pitch,
      }),
      new MelodyNote(note.pitch, note.startTime + turnDuration * 3, turnDuration, 'ornament', {
        ornamentType: 'turn',
        ornamentsNote: note.pitch,
      }),
    ];
  }

  /**
   * Generate an appoggiatura (approach from above or below).
   * @param {MelodyNote} note - Target note
   * @param {GenerationConfig} [config={}] - Generation configuration
   * @returns {MelodyNote[]} Appoggiatura and target
   * @private
   */
  _generateAppoggiatura(note, config = {}) {
    const chords = config.chords || [];
    const activeChord = getActiveChordAtTime(chords, note.startTime);
    const options = config.options || {};
    const approachFromAbove = Math.random() > 0.5;
    let appoggiaturaPitch = approachFromAbove ? note.pitch + 3 : note.pitch - 3;
    appoggiaturaPitch = snapPitchToLocalScale(appoggiaturaPitch, activeChord, options.genre || 'none', options.divisions || 12);
    const appDuration = note.duration * 0.6;

    return [
      new MelodyNote(
        appoggiaturaPitch,
        note.startTime,
        appDuration,
        'ornament',
        {
          ornamentType: 'appoggiatura',
          ornamentsNote: note.pitch,
        }
      ),
      new MelodyNote(note.pitch, note.startTime + appDuration, note.duration - appDuration, 'ornament', {
        ornamentType: 'appoggiatura',
        ornamentsNote: note.pitch,
      }),
    ];
  }
}

export default OrnamentPlanner;
