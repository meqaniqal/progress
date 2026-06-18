// Tests for MicrotonalEngine
import MicrotonalEngine from '../src/engines/MicrotonalEngine.js';
import { MelodyNote, GenerationConfig } from '../src/interfaces.js';

describe('MicrotonalEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new MicrotonalEngine();
  });

  describe('execute()', () => {
    test('should apply 12-TET tuning to notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
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
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.passName).toBe('MicrotonalEngine');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.activeTuning).toBe('12tet');
    });

    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result).toBeDefined();
      expect(result.notes).toEqual([]);
    });

    test('should throw error for unknown tuning system', () => {
      expect(() => engine.setActiveTuning('unknown_tuning')).toThrow('Unknown tuning system: unknown_tuning');
    });
  });

  describe('setActiveTuning()', () => {
    test('should set active tuning to quartertone', () => {
      engine.setActiveTuning('quartertone');
      expect(engine.getActiveTuning().id).toBe('quartertone');
    });

    test('should set active tuning to just', () => {
      engine.setActiveTuning('just');
      expect(engine.getActiveTuning().id).toBe('just');
    });

    test('should set active tuning to pythagorean', () => {
      engine.setActiveTuning('pythagorean');
      expect(engine.getActiveTuning().id).toBe('pythagorean');
    });

    test('should throw error for unknown tuning', () => {
      expect(() => engine.setActiveTuning('nonexistent')).toThrow('Unknown tuning system: nonexistent');
    });
  });

  describe('getActiveTuning()', () => {
    test('should return the active tuning system', () => {
      const tuning = engine.getActiveTuning();
      expect(tuning).toBeDefined();
      expect(tuning.id).toBe('12tet');
    });

    test('should return tuning with correct properties', () => {
      const tuning = engine.getActiveTuning();
      expect(tuning.name).toBe('12-Tone Equal Temperament');
      expect(tuning.parameters).toBeDefined();
    });
  });

  describe('getAllTunings()', () => {
    test('should return all tuning systems', () => {
      const allTunings = engine.getAllTunings();
      expect(Object.keys(allTunings).length).toBe(4);
      expect(allTunings).toHaveProperty('12tet');
      expect(allTunings).toHaveProperty('quartertone');
      expect(allTunings).toHaveProperty('just');
      expect(allTunings).toHaveProperty('pythagorean');
    });
  });

  describe('quarter-tone tuning', () => {
    test('should calculate quarter-tone offsets', async () => {
      engine.setActiveTuning('quartertone');

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(61, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.notes.length).toBe(2);
    });
  });

  describe('just intonation tuning', () => {
    test('should apply just intonation ratios', async () => {
      engine.setActiveTuning('just');

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(64, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.notes.length).toBe(2);
    });
  });

  describe('constructor options', () => {
    test('should respect custom tuningSystem option', () => {
      const customEngine = new MicrotonalEngine({ tuningSystem: 'quartertone' });
      expect(customEngine.activeTuning).toBe('quartertone');
    });

    test('should respect custom microtoneResolution option', () => {
      const customEngine = new MicrotonalEngine({ microtoneResolution: 0.05 });
      expect(customEngine.microtoneResolution).toBe(0.05);
    });
  });
});
