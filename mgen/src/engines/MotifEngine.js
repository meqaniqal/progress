// Motif Engine - Maintains melodic identity through motif families and transformations
// Based on melodygen_architecture.md: "Motifs are never discarded. They are transformed."

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents a motif family with its transformations.
 */
export class MotifFamily {
  /**
   * @param {string} id - Unique motif identifier
   * @param {MelodyNote[]} notes - Original motif notes
   * @param {string} [name] - Human-readable name
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(id, notes, name = null, metadata = {}) {
    this.id = id;
    this.notes = notes;
    this.name = name;
    this.metadata = metadata;
    this.transformations = [];
  }

  addTransformation(transformation) {
    this.transformations.push(transformation);
  }
}

/**
 * Represents a motif transformation.
 */
export class MotifTransformation {
  /**
   * @param {string} type - Transformation type: 'transposition', 'sequence', 'inversion',
   *                        'retrograde', 'augmentation', 'diminution', 'expansion',
   *                        'compression', 'fragmentation', 'ornamentation', 'combination'
   * @param {Object} parameters - Transformation parameters
   */
  constructor(type, parameters = {}) {
    this.type = type;
    this.parameters = parameters;
  }
}

/**
 * Motif Engine - Maintains melodic identity through motif families and transformations.
 * Implements developing-variation principles: recognizable but never static.
 */
export class MotifEngine {
  /**
   * @param {Object} options - Engine options
   * @param {number} [options.minMotifLength=3] - Minimum notes per motif
   * @param {number} [options.maxMotifLength=8] - Maximum notes per motif
   * @param {number} [options.transformProbability=0.7] - Probability of applying transformation
   * @param {string[]} [options.allowedTransformations=['transposition', 'sequence', 'inversion', 'retrograde', 'augmentation', 'diminution']]
   */
  constructor(options = {}) {
    this.minMotifLength = options.minMotifLength || 3;
    this.maxMotifLength = options.maxMotifLength || 8;
    this.transformProbability = options.transformProbability || 0.7;
    this.allowedTransformations = options.allowedTransformations || [
      'transposition',
      'sequence',
      'inversion',
      'retrograde',
      'augmentation',
      'diminution',
    ];
    this.motifFamilies = [];
    this.motifIdCounter = 0;
  }

  /**
   * Execute Motif Engine: Extract motif families and generate transformations.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Motif transformation result
   */
  async execute(config, previousNotes, context = {}) {
    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);
    const motifFamilies = this._extractMotifFamilies(sortedNotes);
    const transformedNotes = this._applyTransformations(motifFamilies, config, previousNotes);

    this.motifFamilies = motifFamilies;

    return new PassResult(
      'MotifEngine',
      transformedNotes,
      new EvaluationMetrics(
        'MotifEngine',
        this._calculateMotifCoherenceScore(transformedNotes, motifFamilies),
        [],
        true
      ),
      {
        motifFamilies,
        motifCount: motifFamilies.length,
        transformationCount: transformedNotes.length - previousNotes.length,
      }
    );
  }

  /**
   * Extract motif families from structural notes.
   * Groups notes into recognizable melodic cells.
   * @param {MelodyNote[]} notes - Sorted notes
   * @returns {MotifFamily[]} Extracted motif families
   * @private
   */
  _extractMotifFamilies(notes) {
    const families = [];
    const structuralNotes = notes.filter((n) => n.role === 'structural');

    if (structuralNotes.length < this.minMotifLength) {
      return families;
    }

    // Extract motifs from consecutive structural notes
    for (let i = 0; i <= structuralNotes.length - this.minMotifLength; i++) {
      const motifLength = Math.min(
        this.maxMotifLength,
        structuralNotes.length - i
      );

      const motifNotes = structuralNotes.slice(i, i + motifLength);
      const intervals = this._calculateIntervals(motifNotes);

      // Check if this motif is distinct from existing families
      if (!this._isDuplicateMotif(intervals, families)) {
        const motifId = `motif_${this.motifIdCounter++}`;
        const family = new MotifFamily(motifId, motifNotes, `Motif ${this.motifIdCounter}`);
        families.push(family);
      }
    }

    return families;
  }

  /**
   * Calculate pitch intervals between consecutive notes.
   * @param {MelodyNote[]} notes - Notes to analyze
   * @returns {number[]} Interval sequence
   * @private
   */
  _calculateIntervals(notes) {
    const intervals = [];
    for (let i = 1; i < notes.length; i++) {
      intervals.push(notes[i].pitch - notes[i - 1].pitch);
    }
    return intervals;
  }

  /**
   * Check if a motif interval sequence is already represented.
   * @param {number[]} intervals - Interval sequence to check
   * @param {MotifFamily[]} families - Existing motif families
   * @returns {boolean} True if duplicate
   * @private
   */
  _isDuplicateMotif(intervals, families) {
    for (const family of families) {
      const existingIntervals = this._calculateIntervals(family.notes);
      if (this._intervalsMatch(intervals, existingIntervals)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Compare two interval sequences for equivalence.
   * @param {number[]} a - First interval sequence
   * @param {number[]} b - Second interval sequence
   * @returns {boolean} True if intervals match
   * @private
   */
  _intervalsMatch(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }

  /**
   * Apply transformations to motif families.
   * @param {MotifFamily[]} families - Motif families
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Previous notes
   * @returns {MelodyNote[]} Transformed notes
   * @private
   */
  _applyTransformations(families, config, previousNotes) {
    const transformedNotes = [];

    for (const family of families) {
      if (Math.random() < this.transformProbability) {
        const transformation = this._selectTransformation(family);
        const transformedMotif = this._applyTransformation(family, transformation);
        transformedNotes.push(...transformedMotif);
      } else {
        transformedNotes.push(...family.notes);
      }
    }

    // Add original notes for continuity
    transformedNotes.push(...previousNotes);

    return transformedNotes;
  }

  /**
   * Select a random transformation from allowed types.
   * @param {MotifFamily} family - Motif family
   * @returns {MotifTransformation} Selected transformation
   * @private
   */
  _selectTransformation(family) {
    const type = this.allowedTransformations[
      Math.floor(Math.random() * this.allowedTransformations.length)
    ];
    const transformation = new MotifTransformation(type, this._generateTransformationParams(type, family));
    family.addTransformation(transformation);
    return transformation;
  }

  /**
   * Generate transformation parameters based on type.
   * @param {string} type - Transformation type
   * @param {MotifFamily} family - Motif family
   * @returns {Object} Transformation parameters
   * @private
   */
  _generateTransformationParams(type, family) {
    switch (type) {
      case 'transposition':
        return { semitones: [3, 5, 7][Math.floor(Math.random() * 3)] };
      case 'sequence':
        return { stepSize: [2, 3, 5][Math.floor(Math.random() * 3)] };
      case 'inversion':
        return { axisPitch: family.notes[0].pitch };
      case 'retrograde':
        return {};
      case 'augmentation':
        return { multiplier: 2 };
      case 'diminution':
        return { divisor: 2 };
      default:
        return {};
    }
  }

  /**
   * Apply a specific transformation to a motif family.
   * @param {MotifFamily} family - Motif family
   * @param {MotifTransformation} transformation - Transformation to apply
   * @returns {MelodyNote[]} Transformed notes
   * @private
   */
  _applyTransformation(family, transformation) {
    switch (transformation.type) {
      case 'transposition':
        return this._applyTransposition(family, transformation.parameters.semitones);
      case 'sequence':
        return this._applySequence(family, transformation.parameters.stepSize);
      case 'inversion':
        return this._applyInversion(family, transformation.parameters.axisPitch);
      case 'retrograde':
        return this._applyRetrograde(family);
      case 'augmentation':
        return this._applyAugmentation(family, transformation.parameters.multiplier);
      case 'diminution':
        return this._applyDiminution(family, transformation.parameters.divisor);
      default:
        return family.notes;
    }
  }

  /**
   * Apply transposition (shift all pitches by interval).
   * @param {MotifFamily} family - Motif family
   * @param {number} semitones - Transposition interval
   * @returns {MelodyNote[]} Transposed notes
   * @private
   */
  _applyTransposition(family, semitones) {
    return family.notes.map((note) =>
      new MelodyNote(
        note.pitch + semitones,
        note.startTime,
        note.duration,
        'structural',
        {
          ...note.metadata,
          motifTransformation: 'transposition',
          transpositionSemitones: semitones,
          motifId: family.id,
        }
      )
    );
  }

  /**
   * Apply sequence (repeat motif at different pitch level).
   * @param {MotifFamily} family - Motif family
   * @param {number} stepSize - Step size for sequence
   * @returns {MelodyNote[]} Sequenced notes
   * @private
   */
  _applySequence(family, stepSize) {
    const basePitch = family.notes[0].pitch;
    const sequences = [];

    for (let i = 1; i <= 2; i++) {
      const offset = i * stepSize;
      sequences.push(
        ...family.notes.map((note) =>
          new MelodyNote(
            note.pitch + offset,
            note.startTime + i * 2,
            note.duration,
            'structural',
            {
              ...note.metadata,
              motifTransformation: 'sequence',
              sequenceLevel: i,
              motifId: family.id,
            }
          )
        )
      );
    }

    return sequences;
  }

  /**
   * Apply inversion (mirror intervals around axis).
   * @param {MotifFamily} family - Motif family
   * @param {number} axisPitch - Inversion axis pitch
   * @returns {MelodyNote[]} Inverted notes
   * @private
   */
  _applyInversion(family, axisPitch) {
    return family.notes.map((note, index) => {
      if (index === 0) {
        return new MelodyNote(note.pitch, note.startTime, note.duration, 'structural', {
          ...note.metadata,
          motifTransformation: 'inversion',
          motifId: family.id,
        });
      }

      const prevNote = family.notes[index - 1];
      const interval = note.pitch - prevNote.pitch;
      const invertedPitch = axisPitch - (note.pitch - axisPitch);

      return new MelodyNote(
        invertedPitch,
        note.startTime,
        note.duration,
        'structural',
        {
          ...note.metadata,
          motifTransformation: 'inversion',
          inversionAxis: axisPitch,
          motifId: family.id,
        }
      );
    });
  }

  /**
   * Apply retrograde (reverse note order).
   * @param {MotifFamily} family - Motif family
   * @returns {MelodyNote[]} Retrograded notes
   * @private
   */
  _applyRetrograde(family) {
    const reversed = [...family.notes].reverse();
    const baseTime = family.notes[family.notes.length - 1].startTime + 2;

    return reversed.map((note, index) =>
      new MelodyNote(
        note.pitch,
        baseTime + index * note.duration,
        note.duration,
        'structural',
        {
          ...note.metadata,
          motifTransformation: 'retrograde',
          motifId: family.id,
        }
      )
    );
  }

  /**
   * Apply augmentation (prolong durations).
   * @param {MotifFamily} family - Motif family
   * @param {number} multiplier - Duration multiplier
   * @returns {MelodyNote[]} Augmented notes
   * @private
   */
  _applyAugmentation(family, multiplier) {
    return family.notes.map((note) =>
      new MelodyNote(
        note.pitch,
        note.startTime,
        note.duration * multiplier,
        'structural',
        {
          ...note.metadata,
          motifTransformation: 'augmentation',
          augmentationMultiplier: multiplier,
          motifId: family.id,
        }
      )
    );
  }

  /**
   * Apply diminution (shorten durations).
   * @param {MotifFamily} family - Motif family
   * @param {number} divisor - Duration divisor
   * @returns {MelodyNote[]} Diminished notes
   * @private
   */
  _applyDiminution(family, divisor) {
    return family.notes.map((note) =>
      new MelodyNote(
        note.pitch,
        note.startTime,
        note.duration / divisor,
        'structural',
        {
          ...note.metadata,
          motifTransformation: 'diminution',
          diminutionDivisor: divisor,
          motifId: family.id,
        }
      )
    );
  }

  /**
   * Calculate motif coherence score.
   * @param {MelodyNote[]} notes - All notes
   * @param {MotifFamily[]} families - Motif families
   * @returns {number} Coherence score (0.0-1.0)
   * @private
   */
  _calculateMotifCoherenceScore(notes, families) {
    if (families.length === 0) return 0.5;

    const motifNotes = notes.filter((n) => n.metadata && n.metadata.motifId);
    const coherenceRatio = motifNotes.length / Math.max(1, notes.length);

    return Math.min(1.0, coherenceRatio * 1.5);
  }

  /**
   * Get all motif families.
   * @returns {MotifFamily[]} Motif families
   */
  getMotifFamilies() {
    return [...this.motifFamilies];
  }
}

export default MotifEngine;
