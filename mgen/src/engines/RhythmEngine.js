// Rhythm Engine - Controls note density, duration patterns, and rhythmic identity
// Based on melodygen_architecture.md: "Style may influence Rhythmic Language"
// and melodygen_current_implementation.md: generatePhraseSubdivisions / generateRhythmTemplate

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents a rhythmic template — a 16-step sixteenth-note grid
 * where 1 = note plays, 0 = rest.
 */
export class RhythmTemplate {
  /**
   * @param {string} id - Template identifier
   * @param {string} name - Human-readable name
   * @param {number[]} grid - 16-element array of 0/1 values
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(id, name, grid, metadata = {}) {
    this.id = id;
    this.name = name;
    this.grid = [...grid];
    this.metadata = metadata;
  }

  /**
   * Returns the number of active (played) steps in this template.
   * @returns {number}
   */
  get activityLevel() {
    return this.grid.reduce((sum, v) => sum + v, 0);
  }

  /**
   * Returns the template as a string for logging (e.g., "1.0.1.0.1.0.1.0.").
   * @returns {string}
   */
  toString() {
    return this.grid.map(v => (v ? '1' : '.')).join('');
  }
}

/**
 * Represents a subdivision profile — how a measure is subdivided
 * into rhythmic units (1 = sixteenth, 2 = eighth, 3 = dotted eighth, etc.).
 */
export class SubdivisionProfile {
  /**
   * @param {string} id - Profile identifier
   * @param {string} name - Human-readable name
   * @param {number[]} subdivisions - 16-element array of subdivision multipliers
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(id, name, subdivisions, metadata = {}) {
    this.id = id;
    this.name = name;
    this.subdivisions = [...subdivisions];
    this.metadata = metadata;
  }
}

/**
 * Rhythm Engine - Controls note density, duration patterns, and rhythmic identity.
 *
 * Operates on MelodyNote[] to adjust timing and duration properties
 * without altering pitch content. Works with aesthetic modes and
 * genre-specific rhythmic languages.
 *
 * Implements concepts from the Progress app's melodyRhythm.js:
 * - 16-step sixteenth-note grid templates per aesthetic mode
 * - Phrase subdivision profiles (acceleration, deceleration, syncopation, triplet swing)
 * - Density control (sparse to dense)
 */
export class RhythmEngine {
  /**
   * @param {Object} [options] - Engine options
   * @param {string} [options.aestheticMode='cantabile'] - Aesthetic mode affecting rhythm templates
   * @param {string} [options.genre='none'] - Genre affecting subdivision profiles
   * @param {number} [options.density=0.5] - Target note density (0.0-1.0)
   * @param {number} [options.stepsPerMeasure=16] - Sixteenth steps per measure (default 16)
   * @param {number} [options.chordSlotDuration=4] - Duration of each chord in beats
   */
   constructor(options = {}) {
     this.aestheticMode = options.aestheticMode || 'cantabile';
     this.genre = options.genre || 'none';
     this.density = options.density ?? 0.5;
     this.stepsPerMeasure = options.stepsPerMeasure || 16;
     this.chordSlotDuration = options.chordSlotDuration || 4;
     this.templates = this._createDefaultTemplates();
     this.subdivisionProfiles = this._createDefaultSubdivisionProfiles();
     this._cachedProfiles = {}; // Cache subdivision profiles per genre for determinism
   }

  /**
   * Create default rhythm templates per aesthetic mode.
   * Mirrors the TEMPLATES from melodyRhythm.js in the Progress app.
   * @returns {Object<string, RhythmTemplate[]>}
   * @private
   */
  _createDefaultTemplates() {
    return {
      cantabile: [
        new RhythmTemplate('cantabile_1', 'Gentle flowing', [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0]),
        new RhythmTemplate('cantabile_2', 'Steady pulse', [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0]),
        new RhythmTemplate('cantabile_3', 'Simple statement', [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        new RhythmTemplate('cantabile_4', 'Syncopated gentle', [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      ],
      declamatory: [
        new RhythmTemplate('declamatory_1', 'Strong declarative', [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0]),
        new RhythmTemplate('declamatory_2', 'Punctuated', [1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0]),
        new RhythmTemplate('declamatory_3', 'Rhythmic drive', [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0]),
      ],
      sighs: [
        new RhythmTemplate('sighs_1', 'Descending sigh', [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]),
        new RhythmTemplate('sighs_2', 'Sparse lament', [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
      ],
      virtuoso: [
        new RhythmTemplate('virtuoso_1', 'Continuous flow', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
        new RhythmTemplate('virtuoso_2', 'Rhythmic energy', [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0]),
        new RhythmTemplate('virtuoso_3', 'Driving pulse', [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]),
      ],
    };
  }

  /**
   * Create default subdivision profiles per genre.
   * Mirrors the profiles from generatePhraseSubdivisions in melodyRhythm.js.
   * @returns {Object<string, SubdivisionProfile[]>}
   * @private
   */
  _createDefaultSubdivisionProfiles() {
    return {
      none: [new SubdivisionProfile('uniform', 'Uniform', Array(16).fill(4))],
      acceleration: new SubdivisionProfile('acceleration', 'Acceleration', this._genAcceleration()),
      deceleration: new SubdivisionProfile('deceleration', 'Deceleration', this._genDeceleration()),
      syncopatedAlternation: new SubdivisionProfile('syncopatedAlternation', 'Syncopated Alternation', this._genSyncopatedAlternation()),
      tripletSwing: new SubdivisionProfile('tripletSwing', 'Triplet Swing', this._genTripletSwing()),
    };
  }

  /**
   * Generate acceleration subdivision profile.
   * @returns {number[]}
   * @private
   */
  _genAcceleration() {
    const subs = [];
    for (let i = 0; i < 16; i++) {
      if (i < 4) {
        subs.push(Math.random() < 0.7 ? 2 : 1);
      } else if (i < 9) {
        subs.push(Math.random() < 0.6 ? 4 : 3);
      } else if (i < 13) {
        const roll = Math.random();
        subs.push(roll < 0.3 ? 6 : (roll < 0.6 ? 8 : (roll < 0.8 ? 12 : 16)));
      } else {
        subs.push(Math.random() < 0.7 ? 2 : 1);
      }
    }
    return subs;
  }

  /**
   * Generate deceleration subdivision profile.
   * @returns {number[]}
   * @private
   */
  _genDeceleration() {
    const subs = [];
    for (let i = 0; i < 16; i++) {
      if (i < 6) {
        const roll = Math.random();
        subs.push(roll < 0.3 ? 4 : (roll < 0.6 ? 6 : (roll < 0.8 ? 8 : 12)));
      } else if (i < 12) {
        subs.push(Math.random() < 0.6 ? 3 : 2);
      } else {
        subs.push(1);
      }
    }
    return subs;
  }

  /**
   * Generate syncopated alternation subdivision profile.
   * @returns {number[]}
   * @private
   */
  _genSyncopatedAlternation() {
    const subs = [];
    for (let i = 0; i < 16; i++) {
      subs.push(i % 2 === 0 ? 2 : (Math.random() < 0.35 ? 8 : 4));
    }
    return subs;
  }

  /**
   * Generate triplet swing subdivision profile.
   * @returns {number[]}
   * @private
   */
  _genTripletSwing() {
    const subs = [];
    for (let i = 0; i < 16; i++) {
      const roll = Math.random();
      subs.push(roll < 0.5 ? 3 : (roll < 0.85 ? 6 : 12));
    }
    return subs;
  }

  /**
   * Execute Rhythm Engine: Apply rhythmic transformations to notes.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Rhythm transformation result
   */
  async execute(config, previousNotes, context = {}) {
    const rhythmicNotes = this._applyRhythmTransformations(previousNotes, config);
    const score = this._calculateRhythmQualityScore(rhythmicNotes, config);

    return new PassResult(
      'RhythmEngine',
      rhythmicNotes,
      new EvaluationMetrics(
        'RhythmEngine',
        score,
        [],
        true
      ),
      {
        activeTemplate: this._getActiveTemplate(),
        subdivisionProfile: this._getActiveSubdivisionProfile(),
        noteCount: rhythmicNotes.length,
        density: this.density,
      }
    );
  }

  /**
   * Apply rhythmic transformations to notes.
   * @param {MelodyNote[]} notes - Notes to transform
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]} Rhythmically transformed notes
   * @private
   */
  _applyRhythmTransformations(notes, config) {
    if (notes.length === 0) return notes;

    const transformed = [];
    const template = this._getActiveTemplate();
    const subdivisionProfile = this._getActiveSubdivisionProfile();

    for (const note of notes) {
      const transformedNote = this._adjustNoteRhythm(note, template, subdivisionProfile, config);
      transformed.push(transformedNote);
    }

    return transformed;
  }

  /**
   * Adjust a single note's rhythm based on template and subdivision profile.
   * @param {MelodyNote} note - Note to adjust
   * @param {RhythmTemplate} template - Active rhythm template
   * @param {SubdivisionProfile} subdivisionProfile - Active subdivision profile
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote} Rhythm-adjusted note
   * @private
   */
  _adjustNoteRhythm(note, template, subdivisionProfile, config) {
    const sixteenthStep = this._noteToSixteenthStep(note);
    const templateIndex = sixteenthStep % this.stepsPerMeasure;
    const templateHit = template.grid[templateIndex];

    // Density roll: only play if within density threshold
    const densityRoll = Math.random() < this.density;

    // If template says rest and density roll fails, return a rest (duration 0)
    if (!templateHit || !densityRoll) {
      return new MelodyNote(
        note.pitch,
        note.startTime,
        0,
        note.role,
        {
          ...note.metadata,
          rhythmAdjusted: true,
          rhythmEngine: 'RhythmEngine',
          templateId: template.id,
          templateHit: templateHit,
          densityRoll: densityRoll,
          reason: !templateHit ? 'templateRest' : 'densityExcluded',
        }
      );
    }

    // Adjust duration based on subdivision profile
    const subIndex = sixteenthStep % this.stepsPerMeasure;
    const subdivision = subdivisionProfile.subdivisions[subIndex] || 4;
    const adjustedDuration = this._calculateDurationFromSubdivision(note.duration, subdivision);

    return new MelodyNote(
      note.pitch,
      note.startTime,
      adjustedDuration,
      note.role,
      {
        ...note.metadata,
        rhythmAdjusted: true,
        rhythmEngine: 'RhythmEngine',
        templateId: template.id,
        subdivisionId: subdivisionProfile.id,
        subdivision: subdivision,
        templateHit: templateHit,
      }
    );
  }

  /**
   * Convert a note's startTime to a sixteenth-step index within a measure.
   * @param {MelodyNote} note - Note to convert
   * @returns {number} Sixteenth step index (0-15)
   * @private
   */
  _noteToSixteenthStep(note) {
    const measureStart = Math.floor(note.startTime / this.chordSlotDuration) * this.chordSlotDuration;
    const offsetInMeasure = note.startTime - measureStart;
    return Math.round((offsetInMeasure / this.chordSlotDuration) * this.stepsPerMeasure) % this.stepsPerMeasure;
  }

  /**
   * Calculate adjusted duration from subdivision value.
   * Higher subdivision = shorter notes (more subdivided).
   * @param {number} baseDuration - Original note duration in beats
   * @param {number} subdivision - Subdivision multiplier (1=sixteenth, 2=eighth, 4=quarter, etc.)
   * @returns {number} Adjusted duration
   * @private
   */
  _calculateDurationFromSubdivision(baseDuration, subdivision) {
    // Scale duration inversely with subdivision
    const scaledDuration = baseDuration / (subdivision / 4);
    return Math.max(0.125, Math.min(baseDuration, scaledDuration));
  }

  /**
   * Get the active rhythm template for the current aesthetic mode.
   * @returns {RhythmTemplate}
   * @private
   */
  _getActiveTemplate() {
    const templates = this.templates[this.aestheticMode];
    if (!templates || templates.length === 0) {
      return this.templates.cantabile[0];
    }
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Get the active subdivision profile for the current genre.
   * @returns {SubdivisionProfile}
   * @private
   */
  _getActiveSubdivisionProfile() {
    const genreMap = {
      'none': 'none',
      'blues': 'tripletSwing',
      'jazz': 'tripletSwing',
      'classical': 'deceleration',
      'minimal': 'none',
      'african': 'syncopatedAlternation'
    };

    const targetGenre = genreMap[this.genre] || this.genre;
    if (targetGenre === 'none') {
      return this.subdivisionProfiles.none[0];
    }

    const profiles = this.subdivisionProfiles[targetGenre];
    if (!profiles) {
      return this.subdivisionProfiles.acceleration;
    }

    // For genre profiles that are single SubdivisionProfile objects (not arrays),
    // regenerate to get fresh random subdivisions
    if (profiles instanceof SubdivisionProfile) {
      return new SubdivisionProfile(
        profiles.id,
        profiles.name,
        this._regenerateProfileForGenre(targetGenre)
      );
    }

    // For arrays (none), pick one
    return profiles[Math.floor(Math.random() * profiles.length)];
  }

  /**
   * Regenerate subdivision profile for a specific genre.
   * @param {string} genre - Genre name
   * @returns {number[]}
   * @private
   */
  _regenerateProfileForGenre(genre) {
    // Fixed 2026-06-19: Cache profiles per genre for deterministic output.
    // Previously called on every execution, producing different subdivision
    // profiles each time for the same genre.
    if (this._cachedProfiles[genre]) {
      return this._cachedProfiles[genre];
    }
    let profile;
    switch (genre) {
      case 'acceleration':
        profile = this._genAcceleration();
        break;
      case 'deceleration':
        profile = this._genDeceleration();
        break;
      case 'syncopatedAlternation':
        profile = this._genSyncopatedAlternation();
        break;
      case 'tripletSwing':
        profile = this._genTripletSwing();
        break;
      default:
        profile = Array(16).fill(4);
        break;
    }
    this._cachedProfiles[genre] = profile;
    return profile;
  }

  /**
   * Calculate rhythm quality score.
   * @param {MelodyNote[]} notes - All notes
   * @param {GenerationConfig} config - Generation configuration
   * @returns {number} Quality score (0.0-1.0)
   * @private
   */
  _calculateRhythmQualityScore(notes, config) {
    if (notes.length === 0) return 0.5;

    const activeNotes = notes.filter(n => n.metadata && n.metadata.rhythmAdjusted);
    const activeRatio = activeNotes.length / notes.length;

    // Score based on:
    // 1. How many notes were rhythmically adjusted (higher = better)
    // 2. How well the rhythm matches the target density
    const actualDensity = activeNotes.filter(n => n.duration > 0).length / Math.max(1, notes.length);
    const densityMatch = 1.0 - Math.abs(this.density - actualDensity);

    // Template adherence: notes that hit template positions
    const templateHits = activeNotes.filter(n => n.metadata && n.metadata.templateHit).length;
    const templateAdherence = templateHits / Math.max(1, activeNotes.length);

    // Weighted combination
    const score = (activeRatio * 0.3) + (densityMatch * 0.4) + (templateAdherence * 0.3);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Set the active aesthetic mode.
   * @param {string} mode - Aesthetic mode: 'cantabile', 'declamatory', 'sighs', 'virtuoso'
   */
  setAestheticMode(mode) {
    if (!this.templates[mode]) {
      throw new Error(`Unknown aesthetic mode: ${mode}. Available: ${Object.keys(this.templates).join(', ')}`);
    }
    this.aestheticMode = mode;
  }

  /**
   * Get the active aesthetic mode.
   * @returns {string}
   */
  getAestheticMode() {
    return this.aestheticMode;
  }

  /**
   * Set the active genre for subdivision profiles.
   * @param {string} genre - Genre name
   */
  setGenre(genre) {
    this.genre = genre;
  }

  /**
   * Get the active genre.
   * @returns {string}
   */
  getGenre() {
    return this.genre;
  }

  /**
   * Set target note density.
   * @param {number} density - Target density (0.0-1.0)
   */
  setDensity(density) {
    this.density = Math.max(0, Math.min(1, density));
  }

  /**
   * Get current target density.
   * @returns {number}
   */
  getDensity() {
    return this.density;
  }

  /**
   * Get all available rhythm templates.
   * @returns {Object<string, RhythmTemplate[]>}
   */
  getAllTemplates() {
    const result = {};
    for (const [mode, templates] of Object.entries(this.templates)) {
      result[mode] = templates.map(t => ({
        id: t.id,
        name: t.name,
        grid: t.grid,
        activityLevel: t.activityLevel,
        gridString: t.toString(),
      }));
    }
    return result;
  }

  /**
   * Get all available subdivision profiles.
   * @returns {Object<string, SubdivisionProfile[]>}
   */
  getAllSubdivisionProfiles() {
    const result = {};
    for (const [genre, profiles] of Object.entries(this.subdivisionProfiles)) {
      if (profiles instanceof SubdivisionProfile) {
        result[genre] = [profiles];
      } else {
        result[genre] = profiles;
      }
    }
    return result;
  }
}

export default RhythmEngine;
