// Tests for Pass A - Structural Skeleton
import { StructuralPlanner } from '../src/passes/passA_structural.js';
import {
  MelodyNote,
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';

describe('StructuralPlanner (Pass A)', () => {
  let planner;

  beforeEach(() => {
    planner = new StructuralPlanner();
  });

  describe('execute()', () => {
    it('should generate structural notes for a simple chord progression', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
        new Chord('G', 'maj', 8, 12),
        new Chord('C', 'maj', 12, 16),
      ];

      const phraseContext = new PhraseContext('statement', false);

      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
      expect(result.notes.length).toBeGreaterThan(0);
    });

    it('should respect phrase role in note selection', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('G', '7', 4, 8),
      ];

      const antecedentContext = new PhraseContext('antecedent', true);
      const config = new GenerationConfig(chords, antecedentContext);

      const result = await planner.execute(config);

      // Antecedent phrases should avoid tonic resolution
      const pitches = result.notes.map((n) => n.pitch);
      const tonicC = 60; // C4

      // At least some notes should not be tonic
      const nonTonicNotes = pitches.filter((p) => p !== tonicC);
      expect(nonTonicNotes.length).toBeGreaterThan(0);
    });

    it('should generate notes within register constraints', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('C', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      // Check that all notes are within reasonable MIDI range
      const pitches = result.notes.map((n) => n.pitch);
      pitches.forEach((pitch) => {
        expect(pitch).toBeGreaterThanOrEqual(48); // C3
        expect(pitch).toBeLessThanOrEqual(96); // C7
      });
    });

    it('should enforce voice leading between consecutive notes', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
        new Chord('G', 'maj', 8, 12),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      const sortedNotes = [...result.notes].sort((a, b) => a.startTime - b.startTime);

      // Check voice leading (consecutive notes shouldn't have extreme leaps)
      for (let i = 0; i < sortedNotes.length - 1; i++) {
        const distance = Math.abs(sortedNotes[i + 1].pitch - sortedNotes[i].pitch);
        // Allow some leaps but not extreme ones
        expect(distance).toBeLessThanOrEqual(19);
      }
    });

    it('should return proper PassResult with evaluation metrics', async () => {
      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      expect(result.passName).toBe('PassA_Structural');
      expect(result.notes).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.passName).toBe('PassA_Structural');
      expect(result.success).toBe(true);
    });

    it('should handle empty chord progression gracefully', async () => {
      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig([], phraseContext);

      const result = await planner.execute(config);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe('_getChordTones()', () => {
    it('should return correct chord tones for major chords', () => {
      const chord = new Chord('C', 'maj', 0, 4);
      const tones = planner._getChordTones(chord);

      expect(tones).toBeDefined();
      expect(tones.length).toBe(3);
    });

    it('should return correct chord tones for minor chords', () => {
      const chord = new Chord('D', 'min', 0, 4);
      const tones = planner._getChordTones(chord);

      expect(tones).toBeDefined();
      expect(tones.length).toBe(3);
    });

    it('should return correct chord tones for dominant 7th chords', () => {
      const chord = new Chord('G', '7', 0, 4);
      const tones = planner._getChordTones(chord);

      expect(tones).toBeDefined();
      expect(tones.length).toBe(4);
    });
  });

  describe('_noteNameToMidi()', () => {
    it('should convert C4 to MIDI 60', () => {
      const midi = planner._noteNameToMidi('C4');
      expect(midi).toBe(60);
    });

    it('should convert A4 to MIDI 69', () => {
      const midi = planner._noteNameToMidi('A4');
      expect(midi).toBe(69);
    });

    it('should handle flat notes', () => {
      const midi = planner._noteNameToMidi('Bb4');
      expect(midi).toBe(70);
    });

    it('should handle sharp notes', () => {
      const midi = planner._noteNameToMidi('F#4');
      expect(midi).toBe(66);
    });
  });
});
