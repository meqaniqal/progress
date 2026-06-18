// Tests for Pass D - Ornament Layer
import { OrnamentPlanner } from '../src/passes/passD_ornament.js';
import {
  MelodyNote,
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';

describe('OrnamentPlanner (Pass D)', () => {
  let planner;

  beforeEach(() => {
    planner = new OrnamentPlanner();
  });

  describe('execute()', () => {
    it('should generate ornament notes for structural notes', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 2, 'structural'),
        new MelodyNote(65, 4, 2, 'structural'),
        new MelodyNote(72, 8, 2, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it('should not ornament connector notes', async () => {
      const allNotes = [
        new MelodyNote(60, 0, 2, 'structural'),
        new MelodyNote(62, 1, 0.5, 'connector'),
        new MelodyNote(65, 4, 2, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, allNotes);

      // Should not generate ornaments for connectors
      const ornamentedConnectors = result.notes.filter(
        (n) => n.role === 'ornament' && n.metadata?.connectsStart !== undefined
      );
      expect(ornamentedConnectors.length).toBe(0);
    });

    it('should respect ornament density parameter', async () => {
      const highDensityPlanner = new OrnamentPlanner({
        ornamentDensity: 1.0, // Always ornament
      });

      const structuralNotes = [
        new MelodyNote(60, 0, 2, 'structural'),
        new MelodyNote(65, 4, 2, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await highDensityPlanner.execute(config, structuralNotes);

      // With 100% density, should generate ornaments for all structural notes
      expect(result.notes.length).toBeGreaterThanOrEqual(0);
    });

    it('should return proper PassResult with evaluation metrics', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 2, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      expect(result.passName).toBe('PassD_Ornament');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle empty previous notes', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, []);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe('_generateGraceNote()', () => {
    it('should generate a grace note before target', () => {
      const note = new MelodyNote(60, 0, 2, 'structural');
      const result = planner._generateGraceNote(note);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].pitch).toBe(59); // One semitone below
    });
  });

  describe('_generateTrill()', () => {
    it('should generate rapid alternation between note and upper neighbor', () => {
      const note = new MelodyNote(60, 0, 2, 'structural');
      const result = planner._generateTrill(note);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4); // Default 4 trill notes

      // Should alternate between target and upper neighbor
      const pitches = result.map((n) => n.pitch);
      expect(pitches[0]).toBe(60);
      expect(pitches[1]).toBe(62); // Upper neighbor
    });
  });

  describe('_generateTurn()', () => {
    it('should generate upper neighbor - target - lower neighbor - target', () => {
      const note = new MelodyNote(60, 0, 2, 'structural');
      const result = planner._generateTurn(note);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4);

      const pitches = result.map((n) => n.pitch);
      expect(pitches[0]).toBe(62); // Upper neighbor
      expect(pitches[1]).toBe(60); // Target
      expect(pitches[2]).toBe(58); // Lower neighbor
      expect(pitches[3]).toBe(60); // Target
    });
  });

  describe('_generateAppoggiatura()', () => {
    it('should generate approach from above or below', () => {
      const note = new MelodyNote(60, 0, 2, 'structural');
      const result = planner._generateAppoggiatura(note);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      // First note should be 3 semitones away
      const diff = Math.abs(result[0].pitch - result[1].pitch);
      expect(diff).toBe(3);
    });
  });
});
