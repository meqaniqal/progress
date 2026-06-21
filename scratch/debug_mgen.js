import { CompositionOrchestrator } from '../mgen/src/orchestrator.js';
import { Chord, PhraseContext, GenerationConfig } from '../mgen/src/interfaces.js';
import { StructuralPlanner } from '../mgen/src/passes/passA_structural.js';
import { CadencePlanner } from '../mgen/src/passes/passB_cadence.js';
import { ConnectorPlanner } from '../mgen/src/passes/passC_connector.js';
import { OrnamentPlanner } from '../mgen/src/passes/passD_ornament.js';
import { ExpectationRefiner } from '../mgen/src/passes/passE_expectation.js';
import { RhythmEngine } from '../mgen/src/engines/RhythmEngine.js';
import { PhraseEngine } from '../mgen/src/engines/PhraseEngine.js';
import { ExpectationEngine } from '../mgen/src/engines/ExpectationEngine.js';
import { VoiceLeadingEngine } from '../mgen/src/engines/VoiceLeadingEngine.js';
import { deriveRhythmEngineConfig } from '../mgen/src/progressBridge.js';

async function main() {
  // Chords: Gmaj7 @ beat 0 | A7 @ beat 2 | Fmin @ beat 4 | Fmaj @ beat 6 | C7 @ beat 8 | Gmaj @ beat 10
  const chords = [
    new Chord('G', 'maj7', 0, [7, 11, 2, 6], 2),
    new Chord('A', '7', 2, [9, 1, 4, 7], 2),
    new Chord('F', 'min', 4, [5, 8, 0], 2),
    new Chord('F', 'maj', 6, [5, 9, 0], 2),
    new Chord('C', '7', 8, [0, 4, 7, 10], 2),
    new Chord('G', 'maj', 10, [7, 11, 2], 2)
  ];

  const phraseContext = new PhraseContext('statement', 0.5, 60, false);
  
  const config = new GenerationConfig(chords, phraseContext, {
    density: 0.5,
    genre: 'none',
    pitchDiversityWeight: 0.0
  });

  const orchestrator = new CompositionOrchestrator();
  orchestrator.registerPass(new StructuralPlanner());
  orchestrator.registerPass(new CadencePlanner());
  orchestrator.registerPass(new ConnectorPlanner());
  orchestrator.registerPass(new OrnamentPlanner());
  orchestrator.registerPass(new ExpectationRefiner());

  const rhythmConfig = deriveRhythmEngineConfig(chords, 'statement', 0.5);
  const rhythmEngine = new RhythmEngine({
    aestheticMode: rhythmConfig.aestheticMode,
    genre: rhythmConfig.genre,
    density: rhythmConfig.density,
  });
  rhythmEngine.setDensity(0.5);
  rhythmEngine.setGenre('none');
  orchestrator.registerPass(rhythmEngine);

  orchestrator.registerPass(new PhraseEngine({ divisions: 12 }));
  orchestrator.registerPass(new ExpectationEngine());
  orchestrator.registerPass(new VoiceLeadingEngine());

  console.log("Executing orchestrator...");
  const result = await orchestrator.execute(config);

  console.log("\n=== FINAL MELODY NOTES ===");
  result.allNotes.forEach((note, i) => {
    console.log(`${i+1}. Pitch: ${note.pitch} | Start: ${note.startTime.toFixed(2)} | Duration: ${note.duration.toFixed(2)} | Role: ${note.role} | Metadata:`, note.metadata);
  });
}

main().catch(console.error);
