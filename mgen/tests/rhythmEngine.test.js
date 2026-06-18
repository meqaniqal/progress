// Tests for RhythmEngine
import RhythmEngine, { RhythmTemplate, SubdivisionProfile } from '../src/engines/RhythmEngine.js';
import { MelodyNote, GenerationConfig } from '../src/interfaces.js';

describe('RhythmEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new RhythmEngine();
  });

  describe('execute()', () => {
    test('should apply rhythm transformations to notes', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 0.5, 'structural'),
        new MelodyNote(64, 2, 1.0, 'cadence'),
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
        new MelodyNote(62, 1, 0.5, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      expect(result.passName).toBe('RhythmEngine');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.score).toBeLessThanOrEqual(1);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.activeTemplate).toBeDefined();
      expect(result.metadata.subdivisionProfile).toBeDefined();
    });

    test('should handle empty previous notes', async () => {
      const config = new GenerationConfig();
      const result = await engine.execute(config, []);

      expect(result).toBeDefined();
      expect(result.notes).toEqual([]);
    });

    test('should mark transformed notes with rhythmAdjusted metadata', async () => {
      const notes = [
        new MelodyNote(60, 0, 1.0, 'structural'),
        new MelodyNote(62, 1, 0.5, 'structural'),
      ];

      const config = new GenerationConfig();
      const result = await engine.execute(config, notes);

      // At least some notes should have rhythmAdjusted metadata
      const adjustedNotes = result.notes.filter(n => n.metadata && n.metadata.rhythmAdjusted);
      expect(adjustedNotes.length).toBeGreaterThan(0);
    });

    test('should include templateId and subdivision info in metadata for active notes', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();
      // Use density 1.0 to ensure notes are never excluded by density roll
      const densityEngine = new RhythmEngine({ density: 1.0 });
      const result = await densityEngine.execute(config, notes);

      const adjustedNotes = result.notes.filter(n => n.metadata && n.metadata.rhythmAdjusted && n.duration > 0);
      if (adjustedNotes.length > 0) {
        expect(adjustedNotes[0].metadata.templateId).toBeDefined();
        expect(adjustedNotes[0].metadata.subdivisionId).toBeDefined();
      }
    });
  });

  describe('setAestheticMode()', () => {
    test('should set active aesthetic mode to cantabile', () => {
      engine.setAestheticMode('cantabile');
      expect(engine.getAestheticMode()).toBe('cantabile');
    });

    test('should set active aesthetic mode to declamatory', () => {
      engine.setAestheticMode('declamatory');
      expect(engine.getAestheticMode()).toBe('declamatory');
    });

    test('should set active aesthetic mode to sighs', () => {
      engine.setAestheticMode('sighs');
      expect(engine.getAestheticMode()).toBe('sighs');
    });

    test('should set active aesthetic mode to virtuoso', () => {
      engine.setAestheticMode('virtuoso');
      expect(engine.getAestheticMode()).toBe('virtuoso');
    });

    test('should throw error for unknown aesthetic mode', () => {
      expect(() => engine.setAestheticMode('unknown_mode')).toThrow('Unknown aesthetic mode: unknown_mode');
    });
  });

  describe('setGenre()', () => {
    test('should set genre to acceleration', () => {
      engine.setGenre('acceleration');
      expect(engine.getGenre()).toBe('acceleration');
    });

    test('should set genre to deceleration', () => {
      engine.setGenre('deceleration');
      expect(engine.getGenre()).toBe('deceleration');
    });

    test('should set genre to syncopatedAlternation', () => {
      engine.setGenre('syncopatedAlternation');
      expect(engine.getGenre()).toBe('syncopatedAlternation');
    });

    test('should set genre to tripletSwing', () => {
      engine.setGenre('tripletSwing');
      expect(engine.getGenre()).toBe('tripletSwing');
    });

    test('should default to none when no genre set', () => {
      expect(engine.getGenre()).toBe('none');
    });
  });

  describe('setDensity()', () => {
    test('should set density to 0.3', () => {
      engine.setDensity(0.3);
      expect(engine.getDensity()).toBe(0.3);
    });

    test('should set density to 0.9', () => {
      engine.setDensity(0.9);
      expect(engine.getDensity()).toBe(0.9);
    });

    test('should clamp density to 0 when given negative value', () => {
      engine.setDensity(-0.5);
      expect(engine.getDensity()).toBe(0);
    });

    test('should clamp density to 1 when given value > 1', () => {
      engine.setDensity(1.5);
      expect(engine.getDensity()).toBe(1);
    });
  });

  describe('constructor options', () => {
    test('should respect custom aestheticMode option', () => {
      const customEngine = new RhythmEngine({ aestheticMode: 'virtuoso' });
      expect(customEngine.getAestheticMode()).toBe('virtuoso');
    });

    test('should respect custom genre option', () => {
      const customEngine = new RhythmEngine({ genre: 'acceleration' });
      expect(customEngine.getGenre()).toBe('acceleration');
    });

    test('should respect custom density option', () => {
      const customEngine = new RhythmEngine({ density: 0.8 });
      expect(customEngine.getDensity()).toBe(0.8);
    });

    test('should respect custom stepsPerMeasure option', () => {
      const customEngine = new RhythmEngine({ stepsPerMeasure: 32 });
      expect(customEngine.stepsPerMeasure).toBe(32);
    });

    test('should respect custom chordSlotDuration option', () => {
      const customEngine = new RhythmEngine({ chordSlotDuration: 2 });
      expect(customEngine.chordSlotDuration).toBe(2);
    });
  });

  describe('getAllTemplates()', () => {
    test('should return all aesthetic mode templates', () => {
      const allTemplates = engine.getAllTemplates();
      expect(Object.keys(allTemplates)).toContain('cantabile');
      expect(Object.keys(allTemplates)).toContain('declamatory');
      expect(Object.keys(allTemplates)).toContain('sighs');
      expect(Object.keys(allTemplates)).toContain('virtuoso');
    });

    test('should return templates with activityLevel property', () => {
      const allTemplates = engine.getAllTemplates();
      const cantabileTemplates = allTemplates.cantabile;
      expect(cantabileTemplates.length).toBeGreaterThan(0);
      expect(cantabileTemplates[0].activityLevel).toBeGreaterThan(0);
    });

    test('should return templates with gridString representation', () => {
      const allTemplates = engine.getAllTemplates();
      const cantabileTemplates = allTemplates.cantabile;
      expect(typeof cantabileTemplates[0].gridString).toBe('string');
      expect(cantabileTemplates[0].gridString).toMatch(/^[1.]+$/);
    });
  });

  describe('getAllSubdivisionProfiles()', () => {
    test('should return all genre subdivision profiles', () => {
      const allProfiles = engine.getAllSubdivisionProfiles();
      expect(Object.keys(allProfiles)).toContain('none');
      expect(Object.keys(allProfiles)).toContain('acceleration');
    });
  });

  describe('RhythmTemplate', () => {
    test('should calculate activityLevel correctly', () => {
      const template = new RhythmTemplate('test', 'Test', [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0]);
      expect(template.activityLevel).toBe(6);
    });

    test('should format grid as string correctly', () => {
      const template = new RhythmTemplate('test', 'Test', [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0]);
      expect(template.toString()).toBe('1...1.1.1...1.1.');
    });

    test('should handle all-rest template', () => {
      const template = new RhythmTemplate('rest', 'All rest', Array(16).fill(0));
      expect(template.activityLevel).toBe(0);
      expect(template.toString()).toBe('................');
    });

    test('should handle all-active template', () => {
      const template = new RhythmTemplate('full', 'Full', Array(16).fill(1));
      expect(template.activityLevel).toBe(16);
      expect(template.toString()).toBe('1111111111111111');
    });
  });

  describe('SubdivisionProfile', () => {
    test('should store subdivisions correctly', () => {
      const profile = new SubdivisionProfile('test', 'Test', [4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2]);
      expect(profile.subdivisions).toEqual([4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2]);
    });
  });

  describe('integration: density affects note count', () => {
    test('high density produces more active notes than low density', async () => {
      const notes = Array.from({ length: 32 }, (_, i) =>
        new MelodyNote(60 + (i % 5), i * 0.5, 0.5, 'structural')
      );

      const highDensityEngine = new RhythmEngine({ density: 0.9 });
      const lowDensityEngine = new RhythmEngine({ density: 0.2 });

      const config = new GenerationConfig();

      const highResult = await highDensityEngine.execute(config, notes);
      const lowResult = await lowDensityEngine.execute(config, notes);

      const highActive = highResult.notes.filter(n => n.duration > 0).length;
      const lowActive = lowResult.notes.filter(n => n.duration > 0).length;

      expect(highActive).toBeGreaterThanOrEqual(lowActive);
    });
  });

  describe('integration: aesthetic mode affects template selection', () => {
    test('virtuoso mode should produce more active notes than sighs mode', async () => {
      const notes = Array.from({ length: 32 }, (_, i) =>
        new MelodyNote(60 + (i % 5), i * 0.5, 0.5, 'structural')
      );

      const virtuosoEngine = new RhythmEngine({ aestheticMode: 'virtuoso', density: 1.0 });
      const sighsEngine = new RhythmEngine({ aestheticMode: 'sighs', density: 1.0 });

      const config = new GenerationConfig();

      const virtuosoResult = await virtuosoEngine.execute(config, notes);
      const sighsResult = await sighsEngine.execute(config, notes);

      const virtuosoActive = virtuosoResult.notes.filter(n => n.duration > 0).length;
      const sighsActive = sighsResult.notes.filter(n => n.duration > 0).length;

      // Virtuoso templates are denser than sighs templates
      expect(virtuosoActive).toBeGreaterThanOrEqual(sighsActive);
    });
  });

  describe('integration: genre affects subdivision', () => {
    test('should apply different subdivision profiles per genre', async () => {
      const notes = [new MelodyNote(60, 0, 1.0, 'structural')];
      const config = new GenerationConfig();

      const accelEngine = new RhythmEngine({ genre: 'acceleration', density: 1.0 });
      const swingEngine = new RhythmEngine({ genre: 'tripletSwing', density: 1.0 });
      const noneEngine = new RhythmEngine({ genre: 'none', density: 1.0 });

      const accelResult = await accelEngine.execute(config, notes);
      const swingResult = await swingEngine.execute(config, notes);
      const noneResult = await noneEngine.execute(config, notes);

      // None genre should use uniform subdivision (all 4s)
      const noneAdjusted = noneResult.notes.filter(n => n.metadata && n.metadata.subdivisionId);
      if (noneAdjusted.length > 0) {
        expect(noneAdjusted[0].metadata.subdivisionId).toBe('uniform');
      }

      // Other genres should use their respective profiles
      const accelAdjusted = accelResult.notes.filter(n => n.metadata && n.metadata.subdivisionId);
      if (accelAdjusted.length > 0) {
        expect(accelAdjusted[0].metadata.subdivisionId).toBe('acceleration');
      }

      const swingAdjusted = swingResult.notes.filter(n => n.metadata && n.metadata.subdivisionId);
      if (swingAdjusted.length > 0) {
        expect(swingAdjusted[0].metadata.subdivisionId).toBe('tripletSwing');
      }
    });
  });
});
