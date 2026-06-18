// Pass E - Expectation Refinement
// Final pass: refines melody based on call-and-response patterns
// Ensures overall musical coherence and resolves any conflicts

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass E: Expectation Refinement.
 * Final pass that refines the complete melody.
 * Ensures call-and-response patterns and overall coherence.
 */
export class ExpectationRefiner {
  /**
   * @param {Object} options - Pass-specific options
   * @param {number} [options.windowSize=32] - Call-and-response window size
   */
  constructor(options = {}) {
    this.windowSize = options.windowSize || 32;
  }

  /**
   * Execute Pass E: Refine expectation layer.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} previousNotes - Notes from all previous passes
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Expectation refinement result
   */
  async execute(config, previousNotes, context = {}) {
    const refinedNotes = [...previousNotes];

    // Sort notes by time
    refinedNotes.sort((a, b) => a.startTime - b.startTime);

    // Apply call-and-response analysis
    const callResponsePairs = this._analyzeCallAndResponse(refinedNotes);

    // Refine notes based on call-response patterns
    const allRefined = this._applyRefinements(refinedNotes, callResponsePairs, config);

    // Only return notes that were actually modified (pitch changed)
    const changedNotes = [];
    for (let i = 0; i < previousNotes.length; i++) {
      const original = previousNotes[i];
      const refined = allRefined[i];
      if (refined && refined.pitch !== original.pitch) {
        changedNotes.push(refined);
      }
    }

    return new PassResult(
      'PassE_Expectation',
      changedNotes,
      new EvaluationMetrics('PassE_Expectation', 1.0, [], true),
      {
        callResponsePairs: callResponsePairs.length,
        originalNoteCount: previousNotes.length,
        finalNoteCount: changedNotes.length,
        noteCount: changedNotes.length,
      }
    );
  }

  /**
   * Analyze call-and-response patterns in the melody.
   * @param {MelodyNote[]} notes - All melody notes
   * @returns {Array<Object>} Call-response pairs
   * @private
   */
  _analyzeCallAndResponse(notes) {
    const pairs = [];

    // Identify structural notes (call) and their potential responses
    const structuralNotes = notes.filter((n) => n.role === 'structural' || n.role === 'cadence');

    for (let i = 0; i < structuralNotes.length - 1; i++) {
      const call = structuralNotes[i];
      const response = structuralNotes[i + 1];

      // Check if there's a call-response relationship
      const distance = response.startTime - call.startTime;
      if (distance > 0 && distance < this.windowSize) {
        pairs.push({
          call,
          response,
          distance,
          callPitch: call.pitch,
          responsePitch: response.pitch,
        });
      }
    }

    return pairs;
  }

  /**
   * Apply refinements based on call-response analysis.
   * Adjusts pitches to improve call-response relationships.
   * @param {MelodyNote[]} notes - All melody notes
   * @param {Array<Object>} callResponsePairs - Call-response pairs
   * @param {GenerationConfig} config - Generation configuration
   * @returns {MelodyNote[]} Refined notes
   * @private
   */
  _applyRefinements(notes, callResponsePairs, config) {
    const refined = notes.map((note) => new MelodyNote(note.pitch, note.startTime, note.duration, note.role, { ...note.metadata }));

    // For each call-response pair, check if refinement is needed
    for (const pair of callResponsePairs) {
      const { call, response } = pair;

      // Check if response mirrors or inverts the call
      const pitchInterval = response.pitch - call.pitch;

      // If the interval is too large, consider adjusting the response
      if (Math.abs(pitchInterval) > 12) {
        // Find the response note and adjust if needed
        const responseIndex = refined.findIndex((n) => n.startTime === response.startTime);
        if (responseIndex !== -1) {
          // Adjust response to be within a reasonable range
          const adjustedPitch = call.pitch + Math.sign(pitchInterval) * Math.min(Math.abs(pitchInterval), 12);
          refined[responseIndex].pitch = adjustedPitch;
        }
      }
    }

    return refined;
  }
}

export default ExpectationRefiner;
