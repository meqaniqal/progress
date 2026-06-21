import { CompositionOrchestrator } from '../mgen/src/orchestrator.js';
import { Chord, MelodyNote } from '../mgen/src/interfaces.js';

const orchestrator = new CompositionOrchestrator();

// Chords: Gmaj7 @ beat 0 | A7 @ beat 2 | Fmin @ beat 4 | Fmaj @ beat 6 | C7 @ beat 8 | Gmaj @ beat 10
const chords = [
  new Chord('G', 'maj7', 0, [], 2),
  new Chord('A', '7', 2, [], 2),
  new Chord('F', 'min', 4, [], 2),
  new Chord('F', 'maj', 6, [], 2),
  new Chord('C', '7', 8, [], 2),
  new Chord('G', 'maj', 10, [], 2)
];

const notes = [
  new MelodyNote(67, 0.50, 1.00, 'structural'),
  new MelodyNote(72, 3.52, 0.08, 'connector'),
  new MelodyNote(72, 3.60, 0.40, 'ornament'),
  new MelodyNote(72, 4.56, 0.42, 'connector'),
  new MelodyNote(60, 6.50, 1.00, 'structural'),
  new MelodyNote(68, 9.52, 0.08, 'connector'),
  new MelodyNote(72, 9.60, 0.40, 'ornament'),
  new MelodyNote(60, 10.56, 0.42, 'connector')
];

console.log("Input Notes:");
notes.forEach(n => console.log(`Pitch: ${n.pitch} (${n.role}) at beat ${n.startTime}`));

const snapped = orchestrator._snapPitchesToHarmonicContext(notes, chords, {});

console.log("\nSnapped Notes:");
snapped.forEach(n => console.log(`Pitch: ${n.pitch} (${n.role}) at beat ${n.startTime} snappedToChord: ${n.metadata.snappedToChord}`));
