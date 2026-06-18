// Tests for PhraseEngine
import PhraseEngine from '../src/engines/PhraseEngine.js';
import { MelodyNote, GenerationConfig, PhraseContext } from '../src/interfaces.js';

describe('PhraseEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new PhraseEngine();
  });

  describe('execute()', () => {
    test('should group notes into phrases', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
        new MelodyNote(67, 4, 1.0, 'structural'),
        new MelodyNote(69, 5, 1.0, 'structural'),
        new MelodyNote(71, 6, 1.0, 'structural'),
        new MelodyNote(72, 7, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.notes).toBeDefined();
      expect(result.notes.length).toBeGreaterThan(0);
    });

    test('should return proper PassResult with evaluation metrics', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.passName).toBe('PhraseEngine');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.phraseCount).toBeGreaterThan(0);
    });

    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result).toBeDefined();
      expect(result.notes).toEqual([]);
      expect(result.metadata.phraseCount).toBe(0);
    });

    test('should assign phrase metadata to notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseId).toBeDefined();
      expect(result.notes[0].metadata.phraseRole).toBeDefined();
      expect(result.notes[0].metadata.phraseIndex).toBeDefined();
    });

    test('should assign phrase roles in sequence', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
        new MelodyNote(67, 4, 1.0, 'structural'),
        new MelodyNote(69, 5, 1.0, 'structural'),
        new MelodyNote(71, 6, 1.0, 'structural'),
        new MelodyNote(72, 7, 1.0, 'structural'),
        new MelodyNote(60, 8, 1.0, 'structural'),
        new MelodyNote(62, 9, 1.0, 'structural'),
        new MelodyNote(64, 10, 1.0, 'structural'),
        new MelodyNote(65, 11, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      const roles = result.metadata.phraseRoles;
      expect(roles).toBeDefined();
      expect(roles).toContain('statement');
      expect(roles).toContain('build');
    });
  });

  describe('getPhrases()', () => {
    test('should return extracted phrases', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const phrases = engine.getPhrases();
      expect(Array.isArray(phrases)).toBe(true);
      expect(phrases.length).toBeGreaterThan(0);
    });

    test('should return empty array for empty input', async () => {
      const config = new GenerationConfig();
      await engine.execute(config, []);

      const phrases = engine.getPhrases();
      expect(Array.isArray(phrases)).toBe(true);
      expect(phrases.length).toBe(0);
    });
  });

  describe('getPhrasesByRole()', () => {
    test('should filter phrases by role', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
        new MelodyNote(67, 4, 1.0, 'structural'),
        new MelodyNote(69, 5, 1.0, 'structural'),
        new MelodyNote(71, 6, 1.0, 'structural'),
        new MelodyNote(72, 7, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const statements = engine.getPhrasesByRole('statement');
      expect(Array.isArray(statements)).toBe(true);
      expect(statements.length).toBeGreaterThanOrEqual(1);
    });

    test('should return empty array for non-existent role', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const climaxes = engine.getPhrasesByRole('climax');
      expect(Array.isArray(climaxes)).toBe(true);
      expect(climaxes.length).toBe(0);
    });
  });

  describe('getPhraseByIndex()', () => {
    test('should return phrase by index', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const phrase = engine.getPhraseByIndex(0);
      expect(phrase).toBeDefined();
      expect(phrase.id).toBe('phrase_0');
    });

    test('should return null for out-of-range index', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const phrase = engine.getPhraseByIndex(100);
      expect(phrase).toBeNull();
    });
  });

  describe('constructor options', () => {
    test('should respect custom notesPerPhrase', () => {
      const customEngine = new PhraseEngine({ notesPerPhrase: 12 });
      expect(customEngine.notesPerPhrase).toBe(12);
    });

    test('should respect custom maxPhraseDuration', () => {
      const customEngine = new PhraseEngine({ maxPhraseDuration: 32 });
      expect(customEngine.maxPhraseDuration).toBe(32);
    });

    test('should respect antecedentConsequent option', () => {
      const customEngine = new PhraseEngine({ antecedentConsequent: false });
      expect(customEngine.antecedentConsequent).toBe(false);
    });
  });

  describe('phrase grouping', () => {
    test('should create multiple phrases from many notes', async () => {
      const notes = [];
      for (let i = 0; i < 20; i++) {
        notes.push(new MelodyNote(60 + i, i, 1.0, 'structural'));
      }

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.metadata.phraseCount).toBeGreaterThan(1);
    });

    test('should respect notesPerPhrase limit', async () => {
      const engineWithLimit = new PhraseEngine({ notesPerPhrase: 4 });

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
        new MelodyNote(67, 4, 1.0, 'structural'),
        new MelodyNote(69, 5, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engineWithLimit.execute(config, notes);

      expect(result.metadata.phraseCount).toBeGreaterThan(1);
    });

    test('should respect maxPhraseDuration limit', async () => {
      const engineWithDuration = new PhraseEngine({ maxPhraseDuration: 4 });

      const notes = [];
      for (let i = 0; i < 10; i++) {
        notes.push(new MelodyNote(60, i, 1.0, 'structural'));
      }

      const config = new GenerationConfig();
      const result = await engineWithDuration.execute(config, notes);

      expect(result.metadata.phraseCount).toBeGreaterThan(1);
    });

    test('should handle large gaps between notes by starting new phrases', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 10, 1.0, 'structural'), // Large gap
        new MelodyNote(65, 11, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.metadata.phraseCount).toBeGreaterThan(1);
    });
  });

  describe('phrase metadata', () => {
    test('should include phraseId in note metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseId).toBeDefined();
      expect(typeof result.notes[0].metadata.phraseId).toBe('string');
    });

    test('should include phraseRole in note metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseRole).toBeDefined();
      expect(['statement', 'build', 'climax', 'release', 'resolution']).toContain(result.notes[0].metadata.phraseRole);
    });

    test('should include phraseTension in note metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseTension).toBeDefined();
      expect(result.notes[0].metadata.phraseTension).toBeGreaterThanOrEqual(0);
      expect(result.notes[0].metadata.phraseTension).toBeLessThanOrEqual(1);
    });

    test('should include isAntecedent in note metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.isAntecedent).toBeDefined();
      expect(typeof result.notes[0].metadata.isAntecedent).toBe('boolean');
    });
  });

  describe('antecedent-consequent pattern', () => {
    test('should create consequent phrases when enabled', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      // With antecedent-consequent enabled, consequent notes should be added
      expect(result.notes.length).toBeGreaterThan(notes.length);
    });

    test('should not create consequent phrases when disabled', async () => {
      const engineNoConsequent = new PhraseEngine({ antecedentConsequent: false });

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engineNoConsequent.execute(config, notes);

      // Without consequent, note count should remain the same
      expect(result.notes.length).toBe(notes.length);
    });

    test('should mark consequent notes with isConsequent flag', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      const consequentNotes = result.notes.filter((n) => n.metadata.isConsequent);
      expect(consequentNotes.length).toBeGreaterThan(0);
    });
  });

  describe('phrase coherence score', () => {
    test('should return 0.5 for empty phrases', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result.metrics.score).toBe(0.5);
    });

    test('should return valid score for single phrase', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
    });

    test('should penalize phrases with too few notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      // Single note phrases should have lower score
      expect(result.metrics.score).toBeLessThan(1.0);
    });
  });
});
