import { CompositionOrchestrator } from '../src/orchestrator.js';
import { StructuralPlanner } from '../src/passes/passA_structural.js';
import { CadencePlanner } from '../src/passes/passB_cadence.js';
import { ConnectorPlanner } from '../src/passes/passC_connector.js';
import { OrnamentPlanner } from '../src/passes/passD_ornament.js';
import { ExpectationRefiner } from '../src/passes/passE_expectation.js';
import { Chord, PhraseContext, GenerationConfig, MelodyNote } from '../src/interfaces.js';

describe('Adaptive Orchestrator & Safe Mode Fallbacks', () => {
  let chords;
  let phraseContext;

  beforeEach(() => {
    chords = [
      new Chord('C', 'maj', 0, [0, 4, 7]),
      new Chord('G', 'maj', 2, [7, 11, 2]),
      new Chord('A', 'min', 4, [9, 0, 4]),
      new Chord('F', 'maj', 6, [5, 9, 0])
    ];
    phraseContext = new PhraseContext('statement', 0.5, null, false);
  });

  test('should trigger safeMode and bypass ornaments when time budget is extremely low', async () => {
    // Instantiate with an extremely tiny budget to guarantee immediate safeMode trigger
    const orchestrator = new CompositionOrchestrator({
      timeBudget: 0.001, // 1 microsecond budget
      maxRegenerations: 3
    });

    orchestrator.registerPass(new StructuralPlanner());
    orchestrator.registerPass(new CadencePlanner());
    orchestrator.registerPass(new ConnectorPlanner());
    orchestrator.registerPass(new OrnamentPlanner()); // OrnamentPlanner bypasses under safeMode
    orchestrator.registerPass(new ExpectationRefiner());

    const config = new GenerationConfig(chords, phraseContext);
    const result = await orchestrator.execute(config);

    expect(result).toBeDefined();
    expect(result.metadata.safeModeTriggered).toBe(true);

    // Verify that PassD (Ornament) produced 0 notes under Safe Mode
    const passDResult = result.metadata.passResults.find(p => p.passName === 'PassD_Ornament');
    expect(passDResult).toBeDefined();
    expect(passDResult.notes.length).toBe(0);
  });

  test('should execute full creative pipeline with backtracking when time budget is ample', async () => {
    const orchestrator = new CompositionOrchestrator({
      timeBudget: 1000, // Ample budget (1 second)
      minScoreThreshold: 0.99 // High threshold to test backtracking
    });

    orchestrator.registerPass(new StructuralPlanner());
    orchestrator.registerPass(new CadencePlanner());

    const config = new GenerationConfig(chords, phraseContext);
    const result = await orchestrator.execute(config);

    expect(result).toBeDefined();
    expect(result.metadata.safeModeTriggered).toBe(false);
  });

  test('should support feed-forward registerRange in Pass A', async () => {
    const orchestrator = new CompositionOrchestrator();
    orchestrator.registerPass(new StructuralPlanner());

    const config = new GenerationConfig(chords, phraseContext, {
      registerRange: { min: 72, max: 76 } // Force high register feed-forward
    });

    const result = await orchestrator.execute(config);
    expect(result.allNotes.length).toBeGreaterThan(0);
    result.allNotes.forEach(note => {
      expect(note.pitch).toBeGreaterThanOrEqual(72);
      expect(note.pitch).toBeLessThanOrEqual(76);
    });
  });
});
