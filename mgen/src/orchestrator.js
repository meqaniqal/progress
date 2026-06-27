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

    // Filter passes into structural and post-processing (refinement)
    const structuralPasses = this.passes.filter(p => {
      const name = p.name || p.constructor.name;
      return name !== 'PhraseEngine' && name !== 'ExpectationEngine' && name !== 'VoiceLeadingEngine';
    });
    const phraseEngineTask = this.passes.find(p => (p.name || p.constructor.name) === 'PhraseEngine');
    const expectationEngineTask = this.passes.find(p => (p.name || p.constructor.name) === 'ExpectationEngine');
    const voiceLeadingEngineTask = this.passes.find(p => (p.name || p.constructor.name) === 'VoiceLeadingEngine');

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

      // Step 1: Run structural passes sequentially with backtracking
      while (i < structuralPasses.length) {
        const task = structuralPasses[i];

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
      if (passResults.length < structuralPasses.length) {
        break;
      }

      // Step 2: Run post-processing refinement loop
      if (phraseEngineTask && expectationEngineTask && voiceLeadingEngineTask) {
        // Run PhraseEngine first to establish phrase structure
        const accumulatedStructural = this._accumulateNotes(passResults);
        const phraseResult = await this._executePassWithRegeneration(phraseEngineTask, config, accumulatedStructural);
        
        this._passNotes.set(phraseResult.passName, [...phraseResult.notes]);
        passResults.push(phraseResult);
        this.executionLog.push({
          passName: phraseResult.passName,
          score: phraseResult.metrics.score,
          issues: phraseResult.metrics.issues,
          noteCount: phraseResult.notes.length,
        });

        let currentRefinementNotes = [...phraseResult.notes];
        let previousIterationNotes = [];

        const maxRefinementIterations = 3;
        for (let refIter = 1; refIter <= maxRefinementIterations; refIter++) {
          if (this.timeBudget && this.timeBudget !== Infinity) {
            const elapsed = performance.now() - this._startTime;
            if (elapsed > this.timeBudget * 0.9) {
              console.warn(`[Orchestrator] Time budget low (${elapsed.toFixed(1)}ms). Exiting refinement early.`);
              break;
            }
          }

          previousIterationNotes = [...currentRefinementNotes];

          // Run ExpectationEngine
          const expResult = await this._executePassWithRegeneration(expectationEngineTask, config, currentRefinementNotes);
          
          // Run VoiceLeadingEngine on ExpectationEngine's output
          const vlResult = await this._executePassWithRegeneration(voiceLeadingEngineTask, config, expResult.notes);

          currentRefinementNotes = [...vlResult.notes];

          // Update the recorded pass results and log entries
          const expIdx = passResults.findIndex(r => r.passName === expResult.passName);
          if (expIdx !== -1) passResults[expIdx] = expResult;
          else passResults.push(expResult);

          const vlIdx = passResults.findIndex(r => r.passName === vlResult.passName);
          if (vlIdx !== -1) passResults[vlIdx] = vlResult;
          else passResults.push(vlResult);

          this._passNotes.set(expResult.passName, [...expResult.notes]);
          this._passNotes.set(vlResult.passName, [...vlResult.notes]);

          const expLogIdx = this.executionLog.findIndex(e => e.passName === expResult.passName);
          const expLogEntry = { passName: expResult.passName, score: expResult.metrics.score, issues: expResult.metrics.issues, noteCount: expResult.notes.length };
          if (expLogIdx !== -1) this.executionLog[expLogIdx] = expLogEntry;
          else this.executionLog.push(expLogEntry);

          const vlLogIdx = this.executionLog.findIndex(e => e.passName === vlResult.passName);
          const vlLogEntry = { passName: vlResult.passName, score: vlResult.metrics.score, issues: vlResult.metrics.issues, noteCount: vlResult.notes.length };
          if (vlLogIdx !== -1) this.executionLog[vlLogIdx] = vlLogEntry;
          else this.executionLog.push(vlLogEntry);

          // Exit early if notes stabilized
          if (this._areNotesEqual(previousIterationNotes, currentRefinementNotes)) {
            break;
          }
        }
      }

      // Assemble candidate melody from current pass results
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

      // Evaluate subcomponents and compatibility
      const subcomponentScores = this._evaluateSubcomponents(passResults, snappedNotes, config);
      const compatibilityEvaluation = this._evaluateCompatibility(snappedNotes, passResults, config);

      // Combine global evaluation issues and compatibility issues
      const allIssues = [
        ...globalEvaluation.issues,
        ...compatibilityEvaluation.issues
      ];

      // Update global score to be influenced by subcomponent coherence and compatibility
      const avgSubcomponentScore = Object.values(subcomponentScores).reduce((a, b) => a + b, 0) / Object.keys(subcomponentScores).length;
      const combinedScore = (globalEvaluation.score * 0.5) + (avgSubcomponentScore * 0.3) + (compatibilityEvaluation.score * 0.2);

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestNotes = snappedNotes;
        bestPassResults = [...passResults];
        bestExecutionLog = [...this.executionLog];
      }

      // If score passes threshold (>= 0.75), or we are in safeMode, stop iterating
      if ((combinedScore >= 0.75 && compatibilityEvaluation.score >= 0.8) || config.options.safeMode) {
        break;
      }

      config.options.feedbackAdjustments = allIssues;
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
   * Helper to check if two sets of MelodyNotes are identical in pitch and duration.
   * @private
   */
  _areNotesEqual(notesA, notesB) {
    if (!notesA || !notesB) return false;
    if (notesA.length !== notesB.length) return false;
    for (let i = 0; i < notesA.length; i++) {
      if (!notesA[i].equals(notesB[i])) {
        return false;
      }
    }
    return true;
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
   * Evaluate subcomponents individually to verify specialized coherence.
   * @private
   */
  _evaluateSubcomponents(passResults, notes, config) {
    const scores = {};

    // 1. PhraseEngine
    const phrasePass = passResults.find(r => r.passName === 'PhraseEngine');
    if (phrasePass && phrasePass.metadata && phrasePass.metadata.arc) {
      const arc = phrasePass.metadata.arc;
      let climaxScore = 1.0;
      if (notes.length > 0) {
        const maxPitch = Math.max(...notes.map(n => n.pitch));
        const climaxNotes = notes.filter(n => {
          const isClimaxSlot = Math.round(n.startTime) === arc.climaxSlot;
          const isClimaxPos = arc.climaxPositions && arc.climaxPositions.includes(Math.round(n.startTime));
          return isClimaxSlot || isClimaxPos;
        });
        const hasHighestAtClimax = climaxNotes.some(n => Math.abs(n.pitch - maxPitch) <= 1);
        if (!hasHighestAtClimax) climaxScore = 0.5;
      }
      
      const baseRegister = config.options?.baseRegister || 60;
      const stepSize = 12.0 / (config.options?.divisions || 12);
      let insideEnvelopeCount = 0;
      let totalChecked = 0;
      notes.forEach(note => {
        const slotIndex = Math.round(note.startTime);
        if (slotIndex >= 0 && slotIndex < arc.registers.length) {
          const registerFraction = arc.registers[slotIndex];
          const registerCeiling = baseRegister + 12 + (registerFraction * stepSize * 0.5);
          const registerFloor = baseRegister + (registerFraction * stepSize * 0.25);
          totalChecked++;
          if (note.pitch >= registerFloor && note.pitch <= registerCeiling) {
            insideEnvelopeCount++;
          }
        }
      });
      const registerScore = totalChecked > 0 ? insideEnvelopeCount / totalChecked : 1.0;
      scores.PhraseEngine = (climaxScore + registerScore) / 2;
    } else {
      scores.PhraseEngine = 1.0;
    }

    // 2. MotifEngine
    const motifNotes = notes.filter(n => n.metadata && n.metadata.motifId);
    const motifRatio = notes.length > 0 ? motifNotes.length / notes.length : 1.0;
    const validTransformations = ['transposition', 'sequence', 'inversion', 'retrograde', 'augmentation', 'diminution'];
    let validTransformCount = 0;
    motifNotes.forEach(n => {
      if (n.metadata.motifTransformation && validTransformations.includes(n.metadata.motifTransformation)) {
        validTransformCount++;
      }
    });
    const transformScore = motifNotes.length > 0 ? validTransformCount / motifNotes.length : 1.0;
    scores.MotifEngine = (motifRatio + transformScore) / 2;

    // 3. StyleEngine
    const stylePass = passResults.find(r => r.passName === 'StyleEngine');
    const activeStyle = stylePass?.metadata?.activeStyle || config.options?.style || 'pop';
    const maxInterval = activeStyle === 'baroque' ? 8 : (activeStyle === 'jazz' ? 14 : 12);
    let styleViolations = 0;
    for (let i = 1; i < notes.length; i++) {
      if (Math.abs(notes[i].pitch - notes[i-1].pitch) > maxInterval) {
        styleViolations++;
      }
    }
    scores.StyleEngine = notes.length > 1 ? 1.0 - (styleViolations / (notes.length - 1)) : 1.0;

    // 4. RhythmEngine
    const targetDensity = config.options?.density ?? 0.5;
    const activeNotes = notes.filter(n => n.duration > 0).length;
    const actualDensity = notes.length > 0 ? activeNotes / notes.length : 0;
    const densityScore = 1.0 - Math.abs(actualDensity - targetDensity);
    scores.RhythmEngine = Math.max(0, densityScore);

    // 5. ExpectationEngine
    const expectationAdjusted = notes.filter(n => n.metadata && n.metadata.expectationAdjusted);
    const resolvedPayoffs = expectationAdjusted.filter(n => n.metadata.adjustmentReason === 'payoff' || n.metadata.adjustmentReason === 'compensation');
    const expectationScore = expectationAdjusted.length > 0 ? resolvedPayoffs.length / expectationAdjusted.length : 1.0;
    scores.ExpectationEngine = expectationScore;

    // 6. VoiceLeadingEngine
    let totalLeaps = 0;
    let compensatedLeaps = 0;
    for (let i = 1; i < notes.length - 1; i++) {
      const prev = notes[i - 1].pitch;
      const curr = notes[i].pitch;
      const next = notes[i + 1].pitch;
      const interval1 = curr - prev;
      const interval2 = next - curr;
      if (Math.abs(interval1) > 7) {
        totalLeaps++;
        if (Math.sign(interval1) !== Math.sign(interval2)) {
          compensatedLeaps++;
        }
      }
    }
    scores.VoiceLeadingEngine = totalLeaps > 0 ? compensatedLeaps / totalLeaps : 1.0;

    return scores;
  }

  /**
   * Evaluate compatibility cross-engine relationships.
   * @private
   */
  _evaluateCompatibility(notes, passResults, config) {
    const issues = [];
    let score = 1.0;

    const phrasePass = passResults.find(r => r.passName === 'PhraseEngine');
    const rhythmPass = passResults.find(r => r.passName === 'RhythmEngine');

    if (notes.length === 0) return { score: 1.0, issues: [] };

    // 1. Phrase arc roles check
    if (phrasePass && phrasePass.metadata && phrasePass.metadata.arc) {
      const arc = phrasePass.metadata.arc;
      let phraseMismatches = 0;
      notes.forEach(note => {
        const slotIndex = Math.round(note.startTime);
        if (slotIndex >= 0 && slotIndex < arc.roles.length) {
          const expectedRole = arc.roles[slotIndex];
          if (note.role === 'structural' && expectedRole && note.metadata.phraseRole && note.metadata.phraseRole !== expectedRole) {
            phraseMismatches++;
          }
        }
      });
      if (phraseMismatches > notes.length * 0.3) {
        issues.push('rhythm-phrase-role-mismatch');
        score -= 0.15;
      }
    }

    // 2. Voice-leading preserving motif identity check
    const vlAdjustedMotifNotes = notes.filter(n => n.metadata && n.metadata.voiceLeadingAdjusted && n.metadata.motifId);
    let motifCorruptions = 0;
    vlAdjustedMotifNotes.forEach(n => {
      if (n.metadata.pitchOffset && Math.abs(n.metadata.pitchOffset) > 2) {
        motifCorruptions++;
      }
    });
    if (motifCorruptions > 0) {
      issues.push('voice-leading-motif-disruption');
      score -= 0.15;
    }

    // 3. Expectation vs Style constraints check
    const stylePass = passResults.find(r => r.passName === 'StyleEngine');
    const activeStyle = stylePass?.metadata?.activeStyle || config.options?.style || 'pop';
    const maxInterval = activeStyle === 'baroque' ? 8 : (activeStyle === 'jazz' ? 14 : 12);
    let expectationStyleViolations = 0;
    for (let i = 1; i < notes.length; i++) {
      const isExpectationAdjusted = notes[i].metadata && notes[i].metadata.expectationAdjusted;
      if (isExpectationAdjusted) {
        const interval = Math.abs(notes[i].pitch - notes[i - 1].pitch);
        if (interval > maxInterval) {
          expectationStyleViolations++;
        }
      }
    }
    if (expectationStyleViolations > 0) {
      issues.push('expectation-style-violation');
      score -= 0.15;
    }

    // 4. Ornament consistency with Rhythm template
    if (rhythmPass && rhythmPass.metadata && rhythmPass.metadata.activeTemplate) {
      const template = rhythmPass.metadata.activeTemplate;
      const stepsPerMeasure = this.stepsPerMeasure || 16;
      const activeChord = config.chords?.[0];
      const chordDuration = activeChord ? (activeChord.duration || 2) : 4;

      let inconsistentOrnaments = 0;
      const ornaments = notes.filter(n => n.role === 'ornament' && n.duration > 0);
      ornaments.forEach(note => {
        const measureStart = Math.floor(note.startTime / chordDuration) * chordDuration;
        const offsetInMeasure = note.startTime - measureStart;
        const sixteenthStep = Math.round((offsetInMeasure / chordDuration) * stepsPerMeasure) % stepsPerMeasure;
        if (template.grid && template.grid[sixteenthStep] === 0) {
          inconsistentOrnaments++;
        }
      });
      if (ornaments.length > 0 && (inconsistentOrnaments / ornaments.length) > 0.5) {
        issues.push('ornament-rhythm-inconsistency');
        score -= 0.15;
      }
    }

    return {
      score: Math.max(0.0, Math.min(1.0, score)),
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
          config.options.leapThreshold = Math.max(4, (config.options.leapThreshold || 7) - 1);
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
        case 'rhythm-phrase-role-mismatch':
          config.options.density = Math.max(0.2, (config.options.density || 0.5) - 0.1);
          break;
        case 'voice-leading-motif-disruption':
          config.options.transformProbability = Math.max(0.1, (config.options.transformProbability || 0.5) - 0.15);
          break;
        case 'expectation-style-violation':
          config.options.leapThreshold = Math.max(4, (config.options.leapThreshold || 7) - 1);
          break;
        case 'ornament-rhythm-inconsistency':
          config.options.density = Math.max(0.1, (config.options.density || 0.3) - 0.1);
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
   * Count notes by role across all passes.
   * Returns { structural: N, cadence: N, connector: N, ornament: N, expectation: N }.
   * Useful for benchmarking which passes contribute what.
   * @returns {Object} Role distribution
   */
  getRoleDistribution() {
    const dist = { structural: 0, cadence: 0, connector: 0, ornament: 0, expectation: 0 };
    for (const entry of this.executionLog) {
      const notes = this._passNotes?.get(entry.passName) || [];
      notes.forEach(n => { dist[n.role] = (dist[n.role] || 0) + 1; });
    }
    return dist;
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
