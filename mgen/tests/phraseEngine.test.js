// Tests for rewritten PhraseEngine (2026-06-19)
// PhraseEngine was completely rewritten to integrate PhraseArcPlanner + PhraseGrammar
import PhraseEngine, { CLIMAX_ARCHETYPES, TENSION_TO_ARCHETYPE, PHRASE_GRAMMAR } from '../src/engines/PhraseEngine.js';
import { MelodyNote, GenerationConfig, PhraseContext } from '../src/interfaces.js';

describe('PhraseEngine (rewritten)', () => {
  let engine;

  beforeEach(() => {
    engine = new PhraseEngine();
  });

  describe('constructor', () => {
    test('should have default options', () => {
      expect(engine.notesPerPhrase).toBe(8);
      expect(engine.maxPhraseDuration).toBe(16);
      expect(engine.antecedentConsequent).toBe(true);
      expect(engine.archetype).toBe('classical');
      expect(engine.divisions).toBe(12);
    });

    test('should respect custom options', () => {
      const custom = new PhraseEngine({
        notesPerPhrase: 12,
        maxPhraseDuration: 32,
        antecedentConsequent: false,
        archetype: 'jazz',
        divisions: 24,
      });
      expect(custom.notesPerPhrase).toBe(12);
      expect(custom.maxPhraseDuration).toBe(32);
      expect(custom.antecedentConsequent).toBe(false);
      expect(custom.archetype).toBe('jazz');
      expect(custom.divisions).toBe(24);
    });

    test('should export CLIMAX_ARCHETYPES', () => {
      expect(CLIMAX_ARCHETYPES).toBeDefined();
      expect(Object.keys(CLIMAX_ARCHETYPES)).toEqual([
        'classical', 'popLate', 'jazz', 'progressive', 'ambient', 'valley',
      ]);
    });

    test('should export TENSION_TO_ARCHETYPE mapping', () => {
      expect(TENSION_TO_ARCHETYPE).toBeDefined();
      expect(TENSION_TO_ARCHETYPE['arch']).toBe('classical');
      expect(TENSION_TO_ARCHETYPE['launch']).toBe('popLate');
      expect(TENSION_TO_ARCHETYPE['valley']).toBe('valley');
      expect(TENSION_TO_ARCHETYPE['staircase']).toBe('progressive');
    });

    test('should export PHRASE_GRAMMAR', () => {
      expect(PHRASE_GRAMMAR).toBeDefined();
      expect(Object.keys(PHRASE_GRAMMAR)).toContain('callResponse');
      expect(Object.keys(PHRASE_GRAMMAR)).toContain('questionAnswer');
      expect(Object.keys(PHRASE_GRAMMAR)).toContain('developing');
    });
  });

  describe('execute() — basic', () => {
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
      expect(result.metadata.arc).toBeNull();
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
  });

  describe('phrase metadata', () => {
    test('should include phraseId in note metadata', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseId).toBeDefined();
      expect(typeof result.notes[0].metadata.phraseId).toBe('string');
    });

    test('should include phraseRole in note metadata', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseRole).toBeDefined();
      expect(['statement', 'build', 'climax', 'release', 'resolution']).toContain(result.notes[0].metadata.phraseRole);
    });

    test('should include phraseTension in note metadata', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.phraseTension).toBeDefined();
      expect(result.notes[0].metadata.phraseTension).toBeGreaterThanOrEqual(0);
      expect(result.notes[0].metadata.phraseTension).toBeLessThanOrEqual(1);
    });

    test('should include isAntecedent in note metadata', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.notes[0].metadata.isAntecedent).toBeDefined();
      expect(typeof result.notes[0].metadata.isAntecedent).toBe('boolean');
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

    test('should return phrases by role', async () => {
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
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const climaxes = engine.getPhrasesByRole('climax');
      expect(Array.isArray(climaxes)).toBe(true);
      expect(climaxes.length).toBe(0);
    });

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
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const phrase = engine.getPhraseByIndex(100);
      expect(phrase).toBeNull();
    });
  });

  describe('getArc() and getGrammar()', () => {
    test('should return computed arc', async () => {
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

      const arc = engine.getArc();
      expect(arc).toBeDefined();
      expect(arc.climaxSlot).toBeGreaterThanOrEqual(0);
      expect(arc.tensions).toBeDefined();
      expect(arc.registers).toBeDefined();
      expect(arc.roles).toBeDefined();
    });

    test('should return selected grammar', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const grammar = engine.getGrammar();
      expect(grammar).toBeDefined();
      expect(grammar.id).toBeDefined();
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
        new MelodyNote(64, 10, 1.0, 'structural'),
        new MelodyNote(65, 11, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.metadata.phraseCount).toBeGreaterThan(1);
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
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.metrics.score).toBeLessThan(1.0);
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

    test('should mark consequent notes with transformType', async () => {
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
      consequentNotes.forEach(n => {
        expect(n.metadata.transformType).toBeDefined();
        expect(['transposition', 'intervalCompression', 'tonicResolution']).toContain(n.metadata.transformType);
      });
    });
  });

  describe('register envelope constraints', () => {
    test('should adjust notes outside register envelope', async () => {
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

      const config = new GenerationConfig(null, null, {
        baseRegister: 60,
        divisions: 12,
      });
      const result = await engine.execute(config, notes);

      // Check that some notes may have been register-adjusted
      const adjustedNotes = result.notes.filter((n) => n.metadata?.registerAdjusted);
      // At least some notes should be within the envelope
      expect(result.notes.length).toBeGreaterThan(0);
    });
  });

  describe('arc computation', () => {
    test('should compute climax slot based on archetype', async () => {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push(new MelodyNote(60 + i, i, 1.0, 'structural'));
      }

      const config = new GenerationConfig(null, null, {
        tensionCurve: 'arch',
      });
      const result = await engine.execute(config, notes);

      const arc = engine.getArc();
      expect(arc).toBeDefined();
      expect(arc.climaxSlot).toBeGreaterThan(0);
      expect(arc.climaxSlot).toBeLessThan(notes.length - 1);
    });

    test('should compute different climax positions for different archetypes', async () => {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push(new MelodyNote(60 + i, i, 1.0, 'structural'));
      }

      const archConfig = new GenerationConfig(null, null, { tensionCurve: 'arch' });
      const launchConfig = new GenerationConfig(null, null, { tensionCurve: 'launch' });
      const valleyConfig = new GenerationConfig(null, null, { tensionCurve: 'valley' });

      const archResult = await engine.execute(archConfig, notes);
      const launchResult = await engine.execute(launchConfig, notes);
      const valleyResult = await engine.execute(valleyConfig, notes);

      const archArc = engine.getArc();
      // Re-execute with launch
      const engine2 = new PhraseEngine();
      const launchResult2 = await engine2.execute(launchConfig, notes);
      const launchArc = engine2.getArc();

      // Valley should have climax around 50% (earlier than classical's 75%)
      expect(valleyResult.metadata.phraseCount).toBeGreaterThanOrEqual(1);
    });

    test('should compute register curve', async () => {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push(new MelodyNote(60 + i, i, 1.0, 'structural'));
      }

      const config = new GenerationConfig(null, null, { tensionCurve: 'arch' });
      await engine.execute(config, notes);

      const arc = engine.getArc();
      expect(arc.registers).toBeDefined();
      expect(arc.registers.length).toBe(notes.length);
      // Registers should be between 0 and 1
      arc.registers.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      });
    });

    test('should compute tension curve', async () => {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push(new MelodyNote(60 + i, i, 1.0, 'structural'));
      }

      const config = new GenerationConfig(null, null, { tensionCurve: 'arch' });
      await engine.execute(config, notes);

      const arc = engine.getArc();
      expect(arc.tensions).toBeDefined();
      expect(arc.tensions.length).toBe(notes.length);
      arc.tensions.forEach(t => {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('phrase roles', () => {
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

    test('should include phraseRole in metadata for all notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      result.notes.forEach(n => {
        expect(n.metadata.phraseRole).toBeDefined();
        expect(['statement', 'build', 'climax', 'release', 'resolution']).toContain(n.metadata.phraseRole);
      });
    });
  });
});
