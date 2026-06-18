// Tests for MotifEngine
import MotifEngine from '../src/engines/MotifEngine.js';
import { MelodyNote, GenerationConfig } from '../src/interfaces.js';

describe('MotifEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new MotifEngine();
  });

  describe('execute()', () => {
    test('should extract motif families from structural notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
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
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.passName).toBe('MotifEngine');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
      expect(result.metadata).toBeDefined();
    });

    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result).toBeDefined();
      expect(result.notes).toEqual([]);
    });

    test('should handle single note (no motifs possible)', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.notes.length).toBeGreaterThanOrEqual(1);
    });

    test('should not extract motifs when below minimum length', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.metadata.motifCount).toBe(0);
    });
  });

  describe('getMotifFamilies()', () => {
    test('should return extracted motif families', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 1.0, 'structural'),
        new MelodyNote(64, 2, 1.0, 'structural'),
        new MelodyNote(65, 3, 1.0, 'structural'),
      ];

      const config = new GenerationConfig();
      await engine.execute(config, notes);

      const families = engine.getMotifFamilies();
      expect(Array.isArray(families)).toBe(true);
    });
  });

  describe('constructor options', () => {
    test('should respect custom minMotifLength', () => {
      const customEngine = new MotifEngine({ minMotifLength: 5 });
      expect(customEngine.minMotifLength).toBe(5);
    });

    test('should respect custom maxMotifLength', () => {
      const customEngine = new MotifEngine({ maxMotifLength: 4 });
      expect(customEngine.maxMotifLength).toBe(4);
    });

    test('should respect custom transformProbability', () => {
      const customEngine = new MotifEngine({ transformProbability: 0.9 });
      expect(customEngine.transformProbability).toBe(0.9);
    });
  });
});
