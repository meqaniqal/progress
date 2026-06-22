// Tests for Notes-First, Feedback-Enabled Melody Generation
import { CompositionOrchestrator } from '../src/orchestrator.js';
import { StructuralPlanner } from '../src/passes/passA_structural.js';
import {
  MelodyNote,
  Chord,
  PhraseContext,
  GenerationConfig,
} from '../src/interfaces.js';
import { progressStateToGenerationConfig } from '../src/progressBridge.js';

describe('Notes-First & Feedback Refactoring', () => {
  describe('Chord Notes-First Priority', () => {
    it('should prioritize explicit chord notes over symbol-derived intervals in Pass A', async () => {
      const planner = new StructuralPlanner();
      // Chord with custom notes [61, 65, 68] which does not match C major symbol 'C'
      const chord = new Chord('C', 'maj', 0, [0, 4, 7], 4, [61, 65, 68]);
      const config = new GenerationConfig([chord], new PhraseContext('statement', 0.5));

      const result = await planner.execute(config);

      expect(result.notes).toBeDefined();
      expect(result.notes.length).toBe(1);
      
      // Structural target should be selected from the explicit custom notes [61, 65, 68], not standard C major [60, 64, 67]
      const notePitch = result.notes[0].pitch;
      expect([61, 65, 68]).toContain(notePitch);
    });
  });

  describe('Pitch Snapping Options', () => {
    it('should bypass pitch snapping entirely if snapToHarmonicContext is false', async () => {
      const orchestrator = new CompositionOrchestrator();
      
      // We will mock pass structural generator to return Bb4 (70) on C major chord
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7], 4, [60, 64, 67])];
      const config = new GenerationConfig(chords, new PhraseContext('statement', 0.5), {
        snapToHarmonicContext: false,
      });

      const inputNotes = [new MelodyNote(70, 0.5, 1.0, 'structural')];
      const snapped = orchestrator._snapPitchesToHarmonicContext(inputNotes, chords, config.options);

      // Pitch should remain 70 (Bb4), not snapped to C/E/G/B
      expect(snapped[0].pitch).toBe(70);
    });

    it('should snap to custom chord notes if present when snapToHarmonicContext is true', async () => {
      const orchestrator = new CompositionOrchestrator();
      
      // Chord with custom notes [61, 65, 68] (Db major triad) but symbol says 'C'
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7], 4, [61, 65, 68])];
      const config = new GenerationConfig(chords, new PhraseContext('statement', 0.5), {
        snapToHarmonicContext: true,
      });

      // Target note is 60 (C)
      const inputNotes = [new MelodyNote(60, 0.5, 1.0, 'structural')];
      const snapped = orchestrator._snapPitchesToHarmonicContext(inputNotes, chords, config.options);

      // C (60) should snap to closest tone in Db triad [61, 65, 68] which is 61
      expect(snapped[0].pitch).toBe(61);
    });
  });

  describe('Global Evaluation & Feedback Loop', () => {
    it('should evaluate melody globally and record score/iterations', async () => {
      const orchestrator = new CompositionOrchestrator();
      
      // Register a pass that returns a simple melody
      orchestrator.registerPass({
        name: 'MockPass',
        execute: async (config, previousNotes) => {
          return {
            passName: 'MockPass',
            notes: [
              new MelodyNote(60, 0.0, 1.0, 'structural'),
              new MelodyNote(62, 1.0, 1.0, 'structural'),
            ],
            metrics: { score: 1.0, passesThreshold: true, issues: [] },
          };
        },
      });

      const config = new GenerationConfig(
        [new Chord('C', 'maj', 0, [0, 4, 7], 4, [60, 64, 67])],
        new PhraseContext('statement', 0.5),
        {
          maxFeedbackIterations: 2,
        }
      );

      const result = await orchestrator.execute(config);

      expect(result.allNotes).toBeDefined();
      expect(result.metadata.feedbackIterations).toBeDefined();
      expect(result.metadata.globalScore).toBeGreaterThanOrEqual(0.0);
    });
  });
});
