// Core I/O Interface for 5-Pass Hierarchical Melody Generator
// Based on melodygen_architecture.md and CURRENT_FOCUS.md

/**
 * Represents a single musical note with timing and pitch information.
 */
export class MelodyNote {
  /**
   * @param {number} pitch - MIDI pitch number (0-127)
   * @param {number} startTime - Beat position within the measure
   * @param {number} duration - Duration in beats
   * @param {string} role - Structural role: 'structural', 'cadence', 'connector', 'ornament', or 'expectation'
   * @param {Object} [metadata] - Additional metadata for evaluation
   */
  constructor(pitch, startTime, duration, role = 'structural', metadata = {}) {
    this.pitch = pitch;
    this.startTime = startTime;
    this.duration = duration;
    this.role = role;
    this.metadata = metadata;
  }

  equals(other) {
    return (
      this.pitch === other.pitch &&
      this.startTime === other.startTime &&
      this.duration === other.duration &&
      this.role === other.role
    );
  }
}

/**
 * Represents a chord with harmonic information.
 */
export class Chord {
  /**
   * @param {string} root - Root note name (e.g., 'C', 'D#')
   * @param {string} quality - Chord quality (e.g., 'maj', 'min', 'dim', 'aug', '7', 'maj7')
   * @param {number} beatStart - Beat position where this chord begins
   * @param {number} [scaleDegrees] - Scale degrees that form the chord
   */
  constructor(root, quality, beatStart, scaleDegrees = []) {
    this.root = root;
    this.quality = quality;
    this.beatStart = beatStart;
    this.scaleDegrees = scaleDegrees;
  }
}

/**
 * Represents phrase-level structural information.
 */
export class PhraseContext {
  /**
   * @param {string} role - Phrase role: 'statement', 'build', 'climax', 'release', 'resolution'
   * @param {number} tensionLevel - Tension level (0.0-1.0)
   * @param {number} [registerTarget] - Target register for this phrase
   * @param {boolean} [isAntecedent] - Whether this is an antecedent phrase (no tonic resolution)
   */
  constructor(role, tensionLevel, registerTarget = null, isAntecedent = false) {
    this.role = role;
    this.tensionLevel = tensionLevel;
    this.registerTarget = registerTarget;
    this.isAntecedent = isAntecedent;
  }
}

/**
 * Evaluation metrics for a single pass output.
 */
export class EvaluationMetrics {
  /**
   * @param {string} passName - Name of the pass (e.g., 'PassA_Structural')
   * @param {number} score - Quality score (0.0-1.0)
   * @param {string[]} issues - List of identified issues
   * @param {boolean} passesThreshold - Whether output meets minimum quality threshold
   */
  constructor(passName, score, issues = [], passesThreshold = true) {
    this.passName = passName;
    this.score = score;
    this.issues = issues;
    this.passesThreshold = passesThreshold;
  }
}

/**
 * Result from a single pass.
 */
export class PassResult {
  /**
   * @param {string} passName - Name of the pass
   * @param {MelodyNote[]} notes - Generated notes from this pass
   * @param {EvaluationMetrics} metrics - Evaluation metrics for this pass
   * @param {Object} [context] - Additional context for downstream passes
   */
  constructor(passName, notes, metrics, context = {}) {
    this.passName = passName;
    this.notes = notes;
    this.metrics = metrics;
    this.context = context;
    this.metadata = context;
    this.success = metrics.passesThreshold;
  }
}

/**
 * Complete melody generation result.
 */
export class MelodyResult {
  /**
   * @param {MelodyNote[]} allNotes - All generated notes from all passes
   * @param {Object} metadata - Generation metadata
   */
  constructor(allNotes, metadata = {}) {
    this.allNotes = allNotes;
    this.metadata = metadata;
  }
}

/**
 * Configuration for melody generation.
 */
export class GenerationConfig {
  /**
   * @param {Chord[]} chords - Chord progression
   * @param {PhraseContext} phraseContext - Phrase-level context
   * @param {Object} [options] - Additional generation options
   */
  constructor(chords, phraseContext, options = {}) {
    this.chords = chords;
    this.phraseContext = phraseContext;
    this.options = options;
  }
}

/**
 * Task interface for composable passes.
 * Each pass must expose: Inputs, Parameters, Outputs, Evaluation Metrics.
 */
export class MelodyTask {
  /**
   * @param {string} name - Task name
   * @param {Function} execute - Execute function that returns PassResult
   * @param {Object} parameters - Task parameters
   */
  constructor(name, execute, parameters = {}) {
    this.name = name;
    this.execute = execute;
    this.parameters = parameters;
  }
}

export default {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  MelodyResult,
  GenerationConfig,
  MelodyTask,
};
