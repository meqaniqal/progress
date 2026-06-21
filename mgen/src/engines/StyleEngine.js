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

    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);
    const styledNotes = this._applyStyleRules(previousNotes, style, sortedNotes);
    const score = this._calculateStyleComplianceScore(styledNotes, style, sortedNotes);

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
  _applyStyleRules(notes, style, sortedNotes) {
    const styled = [];

    for (const note of notes) {
      const styledNote = this._applyIntervalConstraints(note, style, sortedNotes);
      const durationAdjusted = this._applyDurationConstraints(styledNote, style);
      const ornamented = this._applyOrnamentationRules(durationAdjusted, style);

      if (Array.isArray(ornamented)) {
        styled.push(...ornamented);
      } else {
        styled.push(ornamented);
      }
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
  _applyIntervalConstraints(note, style, sortedNotes) {
    const maxInterval = style.rules.maxInterval;

    // Check interval with previous note
    const prevNote = this._findPreviousNote(note, sortedNotes);
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

  _applyOrnamentationRules(note, style) {
    const ornamentDensity = style.rules.ornamentDensity;

    if (Math.random() < ornamentDensity) {
      const ornamentType = this._selectOrnamentType(style);
      return this._applyOrnament(note, ornamentType, style);
    }

    return [note];
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

  _applyOrnament(note, ornamentType, style) {
    switch (ornamentType) {
      case 'grace note':
        const grace = new MelodyNote(
          note.pitch - 1,
          note.startTime - 0.1,
          0.1,
          'ornament',
          {
            styleAdjusted: true,
            styleId: style.id,
            ornamentType,
            ornamentsNote: note.pitch,
          }
        );
        return [grace, note];
      case 'trill':
        const trill1 = new MelodyNote(
          note.pitch + 2,
          note.startTime,
          note.duration * 0.5,
          'ornament',
          {
            styleAdjusted: true,
            styleId: style.id,
            ornamentType,
            ornamentsNote: note.pitch,
          }
        );
        const trill2 = new MelodyNote(
          note.pitch,
          note.startTime + note.duration * 0.5,
          note.duration * 0.5,
          note.role,
          note.metadata
        );
        return [trill1, trill2];
      case 'turn':
        const baseHalf = new MelodyNote(
          note.pitch,
          note.startTime,
          note.duration * 0.5,
          note.role,
          note.metadata
        );
        const turnHalf = new MelodyNote(
          note.pitch + 1,
          note.startTime + note.duration * 0.5,
          note.duration * 0.5,
          'ornament',
          {
            styleAdjusted: true,
            styleId: style.id,
            ornamentType,
            ornamentsNote: note.pitch,
          }
        );
        return [baseHalf, turnHalf];
      case 'blue note':
        return [
          new MelodyNote(
            note.pitch - 1,
            note.startTime,
            note.duration,
            note.role,
            {
              styleAdjusted: true,
              styleId: style.id,
              ornamentType,
              ornamentsNote: note.pitch,
            }
          )
        ];
      case 'slide':
      case 'glissando':
        return [
          new MelodyNote(
            note.pitch + 2,
            note.startTime,
            note.duration,
            note.role,
            {
              styleAdjusted: true,
              styleId: style.id,
              ornamentType,
              ornamentsNote: note.pitch,
            }
          )
        ];
      default:
        return [note];
    }
  }

  /**
   * Find the previous note in the sequence.
   * Fixed 2026-06-19: Previously always returned null, meaning StyleEngine's
   * interval constraints were never applied. Now looks up the previous note
   * from the sorted notes array passed via context.
   * @param {MelodyNote} note - Current note
   * @param {MelodyNote[]} [sortedNotes] - Sorted notes array (from context)
   * @returns {MelodyNote|null} Previous note or null
   * @private
   */
  _findPreviousNote(note, sortedNotes) {
    if (!sortedNotes || sortedNotes.length === 0) return null;
    const idx = sortedNotes.findIndex(n => n.startTime === note.startTime);
    if (idx <= 0) return null;
    return sortedNotes[idx - 1];
  }

  /**
   * Calculate style compliance score.
   * @param {MelodyNote[]} notes - All notes
   * @param {StyleProfile} style - Style profile
   * @returns {number} Compliance score (0.0-1.0)
   * @private
   */
  _calculateStyleComplianceScore(notes, style, sortedNotes) {
    if (notes.length === 0) return 0.5;

    const maxInterval = style.rules.maxInterval;
    const compliantNotes = notes.filter((note) => {
      const prevNote = this._findPreviousNote(note, sortedNotes);
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
