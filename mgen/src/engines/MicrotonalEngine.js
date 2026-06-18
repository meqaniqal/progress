// Microtonal Engine - Handles non-12-TET tunings and microtonal intervals
// Based on melodygen_architecture.md: "Quarter-tones, just intonation, custom tunings"

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents a tuning system.
 */
export class TuningSystem {
  /**
   * @param {string} id - Tuning identifier
   * @param {string} name - Human-readable name
   * @param {Object} parameters - Tuning parameters
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(id, name, parameters, metadata = {}) {
    this.id = id;
    this.name = name;
    this.parameters = parameters;
    this.metadata = metadata;
  }
}

/**
 * Microtonal Engine - Handles non-12-TET tunings and microtonal intervals.
 * Supports quarter-tones, just intonation, and custom tunings.
 */
export class MicrotonalEngine {
  /**
   * @param {Object} options - Engine options
   * @param {string} [options.tuningSystem='12tet'] - Default tuning system
   * @param {number} [options.microtoneResolution=0.01] - Microtone resolution
   */
  constructor(options = {}) {
    this.tuningSystems = this._createDefaultTuningSystems();
    this.activeTuning = options.tuningSystem || '12tet';
    this.microtoneResolution = options.microtoneResolution || 0.01;
  }

  /**
   * Create default tuning systems.
   * @returns {Object<string, TuningSystem>} Default tuning systems
   * @private
   */
  _createDefaultTuningSystems() {
    return {
      '12tet': new TuningSystem(
        '12tet',
        '12-Tone Equal Temperament',
        {
          semitoneRatio: Math.pow(2, 1 / 12),
          baseFrequency: 440,
          quarterToneSupport: false,
        },
        { description: 'Standard Western tuning' }
      ),
      'quartertone': new TuningSystem(
        'quartertone',
        'Quarter-Tone',
        {
          semitoneRatio: Math.pow(2, 1 / 12),
          quarterToneRatio: Math.pow(2, 1 / 24),
          baseFrequency: 440,
          quarterToneSupport: true,
        },
        { description: '24-TET, allows quarter-tone intervals' }
      ),
      'just': new TuningSystem(
        'just',
        'Just Intonation',
        {
          intervals: {
            unison: 1,
            minorSecond: 16 / 15,
            majorSecond: 9 / 8,
            minorThird: 6 / 5,
            majorThird: 5 / 4,
            perfectFourth: 4 / 3,
            tritone: 45 / 32,
            perfectFifth: 3 / 2,
            minorSixth: 8 / 5,
            majorSixth: 5 / 3,
            minorSeventh: 9 / 5,
            majorSeventh: 15 / 8,
            octave: 2,
          },
          baseFrequency: 440,
          quarterToneSupport: false,
        },
        { description: 'Pure intervals based on harmonic series' }
      ),
      'pythagorean': new TuningSystem(
        'pythagorean',
        'Pythagorean Tuning',
        {
          intervals: {
            unison: 1,
            majorSecond: 9 / 8,
            minorThird: 32 / 27,
            majorThird: 81 / 64,
            perfectFourth: 4 / 3,
            perfectFifth: 3 / 2,
            majorSixth: 27 / 16,
            octave: 2,
          },
          baseFrequency: 440,
          quarterToneSupport: false,
        },
        { description: 'Based on pure perfect fifths' }
      ),
    };
  }

  /**
   * Execute Microtonal Engine: Apply tuning system to notes.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Microtonal transformation result
   */
  async execute(config, previousNotes, context = {}) {
    const tuningSystem = this.tuningSystems[this.activeTuning];
    if (!tuningSystem) {
      throw new Error(`Unknown tuning system: ${this.activeTuning}`);
    }

    const microtonalNotes = this._applyTuningSystem(previousNotes, tuningSystem);
    const score = this._calculateTuningConsistencyScore(microtonalNotes, tuningSystem);

    return new PassResult(
      'MicrotonalEngine',
      microtonalNotes,
      new EvaluationMetrics(
        'MicrotonalEngine',
        score,
        [],
        true
      ),
      {
        activeTuning: this.activeTuning,
        tuningSystem,
        noteCount: microtonalNotes.length,
      }
    );
  }

  /**
   * Apply tuning system to notes.
   * @param {MelodyNote[]} notes - Notes to tune
   * @param {TuningSystem} tuningSystem - Tuning system
   * @returns {MelodyNote[]} Tuned notes
   * @private
   */
  _applyTuningSystem(notes, tuningSystem) {
    const tuned = [];

    for (const note of notes) {
      const tunedNote = this._convertToTuningSystem(note, tuningSystem);
      tuned.push(tunedNote);
    }

    return tuned;
  }

  /**
   * Convert a note to the active tuning system.
   * @param {MelodyNote} note - Note to convert
   * @param {TuningSystem} tuningSystem - Target tuning system
   * @returns {MelodyNote} Converted note
   * @private
   */
  _convertToTuningSystem(note, tuningSystem) {
    const baseFrequency = tuningSystem.parameters.baseFrequency || 440;

    switch (tuningSystem.id) {
      case '12tet':
        return this._convertTo12TET(note, baseFrequency);
      case 'quartertone':
        return this._convertToQuarterTone(note, baseFrequency);
      case 'just':
        return this._convertToJustIntonation(note, baseFrequency, tuningSystem.parameters.intervals);
      case 'pythagorean':
        return this._convertToPythagorean(note, baseFrequency, tuningSystem.parameters.intervals);
      default:
        return note;
    }
  }

  /**
   * Convert note to 12-TET.
   * @param {MelodyNote} note - Note to convert
   * @param {number} baseFrequency - Base frequency (A4)
   * @returns {MelodyNote} 12-TET note
   * @private
   */
  _convertTo12TET(note, baseFrequency) {
    const semitonesFromA4 = note.pitch - 69; // MIDI note 69 = A4
    const frequency = baseFrequency * Math.pow(2, semitonesFromA4 / 12);

    return new MelodyNote(
      note.pitch,
      note.startTime,
      note.duration,
      note.role,
      {
        ...note.metadata,
        microtonalAdjusted: true,
        tuningSystem: '12tet',
        frequency,
      }
    );
  }

  /**
   * Convert note to quarter-tone (24-TET).
   * @param {MelodyNote} note - Note to convert
   * @param {number} baseFrequency - Base frequency (A4)
   * @returns {MelodyNote} Quarter-tone note
   * @private
   */
  _convertToQuarterTone(note, baseFrequency) {
    const semitonesFromA4 = note.pitch - 69;
    const quarterToneSteps = semitonesFromA4 * 2; // 2 quarter-tones per semitone
    const frequency = baseFrequency * Math.pow(2, quarterToneSteps / 24);

    return new MelodyNote(
      note.pitch,
      note.startTime,
      note.duration,
      note.role,
      {
        ...note.metadata,
        microtonalAdjusted: true,
        tuningSystem: 'quartertone',
        frequency,
        quarterToneOffset: this._calculateQuarterToneOffset(note.pitch),
      }
    );
  }

  /**
   * Calculate quarter-tone offset for a pitch.
   * @param {number} pitch - MIDI pitch
   * @returns {number} Quarter-tone offset (0 or 0.5)
   * @private
   */
  _calculateQuarterToneOffset(pitch) {
    const semitone = pitch % 1;
    return semitone > 0.5 ? 0.5 : 0;
  }

  /**
   * Convert note to Just Intonation.
   * @param {MelodyNote} note - Note to convert
   * @param {number} baseFrequency - Base frequency (A4)
   * @param {Object} intervals - Interval ratios
   * @returns {MelodyNote} Just intonation note
   * @private
   */
  _convertToJustIntonation(note, baseFrequency, intervals) {
    const closestInterval = this._findClosestInterval(note.pitch, intervals);
    const frequency = baseFrequency * intervals[closestInterval];

    return new MelodyNote(
      note.pitch,
      note.startTime,
      note.duration,
      note.role,
      {
        ...note.metadata,
        microtonalAdjusted: true,
        tuningSystem: 'just',
        frequency,
        intervalName: closestInterval,
        intervalRatio: intervals[closestInterval],
      }
    );
  }

  /**
   * Find closest interval name for a pitch.
   * @param {number} pitch - MIDI pitch
   * @param {Object} intervals - Interval ratios
   * @returns {string} Closest interval name
   * @private
   */
  _findClosestInterval(pitch, intervals) {
    const scaleDegrees = ['unison', 'majorSecond', 'minorThird', 'majorThird', 'perfectFourth', 'perfectFifth', 'majorSixth', 'octave'];
    const scaleIndex = pitch % 12;

    return scaleDegrees[scaleIndex] || 'unison';
  }

  /**
   * Convert note to Pythagorean tuning.
   * @param {MelodyNote} note - Note to convert
   * @param {number} baseFrequency - Base frequency (A4)
   * @param {Object} intervals - Interval ratios
   * @returns {MelodyNote} Pythagorean note
   * @private
   */
  _convertToPythagorean(note, baseFrequency, intervals) {
    const closestInterval = this._findClosestInterval(note.pitch, intervals);
    const frequency = baseFrequency * intervals[closestInterval];

    return new MelodyNote(
      note.pitch,
      note.startTime,
      note.duration,
      note.role,
      {
        ...note.metadata,
        microtonalAdjusted: true,
        tuningSystem: 'pythagorean',
        frequency,
        intervalName: closestInterval,
        intervalRatio: intervals[closestInterval],
      }
    );
  }

  /**
   * Calculate tuning consistency score.
   * @param {MelodyNote[]} notes - All notes
   * @param {TuningSystem} tuningSystem - Active tuning system
   * @returns {number} Consistency score (0.0-1.0)
   * @private
   */
  _calculateTuningConsistencyScore(notes, tuningSystem) {
    if (notes.length === 0) return 0.5;

    const adjustedNotes = notes.filter((n) => n.metadata && n.metadata.microtonalAdjusted);
    const consistencyRatio = adjustedNotes.length / notes.length;

    return Math.min(1.0, consistencyRatio);
  }

  /**
   * Set active tuning system.
   * @param {string} tuningId - Tuning identifier
   */
  setActiveTuning(tuningId) {
    if (!this.tuningSystems[tuningId]) {
      throw new Error(`Unknown tuning system: ${tuningId}`);
    }
    this.activeTuning = tuningId;
  }

  /**
   * Get active tuning system.
   * @returns {TuningSystem} Active tuning system
   */
  getActiveTuning() {
    return this.tuningSystems[this.activeTuning];
  }

  /**
   * Get all tuning systems.
   * @returns {Object<string, TuningSystem>} All tuning systems
   */
  getAllTunings() {
    return { ...this.tuningSystems };
  }
}

export default MicrotonalEngine;
