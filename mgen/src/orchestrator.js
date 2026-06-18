// 5-Pass Pipeline Orchestrator
// Coordinates execution of all melody generation passes with selective regeneration

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  MelodyResult,
  GenerationConfig,
  MelodyTask,
} from './interfaces.js';

/**
 * Orchestrates the 5-pass melody generation pipeline.
 * Executes passes sequentially, evaluates results, and supports selective regeneration.
 */
export class CompositionOrchestrator {
  /**
   * @param {Object} options - Orchestrator options
   * @param {number} [options.maxRegenerations=3] - Maximum regeneration attempts per pass
   * @param {number} [options.minScoreThreshold=0.5] - Minimum score to pass a pass
   */
  constructor(options = {}) {
    this.maxRegenerations = options.maxRegenerations || 3;
    this.minScoreThreshold = options.minScoreThreshold || 0.5;
    this.passes = [];
    this.executionLog = [];
  }

  /**
   * Register a pass task with the orchestrator.
   * @param {MelodyTask|Object} task - Task to register (MelodyTask or class instance with execute method)
   */
  registerPass(task) {
    // Wrap class instances as MelodyTask if needed
    if (!task.name && typeof task.execute === 'function') {
      const wrappedTask = new MelodyTask(
        task.constructor.name,
        task.execute.bind(task),
        task.parameters || {}
      );
      this.passes.push(wrappedTask);
    } else {
      this.passes.push(task);
    }
  }

  /**
   * Execute the full 5-pass pipeline.
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyResult} Complete melody result
   */
  async execute(config) {
    const allNotes = [];
    const passResults = [];
    this._passNotes = new Map();

    for (const task of this.passes) {
      const result = await this._executePassWithRegeneration(task, config, allNotes);
      passResults.push(result);
      allNotes.push(...result.notes);
      this._passNotes.set(result.passName, [...result.notes]);
      this.executionLog.push({
        passName: result.passName,
        score: result.metrics.score,
        issues: result.metrics.issues,
        noteCount: result.notes.length,
      });
    }

    // Deduplicate overlapping notes (same start time) keeping higher-priority roles
    const deduplicated = this._deduplicateOverlappingNotes(allNotes);

    return new MelodyResult(deduplicated, {
      passResults,
      executionLog: this.executionLog,
      phraseContext: config.phraseContext,
      chords: config.chords,
      originalNoteCount: allNotes.length,
      finalNoteCount: deduplicated.length,
    });
  }

  /**
   * Execute a single pass with selective regeneration on failure.
   * @param {MelodyTask} task - Task to execute
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} accumulatedNotes - Notes from previous passes
   * @returns {PassResult} Result from this pass
   * @private
   */
  async _executePassWithRegeneration(task, config, accumulatedNotes) {
    let attempts = 0;
    let lastResult = null;

    while (attempts < this.maxRegenerations) {
      attempts++;

      try {
        lastResult = await task.execute(config, accumulatedNotes, {
          attempt: attempts,
          previousResults: this.executionLog,
        });

        // Evaluate this pass
        lastResult.metrics = this._evaluatePass(lastResult, accumulatedNotes);

        // Check if pass meets threshold
        if (lastResult.metrics.passesThreshold) {
          return lastResult;
        }

        // Log failure and attempt regeneration
        console.warn(
          `[${lastResult.passName}] Failed threshold (score: ${lastResult.metrics.score}), attempt ${attempts}/${this.maxRegenerations}`
        );
      } catch (error) {
        console.error(`[${task.name}] Execution error:`, error);
        lastResult = new PassResult(
          task.name,
          [],
          new EvaluationMetrics(task.name, 0, [`Execution error: ${error.message}`], false)
        );
      }
    }

    // Return best result after max attempts
    return lastResult || new PassResult(task.name, [], new EvaluationMetrics(task.name, 0, ['Max regenerations reached'], false));
  }

  /**
   * Evaluate a pass result against quality criteria.
   * @param {PassResult} result - Pass result to evaluate
   * @param {MelodyNote[]} previousNotes - Notes from previous passes
   * @returns {EvaluationMetrics} Evaluation metrics
   * @private
   */
  _evaluatePass(result, previousNotes) {
    const issues = [];
    let score = 1.0;

    // Check for basic quality criteria
    if (result.notes.length === 0) {
      issues.push('No notes generated');
      score -= 0.5;
    }

    // Check for pitch range violations
    const pitches = result.notes.map((n) => n.pitch);
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);

    if (maxPitch - minPitch > 48) {
      issues.push('Excessive pitch range (>48 semitones)');
      score -= 0.2;
    }

    // Check for voice-leading issues (large leaps without resolution)
    const leaps = this._countLargeLeaps(result.notes);
    if (leaps > result.notes.length * 0.5) {
      issues.push('Excessive large leaps without resolution');
      score -= 0.3;
    }

    // Check for structural coherence (Pass A specific)
    if (result.passName === 'PassA_Structural') {
      const structuralNotes = result.notes.filter((n) => n.role === 'structural');
      if (structuralNotes.length < result.notes.length * 0.3) {
        issues.push('Insufficient structural notes');
        score -= 0.2;
      }
    }

    score = Math.max(0, Math.min(1, score));

    return new EvaluationMetrics(
      result.passName,
      score,
      issues,
      score >= this.minScoreThreshold
    );
  }

  /**
   * Count large leaps in a note sequence.
   * @param {MelodyNote[]} notes - Notes to analyze
   * @returns {number} Number of large leaps
   * @private
   */
  _countLargeLeaps(notes) {
    let leaps = 0;
    for (let i = 1; i < notes.length; i++) {
      const prevPitch = notes[i - 1].pitch;
      const currPitch = notes[i].pitch;
      const interval = Math.abs(currPitch - prevPitch);
      if (interval > 7) {
        leaps++;
      }
    }
    return leaps;
  }

  /**
    * Deduplicate overlapping notes (same start time) keeping higher-priority roles.
    * Priority order: structural > cadence > connector > ornament > expectation.
    * @param {MelodyNote[]} notes - All notes from all passes
    * @returns {MelodyNote[]} Deduplicated notes
    * @private
    */
  _deduplicateOverlappingNotes(notes) {
    const rolePriority = { structural: 5, cadence: 4, connector: 3, ornament: 2, expectation: 1 };

    // Group notes by start time
    const timeGroups = new Map();
    for (const note of notes) {
      const key = note.startTime;
      if (!timeGroups.has(key)) {
        timeGroups.set(key, []);
      }
      timeGroups.get(key).push(note);
    }

    // For each time group, keep only the note with highest priority role
    const deduplicated = [];
    for (const [, group] of timeGroups) {
      if (group.length === 1) {
        deduplicated.push(group[0]);
      } else {
        // Sort by priority (descending), then by pitch (ascending) for ties
        group.sort((a, b) => {
          const priorityA = rolePriority[a.role] || 0;
          const priorityB = rolePriority[b.role] || 0;
          if (priorityB !== priorityA) {
            return priorityB - priorityA;
          }
          return a.pitch - b.pitch;
        });
        deduplicated.push(group[0]);
      }
    }

    // Sort final result by start time
    deduplicated.sort((a, b) => a.startTime - b.startTime);
    return deduplicated;
  }

  /**
    * Get execution log for debugging/analysis.
    * @returns {Object[]} Execution log entries
    */
  getExecutionLog() {
    return [...this.executionLog];
  }

  /**
    * Get intermediate output from a specific pass by name.
    * @param {string} passName - Name of the pass (e.g., 'PassA_Structural')
    * @returns {Object|null} Pass result or null if not found
    */
  getPassOutput(passName) {
    const passResult = this.executionLog.find(p => p.passName === passName);
    if (!passResult) return null;
    return {
      ...passResult,
      notes: this._passNotes?.get(passName) || []
    };
  }

  /**
    * Get all intermediate pass outputs for debugging.
    * @returns {Object[]} All pass results with notes
    */
  getAllPassOutputs() {
    return this.executionLog.map(entry => ({
      ...entry,
      notes: this._passNotes?.get(entry.passName) || []
    }));
  }

  /**
    * Reset orchestrator state.
    */
  reset() {
    this.executionLog = [];
    this._passNotes = new Map();
  }
}

export default CompositionOrchestrator;
