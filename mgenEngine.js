import { state, getActiveProgression } from './store.js';
import { CompositionOrchestrator } from './mgen/src/orchestrator.js';
import { StructuralPlanner } from './mgen/src/passes/passA_structural.js';
import { CadencePlanner } from './mgen/src/passes/passB_cadence.js';
import { ConnectorPlanner } from './mgen/src/passes/passC_connector.js';
import { OrnamentPlanner } from './mgen/src/passes/passD_ornament.js';
import { ExpectationRefiner } from './mgen/src/passes/passE_expectation.js';
import { RhythmEngine } from './mgen/src/engines/RhythmEngine.js';
import { PhraseEngine } from './mgen/src/engines/PhraseEngine.js';
import { ExpectationEngine } from './mgen/src/engines/ExpectationEngine.js';
import { VoiceLeadingEngine } from './mgen/src/engines/VoiceLeadingEngine.js';
import { MicrotonalEngine } from './mgen/src/engines/MicrotonalEngine.js';
import { StyleEngine } from './mgen/src/engines/StyleEngine.js';
import { getChordNotes, getEffectiveTuning, snapToGrid, midiToFreq } from './theory.js';
import {
  progressStateToGenerationConfig,
  melodyGenResultToProgressNotes,
  deriveRhythmEngineConfig,
  midiToNoteName
} from './mgen/src/progressBridge.js';

let mgenCachedNotes = null;
let isGenerating = false;

export function clearMgenCache() {
  mgenCachedNotes = null;
}

export function getMgenMelodyNotes() {
  return mgenCachedNotes;
}

export async function pregenerateMgenMelody(appState = state) {
  if (isGenerating) return;
  if (!appState.melodySettings || !appState.melodySettings.enabled) {
    mgenCachedNotes = null;
    return;
  }
  isGenerating = true;
  const startTime = performance.now();
  try {
    const activeProg = getActiveProgression();
    if (!activeProg || activeProg.length === 0) {
      mgenCachedNotes = [];
      isGenerating = false;
      return;
    }

    // Gathers raw progression data and decorates chords with _beatStart
    let cumulativeBeats = 0;
    const chordsWithBeatStart = activeProg.map((chord, i) => {
      const cloned = {
        ...chord,
        key: chord.key !== undefined ? chord.key : (appState.baseKey !== undefined ? appState.baseKey : 60),
        _beatStart: cumulativeBeats,
        divisions: chord.divisions || appState.divisions || 12
      };
      cumulativeBeats += Number(chord.duration) || 2;
      return cloned;
    });

    // Make a clone of appState with the active progression (with temporary swaps)
    const stateClone = {
      ...appState,
      currentProgression: chordsWithBeatStart
    };

    // Convert to mgen GenerationConfig
    const config = progressStateToGenerationConfig(stateClone);

    // Instantiate and register the 5-pass orchestrator and engines
    const orchestrator = new CompositionOrchestrator({
      timeBudget: 15 // Limit execution to 15ms for real-time play
    });

    // Register 5 planning passes
    orchestrator.registerPass(new StructuralPlanner());
    orchestrator.registerPass(new CadencePlanner());
    orchestrator.registerPass(new ConnectorPlanner());
    orchestrator.registerPass(new OrnamentPlanner());
    orchestrator.registerPass(new ExpectationRefiner());

    // Register Rhythm Engine
    const rhythmConfig = deriveRhythmEngineConfig(
      config.chords,
      config.phraseContext.role,
      config.phraseContext.tensionLevel
    );
    const rhythmEngine = new RhythmEngine({
      aestheticMode: rhythmConfig.aestheticMode,
      genre: rhythmConfig.genre,
      density: rhythmConfig.density,
    });
    rhythmEngine.setDensity(config.options.density || 0.5);
    rhythmEngine.setGenre(config.options.genre || 'none');
    orchestrator.registerPass(rhythmEngine);

    // Register Style Engine
    const styleEngine = new StyleEngine();
    const styleMap = {
      'none': 'pop',
      'classical': 'classical',
      'jazz': 'jazz',
      'blues': 'jazz',
      'minimal': 'pop',
      'african': 'pop'
    };
    const activeStyle = styleMap[config.options.genre] || 'classical';
    styleEngine.setActiveStyle(activeStyle);
    orchestrator.registerPass(styleEngine);

    // Register Phrase Engine
    orchestrator.registerPass(new PhraseEngine({ divisions: stateClone.divisions || 12 }));

    // Register Expectation Engine
    orchestrator.registerPass(new ExpectationEngine());

    // Register Voice Leading Engine
    orchestrator.registerPass(new VoiceLeadingEngine());

    // Register Microtonal Engine
    let mgenTuningId = '12tet';
    if (stateClone.divisions === 24) {
      mgenTuningId = 'quartertone';
    }
    orchestrator.registerPass(new MicrotonalEngine({ tuningSystem: mgenTuningId }));

    // Execute pipeline
    const mgenResult = await orchestrator.execute(config);
    const elapsed = performance.now() - startTime;
    if (elapsed > 120) {
      import('./modalController.js').then(m => m.showPerformanceWarning('mgen', elapsed));
    }

    // Convert back to Progress notes
    const progressNotes = melodyGenResultToProgressNotes(mgenResult, stateClone.bpm || 120);

    // Cache the notes
    mgenCachedNotes = progressNotes;

    // Log debugging information
    // await logMgenDebugInfo(mgenResult, progressNotes, chordsWithBeatStart, stateClone);
  } catch (error) {
    console.error('Error pregenerating mgen melody:', error);
    mgenCachedNotes = [];
  } finally {
    isGenerating = false;
  }
}

async function logMgenDebugInfo(mgenResult, progressNotes, activeProg, appState) {
  if (!progressNotes || progressNotes.length === 0) {
    console.log('%c[MGEN Debug] No melody notes generated.', 'color: #ef4444; font-weight: bold;');
    return;
  }

  // Calculate repeated notes
  let repeatedCount = 0;
  for (let i = 1; i < progressNotes.length; i++) {
    if (progressNotes[i].pitch === progressNotes[i - 1].pitch) {
      repeatedCount++;
    }
  }
  const repeatedPercent = ((repeatedCount / progressNotes.length) * 100).toFixed(1);

  const elapsed = mgenResult.metadata.executionTimeMs || 0;
  const safeMode = mgenResult.metadata.safeModeTriggered ? ' [SAFE MODE]' : '';
  const backtracks = mgenResult.metadata.backtrackCount ? ` [Backtracks: ${mgenResult.metadata.backtrackCount}]` : '';

  console.groupCollapsed(
    `%c[MGEN Debug] Melody Generated: ${progressNotes.length} notes (Repeated: ${repeatedCount} / ${repeatedPercent}%)${safeMode}${backtracks} in ${elapsed.toFixed(1)}ms`,
    mgenResult.metadata.safeModeTriggered ? 'color: #f59e0b; font-weight: bold;' : 'color: #3b82f6; font-weight: bold;'
  );

  console.log(`%cTotal notes: ${progressNotes.length} | Repeated pitch count: ${repeatedCount} (${repeatedPercent}%)`, 'font-style: italic;');

  // Let's get the exact playable notes for each slot
  let playableNotes = [];
  try {
    const theoryMod = await import('./theory.js');
    playableNotes = theoryMod.getPlayableNotes(activeProg, appState) || [];
  } catch (e) {
    console.warn('[MGEN Debug] Failed to load playable notes:', e);
  }

  // Group notes by chord slot
  let cumulativeBeats = 0;
  const chordBoundaries = [];
  activeProg.forEach((chord, idx) => {
    const duration = Number(chord.duration) || 2;
    chordBoundaries.push({
      index: idx,
      symbol: chord.symbol,
      start: cumulativeBeats,
      end: cumulativeBeats + duration,
      chordNotes: playableNotes[idx] || []
    });
    cumulativeBeats += duration;
  });

  // Limit displaying to first 4 chords to keep console concise unless progression is small
  const limit = activeProg.length <= 8 ? activeProg.length : 4;
  console.log(`%cShowing analysis for the first ${limit} chord slots (out of ${activeProg.length}):`, 'color: #6b7280;');

  for (let i = 0; i < limit; i++) {
    const slot = chordBoundaries[i];
    const notesInSlot = progressNotes.filter(n => n.stepTime >= slot.start && n.stepTime < slot.end);
    
    // Note pool formatted
    const poolMidi = slot.chordNotes;
    const poolNames = poolMidi.map(midi => {
      const name = midiToNoteName(midi);
      return `${name}${Math.round(midi) !== midi ? '*' : ''} (${midi})`;
    }).join(', ');

    console.group(`Slot ${i}: ${slot.symbol} (Beats ${slot.start}-${slot.end}) | Note Pool: [${poolNames || 'none'}]`);
    
    if (notesInSlot.length === 0) {
      console.log('  No melody notes generated in this slot.');
    } else {
      notesInSlot.forEach(n => {
        let code = '[STRUC]';
        let just = `Structural skeleton pitch selected for phrase role '${n.metadata?.phraseRole || 'statement'}'.`;

        if (n.clusterRole === 'connector') {
          const type = n.metadata?.motionType || 'step';
          if (type === 'step') {
            code = '[PASS] ';
            just = `Stepwise passing tone connecting ${midiToNoteName(n.metadata.connectsStart)} (${n.metadata.connectsStart}) to ${midiToNoteName(n.metadata.connectsEnd)} (${n.metadata.connectsEnd}).`;
          } else if (type === 'skip') {
            code = '[SKIP] ';
            just = `Skip connector between ${midiToNoteName(n.metadata.connectsStart)} (${n.metadata.connectsStart}) and ${midiToNoteName(n.metadata.connectsEnd)} (${n.metadata.connectsEnd}).`;
          } else {
            code = '[LEAP] ';
            just = `Leap connector between ${midiToNoteName(n.metadata.connectsStart)} (${n.metadata.connectsStart}) and ${midiToNoteName(n.metadata.connectsEnd)} (${n.metadata.connectsEnd}).`;
          }
        } else if (n.clusterRole === 'ornament') {
          code = '[ORN]  ';
          just = `Ornament (${n.metadata?.ornamentType || 'graceNote'}) embellishing target pitch ${midiToNoteName(n.metadata?.ornamentsNote)} (${n.metadata?.ornamentsNote}).`;
        } else if (n.clusterRole === 'cadence') {
          code = '[CAD]  ';
          just = `Cadence target tone.`;
        } else if (n.clusterRole === 'expectation') {
          code = '[EXP]  ';
          just = `Expectation refiner tone.`;
        }

        const noteName = midiToNoteName(n.pitch) + (Math.round(n.pitch) !== n.pitch ? '*' : '');
        console.log(
          `  Beat ${n.stepTime.toFixed(2)}: Pitch %c${noteName} (${n.pitch.toFixed(1)}) %c${code}%c - ${just}`,
          'font-weight: bold; color: #10b981;',
          'color: #3b82f6; font-family: monospace;',
          'color: #4b5563;'
        );
      });
    }
    console.groupEnd();
  }
  
  if (activeProg.length > limit) {
    console.log(`%c... and ${activeProg.length - limit} more chord slots (hidden for conciseness).`, 'color: #9ca3af; font-style: italic;');
  }

  console.groupEnd();
}

/**
 * scheduleMgenMelody: Filters and plays notes that fall within the current slot time window
 */
export function scheduleMgenMelody(
  time,
  chordObj,
  nextChordObj,
  prevChordObj,
  chordSlotDuration,
  beats,
  bpm,
  absIndex,
  totalChords,
  chordNotes,
  playToneFn,
  voiceEvents
) {
  if (mgenCachedNotes === null) {
    // Proactively start generation if not ready yet
    pregenerateMgenMelody();
    return;
  }

  // Find the start beat position of this slot
  const activeProg = getActiveProgression();
  let slotStartBeat = 0;
  for (let i = 0; i < absIndex; i++) {
    slotStartBeat += Number(activeProg[i].duration) || 2;
  }

  const beatLen = 60.0 / bpm;
  const slotEndBeat = slotStartBeat + beats;

  // Determine EDO tuning parameters
  const tuning = getEffectiveTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);
  const divisions = tuning.divisions;
  const periodSize = tuning.periodSize;
  const keyRoot = chordObj.key !== undefined ? Number(chordObj.key) : (Number(state.baseKey) || 60);
  const baseChordKey = chordObj.key !== undefined ? Number(chordObj.key) : keyRoot;

  // Calculate custom offsets for pitch classes based on difference between custom chordNotes and standard chord notes
  const pcOffsets = {};
  const standardNotes = getChordNotes(chordObj.symbol, baseChordKey, divisions) || [];
  if (standardNotes.length > 0 && chordNotes && chordNotes.length > 0) {
    chordNotes.forEach(customNote => {
      const customPc = (customNote % periodSize + periodSize) % periodSize;
      let bestStdNote = null;
      let minDiff = Infinity;
      standardNotes.forEach(stdNote => {
        const stdPc = (stdNote % periodSize + periodSize) % periodSize;
        let diff = Math.abs(customPc - stdPc);
        if (diff > periodSize / 2) diff = periodSize - diff;
        if (diff < minDiff) {
          minDiff = diff;
          bestStdNote = stdNote;
        }
      });
      if (bestStdNote !== null && minDiff < 1.5) {
        const stdPc = (bestStdNote % periodSize + periodSize) % periodSize;
        const pcDiff = customPc - stdPc;
        let normPcDiff = pcDiff;
        while (normPcDiff > periodSize / 2) normPcDiff -= periodSize;
        while (normPcDiff < -periodSize / 2) normPcDiff += periodSize;
        pcOffsets[Math.round(stdPc * 100) / 100] = normPcDiff;
      }
    });
  }

  // Filter notes belonging to this slot
  const slotNotes = mgenCachedNotes.filter(n => n.stepTime >= slotStartBeat && n.stepTime < slotEndBeat);

  slotNotes.forEach(note => {
    // Map relative beat inside chord slot to absolute time in seconds
    const beatOffset = note.stepTime - slotStartBeat;
    const noteStartTime = time + (beatOffset * beatLen);
    const noteDuration = note.noteDuration * beatLen;

    const midiNote = note.pitch;

    // Apply microtonal offsets matching pitch classes
    const pc = (midiNote % periodSize + periodSize) % periodSize;
    let matchedOffset = 0;
    let minDiff = Infinity;
    for (const stdPcStr in pcOffsets) {
      const stdPc = parseFloat(stdPcStr);
      let diff = Math.abs(pc - stdPc);
      if (diff > periodSize / 2) diff = periodSize - diff;
      if (diff < minDiff && diff < 0.2) {
        minDiff = diff;
        matchedOffset = pcOffsets[stdPcStr];
      }
    }

    const adjustedMidiNote = midiNote + matchedOffset;
    const finalMidiNote = snapToGrid(adjustedMidiNote, tuning);
    const frequency = midiToFreq(finalMidiNote);
    
    // Play the note using playToneFn
    playToneFn(
      frequency,
      noteStartTime,
      noteDuration,
      state.instruments.melody || 'sine',
      'melody',
      0
    );
  });
}
