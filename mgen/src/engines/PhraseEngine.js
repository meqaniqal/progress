// Phrase Engine - Groups notes into phrases and manages phrase-level structure
// Based on melodygen_architecture.md: "Phrases are the highest level of musical organization"

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents a phrase with structural information.
 */
export class Phrase {
  /**
   * @param {string} id - Unique phrase identifier
   * @param {MelodyNote[]} notes - Notes belonging to this phrase
   * @param {PhraseContext} phraseContext - Phrase-level context
   * @param {number} [index] - Phrase index in the sequence
   */
  constructor(id, notes, phraseContext, index = 0) {
    this.id = id;
    this.notes = notes;
    this.phraseContext = phraseContext;
    this.index = index;
  }
}

/**
 * Phrase Engine - Groups notes into phrases and manages phrase-level structure.
 * Implements developing-variation principles at the phrase level:
 * statement → build → climax → release → resolution arcs.
 */
export class PhraseEngine {
  /**
   * @param {Object} options - Engine options
   * @param {number} [options.notesPerPhrase=8] - Target notes per phrase
   * @param {number} [options.maxPhraseDuration=16] - Maximum phrase duration in beats
   * @param {boolean} [options.antecedentConsequent=true] - Whether to generate antecedent-consequent phrase pairs
   */
  constructor(options = {}) {
    this.notesPerPhrase = options.notesPerPhrase || 8;
    this.maxPhraseDuration = options.maxPhraseDuration || 16;
    this.antecedentConsequent = options.antecedentConsequent !== false;
    this.phraseRoles = ['statement', 'build', 'climax', 'release', 'resolution'];
    this.phrases = [];
  }

  /**
   * Execute Phrase Engine: Group notes into phrases and assign phrase-level structure.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Phrase transformation result
   */
  async execute(config, previousNotes, context = {}) {
    if (previousNotes.length === 0) {
      return new PassResult(
        'PhraseEngine',
        [],
        new EvaluationMetrics('PhraseEngine', 0.5, [], true),
        {
          phrases: [],
          phraseCount: 0,
        }
      );
    }

    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);
    const phrases = this._groupIntoPhrases(sortedNotes, config);
    const phraseNotes = this._assignPhraseRoles(phrases, config);

    this.phrases = phrases;

    return new PassResult(
      'PhraseEngine',
      phraseNotes,
      new EvaluationMetrics(
        'PhraseEngine',
        this._calculatePhraseCoherenceScore(phrases),
        [],
        true
      ),
      {
        phrases,
        phraseCount: phrases.length,
        phraseRoles: phrases.map((p) => p.phraseContext.role),
      }
    );
  }

  /**
   * Group notes into phrases based on temporal proximity and role.
   * @param {MelodyNote[]} notes - Sorted notes
   * @param {GenerationConfig} config - Generation configuration
   * @returns {Phrase[]} Grouped phrases
   * @private
   */
  _groupIntoPhrases(notes, config) {
    const phrases = [];
    let currentPhraseNotes = [];
    let phraseStartTime = null;

    for (const note of notes) {
      // Start new phrase if gap is large enough or we've reached target size
      if (
        currentPhraseNotes.length > 0 &&
        (note.startTime - (currentPhraseNotes[currentPhraseNotes.length - 1].startTime + currentPhraseNotes[currentPhraseNotes.length - 1].duration) > 2.0 ||
          currentPhraseNotes.length >= this.notesPerPhrase ||
          (note.startTime - phraseStartTime) >= this.maxPhraseDuration)
      ) {
        if (currentPhraseNotes.length > 0) {
          phrases.push(this._createPhrase(currentPhraseNotes, phrases.length));
        }
        currentPhraseNotes = [];
        phraseStartTime = null;
      }

      if (currentPhraseNotes.length === 0) {
        phraseStartTime = note.startTime;
      }

      currentPhraseNotes.push(note);
    }

    // Don't forget the last phrase
    if (currentPhraseNotes.length > 0) {
      phrases.push(this._createPhrase(currentPhraseNotes, phrases.length));
    }

    return phrases;
  }

  /**
   * Create a phrase from a group of notes.
   * @param {MelodyNote[]} notes - Notes for this phrase
   * @param {number} index - Phrase index
   * @returns {Phrase} Created phrase
   * @private
   */
  _createPhrase(notes, index) {
    const phraseContext = this._determinePhraseContext(notes, index);
    return new Phrase(`phrase_${index}`, notes, phraseContext, index);
  }

  /**
   * Determine the phrase context based on notes and position.
   * @param {MelodyNote[]} notes - Notes in the phrase
   * @param {number} index - Phrase index
   * @param {GenerationConfig} config - Generation configuration
   * @returns {PhraseContext} Determined phrase context
   * @private
   */
  _determinePhraseContext(notes, index) {
    const phraseRole = this.phraseRoles[index % this.phraseRoles.length];

    // Calculate tension based on pitch range and interval complexity
    const pitches = notes.map((n) => n.pitch);
    const pitchRange = Math.max(...pitches) - Math.min(...pitches);
    const tensionLevel = this._calculateTensionLevel(notes, pitchRange);

    // Determine register target based on phrase role
    let registerTarget = null;
    if (phraseRole === 'climax') {
      registerTarget = Math.max(...pitches);
    } else if (phraseRole === 'resolution') {
      registerTarget = Math.min(...pitches);
    }

    // Antecedent phrases don't resolve to tonic
    const isAntecedent = phraseRole === 'statement' || phraseRole === 'build';

    return new PhraseContext(phraseRole, tensionLevel, registerTarget, isAntecedent);
  }

  /**
   * Calculate tension level for a phrase.
   * @param {MelodyNote[]} notes - Notes in the phrase
   * @param {number} pitchRange - Pitch range of the phrase
   * @returns {number} Tension level (0.0-1.0)
   * @private
   */
  _calculateTensionLevel(notes, pitchRange) {
    // Higher pitch range = higher tension
    const rangeFactor = Math.min(1.0, pitchRange / 24); // Normalize to 24 semitones

    // More notes = slightly higher tension (density)
    const densityFactor = Math.min(1.0, notes.length / this.notesPerPhrase);

    // Large intervals increase tension
    let intervalTension = 0;
    for (let i = 1; i < notes.length; i++) {
      const interval = Math.abs(notes[i].pitch - notes[i - 1].pitch);
      if (interval > 7) {
        intervalTension += 0.1;
      }
    }
    intervalTension = Math.min(0.5, intervalTension);

    return Math.min(1.0, (rangeFactor * 0.5 + densityFactor * 0.3 + intervalTension * 0.2));
  }

  /**
   * Assign phrase roles and mark notes with phrase information.
   * @param {Phrase[]} phrases - Phrases to process
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]} Notes with phrase metadata
   * @private
   */
  _assignPhraseRoles(phrases, config) {
    const markedNotes = [];

    for (const phrase of phrases) {
      for (const note of phrase.notes) {
        const markedNote = new MelodyNote(
          note.pitch,
          note.startTime,
          note.duration,
          note.role,
          {
            ...note.metadata,
            phraseId: phrase.id,
            phraseRole: phrase.phraseContext.role,
            phraseIndex: phrase.index,
            phraseTension: phrase.phraseContext.tensionLevel,
            isAntecedent: phrase.phraseContext.isAntecedent,
          }
        );
        markedNotes.push(markedNote);
      }
    }

    // If antecedent-consequent mode is enabled, create consequent phrases
    if (this.antecedentConsequent && phrases.length >= 1) {
      return this._applyAntecedentConsequentPattern(markedNotes, phrases);
    }

    return markedNotes;
  }

  /**
   * Apply antecedent-consequent phrase pattern.
   * @param {MelodyNote[]} notes - Marked notes
   * @param {Phrase[]} phrases - Phrases to transform
   * @returns {MelodyNote[]} Transformed notes
   * @private
   */
  _applyAntecedentConsequentPattern(notes, phrases) {
    const consequentNotes = [];

    // For each antecedent phrase, create a consequent variation
    const antecedentPhrases = phrases.filter((p) => p.phraseContext.isAntecedent);

    for (const antecedentPhrase of antecedentPhrases) {
      const consequentPhrase = this._createConsequentPhrase(antecedentPhrase, phrases.length);
      consequentNotes.push(...consequentPhrase.notes);
    }

    return [...notes, ...consequentNotes];
  }

  /**
   * Create a consequent phrase from an antecedent phrase.
   * @param {Phrase} antecedentPhrase - Source antecedent phrase
   * @param {number} totalPhrases - Total number of phrases
   * @returns {Phrase} Created consequent phrase
   * @private
   */
  _createConsequentPhrase(antecedentPhrase, totalPhrases) {
    const consequentNotes = antecedentPhrase.notes.map((note, index) => {
      // Apply slight variation to create consequent
      const pitchShift = index % 2 === 0 ? 2 : -1; // Alternating small shifts
      const newPitch = Math.max(0, Math.min(127, note.pitch + pitchShift));

      return new MelodyNote(
        newPitch,
        note.startTime + totalPhrases * this.notesPerPhrase, // Offset in time
        note.duration,
        note.role,
        {
          ...note.metadata,
          phraseId: `phrase_consequent_${antecedentPhrase.index}`,
          phraseRole: antecedentPhrase.phraseContext.role,
          phraseIndex: antecedentPhrase.index,
          phraseTension: antecedentPhrase.phraseContext.tensionLevel,
          isAntecedent: false, // Consequent phrases resolve
          isConsequent: true,
          sourcePhraseId: antecedentPhrase.id,
        }
      );
    });

    const phraseContext = new PhraseContext(
      antecedentPhrase.phraseContext.role,
      antecedentPhrase.phraseContext.tensionLevel,
      antecedentPhrase.phraseContext.registerTarget,
      false // Consequent is not antecedent
    );

    return new Phrase(
      `phrase_consequent_${antecedentPhrase.index}`,
      consequentNotes,
      phraseContext,
      antecedentPhrase.index
    );
  }

  /**
   * Calculate phrase coherence score.
   * @param {Phrase[]} phrases - Phrases to evaluate
   * @returns {number} Coherence score (0.0-1.0)
   * @private
   */
  _calculatePhraseCoherenceScore(phrases) {
    if (phrases.length === 0) return 0.5;

    let score = 1.0;
    const issues = [];

    // Check for proper phrase role progression
    const roles = phrases.map((p) => p.phraseContext.role);
    const expectedProgression = this.phraseRoles.slice(0, phrases.length);

    for (let i = 0; i < phrases.length; i++) {
      if (roles[i] !== expectedProgression[i]) {
        score -= 0.05;
      }
    }

    // Check for reasonable phrase lengths
    for (const phrase of phrases) {
      if (phrase.notes.length < 2) {
        score -= 0.1;
        issues.push(`Phrase ${phrase.id} has too few notes (${phrase.notes.length})`);
      }
    }

    // Check for tension arc (tension should generally increase toward climax)
    const climaxPhrase = phrases.find((p) => p.phraseContext.role === 'climax');
    if (climaxPhrase) {
      const climaxIndex = phrases.indexOf(climaxPhrase);
      const beforeClimax = phrases.slice(0, climaxIndex);
      const afterClimax = phrases.slice(climaxIndex + 1);

      // Tension should generally rise before climax
      for (let i = 1; i < beforeClimax.length; i++) {
        if (beforeClimax[i].phraseContext.tensionLevel < beforeClimax[i - 1].phraseContext.tensionLevel - 0.1) {
          score -= 0.05;
        }
      }

      // Tension should generally fall after climax
      for (let i = 1; i < afterClimax.length; i++) {
        if (afterClimax[i].phraseContext.tensionLevel > afterClimax[i - 1].phraseContext.tensionLevel + 0.1) {
          score -= 0.05;
        }
      }
    }

    score = Math.max(0, Math.min(1, score));
    return score;
  }

  /**
   * Get all phrases.
   * @returns {Phrase[]} Phrases
   */
  getPhrases() {
    return [...this.phrases];
  }

  /**
   * Get phrases by role.
   * @param {string} role - Phrase role to filter by
   * @returns {Phrase[]} Filtered phrases
   */
  getPhrasesByRole(role) {
    return this.phrases.filter((p) => p.phraseContext.role === role);
  }

  /**
   * Get phrase by index.
   * @param {number} index - Phrase index
   * @returns {Phrase|null} Phrase or null
   */
  getPhraseByIndex(index) {
    return this.phrases[index] || null;
  }
}

export default PhraseEngine;
