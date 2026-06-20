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

  /**
   * Execute Pass D: Generate ornament layer.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes (Pass A + B + C)
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Ornament layer result
   */
  async execute(config, previousNotes, context = {}) {
    const ornaments = [];

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

      const ornamentedNotes = this._attemptOrnament(note, config.chords);
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
   * @param {Chord[]} chords - Chord progression
   * @returns {MelodyNote[]|null} Ornamented notes or null
   * @private
   */
  _attemptOrnament(note, chords) {
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
        return this._generateGraceNote(note);
      case 'trill':
        return this._generateTrill(note);
      case 'turn':
        return this._generateTurn(note);
      case 'appoggiatura':
        return this._generateAppoggiatura(note);
      default:
        return null;
    }
  }

  /**
   * Generate a grace note before the target note.
   * @param {MelodyNote} note - Target note
   * @returns {MelodyNote[]} Grace note and target
   * @private
   */
  _generateGraceNote(note) {
    const gracePitch = note.pitch - 1;
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
   * @returns {MelodyNote[]} Trill notes
   * @private
   */
  _generateTrill(note) {
    const trillNotes = [];
    const upperNeighbor = note.pitch + 2;
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
   * @returns {MelodyNote[]} Turn notes
   * @private
   */
  _generateTurn(note) {
    const upperNeighbor = note.pitch + 2;
    const lowerNeighbor = note.pitch - 2;
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
   * @returns {MelodyNote[]} Appoggiatura and target
   * @private
   */
  _generateAppoggiatura(note) {
    const approachFromAbove = Math.random() > 0.5;
    const appoggiaturaPitch = approachFromAbove ? note.pitch + 3 : note.pitch - 3;
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
