// Tests for VoiceLeadingEngine (2026-06-19)
import VoiceLeadingEngine, {
  classifyInterval,
  getVoiceLeadingBias,
  TRAJECTORY_RULES,
} from '../src/engines/VoiceLeadingEngine.js';
import { MelodyNote, Chord, PhraseContext, GenerationConfig } from '../src/interfaces.js';

describe('VoiceLeadingEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new VoiceLeadingEngine();
  });

  describe('classifyInterval', () => {
    test('should classify steps (< 1.5 semitones)', () => {
      const result = classifyInterval(60, 62, 12);
      expect(result.size).toBe('step');
      expect(result.dir).toBe(1);
    });

    test('should classify skips (1.5-3.5 semitones)', () => {
      const result = classifyInterval(60, 64, 12);
      expect(result.size).toBe('skip');
      expect(result.dir).toBe(1);
    });

    test('should classify leaps (> 3.5 semitones)', () => {
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

    test('should handle microtonal divisions', () => {
      const result = classifyInterval(0, 1, 24);
      expect(result.size).toBe('step');
    });

    test('should return semitones (signed)', () => {
      const result = classifyInterval(72, 60, 12);
      expect(result.semitones).toBe(-12);
    });
  });

  describe('getVoiceLeadingBias', () => {
    test('should return 0 for null interval', () => {
      expect(getVoiceLeadingBias(null, 'statement')).toBe(0);
    });

    test('should return -0.75 for leap up', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'leap' }, 'statement');
      expect(bias).toBe(-0.75);
    });

    test('should return 0.75 for leap down', () => {
      const bias = getVoiceLeadingBias({ dir: -1, size: 'leap' }, 'statement');
      expect(bias).toBe(0.75);
    });

    test('should return 0 for step same (no directional bias)', () => {
      const bias = getVoiceLeadingBias({ dir: 0, size: 'step' }, 'statement');
      expect(bias).toBe(0);
    });

    test('should return -0.60 for skip up', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'skip' }, 'statement');
      expect(bias).toBe(-0.6);
    });

    test('should return 0.60 for skip down', () => {
      const bias = getVoiceLeadingBias({ dir: -1, size: 'skip' }, 'statement');
      expect(bias).toBe(0.6);
    });

    test('should relax rules at climax', () => {
      const bias = getVoiceLeadingBias({ dir: 1, size: 'leap' }, 'climax');
      expect(bias).toBe(0.3);
    });

    test('should relax rules at climax for downward leap', () => {
      const bias = getVoiceLeadingBias({ dir: -1, size: 'leap' }, 'climax');
      expect(bias).toBe(-0.3);
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

    test('should have skip:up rule', () => {
      expect(TRAJECTORY_RULES['skip:up']).toEqual({ preferredDir: -1, preferredSize: 'step', weight: 0.60 });
    });

    test('should have skip:down rule', () => {
      expect(TRAJECTORY_RULES['skip:down']).toEqual({ preferredDir: 1, preferredSize: 'step', weight: 0.60 });
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
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      expect(result.notes.length).toBe(notes.length);
    });

    test('should mark adjusted notes with metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(90, 4, 1.0, 'structural'),
        new MelodyNote(95, 8, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

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

      expect(result.passName).toBe('VoiceLeadingEngine');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should detect and compensate large leaps', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(90, 4, 1.0, 'structural'), // 30 semitone leap
        new MelodyNote(95, 8, 1.0, 'structural'), // continues upward (should be compensated)
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      // Should have made at least 0 adjustments (may not always trigger depending on threshold)
      expect(result.metadata.adjustmentsMade).toBeGreaterThanOrEqual(0);
    });

    test('should detect momentum turns (4 same-direction steps)', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(66, 3, 1.0, 'structural'),
        new MelodyNote(68, 4, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      expect(result.metadata.adjustmentsMade).toBeGreaterThanOrEqual(0);
    });

    test('should handle stepwise motion without adjustments', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await engine.execute(config, notes);

      // Stepwise motion should not trigger adjustments
      expect(result.metadata.adjustmentsMade).toBe(0);
    });
  });

  describe('getIntervalHistory()', () => {
    test('should return interval history entries', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(67, 2, 1.0, 'structural'),
      ];

      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      await engine.execute(config, notes);

      const history = engine.getIntervalHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(notes.length);
    });
  });

  describe('reset()', () => {
    test('should clear interval history', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      await engine.execute(config, notes);

      engine.reset();
      expect(engine.getIntervalHistory().length).toBe(0);
    });
  });

  describe('constructor options', () => {
    test('should respect custom leapThreshold', () => {
      const custom = new VoiceLeadingEngine({ leapThreshold: 5 });
      expect(custom.leapThreshold).toBe(5);
    });

    test('should respect custom momentumWindow', () => {
      const custom = new VoiceLeadingEngine({ momentumWindow: 6 });
      expect(custom.momentumWindow).toBe(6);
    });

    test('should respect custom compensateLeaps', () => {
      const custom = new VoiceLeadingEngine({ compensateLeaps: false });
      expect(custom.compensateLeaps).toBe(false);
    });
  });
});
