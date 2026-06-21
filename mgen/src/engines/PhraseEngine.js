// Phrase Engine - Groups notes into phrases and manages phrase-level structure
// Rewritten 2026-06-19: Integrated PhraseArcPlanner + PhraseGrammar
// Original design (melodygen_architecture.md lines 107-142) described PhraseEngine
// as abstract phrase structure output. This rewrite makes it operational.

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

// ── Climax Archetypes (from melodygen_design_patterns.md Phase 6) ──

const CLIMAX_ARCHETYPES = {
  classical: {
    climaxFraction: 0.75,
    approachShape: 'gradual',
    fallShape: 'sudden',
    description: 'Single apex, usually ~75% through the phrase',
  },
  popLate: {
    climaxFraction: 0.85,
    approachShape: 'plateau_then_peak',
    fallShape: 'gradual',
    description: 'Extended build, late peak, gradual release',
  },
  jazz: {
    climaxFractions: [0.25, 0.60, 0.90],
    shape: 'wave',
    description: 'Wave-shaped; each phrase has its own local apex',
  },
  progressive: {
    climaxFractions: [0.30, 0.55, 0.80],
    shape: 'escalating_waves',
    description: 'Each wave higher than the last; cumulative intensity',
  },
  ambient: {
    climaxFraction: null,
    shape: 'plateau',
    description: 'No dominant peak; sustained tension or suspended resolution',
  },
  valley: {
    climaxFraction: 0.50,
    approachShape: 'gradual',
    fallShape: 'gradual',
    description: 'Inverted arch; stillness at center, motion at edges',
  },
};

// Map tensionCurve settings to climax archetypes
const TENSION_TO_ARCHETYPE = {
  'arch': 'classical',
  'launch': 'popLate',
  'valley': 'valley',
  'staircase': 'progressive',
  'linear': 'classical',
  'wave': 'jazz',
};

// ── Phrase Grammar Archetypes (from melodygen_design_patterns.md Phase 2.2) ──

const PHRASE_GRAMMAR = {
  callResponse: {
    phrasePairRoles: ['call', 'response'],
    openEndDegrees: [4, 1],   // scale degrees (5th, 2nd) for call ending
    closedEndDegrees: [0],    // scale degree (root) for response ending
  },
  questionAnswer: {
    phrasePairRoles: ['question', 'answer'],
    continuationFromLastNote: true,
  },
  statementExpansion: {
    phrasePairRoles: ['statement', 'expansion'],
    expansionFactor: 1.5,
  },
  contrastReturn: {
    phraseTripletRoles: ['A', 'B', 'A_prime'],
    returnVariation: 'partial',
  },
  developing: {
    phraseContinuation: 'develop',
    transformChain: ['sequence', 'inversion', 'augmentation', 'compression'],
  },
};

/**
 * Select phrase grammar based on genre and phrase count.
 * @param {number} phraseCount - Number of phrases
 * @param {string} genre - Genre setting
 * @param {number} tensionLevel - Current tension level
 * @returns {Object} Selected phrase grammar
 */
function selectPhraseGrammar(phraseCount, genre, tensionLevel) {
  if (genre === 'blues') return PHRASE_GRAMMAR.callResponse;
  if (genre === 'jazz' && phraseCount > 4) return PHRASE_GRAMMAR.developing;
  if (tensionLevel > 0.7) return PHRASE_GRAMMAR.statementExpansion;
  if (phraseCount >= 6) return PHRASE_GRAMMAR.contastReturn;
  return PHRASE_GRAMMAR.questionAnswer;
}

/**
 * Represents a phrase with structural information.
 */
export class Phrase {
  constructor(id, notes, phraseContext, index = 0) {
    this.id = id;
    this.notes = notes;
    this.phraseContext = phraseContext;
    this.index = index;
  }
}

/**
 * Phrase Engine - Groups notes into phrases and manages phrase-level structure.
 * Rewritten 2026-06-19: Integrated PhraseArcPlanner + PhraseGrammar.
 *
 * Original design (melodygen_architecture.md) described PhraseEngine as abstract
 * phrase structure output. This rewrite makes it operational by:
 * 1. Computing climax position per macroContourArchetype (6 archetypes)
 * 2. Computing tension and register curves per chord slot
 * 3. Selecting phrase grammar based on genre and phrase count
 * 4. Applying register envelope constraints per slot
 * 5. Fixing antecedent-consequent to use real musical transformations
 */
export class PhraseEngine {
  /**
   * @param {Object} options - Engine options
   * @param {number} [options.notesPerPhrase=8] - Target notes per phrase
   * @param {number} [options.maxPhraseDuration=16] - Maximum phrase duration in beats
   * @param {boolean} [options.antecedentConsequent=true] - Antecedent-consequent phrase pairs
   * @param {string} [options.archetype='classical'] - Climax archetype
   * @param {number} [options.divisions=12] - EDO divisions
   */
  constructor(options = {}) {
    this.notesPerPhrase = options.notesPerPhrase || 8;
    this.maxPhraseDuration = options.maxPhraseDuration || 16;
    this.antecedentConsequent = options.antecedentConsequent !== false;
    this.archetype = options.archetype || 'classical';
    this.divisions = options.divisions || 12;
    this.phraseRoles = ['statement', 'build', 'climax', 'release', 'resolution'];
    this.phrases = [];
    this.arc = null;
    this.grammar = null;
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
          arc: null,
          grammar: null,
        }
      );
    }

    let sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);

    // If antecedentConsequent is enabled and we have a chord progression, filter notes to keep only the first half.
    // The second half will be filled by the generated consequent phrase.
    if (this.antecedentConsequent && config && config.chords && config.chords.length > 0) {
      const lastChord = config.chords[config.chords.length - 1];
      const progressionDuration = lastChord.beatStart + (lastChord.duration || 2);
      const midpoint = progressionDuration / 2;
      const filtered = sortedNotes.filter(n => n.startTime < midpoint);
      // Ensure we don't end up with completely empty notes if filtering was too aggressive
      if (filtered.length > 0) {
        sortedNotes = filtered;
      }
    }

    const arc = this._computePhraseArc(sortedNotes, config);
    const grammar = this._selectPhraseGrammar(config);
    const phrases = this._groupIntoPhrases(sortedNotes, config, arc);
    const phraseNotes = this._assignPhraseRoles(phrases, config, arc, grammar);

    this.phrases = phrases;
    this.arc = arc;
    this.grammar = grammar;

    return new PassResult(
      'PhraseEngine',
      phraseNotes,
      new EvaluationMetrics(
        'PhraseEngine',
        this._calculatePhraseCoherenceScore(phrases, arc),
        [],
        true
      ),
      {
        phrases,
        phraseCount: phrases.length,
        phraseRoles: phrases.map((p) => p.phraseContext.role),
        arc,
        grammar: grammar ? grammar.id : null,
        antecedentConsequent: this.antecedentConsequent,
      }
    );
  }

  /**
   * Compute phrase arc: climax position, tension curve, register curve.
   * Uses the 6 climax archetypes to determine where the climax occurs
   * and how tension/register evolve across the phrase.
   * @param {MelodyNote[]} notes - Sorted notes
   * @param {GenerationConfig} config - Generation configuration
   * @returns {Object} Phrase arc { climaxSlot, tensions[], registers[], roles[], climaxPositions[] }
   * @private
   */
  _computePhraseArc(notes, config) {
    const totalSlots = notes.length;
    if (totalSlots === 0) return { climaxSlot: 0, tensions: [], registers: [], roles: [], climaxPositions: [] };

    const options = config.options || {};
    const tensionCurve = options.tensionCurve || 'arch';
    const genre = options.genre || 'none';

    // Map tensionCurve to climax archetype
    let archetypeKey = TENSION_TO_ARCHETYPE[tensionCurve] || 'classical';
    if (genre === 'jazz') archetypeKey = 'jazz';
    if (genre === 'progressive') archetypeKey = 'progressive';

    const archetype = CLIMAX_ARCHETYPES[archetypeKey] || CLIMAX_ARCHETYPES.classical;

    const arc = {
      climaxSlot: 0,
      tensions: [],
      registers: [],
      roles: [],
      climaxPositions: [],
      archetype: archetypeKey,
    };

    if (Array.isArray(archetype.climaxFractions)) {
      // Multi-climax archetypes (jazz, progressive)
      const numClimaxes = archetype.climaxFractions.length;
      const slotsPerPhrase = Math.floor(totalSlots / numClimaxes);

      for (let c = 0; c < numClimaxes; c++) {
        const phraseStart = c * slotsPerPhrase;
        const phraseEnd = (c === numClimaxes - 1) ? totalSlots : (c + 1) * slotsPerPhrase;
        const localClimaxSlot = phraseStart + Math.round((phraseEnd - phraseStart) * archetype.climaxFractions[c]);

        for (let i = phraseStart; i < phraseEnd; i++) {
          const distToClimax = Math.abs(i - localClimaxSlot) / Math.max(1, phraseEnd - phraseStart);
          arc.tensions.push(1.0 - distToClimax);
          const register = i <= localClimaxSlot
            ? (i - phraseStart) / Math.max(1, localClimaxSlot - phraseStart)
            : 1.0 - ((i - localClimaxSlot) / Math.max(1, phraseEnd - 1 - localClimaxSlot));
          arc.registers.push(Math.max(0, Math.min(1, register)));

          if (i === phraseStart) arc.roles.push('statement');
          else if (i === phraseEnd - 1) arc.roles.push('resolution');
          else if (i === localClimaxSlot) {
            arc.roles.push('climax');
            arc.climaxPositions.push(i);
          }
          else if (i < localClimaxSlot) arc.roles.push('build');
          else arc.roles.push('release');
        }
      }

      arc.climaxPositions.sort((a, b) => a - b);
      arc.climaxSlot = arc.climaxPositions[0];
    } else {
      // Single-climax archetypes
      const climaxFraction = archetype.climaxFraction !== null ? archetype.climaxFraction : 0.50;
      arc.climaxSlot = Math.round(totalSlots * climaxFraction);

      for (let i = 0; i < totalSlots; i++) {
        const distToClimax = Math.abs(i - arc.climaxSlot) / Math.max(1, totalSlots - 1);

        if (archetype.shape === 'valley') {
          // Valley: high tension at edges, low at center
          arc.tensions.push(1.0 - (1.0 - distToClimax));
        } else if (archetype.shape === 'plateau') {
          // Ambient: sustained tension, no peak
          arc.tensions.push(0.5 + 0.3 * Math.exp(-Math.pow(i - totalSlots / 2, 2) / (totalSlots * 0.3)));
        } else {
          // Standard arch shapes
          arc.tensions.push(1.0 - distToClimax);
        }

        const register = i <= arc.climaxSlot
          ? (i / Math.max(1, arc.climaxSlot))
          : 1.0 - ((i - arc.climaxSlot) / Math.max(1, totalSlots - 1 - arc.climaxSlot));
        arc.registers.push(Math.max(0, Math.min(1, register)));

        if (i === 0) arc.roles.push('statement');
        else if (i === totalSlots - 1) arc.roles.push('resolution');
        else if (i === arc.climaxSlot) arc.roles.push('climax');
        else if (i < arc.climaxSlot) arc.roles.push('build');
        else arc.roles.push('release');
      }
    }

    return arc;
  }

  /**
   * Select phrase grammar based on genre and phrase count.
   * @param {GenerationConfig} config - Generation configuration
   * @returns {Object|null} Selected phrase grammar or null
   * @private
   */
  _selectPhraseGrammar(config) {
    const options = config.options || {};
    const genre = options.genre || 'none';
    const phraseCount = this.phrases.length || 2;
    const tensionLevel = 0.5;

    const selected = selectPhraseGrammar(phraseCount, genre, tensionLevel);
    return { ...selected, id: Object.keys(PHRASE_GRAMMAR).find(
      k => PHRASE_GRAMMAR[k] === selected || Object.values(PHRASE_GRAMMAR).indexOf(selected)
    ) || 'questionAnswer' };
  }

  /**
   * Group notes into phrases based on temporal proximity, role, and arc constraints.
   * @param {MelodyNote[]} notes - Sorted notes
   * @param {GenerationConfig} config - Generation configuration
   * @param {Object} arc - Phrase arc
   * @returns {Phrase[]} Grouped phrases
   * @private
   */
  _groupIntoPhrases(notes, config, arc) {
    const phrases = [];
    let currentPhraseNotes = [];
    let phraseStartTime = null;
    let phraseIndex = 0;

    for (const note of notes) {
      const lastNote = currentPhraseNotes.length > 0
        ? currentPhraseNotes[currentPhraseNotes.length - 1]
        : null;

      const gap = lastNote
        ? note.startTime - (lastNote.startTime + lastNote.duration)
        : Infinity;

      const phraseDuration = phraseStartTime !== null ? note.startTime - phraseStartTime : Infinity;

      const shouldStartNewPhrase = currentPhraseNotes.length > 0 && (
        gap > 2.0 ||
        currentPhraseNotes.length >= this.notesPerPhrase ||
        phraseDuration >= this.maxPhraseDuration
      );

      if (shouldStartNewPhrase) {
        if (currentPhraseNotes.length > 0) {
          phrases.push(this._createPhrase(currentPhraseNotes, phraseIndex, arc, config));
          phraseIndex++;
        }
        currentPhraseNotes = [];
        phraseStartTime = null;
      }

      if (currentPhraseNotes.length === 0) {
        phraseStartTime = note.startTime;
      }

      currentPhraseNotes.push(note);
    }

    if (currentPhraseNotes.length > 0) {
      phrases.push(this._createPhrase(currentPhraseNotes, phraseIndex, arc, config));
    }

    return phrases;
  }

  /**
   * Create a phrase from a group of notes, applying arc constraints and grammar.
   * @param {MelodyNote[]} notes - Notes for this phrase
   * @param {number} index - Phrase index
   * @param {Object} arc - Phrase arc
   * @param {GenerationConfig} config - Generation configuration
   * @returns {Phrase} Created phrase
   * @private
   */
  _createPhrase(notes, index, arc, config) {
    const phraseContext = this._determinePhraseContext(notes, index, arc, config);
    return new Phrase(`phrase_${index}`, notes, phraseContext, index);
  }

  /**
   * Determine the phrase context based on arc position, grammar, and note properties.
   * @param {MelodyNote[]} notes - Notes in the phrase
   * @param {number} index - Phrase index
   * @param {Object} arc - Phrase arc
   * @param {GenerationConfig} config - Generation configuration
   * @returns {PhraseContext} Determined phrase context
   * @private
   */
  _determinePhraseContext(notes, index, arc, config) {
    // Determine phrase role from arc
    const phraseStartSlot = this._getPhraseStartSlot(index, arc);
    const phraseEndSlot = this._getPhraseEndSlot(index, arc);

    // Find the dominant role within this phrase's slot range
    let roleCounts = {};
    for (let i = phraseStartSlot; i <= phraseEndSlot && i < arc.roles.length; i++) {
      const role = arc.roles[i];
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }

    let dominantRole = 'statement';
    let maxCount = 0;
    for (const [role, count] of Object.entries(roleCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantRole = role;
      }
    }

    // Calculate tension based on pitch range and interval complexity
    const pitches = notes.map((n) => n.pitch);
    const pitchRange = Math.max(...pitches) - Math.min(...pitches);
    const tensionLevel = this._calculateTensionLevel(notes, pitchRange);

    // Determine register target based on phrase role and arc
    let registerTarget = null;
    if (dominantRole === 'climax') {
      registerTarget = Math.max(...pitches);
    } else if (dominantRole === 'resolution') {
      registerTarget = Math.min(...pitches);
    }

    // Antecedent phrases don't resolve to tonic
    const isAntecedent = this.antecedentConsequent || dominantRole === 'statement' || dominantRole === 'build';

    return new PhraseContext(dominantRole, tensionLevel, registerTarget, isAntecedent);
  }

  /**
   * Get the starting slot for a phrase index.
   * @param {number} index - Phrase index
   * @param {Object} arc - Phrase arc
   * @returns {number} Starting slot
   * @private
   */
  _getPhraseStartSlot(index, arc) {
    if (index === 0) return 0;
    const prevPhraseEnd = this._getPhraseEndSlot(index - 1, arc);
    return prevPhraseEnd + 1;
  }

  /**
   * Get the ending slot for a phrase index.
   * @param {number} index - Phrase index
   * @param {Object} arc - Phrase arc
   * @returns {number} Ending slot
   * @private
   */
  _getPhraseEndSlot(index, arc) {
    if (index === 0) return Math.max(0, Math.floor(this.phrases.length * 0.5) - 1);
    // Simplified: assume roughly equal phrase lengths
    const totalSlots = arc.tensions.length;
    const phrases = this.phrases.length || 1;
    return Math.min(totalSlots - 1, Math.floor((index + 1) * totalSlots / phrases) - 1);
  }

  /**
   * Calculate tension level for a phrase.
   * @param {MelodyNote[]} notes - Notes in the phrase
   * @param {number} pitchRange - Pitch range of the phrase
   * @returns {number} Tension level (0.0-1.0)
   * @private
   */
  _calculateTensionLevel(notes, pitchRange) {
    const rangeFactor = Math.min(1.0, pitchRange / 24);
    const densityFactor = Math.min(1.0, notes.length / this.notesPerPhrase);

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
   * Applies register envelope constraints and antecedent-consequent transformations.
   * @param {Phrase[]} phrases - Phrases to process
   * @param {GenerationConfig} config - Generation configuration
   * @param {Object} arc - Phrase arc
   * @param {Object} grammar - Phrase grammar
   * @returns {MelodyNote[]} Notes with phrase metadata
   * @private
   */
  _assignPhraseRoles(phrases, config, arc, grammar) {
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

    // Apply register envelope constraints from arc
    const constrainedNotes = this._applyRegisterEnvelopes(markedNotes, arc, config);

    // If antecedent-consequent mode is enabled, create consequent phrases
    if (this.antecedentConsequent && phrases.length >= 1) {
      return this._applyAntecedentConsequentPattern(constrainedNotes, phrases, arc, config);
    }

    return constrainedNotes;
  }

  /**
   * Apply register envelope constraints from the phrase arc.
   * Enforces the "single highest note at climax" principle by constraining
   * pitch selection within each slot's register envelope.
   * @param {MelodyNote[]} notes - Marked notes
   * @param {Object} arc - Phrase arc
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]} Notes with register constraints applied
   * @private
   */
  _applyRegisterEnvelopes(notes, arc, config) {
    if (!arc || !arc.registers || arc.registers.length === 0) return notes;

    const options = config.options || {};
    const baseRegister = options.baseRegister || 60;
    const stepSize = 12.0 / (options.divisions || 12);

    return notes.map((note) => {
      const slotIndex = Math.round(note.startTime);
      if (slotIndex < 0 || slotIndex >= arc.registers.length) return note;

      const registerFraction = arc.registers[slotIndex];
      const registerCeiling = baseRegister + 12 + (registerFraction * stepSize * 0.5);
      const registerFloor = baseRegister + (registerFraction * stepSize * 0.25);

      // Adjust pitch if outside register envelope
      let adjustedPitch = note.pitch;
      if (note.pitch > registerCeiling) {
        adjustedPitch = Math.round(registerCeiling);
      } else if (note.pitch < registerFloor) {
        adjustedPitch = Math.round(registerFloor);
      }

      if (adjustedPitch !== note.pitch) {
        return new MelodyNote(
          adjustedPitch,
          note.startTime,
          note.duration,
          note.role,
          {
            ...note.metadata,
            registerAdjusted: true,
            registerEnvelope: { floor: registerFloor, ceiling: registerCeiling },
          }
        );
      }

      return note;
    });
  }

  /**
   * Apply antecedent-consequent phrase pattern with real musical transformations.
   * Instead of arbitrary ±2/-1 shifts, uses transposition, interval compression,
   * and resolution to tonic.
   * @param {MelodyNote[]} notes - Marked notes
   * @param {Phrase[]} phrases - Phrases to transform
   * @param {Object} arc - Phrase arc
   * @returns {MelodyNote[]} Transformed notes
   * @private
   */
  _applyAntecedentConsequentPattern(notes, phrases, arc, config) {
    const consequentNotes = [];
    const antecedentPhrases = phrases.filter((p) => p.phraseContext.isAntecedent);

    for (const antecedentPhrase of antecedentPhrases) {
      const consequentPhrase = this._createConsequentPhrase(antecedentPhrase, phrases.length, arc, config);
      consequentNotes.push(...consequentPhrase.notes);
    }

    return [...notes, ...consequentNotes];
  }

  /**
   * Create a consequent phrase from an antecedent phrase using real musical transformations.
   * Uses transposition, interval compression, and resolution to tonic.
   * @param {Phrase} antecedentPhrase - Source antecedent phrase
   * @param {number} totalPhrases - Total number of phrases
   * @param {Object} arc - Phrase arc
   * @returns {Phrase} Created consequent phrase
   * @private
   */
  _createConsequentPhrase(antecedentPhrase, totalPhrases, arc, config) {
    const antecedentNotes = antecedentPhrase.notes;
    const consequentNotes = [];

    // Determine the transformation type based on phrase role
    const role = antecedentPhrase.phraseContext.role;
    let transformType = 'transposition';

    if (role === 'statement' || role === 'build') {
      transformType = 'transposition';
    } else if (role === 'climax') {
      transformType = 'intervalCompression';
    } else if (role === 'resolution') {
      transformType = 'tonicResolution';
    }

    // Calculate the tonic from the arc (lowest register point)
    const minRegister = Math.min(...(arc.registers || [0.5]));
    const baseRegister = (arc.options && arc.options.baseRegister) || 60;
    const tonic = baseRegister;

    // Calculate musically correct shift offset based on the actual chord progression duration (half of total progression duration)
    let shiftOffset = 8;
    if (config && config.chords && config.chords.length > 0) {
      const lastChord = config.chords[config.chords.length - 1];
      const progressionDuration = lastChord.beatStart + (lastChord.duration || 2);
      shiftOffset = progressionDuration / 2;
    } else if (antecedentNotes.length > 0) {
      const phraseStart = Math.min(...antecedentNotes.map(n => n.startTime));
      const phraseEnd = Math.max(...antecedentNotes.map(n => n.startTime + n.duration));
      shiftOffset = Math.max(4, phraseEnd - phraseStart);
    }

    for (const note of antecedentNotes) {
      let newPitch = note.pitch;
      let transformApplied = false;

      switch (transformType) {
        case 'transposition':
          // Transpose down a 5th (common consequent transformation)
          newPitch = note.pitch - Math.round(7 * (12.0 / this.divisions));
          transformApplied = true;
          break;

        case 'intervalCompression':
          // Compress intervals toward the center (more intimate)
          const centerPitch = (Math.max(...antecedentNotes.map(n => n.pitch)) +
                              Math.min(...antecedentNotes.map(n => n.pitch))) / 2;
          const distFromCenter = note.pitch - centerPitch;
          newPitch = centerPitch + (distFromCenter * 0.6);
          transformApplied = true;
          break;

        case 'tonicResolution':
          // Resolve to tonic (consequent phrases resolve)
          newPitch = tonic + (note.pitch >= tonic ? 0 : 12);
          transformApplied = true;
          break;
      }

      newPitch = Math.max(0, Math.min(127, Math.round(newPitch)));

      const consequentNote = new MelodyNote(
        newPitch,
        note.startTime + shiftOffset,
        note.duration,
        note.role,
        {
          ...note.metadata,
          phraseId: `phrase_consequent_${antecedentPhrase.index}`,
          phraseRole: antecedentPhrase.phraseContext.role,
          phraseIndex: antecedentPhrase.index,
          phraseTension: antecedentPhrase.phraseContext.tensionLevel,
          isAntecedent: false,
          isConsequent: true,
          sourcePhraseId: antecedentPhrase.id,
          transformType: transformType,
          transformApplied: transformApplied,
        }
      );
      consequentNotes.push(consequentNote);
    }

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
   * @param {Object} arc - Phrase arc
   * @returns {number} Coherence score (0.0-1.0)
   * @private
   */
  _calculatePhraseCoherenceScore(phrases, arc) {
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
    if (arc && arc.tensions && arc.tensions.length > 0) {
      const climaxSlot = arc.climaxSlot;
      const beforeClimax = arc.tensions.slice(0, climaxSlot);
      const afterClimax = arc.tensions.slice(climaxSlot + 1);

      // Tension should generally rise before climax
      for (let i = 1; i < beforeClimax.length; i++) {
        if (beforeClimax[i] < beforeClimax[i - 1] - 0.1) {
          score -= 0.05;
        }
      }

      // Tension should generally fall after climax
      for (let i = 1; i < afterClimax.length; i++) {
        if (afterClimax[i] > afterClimax[i - 1] + 0.1) {
          score -= 0.05;
        }
      }
    }

    // Check for climax clarity (climax should be the highest tension point)
    if (arc && arc.tensions && arc.tensions.length > 0) {
      const climaxSlot = arc.climaxSlot;
      const climaxTension = arc.tensions[climaxSlot];
      const maxTension = Math.max(...arc.tensions);
      if (climaxTension < maxTension * 0.8) {
        score -= 0.1;
        issues.push('Climax tension is not the highest point');
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

  /**
   * Get the computed phrase arc.
   * @returns {Object|null} Phrase arc or null
   */
  getArc() {
    return this.arc;
  }

  /**
   * Get the selected phrase grammar.
   * @returns {Object|null} Phrase grammar or null
   */
  getGrammar() {
    return this.grammar;
  }
}

export { CLIMAX_ARCHETYPES, TENSION_TO_ARCHETYPE, PHRASE_GRAMMAR, selectPhraseGrammar };
export default PhraseEngine;
