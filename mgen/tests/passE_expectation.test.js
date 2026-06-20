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

      // Fixed 2026-06-19: Pass E now returns ALL notes (not just changed ones).
      // Modified notes are marked with metadata.passEAdjusted = true.
      expect(refinedNotes.length).toBe(2);
      // The second note (96) should have been adjusted
      const adjustedNote = refinedNotes.find(n => n.metadata?.passEAdjusted);
      expect(adjustedNote).toBeDefined();
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

      // Fixed 2026-06-19: Pass E now returns all notes (not just changed ones).
      // Single note: no call-response pairs, so no refinements needed, but note is still returned.
      expect(result.notes.length).toBe(1);
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
        new MelodyNote(65, 10, 1, 'structural'),
      ];

      const pairs = smallWindowRefiner._analyzeCallAndResponse(notes);

      // Should not identify pair if distance exceeds window
      expect(pairs.length).toBe(0);
    });
  });

  describe('pitchDiversity scoring', () => {
    it('should include pitchDiversityScore in metrics', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(64, 4, 1, 'structural'),
        new MelodyNote(67, 8, 1, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      expect(result.metadata.pitchDiversityScore).toBeDefined();
      expect(typeof result.metadata.pitchDiversityScore).toBe('number');
      expect(result.metadata.pitchDiversityScore).toBeGreaterThanOrEqual(0);
      expect(result.metadata.pitchDiversityScore).toBeLessThanOrEqual(1);
    });

    it('should flag melodies where any pitch exceeds 30% of structural notes', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(60, 2, 1, 'structural'),
        new MelodyNote(60, 4, 1, 'structural'),
        new MelodyNote(60, 6, 1, 'structural'),
        new MelodyNote(64, 8, 1, 'structural'),
        new MelodyNote(67, 10, 1, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await refiner.execute(config, allNotes);

      // 4/6 = 0.67, so pitchDiversityScore = 1.0 - 0.67 = 0.33
      expect(result.metadata.pitchDiversityScore).toBeLessThan(0.5);
      expect(result.metadata.highestPitchFrequency).toBeGreaterThan(0.3);
    });
  });
});
