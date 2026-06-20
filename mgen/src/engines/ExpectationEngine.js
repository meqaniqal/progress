// Expectation Engine - Models listener predictions at multiple scales
// Created 2026-06-19 as a post-processing engine (runs after all 5 passes + Pass E)
// Original design (melodygen_architecture.md lines 183-213) described ExpectationEngine
// as "Pass 5" after Pass D. This implementation registers it as a post-processing engine
// because expectation analysis requires the complete melody context.

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Represents the listener's current expectation state.
 * Tracks predictions at multiple scales: pitch, rhythm, register, resolution.
 * Based on David Huron's ITPRA model (Sweet Anticipation, 2006).
 */
export class ListenerExpectation {
  constructor() {
    this.expectedPitch = null;
    this.expectedRhythm = null;
    this.expectedRegister = null;
    this.expectedResolution = null;
    this.expectationStrength = 0.0;
    this.priorContour = []; // last 4 pitch directions
  }

  reset() {
    this.expectedPitch = null;
    this.expectedRhythm = null;
    this.expectedRegister = null;
    this.expectedResolution = null;
    this.expectationStrength = 0.0;
    this.priorContour = [];
  }
}

/**
 * Trajectory rules for voice leading (from melodygen_design_patterns.md Phase 5).
 * Maps interval direction to preferred counter-direction.
 * Based on perceptual research (Huron 2001: "Tone and Voice").
 */
const TRAJECTORY_RULES = {
  'leap:up':    { preferredDir: -1, preferredSize: 'step', weight: 0.75 },
  'leap:down':  { preferredDir: +1, preferredSize: 'step', weight: 0.75 },
  'step:same':  { preferredDir:  0, preferredSize: 'step', weight: 0.50 },
  'skip:up':    { preferredDir: -1, preferredSize: 'step', weight: 0.60 },
  'skip:down':  { preferredDir: +1, preferredSize: 'step', weight: 0.60 },
};

/**
 * Classify a melodic interval.
 * @param {number} fromPitch - Starting pitch
 * @param {number} toPitch - Ending pitch
 * @param {number} [stepSize=12] - EDO step size
 * @returns {{ dir: number, size: string, semitones: number }}
 */
function classifyInterval(fromPitch, toPitch, stepSize = 12) {
  const diff = toPitch - fromPitch;
  const absDiff = Math.abs(diff);
  return {
    dir: Math.sign(diff),
    size: absDiff <= 2 ? 'step'
        : absDiff <= 4 ? 'skip'
        : 'leap',
    semitones: diff,
  };
}

/**
 * Get voice-leading bias based on the last interval and phrase role.
 * Relaxes rules at climax to allow upward continuation through the peak.
 * @param {{ dir: number, size: string }} lastInterval - Last interval classification
 * @param {string} phraseRole - Current phrase role
 * @param {number} [stepSize=12] - EDO step size
 * @returns {number} Directional bias (-1 to +1)
 */
function getVoiceLeadingBias(lastInterval, phraseRole, stepSize = 12) {
  if (!lastInterval) return 0;
  const { dir, size } = lastInterval;
  const key = `${size}:${dir > 0 ? 'up' : 'down'}`;
  const rule = TRAJECTORY_RULES[key];
  if (!rule) return 0;
  // Relax at climax — allow upward continuation through the peak
  if (phraseRole === 'climax') return dir * 0.3;
  return rule.preferredDir * rule.weight;
}

/**
 * Apply one of the four expectation operations.
 * Musical interest emerges from controlled management of expectations.
 * The objective is neither complete predictability nor complete surprise.
 *
 * @param {string} op - Operation: 'confirmation', 'delay', 'deflection', 'payoff'
 * @param {number} currentPitch - Current pitch
 * @param {number} expectedPitch - What the listener expects
 * @param {number[]} [scalePitches] - Valid scale pitches
 * @param {number[]} [stableTones] - Stable chord tones
 * @param {Object} [rng] - Random number generator
 * @returns {number} Adjusted pitch
 */
export function applyExpectationOp(op, currentPitch, expectedPitch, scalePitches = [], stableTones = [], rng = Math) {
  switch (op) {
    case 'confirmation':
      // Give the listener exactly what they predicted — creates satisfaction
      // Use at cadence points and after tension has built
      return expectedPitch !== null ? expectedPitch : currentPitch;

    case 'delay':
      // Defer the expected note — insert a passing tone or rest first
      // Creates momentary tension; payoff is more satisfying for the wait
      if (expectedPitch !== null) {
        const delayStep = (currentPitch + expectedPitch) / 2;
        if (scalePitches.length > 0) {
          let closest = scalePitches[0];
          let closestDist = Math.abs(delayStep - closest);
          for (let i = 1; i < scalePitches.length; i++) {
            const d = Math.abs(delayStep - scalePitches[i]);
            if (d < closestDist) { closestDist = d; closest = scalePitches[i]; }
          }
          return closest;
        }
        return Math.round(delayStep);
      }
      return currentPitch;

    case 'deflection':
      // Go somewhere unexpected but musically justified
      // Classic: expect the 3rd, get the 5th instead (both are stable)
      if (stableTones.length > 0 && expectedPitch !== null) {
        const unexpectedStable = stableTones.filter(p =>
          p !== expectedPitch && Math.abs(p - currentPitch) > 1
        );
        if (unexpectedStable.length > 0) {
          return unexpectedStable[Math.floor(rng.random() * unexpectedStable.length)];
        }
      }
      return currentPitch;

    case 'payoff':
      // After accumulated delay, deliver the expected note with rhythmic
      // emphasis (on a strong beat, with full duration)
      // Salimpoor et al. (2011) showed dopamine release peaks at
      // the moment of anticipated resolution
      if (expectedPitch !== null) return expectedPitch;
      if (stableTones.length > 0) {
        let closest = stableTones[0];
        let closestDist = Math.abs(currentPitch - closest);
        for (let i = 1; i < stableTones.length; i++) {
          const d = Math.abs(currentPitch - stableTones[i]);
          if (d < closestDist) { closestDist = d; closest = stableTones[i]; }
        }
        return closest;
      }
      return currentPitch;
  }
  return currentPitch;
}

/**
 * Update listener expectation based on the last pitch and interval.
 * Uses melodic inertia (Narmour): after a step, expect continuation.
 * After a leap, expect reversal. This is the core of implication-realization.
 *
 * @param {number} lastPitch - Last sounding pitch
 * @param {{ dir: number, size: string }} lastInterval - Last interval classification
 * @param {number[]} scalePitches - Valid scale pitches
 * @param {number[]} stableTones - Stable chord tones
 * @param {number[]} [registers] - Register trajectory from arc
 * @param {number} [stepIndex=0] - Current step index
 * @returns {ListenerExpectation} Updated expectation state
 */
export function updateExpectation(lastPitch, lastInterval, scalePitches, stableTones, registers = [], stepIndex = 0) {
  const expectation = new ListenerExpectation();

  if (!lastInterval) return expectation;

  const { dir, size } = lastInterval;

  if (size === 'step') {
    // After a step, expect continuation in same direction (Narmour implication)
    const idx = scalePitches.findIndex(p => Math.abs(p - lastPitch) < (12.0 / 12) * 0.5);
    if (idx !== -1) {
      const nextIdx = Math.min(scalePitches.length - 1, idx + dir);
      expectation.expectedPitch = scalePitches[nextIdx];
    }
    expectation.expectationStrength = 0.65; // steps imply continuation
  } else if (size === 'leap') {
    // After a leap, expect reversal (stronger implication)
    const idx = scalePitches.findIndex(p => Math.abs(p - lastPitch) < (12.0 / 12) * 0.5);
    if (idx !== -1) {
      const nextIdx = Math.max(0, idx - dir);
      expectation.expectedPitch = scalePitches[nextIdx];
    }
    expectation.expectationStrength = 0.80; // leaps imply stronger reversal
  }

  // Tonal gravity: add weight toward stable tones (Krumhansl tonal hierarchy)
  if (stableTones.length > 0) {
    let closestStable = stableTones[0];
    let closestDist = Math.abs(lastPitch - closestStable);
    for (let i = 1; i < stableTones.length; i++) {
      const d = Math.abs(lastPitch - stableTones[i]);
      if (d < closestDist) { closestDist = d; closestStable = stableTones[i]; }
    }
    if (closestDist < 2) {
      expectation.expectedResolution = closestStable;
      expectation.expectationStrength = Math.min(1.0, expectation.expectationStrength + 0.2);
    }
  }

  // Expected register trajectory
  if (registers.length > stepIndex + 1) {
    expectation.expectedRegister = registers[stepIndex + 1] > registers[stepIndex]
      ? 'ascending' : 'descending';
  }

  return expectation;
}

/**
 * Expectation Engine - Models listener predictions and manages expectation operations.
 * Runs as a post-processing engine after all 5 passes + Pass E.
 *
 * Original design (melodygen_architecture.md) described ExpectationEngine as "Pass 5"
 * after Pass D. This implementation registers it as a post-processing engine because
 * expectation analysis requires the complete melody context.
 */
export class ExpectationEngine {
  /**
   * @param {Object} options - Engine options
   * @param {number} [options.leapThreshold=7] - Semitones to classify as leap
   * @param {number} [options.maxConsecutiveConfirmations=2] - Max confirmations before forcing variation
   * @param {boolean} [options.enforcePayoff=true] - Ensure phrase-final notes are payoffs
   */
  constructor(options = {}) {
    this.leapThreshold = options.leapThreshold || 7;
    this.maxConsecutiveConfirmations = options.maxConsecutiveConfirmations || 2;
    this.enforcePayoff = options.enforcePayoff !== false;
    this.expectationHistory = [];
  }

  /**
   * Execute Expectation Engine: Review complete melody and adjust based on expectation analysis.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from all previous passes
   * @param {Object} [context] - Execution context (may contain arc, phrase roles)
   * @returns {PassResult} Expectation refinement result
   */
  async execute(config, previousNotes, context = {}) {
    if (previousNotes.length === 0) {
      return new PassResult(
        'ExpectationEngine',
        [],
        new EvaluationMetrics('ExpectationEngine', 0.5, [], true),
        {
          expectationHistory: [],
          adjustmentsMade: 0,
        }
      );
    }

    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);
    const arc = context.arc || (config.options && config.options.arc) || null;
    const expectation = new ListenerExpectation();
    const adjustments = [];

    // Build scale pitches and stable tones from chord data
    const scalePitches = this._buildScalePitches(config);
    const stableTones = this._buildStableTones(config);

    // Scan through notes, updating expectations and applying operations
    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      const prevNote = i > 0 ? sortedNotes[i - 1] : null;

      // Classify the interval from the previous note
      let lastInterval = null;
      if (prevNote) {
        lastInterval = classifyInterval(prevNote.pitch, note.pitch, 12.0 / (config.options?.divisions || 12));
      }

      // Update expectation based on last interval
      const updatedExpectation = updateExpectation(
        prevNote ? prevNote.pitch : note.pitch,
        lastInterval,
        scalePitches,
        stableTones,
        arc ? arc.registers : [],
        i
      );

      expectation.priorContour.push(lastInterval ? lastInterval.dir : 0);
      if (expectation.priorContour.length > 4) expectation.priorContour.shift();

      // Check for momentum: 4 same-direction steps → force turn
      if (expectation.priorContour.length >= 4) {
        const allUp = expectation.priorContour.every(d => d > 0);
        const allDown = expectation.priorContour.every(d => d < 0);
        if (allUp || allDown) {
          // Force a turn — this is momentum tracking
          const turnDir = allUp ? -1 : 1;
          const adjustedPitch = note.pitch + turnDir;
          if (adjustedPitch !== note.pitch) {
            adjustments.push({
              index: i,
              originalPitch: note.pitch,
              adjustedPitch,
              reason: 'momentumTurn',
              note: note,
            });
          }
        }
      }

      // Check for unresolved large leaps (big leap with no step-back)
      if (lastInterval && lastInterval.size === 'leap') {
        if (i < sortedNotes.length - 1) {
          const nextNote = sortedNotes[i + 1];
          const nextInterval = classifyInterval(note.pitch, nextNote.pitch, 12.0 / (config.options?.divisions || 12));
          // If the next note doesn't move back toward the origin, flag it
          const sameDirection = (lastInterval.dir === nextInterval.dir) && Math.abs(nextInterval.semitones) < 3;
          if (sameDirection && Math.abs(lastInterval.semitones) > this.leapThreshold) {
            adjustments.push({
              index: i + 1,
              originalPitch: nextNote.pitch,
              adjustedPitch: note.pitch + Math.sign(lastInterval.dir) * Math.min(Math.abs(nextInterval.semitones) + 1, 3),
              reason: 'unresolvedLeap',
              note: nextNote,
            });
          }
        }
      }

      // Track consecutive confirmations
      if (updatedExpectation.expectedPitch !== null) {
        const isConfirmation = Math.abs(note.pitch - updatedExpectation.expectedPitch) <= 1;
        if (isConfirmation) {
          expectation.confirmationStreak = (expectation.confirmationStreak || 0) + 1;
        } else {
          expectation.confirmationStreak = 0;
        }

        // Prevent 3+ consecutive confirmations without a delay or deflection
        if (expectation.confirmationStreak > this.maxConsecutiveConfirmations) {
          const op = expectation.confirmationStreak % 3 === 0 ? 'deflection' : 'delay';
          const adjustedPitch = applyExpectationOp(op, note.pitch, updatedExpectation.expectedPitch, scalePitches, stableTones);
          if (adjustedPitch !== note.pitch) {
            adjustments.push({
              index: i,
              originalPitch: note.pitch,
              adjustedPitch,
              reason: `excessiveConfirmation_${op}`,
              note: note,
            });
          }
        }
      }

      // Ensure phrase-final notes are payoffs
      if (this.enforcePayoff && i === sortedNotes.length - 1) {
        const phraseRole = note.metadata?.phraseRole || note.metadata?.phraseRole;
        if (phraseRole === 'resolution' && stableTones.length > 0) {
          let closestStable = stableTones[0];
          let closestDist = Math.abs(note.pitch - closestStable);
          for (let j = 1; j < stableTones.length; j++) {
            const d = Math.abs(note.pitch - stableTones[j]);
            if (d < closestDist) { closestDist = d; closestStable = stableTones[j]; }
          }
          if (Math.abs(note.pitch - closestStable) > 1) {
            adjustments.push({
              index: i,
              originalPitch: note.pitch,
              adjustedPitch: closestStable,
              reason: 'payoffEnforcement',
              note: note,
            });
          }
        }
      }

      this.expectationHistory.push({
        index: i,
        pitch: note.pitch,
        expectation: { ...updatedExpectation },
        lastInterval,
      });
    }

    // Apply adjustments to notes
    const adjustedNotes = sortedNotes.map((note, i) => {
      const adjustment = adjustments.find(a => a.index === i);
      if (adjustment) {
        return new MelodyNote(
          adjustment.adjustedPitch,
          note.startTime,
          note.duration,
          note.role,
          {
            ...note.metadata,
            expectationAdjusted: true,
            adjustmentReason: adjustment.reason,
            originalPitch: adjustment.originalPitch,
          }
        );
      }
      return note;
    });

    return new PassResult(
      'ExpectationEngine',
      adjustedNotes,
      new EvaluationMetrics(
        'ExpectationEngine',
        this._calculateExpectationScore(adjustedNotes, adjustments),
        adjustments.length > 0 ? [`Made ${adjustments.length} expectation-based adjustments`] : [],
        true
      ),
      {
        expectationHistory: this.expectationHistory,
        adjustmentsMade: adjustments.length,
        adjustments,
      }
    );
  }

  /**
   * Build scale pitches from chord data.
   * @param {GenerationConfig} config - Generation configuration
   * @returns {number[]} Scale pitches
   * @private
   */
  _buildScalePitches(config) {
    const chords = config.chords || [];
    if (chords.length === 0) return [];

    // Use the first chord's scale degrees as the basis
    const firstChord = chords[0];
    const baseKey = config.options?.baseRegister || 60;

    // Build a simple major scale as default
    const scaleIntervals = [0, 2, 4, 5, 7, 9, 11];
    return scaleIntervals.map(d => baseKey + d);
  }

  /**
   * Build stable tones from chord data.
   * @param {GenerationConfig} config - Generation configuration
   * @returns {number[]} Stable tones (root, 3rd, 5th)
   * @private
   */
  _buildStableTones(config) {
    const chords = config.chords || [];
    if (chords.length === 0) return [];

    const firstChord = chords[0];
    const baseKey = config.options?.baseRegister || 60;

    // Root, 3rd, 5th are stable tones
    const scaleIntervals = [0, 4, 7];
    return scaleIntervals.map(d => baseKey + d);
  }

  /**
   * Calculate expectation quality score.
   * @param {MelodyNote[]} notes - All notes
   * @param {Object[]} adjustments - Adjustments made
   * @returns {number} Score (0.0-1.0)
   * @private
   */
  _calculateExpectationScore(notes, adjustments) {
    if (notes.length === 0) return 0.5;

    let score = 1.0;
    const adjustmentRatio = adjustments.length / notes.length;

    // Penalize excessive adjustments (indicates poor prior passes)
    if (adjustmentRatio > 0.3) {
      score -= 0.3;
    } else if (adjustmentRatio > 0.15) {
      score -= 0.15;
    }

    // Reward payoff enforcement
    const payoffAdjustments = adjustments.filter(a => a.reason === 'payoffEnforcement');
    if (payoffAdjustments.length > 0) {
      score += 0.05; // Small bonus for enforcing payoffs
    }

    // Penalize unresolved leaps
    const unresolvedLeaps = adjustments.filter(a => a.reason === 'unresolvedLeap');
    if (unresolvedLeaps.length > 0) {
      score -= 0.1 * unresolvedLeaps.length;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get the expectation history.
   * @returns {Object[]} Expectation history entries
   */
  getExpectationHistory() {
    return [...this.expectationHistory];
  }

  /**
   * Reset expectation state.
   */
  reset() {
    this.expectationHistory = [];
  }
}

export default ExpectationEngine;
