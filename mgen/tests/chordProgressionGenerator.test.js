// chordProgressionGenerator.test.js
// Tests for the chord progression generator module.
// Tests the fixturegen → bridge → mgen pipeline independently of the web UI.

import {
  generateRandomChord,
  generateRandomProgression,
  generateComplexChordPattern,
  generateComplexBassPattern,
  generateComplexDrumPattern,
  generateProgressionWithTracks,
  generateRandomPhraseContext,
  buildGenerationConfig,
} from '../src/chordProgressionGenerator.js';
import { Chord, PhraseContext, GenerationConfig } from '../src/interfaces.js';
import { preprocessProgressData } from '../src/progressBridge.js';

describe('chordProgressionGenerator', () => {
  describe('generateRandomChord()', () => {
    it('should return a Chord instance', () => {
      const chord = generateRandomChord(0);
      expect(chord).toBeInstanceOf(Chord);
    });

    it('should use the provided beatStart', () => {
      const chord = generateRandomChord(5);
      expect(chord.beatStart).toBe(5);
    });

    it('should have a valid root note', () => {
      const chord = generateRandomChord(0);
      expect(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']).toContain(chord.root);
    });

    it('should have a valid quality', () => {
      const chord = generateRandomChord(0);
      expect(['maj', 'min', 'dim', 'aug', '7', 'maj7']).toContain(chord.quality);
    });

    it('should have scaleDegrees matching the quality', () => {
      for (let i = 0; i < 20; i++) {
        const chord = generateRandomChord(0);
        // All qualities return 3 degrees: root + 2 intervals (3rd, 5th)
        expect(chord.scaleDegrees.length).toBe(3);
      }
    });

    it('should have scale degrees within 0-11 range', () => {
      for (let i = 0; i < 20; i++) {
        const chord = generateRandomChord(0);
        chord.scaleDegrees.forEach(deg => {
          expect(deg).toBeGreaterThanOrEqual(0);
          expect(deg).toBeLessThanOrEqual(11);
        });
      }
    });
  });

  describe('generateRandomProgression()', () => {
    it('should return an array of Chord instances', () => {
      const progression = generateRandomProgression();
      expect(Array.isArray(progression)).toBe(true);
      progression.forEach(c => expect(c).toBeInstanceOf(Chord));
    });

    it('should generate 4 chords by default', () => {
      const progression = generateRandomProgression();
      expect(progression.length).toBe(4);
    });

    it('should respect the count parameter', () => {
      const progression = generateRandomProgression({ count: 8 });
      expect(progression.length).toBe(8);
    });

    it('should use beatIncrement=2 by default', () => {
      const progression = generateRandomProgression();
      expect(progression[0].beatStart).toBe(0);
      expect(progression[1].beatStart).toBe(2);
      expect(progression[2].beatStart).toBe(4);
      expect(progression[3].beatStart).toBe(6);
    });

    it('should respect custom beatIncrement', () => {
      const progression = generateRandomProgression({ beatIncrement: 4 });
      expect(progression[0].beatStart).toBe(0);
      expect(progression[1].beatStart).toBe(4);
      expect(progression[2].beatStart).toBe(8);
    });

    it('should respect startBeat parameter', () => {
      const progression = generateRandomProgression({ startBeat: 10, count: 3 });
      expect(progression[0].beatStart).toBe(10);
      expect(progression[1].beatStart).toBe(12);
      expect(progression[2].beatStart).toBe(14);
    });

    it('should generate 1 chord when count=1', () => {
      const progression = generateRandomProgression({ count: 1 });
      expect(progression.length).toBe(1);
    });
  });

  describe('generateComplexChordPattern()', () => {
    it('should return an object with instances and transitions arrays', () => {
      const pattern = generateComplexChordPattern(4);
      expect(pattern).toHaveProperty('instances');
      expect(pattern).toHaveProperty('transitions');
      expect(Array.isArray(pattern.instances)).toBe(true);
      expect(Array.isArray(pattern.transitions)).toBe(true);
    });

    it('should generate 3-8 instances', () => {
      for (let i = 0; i < 10; i++) {
        const pattern = generateComplexChordPattern(4);
        expect(pattern.instances.length).toBeGreaterThanOrEqual(3);
        expect(pattern.instances.length).toBeLessThanOrEqual(8);
      }
    });

    it('should generate instances with valid fields', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst).toHaveProperty('id');
        expect(inst).toHaveProperty('startTime');
        expect(inst).toHaveProperty('duration');
        expect(inst).toHaveProperty('type');
        expect(inst).toHaveProperty('pitchOffset');
        expect(inst).toHaveProperty('pitchOffsets');
        expect(inst).toHaveProperty('isSelected');
        expect(inst).toHaveProperty('probability');
      });
    });

    it('should generate normalized startTime values (0-1)', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst.startTime).toBeGreaterThanOrEqual(0);
        expect(inst.startTime).toBeLessThanOrEqual(1);
      });
    });

    it('should generate valid type values', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.instances.forEach(inst => {
        expect(['chord', 'note']).toContain(inst.type);
      });
    });

    it('should generate pitchOffsets arrays of valid values', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.instances.forEach(inst => {
        expect(Array.isArray(inst.pitchOffsets)).toBe(true);
        inst.pitchOffsets.forEach(offset => {
          expect(offset).toBeGreaterThanOrEqual(-12);
          expect(offset).toBeLessThanOrEqual(12);
        });
      });
    });

    it('should generate arpeggio settings on ~50% of instances', () => {
      let totalArps = 0;
      let totalInstances = 0;
      for (let i = 0; i < 20; i++) {
        const pattern = generateComplexChordPattern(4);
        totalInstances += pattern.instances.length;
        totalArps += pattern.instances.filter(x => x.arpSettings).length;
      }
      const ratio = totalArps / totalInstances;
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.7);
    });

    it('should generate valid arpSettings when present', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.instances.filter(x => x.arpSettings).forEach(inst => {
        const arp = inst.arpSettings;
        expect(['up', 'down', 'random', 'arpeggiated']).toContain(arp.style);
        expect(arp.rate).toBeGreaterThanOrEqual(0.125);
        expect(arp.rate).toBeLessThanOrEqual(0.5);
        expect(arp.gate).toBeGreaterThanOrEqual(0.5);
        expect(arp.gate).toBeLessThanOrEqual(0.95);
      });
    });

    it('should generate transitions (0-3)', () => {
      for (let i = 0; i < 10; i++) {
        const pattern = generateComplexChordPattern(4);
        expect(pattern.transitions.length).toBeGreaterThanOrEqual(0);
        expect(pattern.transitions.length).toBeLessThanOrEqual(3);
      }
    });

    it('should generate valid transition types', () => {
      const pattern = generateComplexChordPattern(4);
      pattern.transitions.forEach(trans => {
        expect(['fade', 'crescendo', 'diminuendo', 'switch']).toContain(trans.type);
        expect(trans).toHaveProperty('targetChordIndex');
        expect(trans).toHaveProperty('startTime');
        expect(trans).toHaveProperty('duration');
      });
    });
  });

  describe('generateComplexBassPattern()', () => {
    it('should return an object with instances array', () => {
      const pattern = generateComplexBassPattern(4);
      expect(Array.isArray(pattern.instances)).toBe(true);
    });

    it('should generate 2-6 instances', () => {
      for (let i = 0; i < 10; i++) {
        const pattern = generateComplexBassPattern(4);
        expect(pattern.instances.length).toBeGreaterThanOrEqual(2);
        expect(pattern.instances.length).toBeLessThanOrEqual(6);
      }
    });

    it('should generate instances with valid fields', () => {
      const pattern = generateComplexBassPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst).toHaveProperty('id');
        expect(inst).toHaveProperty('startTime');
        expect(inst).toHaveProperty('duration');
        expect(inst).toHaveProperty('type');
        expect(inst).toHaveProperty('pitchOffset');
        expect(inst).toHaveProperty('pitchOffsets');
        expect(inst).toHaveProperty('isSelected');
        expect(inst).toHaveProperty('probability');
      });
    });

    it('should generate pitchOffset values in range -12 to 7', () => {
      const pattern = generateComplexBassPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst.pitchOffset).toBeGreaterThanOrEqual(-12);
        expect(inst.pitchOffset).toBeLessThanOrEqual(7);
      });
    });

    it('should always have null arpSettings for bass', () => {
      const pattern = generateComplexBassPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst.arpSettings).toBeNull();
      });
    });

    it('should generate normalized startTime values (0-1)', () => {
      const pattern = generateComplexBassPattern(4);
      pattern.instances.forEach(inst => {
        expect(inst.startTime).toBeGreaterThanOrEqual(0);
        expect(inst.startTime).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('generateComplexDrumPattern()', () => {
    it('should return an object with hits array', () => {
      const pattern = generateComplexDrumPattern(4);
      expect(Array.isArray(pattern.hits)).toBe(true);
    });

    it('should generate 4-8+ hits for a 4-beat chord', () => {
      const pattern = generateComplexDrumPattern(4);
      expect(pattern.hits.length).toBeGreaterThanOrEqual(4);
    });

    it('should generate hits with valid fields', () => {
      const pattern = generateComplexDrumPattern(4);
      pattern.hits.forEach(hit => {
        expect(hit).toHaveProperty('id');
        expect(hit).toHaveProperty('time');
        expect(hit).toHaveProperty('row');
        expect(hit).toHaveProperty('velocity');
        expect(hit).toHaveProperty('probability');
      });
    });

    it('should generate valid drum row values', () => {
      const pattern = generateComplexDrumPattern(4);
      pattern.hits.forEach(hit => {
        expect(['kick', 'snare', 'chh', 'ohh']).toContain(hit.row);
      });
    });

    it('should generate hits sorted by time', () => {
      const pattern = generateComplexDrumPattern(4);
      for (let i = 1; i < pattern.hits.length; i++) {
        expect(pattern.hits[i].time).toBeGreaterThanOrEqual(pattern.hits[i - 1].time);
      }
    });

    it('should generate valid velocity values (0.3-1.0)', () => {
      const pattern = generateComplexDrumPattern(4);
      pattern.hits.forEach(hit => {
        expect(hit.velocity).toBeGreaterThanOrEqual(0.3);
        expect(hit.velocity).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('generateProgressionWithTracks()', () => {
    it('should return an object with chords, progressData, and rawChords', () => {
      const result = generateProgressionWithTracks();
      expect(result).toHaveProperty('chords');
      expect(result).toHaveProperty('progressData');
      expect(result).toHaveProperty('rawChords');
    });

    it('should return Chord[] for chords property', () => {
      const result = generateProgressionWithTracks();
      result.chords.forEach(c => expect(c).toBeInstanceOf(Chord));
    });

    it('should return rawChords as Chord[]', () => {
      const result = generateProgressionWithTracks();
      result.rawChords.forEach(c => expect(c).toBeInstanceOf(Chord));
    });

    it('should generate the specified number of raw chords', () => {
      const result = generateProgressionWithTracks({ count: 6 });
      expect(result.rawChords.length).toBe(6);
    });

    it('should include bassPattern when withBass=true', () => {
      const result = generateProgressionWithTracks({ count: 3, withBass: true });
      result.progressData.chords.forEach(pc => {
        expect(pc.bassPattern).toBeDefined();
        expect(Array.isArray(pc.bassPattern.instances)).toBe(true);
      });
    });

    it('should not include bassPattern when withBass=false', () => {
      const result = generateProgressionWithTracks({ count: 3, withBass: false });
      result.progressData.chords.forEach(pc => {
        expect(pc.bassPattern).toBeUndefined();
      });
    });

    it('should include drumPattern when withDrums=true', () => {
      const result = generateProgressionWithTracks({ count: 3, withDrums: true });
      result.progressData.chords.forEach(pc => {
        expect(pc.drumPattern).toBeDefined();
        expect(Array.isArray(pc.drumPattern.hits)).toBe(true);
      });
    });

    it('should not include drumPattern when withDrums=false', () => {
      const result = generateProgressionWithTracks({ count: 3, withDrums: false });
      result.progressData.chords.forEach(pc => {
        expect(pc.drumPattern).toBeUndefined();
      });
    });

    it('should run through bridge preprocessing', () => {
      const result = generateProgressionWithTracks({ count: 4 });
      expect(result.chords.length).toBeGreaterThan(0);
    });

    it('should produce valid progressData format for bridge', () => {
      const result = generateProgressionWithTracks({ count: 4, withBass: true, withDrums: true });
      result.progressData.chords.forEach(pc => {
        expect(pc).toHaveProperty('symbol');
        expect(pc).toHaveProperty('key');
        expect(pc).toHaveProperty('divisions');
        expect(pc).toHaveProperty('duration');
        expect(pc).toHaveProperty('notes');
      });
    });

    it('should work with custom beatIncrement', () => {
      const result = generateProgressionWithTracks({ count: 3, beatIncrement: 4 });
      expect(result.rawChords[0].beatStart).toBe(0);
      expect(result.rawChords[1].beatStart).toBe(4);
      expect(result.rawChords[2].beatStart).toBe(8);
    });

    it('should generate complex chord patterns by default (arps, transitions, pitch offsets)', () => {
      // Run multiple times to ensure we consistently get complex patterns
      let totalArps = 0;
      let totalPitchOffsets = 0;
      for (let run = 0; run < 10; run++) {
        const result = generateProgressionWithTracks({ count: 3 });
        result.progressData.chords.forEach(pc => {
          const arps = pc.chordPattern.instances.filter(x => x.arpSettings);
          totalArps += arps.length;
          const offsets = pc.chordPattern.instances.reduce(
            (sum, x) => sum + x.pitchOffsets.length, 0
          );
          totalPitchOffsets += offsets;
        });
      }
      // Across 30 chords * 10 runs, we should consistently get arps and pitch offsets
      expect(totalArps).toBeGreaterThan(10);
      expect(totalPitchOffsets).toBeGreaterThan(10);
    });

    it('should generate simple patterns when complexPatterns=false', () => {
      const result = generateProgressionWithTracks({ count: 3, complexPatterns: false });
      result.progressData.chords.forEach(pc => {
        expect(pc.chordPattern.instances.length).toBe(1);
        expect(pc.chordPattern.transitions.length).toBe(0);
      });
    });

    it('should exercise bridge event boundaries with complex patterns', () => {
      // Complex patterns with 5+ instances, bass, and drums create many event boundaries
      // The bridge should slice chords at each boundary
      const result = generateProgressionWithTracks({ count: 3, beatIncrement: 4 });
      // With 3 chords of 4 beats each, complex patterns, bass, and drums,
      // the bridge should produce more sliced chords than raw chords
      expect(result.chords.length).toBeGreaterThan(result.rawChords.length);
    });
  });

  describe('generateRandomPhraseContext()', () => {
    it('should return a PhraseContext instance', () => {
      const ctx = generateRandomPhraseContext();
      expect(ctx).toBeInstanceOf(PhraseContext);
    });

    it('should have a valid role', () => {
      for (let i = 0; i < 10; i++) {
        const ctx = generateRandomPhraseContext();
        expect(['statement', 'build', 'climax', 'release', 'resolution']).toContain(ctx.role);
      }
    });

    it('should have tensionLevel in range 0.1-0.95', () => {
      for (let i = 0; i < 10; i++) {
        const ctx = generateRandomPhraseContext();
        expect(ctx.tensionLevel).toBeGreaterThanOrEqual(0.1);
        expect(ctx.tensionLevel).toBeLessThanOrEqual(0.95);
      }
    });

    it('should respect forced role parameter', () => {
      const ctx = generateRandomPhraseContext({ role: 'climax' });
      expect(ctx.role).toBe('climax');
    });

    it('should respect forced tensionLevel parameter', () => {
      const ctx = generateRandomPhraseContext({ tensionLevel: 0.75 });
      expect(ctx.tensionLevel).toBe(0.75);
    });

    it('should respect forced isAntecedent parameter', () => {
      const ctx = generateRandomPhraseContext({ isAntecedent: true });
      expect(ctx.isAntecedent).toBe(true);
    });
  });

  describe('buildGenerationConfig()', () => {
    it('should return a GenerationConfig instance', () => {
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7])];
      const ctx = new PhraseContext('statement', 0.5, undefined, false);
      const config = buildGenerationConfig(chords, ctx);
      expect(config).toBeInstanceOf(GenerationConfig);
    });

    it('should store chords correctly', () => {
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7]), new Chord('G', '7', 2, [7, 11, 2])];
      const ctx = new PhraseContext('statement', 0.5, undefined, false);
      const config = buildGenerationConfig(chords, ctx);
      expect(config.chords.length).toBe(2);
    });

    it('should store phraseContext correctly', () => {
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7])];
      const ctx = new PhraseContext('build', 0.8, undefined, true);
      const config = buildGenerationConfig(chords, ctx);
      expect(config.phraseContext.role).toBe('build');
      expect(config.phraseContext.tensionLevel).toBe(0.8);
      expect(config.phraseContext.isAntecedent).toBe(true);
    });
  });
});
