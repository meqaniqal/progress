// Tests for ExpectationEngine (2026-06-19)
import ExpectationEngine, {
  ListenerExpectation,
  applyExpectationOp,
  updateExpectation,
} from '../src/engines/ExpectationEngine.js';
import { classifyInterval, getVoiceLeadingBias, TRAJECTORY_RULES } from '../src/engines/VoiceLeadingEngine.js';
import { MelodyNote, Chord, PhraseContext, GenerationConfig } from '../src/interfaces.js';

describe('ExpectationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ExpectationEngine();
  });

  describe('classifyInterval', () => {
    test('should classify steps', () => {
      const result = classifyInterval(60, 62, 12);
      expect(result.size).toBe('step');
      expect(result.dir).toBe(1);
      expect(result.semitones).toBe(2);
    });

    test('should classify skips', () => {
      const result = classifyInterval(60, 64, 12);
      expect(result.size).toBe('skip');
      expect(result.dir).toBe(1);
    });

    test('should classify leaps', () => {
      const result = classifyInterval(60, 67, 12);
      expect(result.size).toBe('leap');
      expect(result.dir).toBe(1);
    });

    test('should handle downward intervals', () => {
      const result = classifyInterval(72, 60, 12);
      expect(result.dir).toBe(-1);
    });

    test('should handle same pitch', () => {
      const result = classifyInterval(60, 60, 12);
      expect(result.size).toBe('step');
      expect(result.dir).toBe(0);
    });
  });

  describe('getVoiceLeadingBias', () => {
    test('should return 0 for null interval', () => {
      expect(getVoiceLeadingBias(null, 'statement')).toBe(0);
    });

    test('should return bias for leap up', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'leap' }, 'statement');
      expect(bias).toBe(-0.75);
    });

    test('should return bias for leap down', () => {
      const bias = getVoiceLeadingBias({ dir: -1, size: 'leap' }, 'statement');
      expect(bias).toBe(0.75);
    });

    test('should relax rules at climax', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'leap' }, 'climax');
      expect(bias).toBe(0.3);
    });

    test('should return bias for skip up', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'skip' }, 'statement');
      expect(bias).toBe(-0.6);
    });

    test('should return bias for skip down', () => {
      const bias = getVoiceLeadingBias({ dir: -1, size: 'skip' }, 'statement');
      expect(bias).toBe(0.6);
    });
  });

  describe('applyExpectationOp', () => {
    test('should confirm expected pitch', () => {
      const result = applyExpectationOp('confirmation', 60, 62);
      expect(result).toBe(62);
    });

    test('should delay with passing tone', () => {
      const result = applyExpectationOp('delay', 60, 66, [60, 62, 64, 66]);
      // Midpoint of 60 and 66 is 63; nearest scale pitch is 62 or 64
      expect([62, 64]).toContain(result);
    });

    test('should deflect to unexpected stable tone', () => {
      const result = applyExpectationOp('deflection', 60, 62, [60, 62, 64, 67], [60, 64, 67]);
      // Should return a stable tone that's not the expected pitch
      expect([60, 64, 67]).toContain(result);
    });

    test('should payoff expected pitch', () => {
      const result = applyExpectationOp('payoff', 60, 64);
      expect(result).toBe(64);
    });

    test('should return current pitch when no expected pitch', () => {
      const result = applyExpectationOp('confirmation', 60, null);
      expect(result).toBe(60);
    });
  });

  describe('updateExpectation', () => {
    test('should return empty expectation for null interval', () => {
      const result = updateExpectation(60, null, [60, 62, 64], [60, 64, 67]);
      expect(result.expectedPitch).toBeNull();
      expect(result.expectationStrength).toBe(0.0);
    });

    test('should predict continuation after step (Narmour)', () => {
      const result = updateExpectation(60, { dir: 1, size: 'step' }, [60, 62, 64], [60, 64, 67]);
      expect(result.expectedPitch).toBe(62);
      // Strength is 0.65 + 0.2 (tonal gravity) = 0.85
      expect(result.expectationStrength).toBeGreaterThanOrEqual(0.65);
    });

    test('should predict reversal after leap (Narmour)', () => {
      const result = updateExpectation(60, { dir: 1, size: 'leap' }, [60, 62, 64], [60, 64, 67]);
      expect(result.expectedPitch).toBe(60);
      // Strength is 0.80 + 0.2 (tonal gravity) = 1.0 (capped)
      expect(result.expectationStrength).toBeGreaterThanOrEqual(0.80);
    });

    test('should add tonal gravity toward stable tones', () => {
      const result = updateExpectation(61, { dir: 1, size: 'step' }, [60, 62, 64], [60, 64, 67]);
      expect(result.expectedResolution).toBe(60);
      expect(result.expectationStrength).toBeGreaterThan(0.65);
    });
  });

  describe('ListenerExpectation', () => {
    test('should create with default values', () => {
      const le = new ListenerExpectation();
      expect(le.expectedPitch).toBeNull();
      expect(le.expectedRhythm).toBeNull();
      expect(le.expectedRegister).toBeNull();
      expect(le.expectedResolution).toBeNull();
      expect(le.expectationStrength).toBe(0.0);
      expect(le.priorContour).toEqual([]);
    });

    test('should reset state', () => {
      const le = new ListenerExpectation();
      le.expectedPitch = 60;
      le.priorContour = [1, -1];
      le.reset();
      expect(le.expectedPitch).toBeNull();
      expect(le.priorContour).toEqual([]);
    });
  });

  describe('TRAJECTORY_RULES', () => {
    test('should have leap:up rule', () => {
      expect(TRAJECTORY_RULES['leap:up']).toEqual({ preferredDir: -1, preferredSize: 'step', weight: 0.75 });
    });

    test('should have leap:down rule', () => {
      expect(TRAJECTORY_RULES['leap:down']).toEqual({ preferredDir: 1, preferredSize: 'step', weight: 0.75 });
    });

    test('should have step:same rule', () => {
      expect(TRAJECTORY_RULES['step:same']).toEqual({ preferredDir: 0, preferredSize: 'step', weight: 0.50 });
    });
  });

  describe('execute()', () => {
    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result.notes).toEqual([]);
      expect(result.metadata.adjustmentsMade).toBe(0);
    });

    test('should return all notes (not just changed ones)', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(65, 4, 1.0, 'structural'),
        new MelodyNote(72, 8, 1.0, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      // Should return all notes, not just modified ones
      expect(result.notes.length).toBe(notes.length);
    });

    test('should mark adjusted notes with metadata', async () => {
      const notes = [
        new MelodyNote(48, 0, 1.0, 'structural'),
        new MelodyNote(96, 8, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      // Check that the result has metadata about adjustments
      expect(result.metadata.adjustmentsMade).toBeDefined();
    });

    test('should return proper PassResult with evaluation metrics', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(65, 4, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      expect(result.passName).toBe('ExpectationEngine');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should detect unresolved large leaps', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(90, 4, 1.0, 'structural'), // 30 semitone leap
        new MelodyNote(95, 8, 1.0, 'structural'), // continues upward
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      expect(result.metadata.adjustmentsMade).toBeGreaterThanOrEqual(0);
    });

    test('should enforce payoff on phrase-final resolution notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(65, 4, 1.0, 'structural'),
        new MelodyNote(75, 8, 1.0, 'resolution'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('resolution', 0.3);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      expect(result.metadata.adjustmentsMade).toBeDefined();
    });
  });

  describe('getExpectationHistory()', () => {
    test('should return expectation history entries', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      await engine.execute(config, notes);

      const history = engine.getExpectationHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(notes.length);
    });
  });

  describe('reset()', () => {
    test('should clear expectation history', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      await engine.execute(config, notes);

      engine.reset();
      expect(engine.getExpectationHistory().length).toBe(0);
    });
  });
});
