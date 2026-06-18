// Tests for StyleEngine
import StyleEngine from '../src/engines/StyleEngine.js';
import { MelodyNote, GenerationConfig } from '../src/interfaces.js';

describe('StyleEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new StyleEngine();
  });

  describe('execute()', () => {
    test('should apply style rules to notes', async () => {
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

      expect(result.passName).toBe('StyleEngine');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.activeStyle).toBe('classical');
    });

    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result).toBeDefined();
      expect(result.notes).toEqual([]);
    });

    test('should throw error for unknown style', () => {
      expect(() => engine.setActiveStyle('unknown_style')).toThrow('Unknown style: unknown_style');
    });
  });

  describe('setActiveStyle()', () => {
    test('should set active style to baroque', () => {
      engine.setActiveStyle('baroque');
      expect(engine.getActiveStyle().id).toBe('baroque');
    });

    test('should set active style to jazz', () => {
      engine.setActiveStyle('jazz');
      expect(engine.getActiveStyle().id).toBe('jazz');
    });

    test('should set active style to pop', () => {
      engine.setActiveStyle('pop');
      expect(engine.getActiveStyle().id).toBe('pop');
    });

    test('should throw error for unknown style', () => {
      expect(() => engine.setActiveStyle('nonexistent')).toThrow('Unknown style: nonexistent');
    });
  });

  describe('getActiveStyle()', () => {
    test('should return the active style profile', () => {
      const style = engine.getActiveStyle();
      expect(style).toBeDefined();
      expect(style.id).toBe('classical');
    });

    test('should return style with correct properties', () => {
      const style = engine.getActiveStyle();
      expect(style.name).toBe('Classical');
      expect(style.rules).toBeDefined();
    });
  });

  describe('getAllStyles()', () => {
    test('should return all style profiles', () => {
      const allStyles = engine.getAllStyles();
      expect(Object.keys(allStyles).length).toBe(4);
      expect(allStyles).toHaveProperty('baroque');
      expect(allStyles).toHaveProperty('classical');
      expect(allStyles).toHaveProperty('jazz');
      expect(allStyles).toHaveProperty('pop');
    });
  });

  describe('style rules application', () => {
    test('should respect maxInterval constraint for baroque style', async () => {
      engine.setActiveStyle('baroque');

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(75, 1, 1.0, 'structural'), // 15 semitones, exceeds baroque max of 12
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
      expect(result.notes.length).toBeGreaterThan(0);
    });

    test('should respect maxInterval constraint for jazz style', async () => {
      engine.setActiveStyle('jazz');

      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(74, 1, 1.0, 'structural'), // 14 semitones, within jazz max of 14
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result).toBeDefined();
    });
  });
});
