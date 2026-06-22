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
   * @param {number} [options.timeBudget=Infinity] - Execution time budget in ms
   */
  constructor(options = {}) {
    this.maxRegenerations = options.maxRegenerations || 3;
    this.minScoreThreshold = options.minScoreThreshold || 0.5;
    this.timeBudget = options.timeBudget || Infinity;
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
    this._startTime = performance.now();
    this.safeModeTriggered = false;
    this.backtrackCount = 0;
    this.maxBacktracks = 2;
    this.executionLog = [];

    if (!config.options) {
      config.options = {};
    }
    // Initialize/Reset dynamic properties
    config.options.safeMode = false;
    config.options.backtrackFeedback = null;
    config.options.feedbackAdjustments = null;

    const maxFeedbackIterations = config.options.maxFeedbackIterations !== undefined 
      ? config.options.maxFeedbackIterations 
      : 5;

    let bestNotes = null;
    let bestScore = -1;
    let bestPassResults = [];
    let bestExecutionLog = [];

    let feedbackIteration = 0;

    while (feedbackIteration < maxFeedbackIterations) {
      feedbackIteration++;
      
      const passResults = [];
      this._passNotes = new Map();
      this.executionLog = [];
      let i = 0;

      // On iterations > 1, dynamically adjust parameters based on feedback
      if (feedbackIteration > 1 && config.options.feedbackAdjustments) {
        this._applyFeedbackAdjustments(config, config.options.feedbackAdjustments);
      }

      while (i < this.passes.length) {
        const task = this.passes[i];

        // Check if time budget is running low (over 70% elapsed) to preserve real-time play
        if (this.timeBudget && this.timeBudget !== Infinity) {
          const elapsed = performance.now() - this._startTime;
          if (elapsed > this.timeBudget * 0.7) {
            config.options.safeMode = true;
            this.safeModeTriggered = true;
            if (feedbackIteration > 1) {
              console.warn(`[Orchestrator] Time budget running low (${elapsed.toFixed(1)}ms). Exiting feedback loop early.`);
              break;
            }
            console.warn(`[Orchestrator] Time budget running low (${elapsed.toFixed(1)}ms / ${this.timeBudget}ms). Switching remaining passes to SAFE mode.`);
          }
        }

        const accumulatedNotes = this._accumulateNotes(passResults.slice(0, i));
        const result = await this._executePassWithRegeneration(task, config, accumulatedNotes);

        if (!result.metrics.passesThreshold && i > 0 && this.backtrackCount < this.maxBacktracks && !config.options.safeMode) {
          this.backtrackCount++;
          i--; // Backtrack
          passResults.length = i;
          this.executionLog.length = i;
          config.options.backtrackFeedback = {
            failedPass: task.name || task.constructor.name,
            issues: result.metrics.issues
          };
          continue;
        }

        config.options.backtrackFeedback = null;
        const passName = result.passName;
        this._passNotes.set(passName, [...result.notes]);

        const existingIdx = passResults.findIndex(r => r.passName === passName);
        if (existingIdx !== -1) {
          passResults[existingIdx] = result;
        } else {
          passResults.push(result);
        }

        this.executionLog.push({
          passName: result.passName,
          score: result.metrics.score,
          issues: result.metrics.issues,
          noteCount: result.notes.length,
        });

        i++;
      }

      // If we exited early due to time budget, exit the feedback loop
      if (passResults.length < this.passes.length) {
        break;
      }

      // Assemble candidate melody
      const finalAccumulatedNotes = this._accumulateNotes(passResults);
      const deduplicated = this._deduplicateOverlappingNotes(finalAccumulatedNotes);
      const soundingNotes = deduplicated.filter(n => n.duration > 0);
      const snappedNotes = this._snapPitchesToHarmonicContext(soundingNotes, config.chords, config.options);
      snappedNotes.sort((a, b) => a.startTime - b.startTime);

      // Clamp durations
      for (let j = 0; j < snappedNotes.length - 1; j++) {
        const currentNote = snappedNotes[j];
        const nextNote = snappedNotes[j + 1];
        const timeToNext = nextNote.startTime - currentNote.startTime;
        if (currentNote.duration > timeToNext) {
          currentNote.duration = timeToNext;
        }
      }

      // Evaluate globally
      const globalEvaluation = this._evaluateMelodyGlobally(snappedNotes, config);

      if (globalEvaluation.score > bestScore) {
        bestScore = globalEvaluation.score;
        bestNotes = snappedNotes;
        bestPassResults = [...passResults];
        bestExecutionLog = [...this.executionLog];
      }

      // If score passes threshold (>= 0.75), or we are in safeMode, stop iterating
      if (globalEvaluation.passesThreshold || config.options.safeMode) {
        break;
      }

      config.options.feedbackAdjustments = globalEvaluation.issues;
    }

    return new MelodyResult(bestNotes || [], {
      passResults: bestPassResults,
      executionLog: bestExecutionLog,
      phraseContext: config.phraseContext,
      chords: config.chords,
      originalNoteCount: bestNotes ? bestNotes.length : 0,
      finalNoteCount: bestNotes ? bestNotes.length : 0,
      safeModeTriggered: this.safeModeTriggered,
      backtrackCount: this.backtrackCount,
      feedbackIterations: feedbackIteration,
      globalScore: bestScore,
      executionTimeMs: performance.now() - this._startTime
    });
  }

  /**
   * Evaluate a generated melody globally against composition guidelines.
   * @param {MelodyNote[]} notes - Melody notes
   * @param {GenerationConfig} config - Config context
   * @returns {Object} Evaluation metrics including score and issues
   * @private
   */
  _evaluateMelodyGlobally(notes, config) {
    const issues = [];
    let score = 1.0;

    if (!notes || notes.length === 0) {
      return { score: 0.0, passesThreshold: false, issues: ['no-notes'] };
    }

    // 1. Pitch Diversity
    const pitchCounts = {};
    notes.forEach(n => {
      pitchCounts[n.pitch] = (pitchCounts[n.pitch] || 0) + 1;
    });
    const uniqueRatio = Object.keys(pitchCounts).length / notes.length;
    if (uniqueRatio < 0.25) {
      issues.push('low-pitch-diversity');
      score -= 0.2;
    }

    // 2. Voice-leading: large leap compensation
    let uncompensatedLeaps = 0;
    for (let i = 1; i < notes.length - 1; i++) {
      const prev = notes[i - 1].pitch;
      const curr = notes[i].pitch;
      const next = notes[i + 1].pitch;
      const interval1 = curr - prev;
      const interval2 = next - curr;
      if (Math.abs(interval1) > 7) {
        if (Math.sign(interval1) === Math.sign(interval2)) {
          uncompensatedLeaps++;
        }
      }
    }
    if (uncompensatedLeaps > 2) {
      issues.push('excessive-uncompensated-leaps');
      score -= 0.15;
    }

    // 3. Harmonic responsiveness
    let nonChordStructuralCount = 0;
    let structuralCount = 0;
    notes.forEach(note => {
      if (note.role === 'structural') {
        structuralCount++;
        const activeChord = config.chords.find(c => note.startTime >= c.beatStart && note.startTime < c.beatStart + c.duration) || config.chords[0];
        if (activeChord && activeChord.notes && activeChord.notes.length > 0) {
          const isChordTone = activeChord.notes.some(n => Math.abs((n % 12) - (note.pitch % 12)) < 0.1);
          if (!isChordTone) {
            nonChordStructuralCount++;
          }
        }
      }
    });
    if (structuralCount > 0 && (nonChordStructuralCount / structuralCount) > 0.4) {
      issues.push('weak-harmonic-responsiveness');
      score -= 0.2;
    }

    // 4. Motivic coherence (interval repetition checking)
    const intervals = [];
    for (let i = 1; i < notes.length; i++) {
      intervals.push(notes[i].pitch - notes[i - 1].pitch);
    }
    let repetitionCount = 0;
    for (let i = 0; i < intervals.length - 3; i++) {
      for (let j = i + 2; j < intervals.length - 1; j++) {
        if (intervals[i] === intervals[j] && intervals[i+1] === intervals[j+1]) {
          repetitionCount++;
        }
      }
    }
    if (repetitionCount > notes.length * 0.5) {
      issues.push('excessive-repetition');
      score -= 0.15;
    } else if (repetitionCount === 0 && notes.length > 8) {
      issues.push('low-motivic-coherence');
      score -= 0.1;
    }

    score = Math.max(0.0, Math.min(1.0, score));
    return {
      score,
      passesThreshold: score >= 0.75,
      issues
    };
  }

  /**
   * Adjust parameters in GenerationConfig based on feedback issues.
   * @param {GenerationConfig} config - Target configuration
   * @param {string[]} issues - List of issues detected in evaluation
   * @private
   */
  _applyFeedbackAdjustments(config, issues) {
    if (!config.options) config.options = {};
    issues.forEach(issue => {
      switch (issue) {
        case 'low-pitch-diversity':
          config.options.pitchDiversityWeight = Math.min(1.0, (config.options.pitchDiversityWeight || 0.0) + 0.3);
          break;
        case 'excessive-uncompensated-leaps':
          config.options.maxLeap = Math.max(4, (config.options.maxLeap || 12) - 2);
          break;
        case 'weak-harmonic-responsiveness':
          config.options.strictChordTones = true;
          break;
        case 'excessive-repetition':
          config.options.density = Math.max(0.2, (config.options.density || 0.5) - 0.15);
          break;
        case 'low-motivic-coherence':
          config.options.pitchDiversityWeight = Math.max(0.1, (config.options.pitchDiversityWeight || 0.0) - 0.2);
          break;
      }
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
    const maxAttempts = config.options?.safeMode ? 1 : this.maxRegenerations;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        lastResult = await task.execute(config, accumulatedNotes, {
          attempt: attempts,
          previousResults: this.executionLog,
        });

        // Evaluate this pass
        lastResult.metrics = this._evaluatePass(lastResult, accumulatedNotes);

        // Check if pass meets threshold
        if (lastResult.metrics.passesThreshold || config.options?.safeMode) {
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
   * Accumulates notes from executed passes, handling both additive and refining/complete passes.
   * Refining passes (Rhythm, Style, Phrase, Expectation, VoiceLeading) replace preceding notes
   * with the complete modified set of notes. Additive passes append new notes.
   * @param {Object[]} results - Pass results
   * @returns {MelodyNote[]} Accumulated notes
   * @private
   */
  _accumulateNotes(results) {
    let accumulated = [];
    const refiningPasses = ['PassE_Expectation', 'RhythmEngine', 'StyleEngine', 'PhraseEngine', 'ExpectationEngine', 'VoiceLeadingEngine'];
    
    for (const res of results) {
      if (res && res.notes) {
        if (refiningPasses.includes(res.passName)) {
          // A refining pass returns the complete set of notes, replacing what was accumulated so far
          accumulated = [...res.notes];
        } else {
          // An additive pass returns only its new notes, so we append them
          accumulated.push(...res.notes);
        }
      }
    }
    return accumulated;
  }

  /**
   * Snaps all notes' pitches to the chord tones (for structural/cadence roles)
   * or scale tones (for connector/ornament/expectation roles) of the active chord.
   * @param {MelodyNote[]} notes - Notes to snap
   * @param {Chord[]} chords - Chord progression
   * @param {Object} [configOptions] - Generation options
   * @returns {MelodyNote[]} Snapped notes
   * @private
   */
  _snapPitchesToHarmonicContext(notes, chords, configOptions = {}) {
    if (!chords || chords.length === 0) return notes;

    if (configOptions.snapToHarmonicContext === false) {
      return notes;
    }

    const noteValues = {
      C: 0,
      'C#': 1, Csh: 1,
      Db: 1, Dbb: 0,
      D: 2,
      'D#': 3, Dsh: 3,
      Eb: 3, Ebb: 1,
      E: 4, Esh: 5,
      F: 5, Fb: 3, Fbb: 3,
      'F#': 6, Fsh: 6, Gb: 6,
      G: 7, Gbb: 4,
      'G#': 8, Gsh: 8, Ab: 8, Abb: 7,
      A: 9,
      'A#': 10, Ash: 10, Bb: 10, Bbb: 8,
      B: 11, Bsh: 12,
    };

    const getRootPc = (rootName) => {
      const cleanRoot = rootName.replace(/\d+$/, '');
      return noteValues[cleanRoot] !== undefined ? noteValues[cleanRoot] : 0;
    };

    const registerRange = configOptions.registerRange;
    const minRegister = registerRange ? (registerRange.min || 0) : 0;
    const maxRegister = registerRange ? (registerRange.max || 127) : 127;

    return notes.map(note => {
      // 1. Find active chord at note.startTime
      let activeChord = chords[0];
      for (let i = 0; i < chords.length; i++) {
        const c = chords[i];
        const nextC = chords[i + 1];
        const chordDuration = c.duration || 2;
        const nextStart = nextC ? nextC.beatStart : c.beatStart + chordDuration;
        
        if (note.startTime >= c.beatStart && note.startTime < nextStart) {
          activeChord = c;
          break;
        }
      }

      // 2. Get scale/chord pitch classes
      const rootPc = getRootPc(activeChord.root);
      const quality = activeChord.quality || 'maj';

      let chordIntervals = [0, 4, 7]; // default major
      let scaleIntervals = [0, 2, 4, 5, 7, 9, 11];

      if (quality === 'min' || quality === 'min7') {
        chordIntervals = [0, 3, 7];
        scaleIntervals = [0, 2, 3, 5, 7, 8, 10];
      } else if (quality === 'dim') {
        chordIntervals = [0, 3, 6];
        scaleIntervals = [0, 2, 3, 5, 6, 8, 10];
      } else if (quality === 'aug') {
        chordIntervals = [0, 4, 8];
        scaleIntervals = [0, 2, 4, 6, 8, 10];
      } else if (quality === '7') {
        chordIntervals = [0, 4, 7, 10];
        scaleIntervals = [0, 2, 4, 5, 7, 9, 10];
      } else if (quality === 'maj7') {
        chordIntervals = [0, 4, 7, 11];
        scaleIntervals = [0, 2, 4, 5, 7, 9, 11];
      }

      const isChordToneRole = note.role === 'structural' || note.role === 'cadence';
      let targetPitchClasses = [];

      if (isChordToneRole) {
        if (activeChord.notes && activeChord.notes.length > 0) {
          targetPitchClasses = activeChord.notes.map(n => n % 12);
        } else {
          targetPitchClasses = chordIntervals.map(i => (rootPc + i) % 12);
        }
      } else {
        if (activeChord.notes && activeChord.notes.length > 0) {
          const chordPcs = activeChord.notes.map(n => n % 12);
          const scalePcs = scaleIntervals.map(i => (rootPc + i) % 12);
          targetPitchClasses = [...new Set([...chordPcs, ...scalePcs])];
        } else {
          targetPitchClasses = scaleIntervals.map(i => (rootPc + i) % 12);
        }
      }

      const currentOctave = Math.floor(note.pitch / 12);
      
      let bestPitch = note.pitch;
      let minDiff = Infinity;

      for (let oct = currentOctave - 1; oct <= currentOctave + 1; oct++) {
        for (const pc of targetPitchClasses) {
          const candidate = oct * 12 + pc;
          if (candidate >= 0 && candidate <= 127) {
            if (registerRange && (candidate < minRegister || candidate > maxRegister)) {
              continue;
            }
            const diff = Math.abs(note.pitch - candidate);
            if (diff < minDiff) {
              minDiff = diff;
              bestPitch = candidate;
            }
          }
        }
      }

      if (bestPitch !== note.pitch) {
        return new MelodyNote(
          bestPitch,
          note.startTime,
          note.duration,
          note.role,
          {
            ...note.metadata,
            snappedToChord: true,
            originalPitch: note.pitch,
            activeChordSymbol: `${activeChord.root}${activeChord.quality}`,
          }
        );
      }

      return note;
    });
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
