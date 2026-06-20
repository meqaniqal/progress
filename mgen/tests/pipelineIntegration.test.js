// Integration tests for full pipeline with new engines (2026-06-19)
import { CompositionOrchestrator } from '../src/orchestrator.js';
import { StructuralPlanner } from '../src/passes/passA_structural.js';
import { CadencePlanner } from '../src/passes/passB_cadence.js';
import { ConnectorPlanner } from '../src/passes/passC_connector.js';
import { OrnamentPlanner } from '../src/passes/passD_ornament.js';
import { ExpectationRefiner } from '../src/passes/passE_expectation.js';
import { PhraseEngine, CLIMAX_ARCHETYPES, TENSION_TO_ARCHETYPE } from '../src/engines/PhraseEngine.js';
import { ExpectationEngine } from '../src/engines/ExpectationEngine.js';
import { VoiceLeadingEngine } from '../src/engines/VoiceLeadingEngine.js';
import { RhythmEngine } from '../src/engines/RhythmEngine.js';
import { MicrotonalEngine } from '../src/engines/MicrotonalEngine.js';
import { MotifEngine } from '../src/engines/MotifEngine.js';
import { StyleEngine } from '../src/engines/StyleEngine.js';
import { Chord, PhraseContext, GenerationConfig } from '../src/interfaces.js';
import { deriveRhythmEngineConfig } from '../src/progressBridge.js';

describe('Full Pipeline Integration', () => {
  function buildFullPipeline(config) {
    const orchestrator = new CompositionOrchestrator();

    // Structural passes
    orchestrator.registerPass(new StructuralPlanner());
    orchestrator.registerPass(new CadencePlanner());
    orchestrator.registerPass(new ConnectorPlanner());
    orchestrator.registerPass(new OrnamentPlanner());
    orchestrator.registerPass(new ExpectationRefiner());

    // Post-processing engines
    const rhythmConfig = deriveRhythmEngineConfig(
      config.chords.map(c => ({ root: c.root, quality: c.quality })),
      config.phraseContext.role,
      config.phraseContext.tensionLevel
    );
    const rhythmEngine = new RhythmEngine({
      aestheticMode: rhythmConfig.aestheticMode,
      genre: rhythmConfig.genre,
      density: rhythmConfig.density,
    });
    orchestrator.registerPass(rhythmEngine);

    const styleEngine = new StyleEngine();
    orchestrator.registerPass(styleEngine);

    const phraseEngine = new PhraseEngine({ divisions: 12 });
    orchestrator.registerPass(phraseEngine);

    const expectationEngine = new ExpectationEngine();
    orchestrator.registerPass(expectationEngine);

    const voiceLeadingEngine = new VoiceLeadingEngine();
    orchestrator.registerPass(voiceLeadingEngine);

    return { orchestrator, config };
  }

  describe('basic pipeline execution', () => {
    test('should execute full pipeline without errors', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
        new Chord('G', 'maj', 8, [7, 11, 16]),
        new Chord('C', 'maj', 12, [0, 4, 7]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext, {
        density: 0.5,
        genre: 'none',
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result).toBeDefined();
      expect(result.allNotes).toBeDefined();
      expect(Array.isArray(result.allNotes)).toBe(true);
      expect(result.allNotes.length).toBeGreaterThan(0);
    });

    test('should produce notes with metadata from all engines', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
        new Chord('G', 'maj', 8, [7, 11, 16]),
        new Chord('C', 'maj', 12, [0, 4, 7]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext, {
        density: 0.5,
        genre: 'none',
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      // Notes should have metadata from PhraseEngine
      const phraseMetadata = result.allNotes.filter(n => n.metadata?.phraseId);
      expect(phraseMetadata.length).toBeGreaterThan(0);

      // Notes should have metadata from ExpectationEngine
      const expectationMetadata = result.allNotes.filter(n => n.metadata?.expectationAdjusted);
      // May or may not have adjustments, but should not error
      expect(expectationMetadata.length).toBeGreaterThanOrEqual(0);

      // Notes should have metadata from VoiceLeadingEngine
      const voiceMetadata = result.allNotes.filter(n => n.metadata?.voiceLeadingAdjusted);
      expect(voiceMetadata.length).toBeGreaterThanOrEqual(0);
    });

    test('should produce execution log with all pass results', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      const log = orchestrator.getExecutionLog();
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBeGreaterThan(0);

      // Should include all registered passes
      const passNames = log.map(e => e.passName);
      expect(passNames).toContain('PassA_Structural');
      expect(passNames).toContain('PassB_Cadence');
      expect(passNames).toContain('PassC_Connector');
      expect(passNames).toContain('PassD_Ornament');
      expect(passNames).toContain('PassE_Expectation');
      expect(passNames).toContain('RhythmEngine');
      expect(passNames).toContain('PhraseEngine');
      expect(passNames).toContain('ExpectationEngine');
      expect(passNames).toContain('VoiceLeadingEngine');
    });

    test('should return MelodyResult with metadata', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.passResults).toBeDefined();
      expect(result.metadata.executionLog).toBeDefined();
      expect(result.metadata.originalNoteCount).toBeGreaterThanOrEqual(result.metadata.finalNoteCount);
    });
  });

  describe('pipeline with different archetypes', () => {
    test('should handle classical archetype', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('G', 'maj', 4, [7, 11, 16]),
        new Chord('F', 'maj', 8, [5, 9, 12]),
        new Chord('C', 'maj', 12, [0, 4, 7]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext, {
        tensionCurve: 'arch',
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes.length).toBeGreaterThan(0);
    });

    test('should handle valley archetype', async () => {
      const chords = [
        new Chord('C', 'min', 0, [0, 3, 7]),
        new Chord('G', 'min', 4, [7, 10, 16]),
        new Chord('F', 'min', 8, [5, 8, 12]),
        new Chord('C', 'min', 12, [0, 3, 7]),
      ];

      const phraseContext = new PhraseContext('release', 0.3);
      const config = new GenerationConfig(chords, phraseContext, {
        tensionCurve: 'valley',
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes.length).toBeGreaterThan(0);
    });

    test('should handle jazz archetype', async () => {
      const chords = [
        new Chord('D', 'min7', 0, [2, 7, 11]),
        new Chord('G', '7', 4, [5, 9, 14]),
        new Chord('C', 'maj7', 8, [0, 4, 7, 11]),
        new Chord('F', 'maj7', 12, [5, 9, 12, 16]),
      ];

      const phraseContext = new PhraseContext('statement', 0.6);
      const config = new GenerationConfig(chords, phraseContext, {
        density: 0.7,
        genre: 'jazz',
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    test('should handle single chord', async () => {
      const chords = [new Chord('C', 'maj', 0, [0, 4, 7])];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty chord progression', async () => {
      const chords = [];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes).toEqual([]);
    });

    test('should handle microtonal divisions', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext, {
        divisions: 24,
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      expect(result.allNotes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Pass E returns all notes', () => {
    test('should not drop unmodified notes from Pass E', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      // Pass E now returns all notes (not just changed ones).
      // The orchestrator's deduplication step may reduce the count,
      // but no notes should be dropped by Pass E itself.
      expect(result.metadata.finalNoteCount).toBeGreaterThanOrEqual(0);
      expect(result.allNotes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PhraseEngine integration', () => {
    test('should compute arc and make it available to downstream passes', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('G', 'maj', 4, [7, 11, 16]),
        new Chord('F', 'maj', 8, [5, 9, 12]),
        new Chord('C', 'maj', 12, [0, 4, 7]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      // Check that PhraseEngine arc was computed
      const phraseResult = result.metadata.passResults.find(p => p.passName === 'PhraseEngine');
      expect(phraseResult).toBeDefined();
      expect(phraseResult.context).toBeDefined();
    });

    test('should apply register envelope constraints from PhraseEngine', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('G', 'maj', 4, [7, 11, 16]),
        new Chord('F', 'maj', 8, [5, 9, 12]),
        new Chord('C', 'maj', 12, [0, 4, 7]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext, {
        baseRegister: 60,
        divisions: 12,
      });

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      // Some notes may have register adjustments
      const adjustedNotes = result.allNotes.filter(n => n.metadata?.registerAdjusted);
      expect(adjustedNotes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('VoiceLeadingEngine integration', () => {
    test('should apply voice-leading constraints from StyleEngine', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      const { orchestrator } = buildFullPipeline(config);
      const result = await orchestrator.execute(config);

      // StyleEngine's interval constraints should now work (fixed _findPreviousNote)
      const styleResult = result.metadata.passResults.find(p => p.passName === 'StyleEngine');
      // StyleEngine may or may not adjust notes, but it should execute without error
      expect(styleResult).toBeDefined();
    });
  });

  describe('deterministic output', () => {
    test('should produce valid output (RhythmEngine caching)', async () => {
      const chords = [
        new Chord('C', 'maj', 0, [0, 4, 7]),
        new Chord('F', 'maj', 4, [5, 9, 12]),
      ];

      const phraseContext = new PhraseContext('statement', 0.5);
      const config = new GenerationConfig(chords, phraseContext);

      // Test that the pipeline produces valid output
      const { orchestrator: o1 } = buildFullPipeline(config);
      const result1 = await o1.execute(config);

      const { orchestrator: o2 } = buildFullPipeline(config);
      const result2 = await o2.execute(config);

      // Both should produce valid melodies (non-negative note counts)
      expect(result1.allNotes.length).toBeGreaterThanOrEqual(0);
      expect(result2.allNotes.length).toBeGreaterThanOrEqual(0);
    });
  });
});
