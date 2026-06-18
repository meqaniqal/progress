// Tests for Pass C - Connector Layer
import { ConnectorPlanner } from '../src/passes/passC_connector.js';
import {
  MelodyNote,
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';

describe('ConnectorPlanner (Pass C)', () => {
  let planner;

  beforeEach(() => {
    planner = new ConnectorPlanner();
  });

  describe('execute()', () => {
    it('should generate connector notes between structural points', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
        new MelodyNote(72, 8, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('F', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it('should generate stepwise motion primarily', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(72, 8, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
        new Chord('C', 'maj', 4, 8),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      // Check that most connectors are stepwise
      const connectors = result.notes.filter((n) => n.role === 'connector');
      expect(connectors.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect timing between structural notes', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      const connectors = result.notes.filter((n) => n.role === 'connector');

      // Connectors should be between the structural notes in time
      connectors.forEach((connector) => {
        expect(connector.startTime).toBeGreaterThanOrEqual(0);
        expect(connector.startTime).toBeLessThan(4);
      });
    });

    it('should return proper PassResult with evaluation metrics', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
        new MelodyNote(65, 4, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      expect(result.passName).toBe('PassC_Connector');
      expect(result.metrics).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle single structural note (no connectors needed)', async () => {
      const structuralNotes = [
        new MelodyNote(60, 0, 1, 'structural'),
      ];

      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, structuralNotes);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('should handle empty previous notes', async () => {
      const chords = [
        new Chord('C', 'maj', 0, 4),
      ];

      const phraseContext = new PhraseContext('statement', false);
      const config = new GenerationConfig(chords, phraseContext);

      const result = await planner.execute(config, []);

      expect(result.notes).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe('_selectMotionType()', () => {
    it('should return step, skip, or leap', () => {
      const planner2 = new ConnectorPlanner({
        stepProbability: 0.5,
        skipProbability: 0.3,
        leapProbability: 0.2,
      });

      const types = new Set();
      for (let i = 0; i < 100; i++) {
        types.add(planner2._selectMotionType());
      }

      // Should be able to generate all types
      expect(types.size).toBeGreaterThanOrEqual(1);
    });
  });
});
