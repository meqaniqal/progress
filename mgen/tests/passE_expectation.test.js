// Tests for Pass E - Expectation Refinement
import { ExpectationRefiner } from '../src/passes/passE_expectation.js';
import {
  MelodyNote,
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';

describe('ExpectationRefiner (Pass E)', () => {
  let refiner;

  beforeEach(() => {
    refiner = new ExpectationRefiner();
  });

  describe('execute()', () => {
    it('should refine melody based on call-and-response patterns', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
        new MelodyNote(72, 8, 1, 'structural'),
        new MelodyNote(67, 12, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
        new Chord('G', 'maj', 8, 12),
        new Chord('C', 'maj', 12, 16),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it('should analyze call-and-response pairs', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
        new MelodyNote(72, 8, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      // Check that call-response analysis was performed
      expect(result.metadata.callResponsePairs).toBeDefined();
      expect(result.metadata.callResponsePairs).toBeGreaterThanOrEqual(0);
    });

    it('should refine notes with large pitch intervals', async () => {
      const allNotes = [
        new MelodyNote(48, 0, 1, 'structural'), // C3
        new MelodyNote(96, 8, 1, 'structural'), // C7 (48 semitone jump)
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('C', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      const refinedNotes = result.notes;

      // Large interval (48 semitones) should trigger refinement of the response note
      // Only the changed note is returned (the response note pitch was adjusted)
      expect(refinedNotes.length).toBe(1);
      expect(refinedNotes[0].pitch).toBe(60); // Adjusted from 96 to 60 (one octave above call)
    });

    it('should return proper PassResult with evaluation metrics', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      expect(result.passName).toBe('PassE_Expectation');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle empty previous notes', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, []);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('should handle single note (no call-response possible)', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      // Single note: no call-response pairs, so no refinements needed
      expect(result.notes.length).toBe(0);
      expect(result.metadata.callResponsePairs).toBe(0);
    });
  });

  describe('_analyzeCallAndResponse()', () => {
    it('should identify call-response pairs in melody', () => {
      const notes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
        new MelodyNote(72, 8, 1, 'structural'),
      ];

      const pairs = refiner._analyzeCallAndResponse(notes);

      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBe(2); // Two pairs from three notes
    });

    it('should respect window size constraint', () => {
      const smallWindowRefiner = new ExpectationRefiner({ windowSize: 2 });

      const notes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 10, 1, 'structural'), // 10 time units apart
      ];

      const pairs = smallWindowRefiner._analyzeCallAndResponse(notes);

      // Should not identify pair if distance exceeds window
      expect(pairs.length).toBe(0);
    });
  });
});
