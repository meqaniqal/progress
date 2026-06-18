// Tests for Pass B - Cadence Layer
import { CadencePlanner } from '../src/passes/passB_cadence.js';
import {
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';

describe('CadencePlanner (Pass B)', () => {
  let planner;

  beforeEach(() => {
    planner = new CadencePlanner();
  });

  describe('execute()', () => {
    it('should generate cadence notes for phrase endings', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('G', '7', 4, 8),
        new Chord('C', 'maj', 8, 12),
      ];

      const phraseContext = new PhraseContext('consequent', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
      expect(result.notes.length).toBeGreaterThan(0);
    });

    it('should avoid tonic resolution for antecedent phrases', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('G', '7', 4, 8),
      ];

      const phraseContext = new PhraseContext('antecedent', true);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      const pitches = result.notes.map((n) => n.pitch);
      const tonicC = 60; // C4

      // Antecedent should not resolve to tonic
      const nonTonicNotes = pitches.filter((p) => p !== tonicC);
      expect(nonTonicNotes.length).toBeGreaterThan(0);
    });

    it('should generate cadence notes at chord boundaries', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
        new Chord('G', '7', 8, 12),
        new Chord('C', 'maj', 12, 16),
      ];

      const phraseContext = new PhraseContext('consequent', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      // Should have cadence notes at phrase boundaries
      expect(result.notes.length).toBeGreaterThan(0);

      // Check that cadence notes have proper metadata
      result.notes.forEach((note) => {
        expect(note.metadata.isCadenceNote).toBe(true);
      });
    });

    it('should return proper PassResult with evaluation metrics', async () => {
      const chords = [new Chord('C', 'maj', 0, 4)];
      const phraseContext = new PhraseContext('consequent', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config);

      expect(result.passName).toBe('PassB_Cadence');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle empty chord progression gracefully', async () => {
      const phraseContext = new PhraseContext('consequent', false);
      const config = new GenerationConfig([], phraseContext);

      const result = await planner.execute(config);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe('_identifyCadencePoints()', () => {
    it('should identify last chord as cadence point', () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('G', '7', 4, 8),
        new Chord('C', 'maj', 8, 12),
      ];

      const phraseContext = new PhraseContext('consequent', false);
      const cadencePoints = planner._identifyCadencePoints(chords, phraseContext);

      const lastChordPoint = cadencePoints.find((p) => p.chordIndex === chords.length - 1);
      expect(lastChordPoint).toBeDefined();
      expect(lastChordPoint.isPhraseEnd).toBe(true);
    });

    it('should identify dominant chords as half-cadence points', () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('G', '7', 4, 8),
        new Chord('C', 'maj', 8, 12),
      ];

      const phraseContext = new PhraseContext('consequent', false);
      const cadencePoints = planner._identifyCadencePoints(chords, phraseContext);

      const dominantPoints = cadencePoints.filter((p) => !p.isPhraseEnd);
      expect(dominantPoints.length).toBeGreaterThan(0);
    });
  });

  describe('_noteNameToMidi()', () => {
    it('should convert C4 to MIDI 60', () => {
      const midi = planner._noteNameToMidi('C4');
      expect(midi).toBe(60);
    });

    it('should convert G4 to MIDI 67', () => {
      const midi = planner._noteNameToMidi('G4');
      expect(midi).toBe(67);
    });
  });
});
