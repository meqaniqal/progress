// Style Engine - Applies genre-specific musical rules and style profiles
// Based on melodygen_architecture.md: "Style profiles define genre-specific rules for harmony, rhythm, ornamentation"

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents a style profile with genre-specific rules.
 */
export class StyleProfile {
  /**
   * @param {string} id - Style identifier
   * @param {string} name - Human-readable name
   * @param {Object} rules - Style rules
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(id, name, rules, metadata = {}) {
    this.id = id;
    this.name = name;
    this.rules = rules;
    this.metadata = metadata;
  }
}

/**
 * Style Engine - Applies genre-specific musical rules and style profiles.
 * Supports baroque, classical, jazz, pop, and custom styles.
 */
export class StyleEngine {
  /**
   * @param {Object} options - Engine options
   */
  constructor(options = {}) {
    this.styleProfiles = this._createDefaultProfiles();
    this.activeStyle = options.activeStyle || 'classical';
    this.styleWeights = options.styleWeights || {};
  }

  /**
   * Create default style profiles.
   * @returns {Object<string, StyleProfile>} Default style profiles
   * @private
   */
  _createDefaultProfiles() {
    return {
      baroque: new StyleProfile(
        'baroque',
        'Baroque',
        {
          maxInterval: 12,
          preferredIntervals: [0, 2, 3, 5, 7],
          ornamentDensity: 0.4,
          allowSyncopation: false,
          preferStepwiseMotion: true,
          maxDuration: 2.0,
          minDuration: 0.25,
          chordToneEmphasis: true,
          allowChromaticism: false,
          preferConsonance: true,
        },
        { era: '1600-1750', characteristics: ['counterpoint', 'basso continuo', 'ornamentation'] }
      ),
      classical: new StyleProfile(
        'classical',
        'Classical',
        {
          maxInterval: 10,
          preferredIntervals: [0, 2, 3, 5, 7],
          ornamentDensity: 0.3,
          allowSyncopation: true,
          preferStepwiseMotion: true,
          maxDuration: 2.0,
          minDuration: 0.5,
          chordToneEmphasis: true,
          allowChromaticism: false,
          preferConsonance: true,
        },
        { era: '1750-1820', characteristics: ['balance', 'clarity', 'form'] }
      ),
      jazz: new StyleProfile(
        'jazz',
        'Jazz',
        {
          maxInterval: 14,
          preferredIntervals: [0, 2, 3, 5, 7, 10, 12],
          ornamentDensity: 0.5,
          allowSyncopation: true,
          preferStepwiseMotion: false,
          maxDuration: 3.0,
          minDuration: 0.25,
          chordToneEmphasis: false,
          allowChromaticism: true,
          preferConsonance: false,
        },
        { era: '1920-present', characteristics: ['swing', 'improvisation', 'extended chords'] }
      ),
      pop: new StyleProfile(
        'pop',
        'Pop',
        {
          maxInterval: 8,
          preferredIntervals: [0, 2, 3, 5, 7],
          ornamentDensity: 0.2,
          allowSyncopation: true,
          preferStepwiseMotion: true,
          maxDuration: 2.0,
          minDuration: 0.5,
          chordToneEmphasis: true,
          allowChromaticism: false,
          preferConsonance: true,
        },
        { era: '1950-present', characteristics: ['catchy', 'repetitive', 'accessible'] }
      ),
    };
  }

  /**
   * Execute Style Engine: Apply style rules to notes.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Style transformation result
   */
  async execute(config, previousNotes, context = {}) {
    const style = this.styleProfiles[this.activeStyle];
    if (!style) {
      throw new Error(`Unknown style: ${this.activeStyle}`);
    }

    const styledNotes = this._applyStyleRules(previousNotes, style);
    const score = this._calculateStyleComplianceScore(styledNotes, style);

    return new PassResult(
      'StyleEngine',
      styledNotes,
      new EvaluationMetrics(
        'StyleEngine',
        score,
        [],
        true
      ),
      {
        activeStyle: this.activeStyle,
        styleProfile: style,
        noteCount: styledNotes.length,
      }
    );
  }

  /**
   * Apply style rules to notes.
   * @param {MelodyNote[]} notes - Notes to style
   * @param {StyleProfile} style - Style profile
   * @returns {MelodyNote[]} Styled notes
   * @private
   */
  _applyStyleRules(notes, style) {
    const styled = [];

    for (const note of notes) {
      const styledNote = this._applyIntervalConstraints(note, style);
      const durationAdjusted = this._applyDurationConstraints(styledNote, style);
      const ornamented = this._applyOrnamentationRules(durationAdjusted, style);

      styled.push(ornamented);
    }

    return styled;
  }

  /**
   * Apply interval constraints based on style.
   * @param {MelodyNote} note - Note to constrain
   * @param {StyleProfile} style - Style profile
   * @returns {MelodyNote} Constrained note
   * @private
   */
  _applyIntervalConstraints(note, style) {
    const maxInterval = style.rules.maxInterval;

    // Check interval with previous note
    const prevNote = this._findPreviousNote(note);
    if (prevNote) {
      const interval = Math.abs(note.pitch - prevNote.pitch);
      if (interval > maxInterval) {
        // Adjust pitch to fit within max interval
        const adjustedPitch = prevNote.pitch + (note.pitch > prevNote.pitch ? maxInterval : -maxInterval);
        return new MelodyNote(
          adjustedPitch,
          note.startTime,
          note.duration,
          note.role,
          {
            ...note.metadata,
            styleAdjusted: true,
            styleId: style.id,
          }
        );
      }
    }

    return note;
  }

  /**
   * Apply duration constraints based on style.
   * @param {MelodyNote} note - Note to constrain
   * @param {StyleProfile} style - Style profile
   * @returns {MelodyNote} Duration-constrained note
   * @private
   */
  _applyDurationConstraints(note, style) {
    const { maxDuration, minDuration } = style.rules;
    let duration = note.duration;

    if (duration > maxDuration) {
      duration = maxDuration;
    } else if (duration < minDuration) {
      duration = minDuration;
    }

    return new MelodyNote(
      note.pitch,
      note.startTime,
      duration,
      note.role,
      {
        ...note.metadata,
        styleAdjusted: true,
        styleId: style.id,
      }
    );
  }

  /**
   * Apply ornamentation rules based on style.
   * @param {MelodyNote} note - Note to ornament
   * @param {StyleProfile} style - Style profile
   * @returns {MelodyNote} Ornamented note
   * @private
   */
  _applyOrnamentationRules(note, style) {
    const ornamentDensity = style.rules.ornamentDensity;

    if (Math.random() < ornamentDensity) {
      const ornamentType = this._selectOrnamentType(style);
      const ornamentedNote = this._applyOrnament(note, ornamentType);
      return new MelodyNote(
        ornamentedNote.pitch,
        ornamentedNote.startTime,
        ornamentedNote.duration,
        note.role,
        {
          ...note.metadata,
          styleAdjusted: true,
          styleId: style.id,
          ornamentType,
        }
      );
    }

    return note;
  }

  /**
   * Select ornament type based on style.
   * @param {StyleProfile} style - Style profile
   * @returns {string} Ornament type
   * @private
   */
  _selectOrnamentType(style) {
    switch (style.id) {
      case 'baroque':
        return ['grace note', 'trill', 'turn'][Math.floor(Math.random() * 3)];
      case 'classical':
        return ['grace note', 'turn'][Math.floor(Math.random() * 2)];
      case 'jazz':
        return ['blue note', 'slide', 'glissando'][Math.floor(Math.random() * 3)];
      case 'pop':
        return ['grace note'][0];
      default:
        return 'grace note';
    }
  }

  /**
   * Apply ornament to a note.
   * @param {MelodyNote} note - Base note
   * @param {string} ornamentType - Ornament type
   * @returns {MelodyNote} Ornamented note
   * @private
   */
  _applyOrnament(note, ornamentType) {
    switch (ornamentType) {
      case 'grace note':
        return new MelodyNote(
          note.pitch - 1,
          note.startTime - 0.1,
          0.1,
          'ornament',
          {
            styleAdjusted: true,
            styleId: note.metadata?.styleId || 'unknown',
            ornamentType,
          }
        );
      case 'trill':
        return new MelodyNote(
          note.pitch + 2,
          note.startTime,
          note.duration * 0.5,
          'ornament',
          {
            styleAdjusted: true,
            styleId: note.metadata?.styleId || 'unknown',
            ornamentType,
          }
        );
      case 'turn':
        return new MelodyNote(
          note.pitch + 1,
          note.startTime + note.duration * 0.5,
          note.duration * 0.5,
          'ornament',
          {
            styleAdjusted: true,
            styleId: note.metadata?.styleId || 'unknown',
            ornamentType,
          }
        );
      case 'blue note':
        return new MelodyNote(
          note.pitch - 1,
          note.startTime,
          note.duration,
          note.role,
          {
            styleAdjusted: true,
            styleId: note.metadata?.styleId || 'unknown',
            ornamentType,
          }
        );
      case 'slide':
      case 'glissando':
        return new MelodyNote(
          note.pitch + 2,
          note.startTime,
          note.duration,
          note.role,
          {
            styleAdjusted: true,
            styleId: note.metadata?.styleId || 'unknown',
            ornamentType,
          }
        );
      default:
        return note;
    }
  }

  /**
   * Find the previous note in the sequence.
   * @param {MelodyNote} note - Current note
   * @returns {MelodyNote|null} Previous note or null
   * @private
   */
  _findPreviousNote(note) {
    // This would be called within context of a sorted notes array
    // For now, return null (no previous note found)
    return null;
  }

  /**
   * Calculate style compliance score.
   * @param {MelodyNote[]} notes - All notes
   * @param {StyleProfile} style - Style profile
   * @returns {number} Compliance score (0.0-1.0)
   * @private
   */
  _calculateStyleComplianceScore(notes, style) {
    if (notes.length === 0) return 0.5;

    const maxInterval = style.rules.maxInterval;
    const compliantNotes = notes.filter((note) => {
      const prevNote = this._findPreviousNote(note);
      if (!prevNote) return true;
      return Math.abs(note.pitch - prevNote.pitch) <= maxInterval;
    });

    return compliantNotes.length / notes.length;
  }

  /**
   * Set active style.
   * @param {string} styleId - Style identifier
   */
  setActiveStyle(styleId) {
    if (!this.styleProfiles[styleId]) {
      throw new Error(`Unknown style: ${styleId}`);
    }
    this.activeStyle = styleId;
  }

  /**
   * Get active style profile.
   * @returns {StyleProfile} Active style profile
   */
  getActiveStyle() {
    return this.styleProfiles[this.activeStyle];
  }

  /**
   * Get all style profiles.
   * @returns {Object<string, StyleProfile>} All style profiles
   */
  getAllStyles() {
    return { ...this.styleProfiles };
  }
}

export default StyleEngine;
