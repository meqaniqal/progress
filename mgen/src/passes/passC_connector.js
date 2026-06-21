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
    const options = config.options || {};
    const safeMode = options.safeMode || false;

    // Sort previous notes by time
    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);

    // Generate connectors between consecutive structural/cadence points
    for (let i = 0; i < sortedNotes.length - 1; i++) {
      const currentNote = sortedNotes[i];
      const nextNote = sortedNotes[i + 1];

      const connectors = this._generateConnectors(currentNote, nextNote, safeMode, options);
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
   * @param {boolean} safeMode - Whether to execute under Safe Mode
   * @param {Object} options - Generation options
   * @returns {MelodyNote[]} Connective notes
   * @private
   */
  _generateConnectors(startNote, endNote, safeMode = false, options = {}) {
    const connectors = [];
    const startPitch = startNote.pitch;
    const endPitch = endNote.pitch;
    const startTime = startNote.startTime;
    const endTime = endNote.startTime;

    // Calculate distance and direction
    const distance = endPitch - startPitch;
    const direction = Math.sign(distance);
    const absDistance = Math.abs(distance);

    // Skip connectors for same-pitch gaps (no point connecting to yourself)
    if (absDistance === 0) {
      return connectors;
    }

    const density = options.density !== undefined ? options.density : 0.5;

    // Determine number of connector notes based on distance and density (cap to 1 in safeMode)
    let numConnectors;
    if (safeMode) {
      numConnectors = Math.min(Math.max(1, Math.floor(absDistance / 2)), 1);
    } else if (density > 0.7) {
      numConnectors = Math.min(Math.floor(absDistance), absDistance <= 1 ? 2 : 6);
    } else if (density < 0.3) {
      numConnectors = Math.min(Math.floor(absDistance / 3), 1);
    } else {
      numConnectors = Math.min(Math.floor(absDistance / 2), absDistance <= 1 ? 2 : 4);
    }

    if (numConnectors === 0) {
      return connectors;
    }

    // Generate stepwise or skip motion
    let currentPitch = startPitch;
    const timeStep = (endTime - startTime) / (numConnectors + 1);

    for (let i = 0; i < numConnectors; i++) {
      const timePosition = startTime + timeStep * (i + 1);

      // Determine motion type (always stepwise in safeMode)
      const motionType = safeMode ? 'step' : this._selectMotionType();

      let stepSize;
      if (safeMode || motionType === 'step') {
        stepSize = direction * 1;
      } else {
        switch (motionType) {
          case 'skip':
            stepSize = direction * (2 + Math.floor(Math.random() * 2));
            break;
          case 'leap':
            stepSize = direction * (3 + Math.floor(Math.random() * 4));
            break;
          default:
            stepSize = direction * 1;
        }
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
