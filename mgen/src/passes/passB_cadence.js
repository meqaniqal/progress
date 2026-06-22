// Pass B - Cadence Layer
// Generates phrase endings and structural resolutions
// Works with structural notes from Pass A to create proper cadential behavior

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass B: Cadence Layer Generator.
 * Generates phrase endings and structural resolutions.
 * Ensures proper cadential behavior based on phrase role.
 */
export class CadencePlanner {
  /**
   * @param {Object} options - Pass-specific options
   */
  constructor(options = {}) {
    this.options = options;
    this.baseRegister = options.baseRegister || 60;
  }

  /**
   * Execute Pass B: Generate cadence layer.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes (Pass A structural notes)
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Cadence layer result
   */
  async execute(config, previousNotes, context = {}) {
    const { chords, phraseContext } = config;
    const notes = [];
    const options = config.options || {};
    this.baseRegister = options.baseRegister !== undefined ? options.baseRegister : this.baseRegister;

    // Identify cadence points (typically phrase endings)
    const cadencePoints = this._identifyCadencePoints(chords, phraseContext);

    // Generate cadence notes for each cadence point
    for (const cadencePoint of cadencePoints) {
      const cadenceNote = this._generateCadenceNote(cadencePoint, previousNotes, phraseContext);
      if (cadenceNote) {
        notes.push(cadenceNote);
      }
    }

    return new PassResult(
      'PassB_Cadence',
      notes,
      new EvaluationMetrics('PassB_Cadence', 1.0, [], true),
      {
        phraseContext,
        cadenceCount: notes.length,
        cadencePoints,
      }
    );
  }

  /**
   * Identify cadence points in the chord progression.
   * Cadence points are typically at phrase boundaries.
   * @param {Chord[]} chords - Chord progression
   * @param {PhraseContext} phraseContext - Phrase context
   * @returns {Array<Object>} Cadence point descriptors
   * @private
   */
  _identifyCadencePoints(chords, phraseContext) {
    const cadencePoints = [];

    // Last chord is always a potential cadence point
    if (chords.length > 0) {
      const lastChord = chords[chords.length - 1];
      cadencePoints.push({
        chordIndex: chords.length - 1,
        chord: lastChord,
        isPhraseEnd: true,
        phraseRole: phraseContext.role,
        isAntecedent: phraseContext.isAntecedent,
      });
    }

    // Identify half-cadence points (mid-phrase endings)
    for (let i = 0; i < chords.length - 1; i++) {
      const chord = chords[i];
      // Dominant chords often create half-cadences
      if (chord.quality === '7' || chord.quality === 'dim') {
        cadencePoints.push({
          chordIndex: i,
          chord,
          isPhraseEnd: false,
          phraseRole: phraseContext.role,
          isAntecedent: phraseContext.isAntecedent,
        });
      }
    }

    return cadencePoints;
  }

  /**
   * Generate a cadence note for a cadence point.
   * Respects phrase role and antecedent/consequent distinctions.
   * @param {Object} cadencePoint - Cadence point descriptor
   * @param {MelodyNote[]} previousNotes - Structural notes from Pass A
   * @param {PhraseContext} phraseContext - Phrase context
   * @returns {MelodyNote|null} Cadence note or null if not applicable
   * @private
   */
  _generateCadenceNote(cadencePoint, previousNotes, phraseContext) {
    const { chord, isPhraseEnd, phraseRole, isAntecedent } = cadencePoint;

    const chordTones = this._getChordTones(chord);

    // Antecedent phrases should NOT resolve to tonic
    if (isAntecedent && isPhraseEnd) {
      // End on dominant or leading tone instead
      const dominantTone = this._findDominantNote(chord, chordTones);
      return this._createCadenceNote(dominantTone, cadencePoint, previousNotes, 'cadence');
    }

    // Consequent phrases resolve to tonic
    if (isPhraseEnd) {
      const tonicNote = this._findTonicResolution(chord, chordTones, phraseContext);
      return this._createCadenceNote(tonicNote, cadencePoint, previousNotes, 'cadence');
    }

    // Half-cadences on dominant chords
    if (!isPhraseEnd) {
      const dominantNote = this._findDominantNote(chord, chordTones);
      return this._createCadenceNote(dominantNote, cadencePoint, previousNotes, 'cadence');
    }

    return null;
  }

  /**
   * Create a cadence note with proper timing.
   * @param {number} pitch - Target pitch
   * @param {Object} cadencePoint - Cadence point descriptor
   * @param {MelodyNote[]} previousNotes - Previous notes
   * @param {string} role - Note role
   * @returns {MelodyNote} Cadence note
   * @private
   */
  _createCadenceNote(pitch, cadencePoint, previousNotes, role) {
    const chord = cadencePoint.chord;

    // Place cadence note 1 beat after chord start to avoid colliding with structural notes on beats 1 and 3
    const startTime = chord.beatStart + 1;
    const duration = 1.0;

    return new MelodyNote(pitch, startTime, duration, role, {
      chordRoot: chord.root,
      chordQuality: chord.quality,
      isCadenceNote: true,
      cadenceType: cadencePoint.isPhraseEnd ? 'full' : 'half',
      phraseRole: cadencePoint.phraseRole,
    });
  }

  /**
   * Get chord tones for a chord.
   * @param {Chord} chord - Chord to analyze
   * @returns {number[]} Chord tones as MIDI pitches
   * @private
   */
  _getChordTones(chord) {
    if (chord.notes && chord.notes.length > 0) {
      const pitchClasses = new Set(chord.notes.map(n => ((n % 12) + 12) % 12));
      return [...pitchClasses].map(pc => this.baseRegister + pc);
    }
    const rootMidi = this._noteNameToMidi(chord.root);
    const intervals = this._getChordIntervals(chord.quality);
    return intervals.map((interval) => rootMidi + interval);
  }

  /**
   * Get chord intervals based on quality.
   * @param {string} quality - Chord quality
   * @returns {number[]} Intervals from root
   * @private
   */
  _getChordIntervals(quality) {
    switch (quality) {
      case 'maj':
        return [0, 4, 7];
      case 'min':
        return [0, 3, 7];
      case 'dim':
        return [0, 3, 6];
      case '7':
        return [0, 4, 7, 10];
      default:
        return [0, 4, 7];
    }
  }

  /**
   * Convert note name to MIDI pitch.
   * @param {string} noteName - Note name
   * @returns {number} MIDI pitch
   * @private
   */
  _noteNameToMidi(noteName) {
    const noteValues = {
      C: 0,
      'C#': 1,
      Db: 1,
      D: 2,
      'D#': 3,
      Eb: 3,
      E: 4,
      F: 5,
      'F#': 6,
      Gb: 6,
      G: 7,
      'G#': 8,
      Ab: 8,
      A: 9,
      'A#': 10,
      Bb: 10,
      B: 11,
    };

    const match = noteName.match(/^([A-G][b#]?)(\d+)?$/);
    if (!match) return 60;

    const note = match[1];
    const octave = match[2] ? parseInt(match[2], 10) : 4;
    const baseNote = noteValues[note] || 0;
    return 12 * (octave + 1) + baseNote;
  }

  /**
   * Find dominant note for a chord.
   * @param {Chord} chord - Current chord
   * @param {number[]} chordTones - Chord tones
   * @returns {number} Dominant pitch
   * @private
   */
  _findDominantNote(chord, chordTones) {
    // For dominant chords, use the seventh (creates tension)
    if (chord.quality === '7') {
      return chordTones[3];
    }
    // For other chords, use the fifth
    return chordTones[2];
  }

  /**
   * Find tonic resolution for a phrase.
   * @param {Chord} chord - Current chord
   * @param {number[]} chordTones - Chord tones
   * @param {PhraseContext} phraseContext - Phrase context
   * @returns {number} Tonic resolution pitch
   * @private
   */
  _findTonicResolution(chord, chordTones, phraseContext) {
    // If this is a tonic chord, resolve to root
    if (chord.quality === 'maj' || chord.quality === 'min') {
      return this._noteNameToMidi(chord.root);
    }

    // Otherwise find nearest chord tone to tonic
    const rootMidi = this._noteNameToMidi(chord.root);
    return chordTones.reduce((prev, curr) =>
      Math.abs(curr - rootMidi) < Math.abs(prev - rootMidi) ? curr : prev
    );
  }
}

export default CadencePlanner;
