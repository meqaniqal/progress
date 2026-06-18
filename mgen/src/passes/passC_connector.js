// Pass C - Connector Layer
// Generates connective motion between structural points
// Fills gaps between structural notes (Pass A) and cadence notes (Pass B)

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass C: Connector Layer Generator.
 * Generates connective motion between structural points.
 * Uses stepwise motion primarily, with occasional skips.
 */
export class ConnectorPlanner {
  /**
   * @param {Object} options - Pass-specific options
   * @param {number} [options.stepProbability=0.7] - Probability of stepwise motion
   * @param {number} [options.skipProbability=0.2] - Probability of skip motion
   * @param {number} [options.leapProbability=0.1] - Probability of leap motion
   */
  constructor(options = {}) {
    this.stepProbability = options.stepProbability || 0.7;
    this.skipProbability = options.skipProbability || 0.2;
    this.leapProbability = options.leapProbability || 0.1;
  }

  /**
   * Execute Pass C: Generate connector layer.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from previous passes (Pass A + Pass B)
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Connector layer result
   */
  async execute(config, previousNotes, context = {}) {
    const notes = [];

    // Sort previous notes by time
    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);

    // Generate connectors between consecutive structural/cadence points
    for (let i = 0; i < sortedNotes.length - 1; i++) {
      const currentNote = sortedNotes[i];
      const nextNote = sortedNotes[i + 1];

      const connectors = this._generateConnectors(currentNote, nextNote);
      notes.push(...connectors);
    }

    return new PassResult(
      'PassC_Connector',
      notes,
      new EvaluationMetrics('PassC_Connector', 1.0, [], true),
      {
        connectorCount: notes.length,
        structuralNoteCount: previousNotes.length,
      }
    );
  }

  /**
   * Generate connective notes between two structural points.
   * Uses stepwise motion primarily, with occasional skips.
   * @param {MelodyNote} startNote - Starting structural/cadence note
   * @param {MelodyNote} endNote - Ending structural/cadence note
   * @returns {MelodyNote[]} Connective notes
   * @private
   */
  _generateConnectors(startNote, endNote) {
    const connectors = [];
    const startPitch = startNote.pitch;
    const endPitch = endNote.pitch;
    const startTime = startNote.startTime;
    const endTime = endNote.startTime;

    // Calculate distance and direction
    const distance = endPitch - startPitch;
    const direction = Math.sign(distance);
    const absDistance = Math.abs(distance);

    // Determine number of connector notes based on distance
    const numConnectors = Math.min(Math.floor(absDistance / 2), 4);

    if (numConnectors === 0) {
      return connectors;
    }

    // Generate stepwise or skip motion
    let currentPitch = startPitch;
    const timeStep = (endTime - startTime) / (numConnectors + 1);

    for (let i = 0; i < numConnectors; i++) {
      const timePosition = startTime + timeStep * (i + 1);

      // Determine motion type
      const motionType = this._selectMotionType();

      let stepSize;
      switch (motionType) {
        case 'step':
          stepSize = direction * 1;
          break;
        case 'skip':
          stepSize = direction * (2 + Math.floor(Math.random() * 2));
          break;
        case 'leap':
          stepSize = direction * (3 + Math.floor(Math.random() * 4));
          break;
        default:
          stepSize = direction * 1;
      }

      // Ensure we don't overshoot the target
      currentPitch += stepSize;
      if ((direction > 0 && currentPitch > endPitch) || (direction < 0 && currentPitch < endPitch)) {
        currentPitch = endPitch;
      }

      connectors.push(
        new MelodyNote(currentPitch, timePosition, timeStep * 0.8, 'connector', {
          motionType,
          connectsStart: startNote.pitch,
          connectsEnd: endPitch,
        })
      );
    }

    return connectors;
  }

  /**
   * Select motion type based on probabilities.
   * @returns {string} Motion type: 'step', 'skip', or 'leap'
   * @private
   */
  _selectMotionType() {
    const rand = Math.random();
    if (rand < this.stepProbability) {
      return 'step';
    } else if (rand < this.stepProbability + this.skipProbability) {
      return 'skip';
    } else {
      return 'leap';
    }
  }
}

export default ConnectorPlanner;
