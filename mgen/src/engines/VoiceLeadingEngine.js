// Voice Leading Engine - Maintains perceptually coherent motion through trajectories
// Created 2026-06-19 as a post-processing engine (runs after all 5 passes + Pass E + ExpectationEngine)
// Original design (melodygen_architecture.md lines 216-247) described VoiceLeadingEngine
// as "Phase 5" (a later priority). This implementation registers it as a post-processing engine
// because voice-leading analysis requires the complete melody context.

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Trajectory rules for voice leading (from melodygen_design_patterns.md Phase 5).
 * Maps interval direction to preferred counter-direction.
 * Based on perceptual research (Huron 2001: "Tone and Voice").
 *
 * Classical voice-leading rules derived from auditory streaming research:
 * - Large upward leaps should be followed by stepwise downward motion
 * - Large downward leaps should be followed by stepwise upward motion
 * - Small motions (steps) have weaker directional preferences
 * - At climax, rules are relaxed to allow upward continuation through the peak
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
export function classifyInterval(fromPitch, toPitch, stepSize = 12) {
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
export function getVoiceLeadingBias(lastInterval, phraseRole, stepSize = 12) {
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
 * Voice Leading Engine - Maintains perceptually coherent motion through trajectories.
 * Operates on vectors (trajectories), not isolated intervals.
 *
 * Original design (melodygen_architecture.md) described VoiceLeadingEngine as "Phase 5"
 * (a later priority). This implementation registers it as a post-processing engine
 * because voice-leading analysis requires the complete melody context.
 *
 * Also fixes StyleEngine's _findPreviousNote() bug (always returned null).
 */
export class VoiceLeadingEngine {
  /**
   * @param {Object} options - Engine options
   * @param {number} [options.leapThreshold=7] - Semitones to classify as leap
   * @param {number} [options.momentumWindow=4] - Number of steps for momentum tracking
   * @param {boolean} [options.compensateLeaps=true] - Compensate large leaps with counter-directional motion
   */
  constructor(options = {}) {
    this.leapThreshold = options.leapThreshold || 7;
    this.momentumWindow = options.momentumWindow || 4;
    this.compensateLeaps = options.compensateLeaps !== false;
    this.intervalHistory = [];
  }

  /**
   * Execute Voice Leading Engine: Review complete melody and adjust for coherent motion.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from all previous passes
   * @param {Object} [context] - Execution context (may contain arc, phrase roles)
   * @returns {PassResult} Voice leading result
   */
  async execute(config, previousNotes, context = {}) {
    if (previousNotes.length === 0) {
      return new PassResult(
        'VoiceLeadingEngine',
        [],
        new EvaluationMetrics('VoiceLeadingEngine', 0.5, [], true),
        {
          intervalHistory: [],
          adjustmentsMade: 0,
        }
      );
    }

    const sortedNotes = [...previousNotes].sort((a, b) => a.startTime - b.startTime);
    const stepSize = 12.0 / (config.options?.divisions || 12);
    const arc = context.arc || (config.options && config.options.arc) || null;
    const adjustments = [];
    const contourBuffer = [];

    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      const prevNote = i > 0 ? sortedNotes[i - 1] : null;

      if (!prevNote) {
        this.intervalHistory.push({ index: i, interval: null });
        continue;
      }

      const interval = classifyInterval(prevNote.pitch, note.pitch, stepSize);
      this.intervalHistory.push({ index: i, interval });

      // Get voice-leading bias for this interval
      const phraseRole = note.metadata?.phraseRole || note.metadata?.phraseRole || 'statement';
      const bias = getVoiceLeadingBias(interval, phraseRole, stepSize);

      // Check if the next note follows the expected counter-direction
      if (this.compensateLeaps && interval.size === 'leap' && i < sortedNotes.length - 1) {
        const nextNote = sortedNotes[i + 1];
        const nextInterval = classifyInterval(note.pitch, nextNote.pitch, stepSize);

        // A leap should be followed by counter-directional stepwise motion
        const followsExpectedDirection = (nextInterval.dir === -interval.dir) ||
                                          (nextInterval.size === 'step' && Math.abs(nextInterval.semitones) <= 2);

        if (!followsExpectedDirection && Math.abs(interval.semitones) > this.leapThreshold) {
          // Compensate: adjust the next note to move back toward the origin
          const targetPitch = note.pitch + (-interval.dir) * Math.min(2, Math.abs(nextInterval.semitones) + 1);
          adjustments.push({
            index: i + 1,
            originalPitch: nextNote.pitch,
            adjustedPitch: Math.max(0, Math.min(127, Math.round(targetPitch))),
            reason: 'leapCompensation',
            interval: interval,
            note: nextNote,
          });
        }
      }

      // Momentum tracking: if last N steps all moved same direction, force a turn
      contourBuffer.push(interval.dir);
      if (contourBuffer.length > this.momentumWindow) {
        contourBuffer.shift();
      }

      if (contourBuffer.length >= this.momentumWindow) {
        const allUp = contourBuffer.every(d => d > 0);
        const allDown = contourBuffer.every(d => d < 0);

        if (allUp || allDown) {
          const turnDir = allUp ? -1 : 1;
          if (i < sortedNotes.length - 1) {
            const nextNote = sortedNotes[i + 1];
            const targetPitch = nextNote.pitch + turnDir;
            if (targetPitch !== nextNote.pitch) {
              adjustments.push({
                index: i + 1,
                originalPitch: nextNote.pitch,
                adjustedPitch: Math.max(0, Math.min(127, Math.round(targetPitch))),
                reason: 'momentumTurn',
                interval: interval,
                note: nextNote,
              });
            }
          }
        }
      }
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
            voiceLeadingAdjusted: true,
            adjustmentReason: adjustment.reason,
            originalPitch: adjustment.originalPitch,
            interval: adjustment.interval,
          }
        );
      }
      return note;
    });

    return new PassResult(
      'VoiceLeadingEngine',
      adjustedNotes,
      new EvaluationMetrics(
        'VoiceLeadingEngine',
        this._calculateVoiceLeadingScore(adjustedNotes, adjustments, sortedNotes),
        adjustments.length > 0 ? [`Made ${adjustments.length} voice-leading adjustments`] : [],
        true
      ),
      {
        intervalHistory: this.intervalHistory,
        adjustmentsMade: adjustments.length,
        adjustments,
      }
    );
  }

  /**
   * Calculate voice leading quality score.
   * @param {MelodyNote[]} notes - All notes
   * @param {Object[]} adjustments - Adjustments made
   * @param {MelodyNote[]} originalNotes - Original notes (before adjustment)
   * @returns {number} Score (0.0-1.0)
   * @private
   */
  _calculateVoiceLeadingScore(notes, adjustments, originalNotes) {
    if (notes.length === 0) return 0.5;

    let score = 1.0;
    const stepSize = 12.0;

    // Count leaps and their compensation rate
    let leapCount = 0;
    let compensatedLeaps = 0;

    for (let i = 1; i < notes.length; i++) {
      const interval = classifyInterval(originalNotes[i - 1].pitch, originalNotes[i].pitch, stepSize);
      if (interval.size === 'leap') {
        leapCount++;
        const wasAdjusted = adjustments.find(a => a.index === i && a.reason === 'leapCompensation');
        if (wasAdjusted) compensatedLeaps++;
      }
    }

    // Penalize un-compensated leaps
    const uncompensatedLeaps = leapCount - compensatedLeaps;
    if (uncompensatedLeaps > 0) {
      score -= Math.min(0.5, uncompensatedLeaps * 0.1);
    }

    // Penalize excessive adjustments (indicates poor prior passes)
    const adjustmentRatio = adjustments.length / notes.length;
    if (adjustmentRatio > 0.3) {
      score -= 0.3;
    } else if (adjustmentRatio > 0.15) {
      score -= 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get the interval history.
   * @returns {Object[]} Interval history entries
   */
  getIntervalHistory() {
    return [...this.intervalHistory];
  }

  /**
   * Reset voice leading state.
   */
  reset() {
    this.intervalHistory = [];
  }
}

export { TRAJECTORY_RULES };
export default VoiceLeadingEngine;
