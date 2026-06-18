// Tests for deriveRhythmEngineConfig helper
// Validates that RhythmEngine config is derived correctly from chord data,
// mirroring the Progress app's selectAestheticMode heuristic.

import { deriveRhythmEngineConfig } from '../src/progressBridge.js';

describe('deriveRhythmEngineConfig', () => {

  describe('major chord quality', () => {
    it('should return cantabile for low tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'major' }],
        'statement',
        0.3
      );
      expect(result.aestheticMode).toBe('cantabile');
    });

    it('should return declamatory for high tension (> 0.6)', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'major' }],
        'statement',
        0.7
      );
      expect(result.aestheticMode).toBe('declamatory');
    });

    it('should return declamatory for build role regardless of tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'major' }],
        'build',
        0.3
      );
      expect(result.aestheticMode).toBe('declamatory');
    });
  });

  describe('minor chord quality', () => {
    it('should return cantabile for low tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'D', quality: 'minor' }],
        'statement',
        0.3
      );
      expect(result.aestheticMode).toBe('cantabile');
    });

    it('should return sighs for high tension (> 0.6)', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'D', quality: 'minor' }],
        'statement',
        0.7
      );
      expect(result.aestheticMode).toBe('sighs');
    });

    it('should return sighs for build role regardless of tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'D', quality: 'minor' }],
        'build',
        0.3
      );
      expect(result.aestheticMode).toBe('sighs');
    });
  });

  describe('dominant chord quality', () => {
    it('should return declamatory for low tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'G', quality: 'dominant' }],
        'statement',
        0.3
      );
      expect(result.aestheticMode).toBe('declamatory');
    });

    it('should return virtuoso for climax role', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'G', quality: 'dominant' }],
        'climax',
        0.3
      );
      expect(result.aestheticMode).toBe('virtuoso');
    });

    it('should return virtuoso for high tension (> 0.6)', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'G', quality: 'dominant' }],
        'statement',
        0.7
      );
      expect(result.aestheticMode).toBe('virtuoso');
    });
  });

  describe('diminished chord quality', () => {
    it('should return sighs for low tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'B', quality: 'diminished' }],
        'statement',
        0.3
      );
      expect(result.aestheticMode).toBe('sighs');
    });

    it('should return declamatory for build role', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'B', quality: 'diminished' }],
        'build',
        0.3
      );
      expect(result.aestheticMode).toBe('declamatory');
    });

    it('should return sighs for climax role (diminished exception)', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'B', quality: 'diminished' }],
        'climax',
        0.3
      );
      expect(result.aestheticMode).toBe('sighs');
    });
  });

  describe('augmented chord quality', () => {
    it('should return cantabile for low tension', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'F', quality: 'augmented' }],
        'statement',
        0.3
      );
      expect(result.aestheticMode).toBe('cantabile');
    });

    it('should return declamatory for build role', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'F', quality: 'augmented' }],
        'build',
        0.3
      );
      expect(result.aestheticMode).toBe('declamatory');
    });
  });

  describe('phrase role overrides', () => {
    it('should always return cantabile for resolution role', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'maj' }],
        'resolution',
        0.9
      );
      expect(result.aestheticMode).toBe('cantabile');
    });

    it('should return virtuoso for climax with non-diminished quality', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'maj' }],
        'climax',
        0.3
      );
      expect(result.aestheticMode).toBe('virtuoso');
    });

    it('should return sighs for climax with diminished quality', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'B', quality: 'diminished' }],
        'climax',
        0.3
      );
      expect(result.aestheticMode).toBe('sighs');
    });
  });

  describe('empty chord list', () => {
    it('should default to cantabile when no chords provided', () => {
      const result = deriveRhythmEngineConfig([], 'statement', 0.5);
      expect(result.aestheticMode).toBe('cantabile');
    });
  });

  describe('returned config structure', () => {
    it('should always include aestheticMode, genre, and density', () => {
      const result = deriveRhythmEngineConfig(
        [{ root: 'C', quality: 'maj' }],
        'statement',
        0.5
      );
      expect(result).toHaveProperty('aestheticMode');
      expect(result).toHaveProperty('genre');
      expect(result).toHaveProperty('density');
      expect(result.genre).toBe('none');
      expect(result.density).toBe(0.5);
    });
  });
});
