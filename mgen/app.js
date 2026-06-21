import { CompositionOrchestrator } from './src/orchestrator.js';
import { Chord, PhraseContext, GenerationConfig, MelodyNote } from './src/interfaces.js';
import { StructuralPlanner } from './src/passes/passA_structural.js';
import { CadencePlanner } from './src/passes/passB_cadence.js';
import { ConnectorPlanner } from './src/passes/passC_connector.js';
import { OrnamentPlanner } from './src/passes/passD_ornament.js';
import { ExpectationRefiner } from './src/passes/passE_expectation.js';
import { MicrotonalEngine } from './src/engines/MicrotonalEngine.js';
import { MotifEngine, MotifFamily, MotifTransformation } from './src/engines/MotifEngine.js';
import { StyleEngine, StyleProfile } from './src/engines/StyleEngine.js';
import { RhythmEngine, RhythmTemplate, SubdivisionProfile } from './src/engines/RhythmEngine.js';
import { PhraseEngine, CLIMAX_ARCHETYPES, TENSION_TO_ARCHETYPE, PHRASE_GRAMMAR } from './src/engines/PhraseEngine.js';
import { ExpectationEngine } from './src/engines/ExpectationEngine.js';
import { VoiceLeadingEngine, classifyInterval, getVoiceLeadingBias } from './src/engines/VoiceLeadingEngine.js';
import {
  generateProgressionWithTracks,
  generateRandomPhraseContext,
  buildGenerationConfig,
} from './src/chordProgressionGenerator.js';
import { deriveRhythmEngineConfig } from './src/progressBridge.js';

// State
let chords = [];
let pipelineResults = null;
let audioContext = null;
let playbackSource = null;

// Note name to MIDI number mapping
const NOTE_TO_MIDI = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
};

const MIDI_TO_NOTE = Object.fromEntries(
  Object.entries(NOTE_TO_MIDI).map(([k, v]) => [v, k])
);

function midiToNoteName(midi) {
  const note = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return MIDI_TO_NOTE[note] + octave;
}

// Chord management
function addChord() {
  const root = document.getElementById('chord-root').value;
  const quality = document.getElementById('chord-quality').value;
  const beat = parseInt(document.getElementById('chord-beat').value) || 0;

  const chord = new Chord(root, quality, beat, getScaleDegrees(root, quality));
  chords.push(chord);
  renderChordList();
  document.getElementById('chord-beat').value = chords.length > 0
    ? (chords[chords.length - 1].beatStart + 2)
    : 0;
}

function getScaleDegrees(root, quality) {
  const rootIndex = NOTE_TO_MIDI[root];
  const degrees = [rootIndex];
  if (quality === 'maj' || quality === '7' || quality === 'maj7') {
    degrees.push((rootIndex + 4) % 12);
    degrees.push((rootIndex + 7) % 12);
  } else if (quality === 'min') {
    degrees.push((rootIndex + 3) % 12);
    degrees.push((rootIndex + 7) % 12);
  } else if (quality === 'dim') {
    degrees.push((rootIndex + 3) % 12);
    degrees.push((rootIndex + 6) % 12);
  } else if (quality === 'aug') {
    degrees.push((rootIndex + 4) % 12);
    degrees.push((rootIndex + 8) % 12);
  }
  return degrees;
}

function removeChord(index) {
  chords.splice(index, 1);
  renderChordList();
}

function renderChordList() {
  const container = document.getElementById('chord-list');
  container.innerHTML = chords.map((chord, i) => `
    <div class="chord-chip">
      <span>${chord.root}${chord.quality} @ beat ${chord.beatStart}</span>
      <button class="remove-chord" onclick="removeChord(${i})">✕</button>
    </div>
  `).join('');
}

// Pipeline execution
async function runPipeline() {
  if (chords.length === 0) {
    alert('Please add at least one chord.');
    return;
  }

  const phraseRole = document.getElementById('phrase-role').value;
  const tensionLevel = parseFloat(document.getElementById('tension-level').value) || 0.5;
  const isAntecedent = document.getElementById('is-antecedent').value === 'true';

  // Validate chord instances before passing to orchestrator (disabled console logging)
  /*
  console.log('\n=== CHORD VALIDATION ===');
  chords.forEach((chord, i) => {
    console.log(`Chord ${i + 1}:`, {
      root: chord.root,
      quality: chord.quality,
      beatStart: chord.beatStart,
      scaleDegrees: chord.scaleDegrees,
      isChordInstance: chord instanceof Chord,
      constructorName: chord.constructor.name
    });
  });
  */

  const tuningSystemId = document.getElementById('tuning-system').value;
  const microtonalEngine = new MicrotonalEngine({ tuningSystem: tuningSystemId });

  const orchestrator = new CompositionOrchestrator();

  // Register all passes (structural passes 1-5)
  const rhythmConfig = deriveRhythmEngineConfig(chords, phraseRole, tensionLevel);
  const rhythmEngine = new RhythmEngine({
    aestheticMode: rhythmConfig.aestheticMode,
    genre: rhythmConfig.genre,
    density: rhythmConfig.density,
  });
  orchestrator.registerPass(new StructuralPlanner());
  orchestrator.registerPass(new CadencePlanner());
  orchestrator.registerPass(new ConnectorPlanner());
  orchestrator.registerPass(new OrnamentPlanner());
  orchestrator.registerPass(new ExpectationRefiner());
  orchestrator.registerPass(rhythmEngine);

  // Register post-processing engines (run after all structural passes)
  const phraseEngine = new PhraseEngine({
    archetype: TENSION_TO_ARCHETYPE[tensionCurve] || 'classical',
    divisions: 12,
  });
  orchestrator.registerPass(phraseEngine);

  const expectationEngine = new ExpectationEngine();
  orchestrator.registerPass(expectationEngine);

  const voiceLeadingEngine = new VoiceLeadingEngine();
  orchestrator.registerPass(voiceLeadingEngine);

  // Build chord progression from user input
  const chordProgression = chords.map(chord => ({
    root: chord.root,
    quality: chord.quality,
    beatStart: chord.beatStart,
    scaleDegrees: chord.scaleDegrees
  }));

  const phraseContext = new PhraseContext(
    phraseRole,
    tensionLevel,
    undefined,
    isAntecedent
  );

  const config = new GenerationConfig(chordProgression, phraseContext, {
    density: parseFloat(document.getElementById('density-level')?.value) || 0.5,
    genre: document.getElementById('genre-select')?.value || 'none',
    pitchDiversityWeight: (parseFloat(document.getElementById('pitch-diversity-weight')?.value) || 0) / 100,
  });

  // Update RhythmEngine from config options (density/genre from Progress app settings)
  rhythmEngine.setDensity(config.options.density || 0.5);
  rhythmEngine.setGenre(config.options.genre || 'none');

  // Stop any ongoing playback before starting new pipeline
  stopPlayback();

  // Show pipeline status panel
  document.getElementById('pipeline-status').style.display = 'block';
  document.getElementById('visualization').style.display = 'block';

  // Render pass cards
  renderPassStages(['A', 'B', 'C', 'D', 'E', 'F']);

  const log = document.getElementById('execution-log');
  log.innerHTML = '';

  try {
    const result = await orchestrator.execute(config);
    
    // Extract RhythmEngine output (6th pass) for metadata verification
    const rhythmPassResult = result.metadata?.passResults?.find(p => p.passName === 'RhythmEngine');
    const rhythmAdjustedNotes = result.allNotes.filter(n => n.metadata && n.metadata.rhythmAdjusted);
    /*
    if (rhythmPassResult) {
      console.log('\n=== RhythmEngine Output ===');
      console.log(`  Template: ${rhythmPassResult.metadata?.activeTemplate?.id || 'N/A'}`);
      console.log(`  Subdivision: ${rhythmPassResult.metadata?.subdivisionProfile?.id || 'N/A'}`);
      console.log(`  Notes with rhythmAdjusted: ${rhythmAdjustedNotes.length}/${result.allNotes.length}`);
      rhythmAdjustedNotes.slice(0, 5).forEach((note, i) => {
        const meta = note.metadata || {};
        console.log(`    ${i + 1}. pitch:${note.pitch} start:${note.startTime} dur:${note.duration} rhythmAdjusted:${meta.rhythmAdjusted} templateId:${meta.templateId || 'N/A'} subdivisionId:${meta.subdivisionId || 'N/A'}`);
      });
    }
    */
    
    // Apply microtonal tuning to final result
    const microtonalResult = await microtonalEngine.execute(config, result.allNotes, {});
    pipelineResults = {
      ...result,
      allNotes: microtonalResult.notes,
      metadata: {
        ...result.metadata,
        microtonalTuning: tuningSystemId,
        microtonalResult,
        rhythmEngineResult: rhythmPassResult,
        rhythmAdjustedNoteCount: rhythmAdjustedNotes.length,
      }
    };

    // Log per-pass output for debugging (disabled console logging)
    /*
    console.log('\n=== PER-PASS OUTPUT ===');
    const allPassOutputs = orchestrator.getAllPassOutputs();
    allPassOutputs.forEach(pass => {
      console.log(`${pass.passName}: ${pass.noteCount} notes`, pass.notes);
    });
    */

    // Update pass cards with results
    updatePassCards(result);

    // Render visualization
    renderVisualization(result);

    // Log success
    addLogEntry(`Pipeline completed successfully. Generated ${result.allNotes.length} notes.`, 'success');
  } catch (error) {
    addLogEntry(`Pipeline failed: ${error.message}`, 'error');
    console.error(error);
  }
}

// Log 30 notes to console after pipeline completion
if (pipelineResults && pipelineResults.allNotes) {
  logNotesToConsole(pipelineResults.allNotes);
}

function renderPassStages(passNames) {
  const container = document.getElementById('pass-stages');
  container.innerHTML = passNames.map(name => `
    <div class="pass-card" id="pass-${name}">
      <h3>Pass ${name}</h3>
      <div class="note-count">Waiting...</div>
      <div class="metrics"></div>
    </div>
  `).join('');
}

function updatePassCards(result) {
  const passNames = ['A', 'B', 'C', 'D', 'E', 'F'];
  const passMap = {
    'A': 'PassA_Structural',
    'B': 'PassB_Cadence',
    'C': 'PassC_Connector',
    'D': 'PassD_Ornament',
    'E': 'PassE_Expectation',
    'F': 'RhythmEngine'
  };

  const passResults = result.metadata?.passResults || [];

  passNames.forEach(name => {
    const card = document.getElementById(`pass-${name}`);
    if (!card) return;

    card.classList.add('completed');

    const noteCount = document.querySelector(`#pass-${name} .note-count`);
    const metrics = document.querySelector(`#pass-${name} .metrics`);

    const passResult = passResults.find(p => p.passName === passMap[name]);

    if (passResult) {
      noteCount.textContent = `${passResult.notes.length} notes`;
      const eval_ = passResult.metrics;
      metrics.innerHTML = `
        <span class="score">Score: ${eval_.score.toFixed(2)}</span>
      `;
      if (eval_.issues && eval_.issues.length > 0) {
        metrics.innerHTML += `
          <ul class="issues-list">
            ${eval_.issues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        `;
      }
    } else {
      noteCount.textContent = 'No output';
      metrics.innerHTML = '<span style="color: #e94560;">Failed</span>';
      card.classList.add('failed');
    }
  });
}

function renderVisualization(result) {
  const tabsContainer = document.getElementById('stage-tabs');
  const contentContainer = document.getElementById('stage-content');

  const passResults = result.metadata?.passResults || [];
  const passMap = {
    'A: Structural': 'PassA_Structural',
    'B: Cadence': 'PassB_Cadence',
    'C: Connector': 'PassC_Connector',
    'D: Ornament': 'PassD_Ornament',
    'E: Expectation': 'PassE_Expectation'
  };

  const passes = [
    { name: 'A: Structural', data: passResults.find(p => p.passName === passMap['A: Structural']) },
    { name: 'B: Cadence', data: passResults.find(p => p.passName === passMap['B: Cadence']) },
    { name: 'C: Connector', data: passResults.find(p => p.passName === passMap['C: Connector']) },
    { name: 'D: Ornament', data: passResults.find(p => p.passName === passMap['D: Ornament']) },
    { name: 'E: Expectation', data: passResults.find(p => p.passName === passMap['E: Expectation']) },
    { name: 'Final Melody', data: { notes: result.allNotes } }
  ];

  tabsContainer.innerHTML = passes.map((p, i) => `
    <div class="stage-tab ${i === passes.length - 1 ? 'active' : ''}"
         onclick="showStage(${i})">${p.name}</div>
  `).join('');

  // Show final melody by default
  showStage(passes.length - 1);
}

function showStage(index) {
  const passResults = pipelineResults?.metadata?.passResults || [];
  const passMap = {
    'A: Structural': 'PassA_Structural',
    'B: Cadence': 'PassB_Cadence',
    'C: Connector': 'PassC_Connector',
    'D: Ornament': 'PassD_Ornament',
    'E: Expectation': 'PassE_Expectation'
  };

  const passes = [
    { name: 'A: Structural', data: passResults.find(p => p.passName === passMap['A: Structural']) },
    { name: 'B: Cadence', data: passResults.find(p => p.passName === passMap['B: Cadence']) },
    { name: 'C: Connector', data: passResults.find(p => p.passName === passMap['C: Connector']) },
    { name: 'D: Ornament', data: passResults.find(p => p.passName === passMap['D: Ornament']) },
    { name: 'E: Expectation', data: passResults.find(p => p.passName === passMap['E: Expectation']) },
    { name: 'Final Melody', data: { notes: pipelineResults?.allNotes || [] } }
  ];

  const tabs = document.querySelectorAll('.stage-tab');
  tabs.forEach((tab, i) => tab.classList.toggle('active', i === index));

  const content = document.getElementById('stage-content');
  const passData = passes[index];

  if (!passData || !passData.data || !passData.data.notes || passData.data.notes.length === 0) {
    content.innerHTML = '<div class="empty-state">No notes generated in this pass</div>';
    document.getElementById('piano-roll').style.display = 'none';
    return;
  }

  const notes = passData.data.notes;

  // Show note chips
  const noteHtml = notes.map(note => {
    const noteName = midiToNoteName(note.pitch);
    const roleClass = note.role || 'structural';
    return `<span class="note-chip ${roleClass}">${noteName} (${note.role || 'structural'})</span>`;
  }).join('');

  // Build numerical table
  const tableRows = notes.map((note, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${midiToNoteName(note.pitch)}</td>
      <td>${note.pitch}</td>
      <td>${note.startTime.toFixed(2)}</td>
      <td>${note.duration.toFixed(2)}</td>
      <td>${note.role || 'structural'}</td>
    </tr>
  `).join('');

  const totalDuration = notes.length > 0
    ? Math.max(...notes.map(n => n.startTime + n.duration)).toFixed(2)
    : '0.00';

  const pitchRange = notes.length > 0
    ? `${Math.min(...notes.map(n => n.pitch))} - ${Math.max(...notes.map(n => n.pitch))} (${notes.length} unique pitches)`
    : 'N/A';

  const roleCounts = notes.length > 0
    ? Object.entries(
        notes.reduce((acc, n) => {
          const role = n.role || 'structural';
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {})
      ).map(([role, count]) => `${role}: ${count}`).join(', ')
    : 'N/A';

  content.innerHTML = '';

  const tableContainer = document.getElementById('table-content');
  if (tableContainer) {
    tableContainer.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Note</th>
            <th>MIDI</th>
            <th>Start (s)</th>
            <th>Duration (s)</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;
  }

  // Draw piano roll for final melody
  if (index === passes.length - 1) {
    drawPianoRoll(notes);
  } else {
    document.getElementById('piano-roll').style.display = 'none';
  }
}

// Log 30 notes to console for quick reference
function logNotesToConsole(notes) {
  const roleColors = {
    'structural': 'Cyan',
    'cadence': 'Green',
    'connector': 'Yellow',
    'ornament': 'Red',
    'expectation': 'Purple'
  };

  const maxNotes = 30;
  const displayNotes = notes.slice(0, maxNotes);

  console.log('\n' + '='.repeat(80));
  console.log(`  30 NOTES (showing first ${displayNotes.length} of ${notes.length})`);
  console.log('  ' + '-'.repeat(78));
  console.log('  #  Note      MIDI  Start  Dur  Role  Color  Position');
  console.log('  ' + '-'.repeat(78));

  displayNotes.forEach((note, i) => {
    const noteName = midiToNoteName(note.pitch);
    const role = note.role || 'structural';
    const color = roleColors[role] || 'White';
    const position = getVisualPosition(note, notes);

    console.log(`  ${i + 1}.  ${noteName}  ${note.pitch}  ${note.startTime.toFixed(1)}  ${note.duration.toFixed(1)}  ${role}  ${color}  ${position}`);
  });

  if (notes.length > maxNotes) {
    console.log(`  ... and ${notes.length - maxNotes} more notes`);
  } else {
    console.log(`  Total: ${notes.length} notes`);
  }
  console.log('  ' + '-'.repeat(78));
  console.log('  Color Key:  Cyan=Structural,  Green=Cadence,  Yellow=Connector,  Red=Ornament,  Purple=Expectation');
  console.log('  ' + '='.repeat(80) + '\n');
}

// Get visual position for a note (top, middle, bottom)
function getVisualPosition(note, allNotes) {
  const pitches = allNotes.map(n => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = maxPitch - minPitch;
  const normalized = range > 0 ? (note.pitch - minPitch) / range : 0;
  const position = normalized < 0.33 ? 'top' : normalized < 0.66 ? 'middle' : 'bottom';
  return position;
}

// Piano roll visualization
function drawPianoRoll(notes) {
  const canvas = document.getElementById('piano-canvas');
  const container = document.getElementById('piano-roll');

  if (notes.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const ctx = canvas.getContext('2d');
  const width = Math.max(800, notes.length * 50);
  const height = 300;

  canvas.width = width;
  canvas.height = height;

  // Clear
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, width, height);

  // Find pitch range
  const pitches = notes.map(n => n.pitch);
  const minPitch = Math.min(...pitches) - 5;
  const maxPitch = Math.max(...pitches) + 5;
  const pitchRange = maxPitch - minPitch || 1;

  // Find time range
  const maxTime = Math.max(...notes.map(n => n.startTime + n.duration));

  const noteHeight = (height - 40) / pitchRange;
  const timeScale = (width - 60) / maxTime;

  // Draw grid lines for pitches
  ctx.strokeStyle = '#1a1a4e';
  ctx.lineWidth = 1;
  for (let p = minPitch; p <= maxPitch; p++) {
    const y = height - 20 - (p - minPitch) * noteHeight;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Label pitch
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '10px monospace';
    ctx.fillText(midiToNoteName(p), 5, y - 3);
  }

  // Draw chord accompaniment bars
  const chords = pipelineResults?.metadata?.chords || [];
  if (chords.length > 0) {
    const chordColors = {
      'maj': 'rgba(78, 204, 162, 0.15)',
      'min': 'rgba(168, 85, 247, 0.15)',
      'dim': 'rgba(233, 69, 96, 0.15)',
      'aug': 'rgba(240, 165, 0, 0.15)',
      '7': 'rgba(255, 165, 0, 0.15)',
      'maj7': 'rgba(78, 204, 162, 0.15)'
    };

    chords.forEach(chord => {
      const rootIndex = NOTE_TO_MIDI[chord.root];
      const chordPitches = chord.scaleDegrees.map(deg => rootIndex + (deg - rootIndex + 60));
      const chordDuration = _getChordDuration(chord, chords);

      const x = 50 + chord.beatStart * timeScale;
      const w = chordDuration * timeScale;

      ctx.fillStyle = chordColors[chord.quality] || 'rgba(100, 100, 100, 0.15)';
      ctx.fillRect(x, 10, w, height - 30);

      // Chord label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '11px monospace';
      ctx.fillText(`${chord.root}${chord.quality}`, x + 3, 22);
    });
  }

// Sort notes by time before drawing
  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);

  // Draw notes
  sortedNotes.forEach(note => {
    const x = 50 + note.startTime * timeScale;
    const y = height - 20 - (note.pitch - minPitch) * noteHeight;
    const w = Math.max(10, note.duration * timeScale);
    const h = Math.max(8, noteHeight * 0.8);

    // Color by role
    const colors = {
      'structural': '#00d4ff',
      'cadence': '#4ecca3',
      'connector': '#f0a500',
      'ornament': '#e94560',
      'expectation': '#a855f7'
    };
    ctx.fillStyle = colors[note.role] || '#00d4ff';
    ctx.globalAlpha = 0.8;

    ctx.fillRect(x, y - h / 2, w, h);
    ctx.globalAlpha = 1;

    // Note label
    ctx.fillStyle = '#e9e9e9';
    ctx.font = '9px monospace';
    ctx.fillText(midiToNoteName(note.pitch), x + 5, y + 5);
  });
}

// Playback with Web Audio API
function playMelody() {
  if (!pipelineResults || !pipelineResults.allNotes) return;

  stopPlayback();

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const notes = pipelineResults.allNotes;
  const chords = pipelineResults.metadata?.chords || [];
  const now = audioContext.currentTime;

  // Play chord accompaniment
  chords.forEach(chord => {
    const rootIndex = NOTE_TO_MIDI[chord.root];
    const chordPitches = chord.scaleDegrees.map(deg => rootIndex + (deg - rootIndex + 60));
    const chordDuration = _getChordDuration(chord, chords);

    chordPitches.forEach(pitch => {
      const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(0.15, now + chord.beatStart);
      gainNode.gain.setValueAtTime(0.15, now + chord.beatStart + chordDuration * 0.85);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + chord.beatStart + chordDuration);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(now + chord.beatStart);
      oscillator.stop(now + chord.beatStart + chordDuration);
    });
  });

  // Play melody notes
  notes.forEach(note => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // MIDI to frequency
    const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.3, now + note.startTime);
    gainNode.gain.setValueAtTime(0.3, now + note.startTime + note.duration * 0.8);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + note.startTime + note.duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now + note.startTime);
    oscillator.stop(now + note.startTime + note.duration);
  });
}

function _getChordDuration(chord, chords) {
  const idx = chords.indexOf(chord);
  if (idx < chords.length - 1) {
    return chords[idx + 1].beatStart - chord.beatStart;
  }
  return 2;
}

function stopPlayback() {
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
}

// Logging
function addLogEntry(message, type = 'info') {
  const log = document.getElementById('execution-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// Reset
function resetAll() {
  chords = [];
  pipelineResults = null;
  renderChordList();

  document.getElementById('pipeline-status').style.display = 'none';
  document.getElementById('visualization').style.display = 'none';
  document.getElementById('execution-log').innerHTML = '';
  document.getElementById('pass-stages').innerHTML = '';
  document.getElementById('stage-tabs').innerHTML = '';
  document.getElementById('stage-content').innerHTML =
    '<div class="empty-state">Run the pipeline to see results</div>';
  document.getElementById('piano-roll').style.display = 'none';

  stopPlayback();
}

function add145Progression() {
  const root = document.getElementById('chord-root').value;
  const quality = document.getElementById('chord-quality').value;
  const beat = parseInt(document.getElementById('chord-beat').value) || 0;

  const rootIndex = NOTE_TO_MIDI[root];
  const fourthIndex = (rootIndex + 4) % 12;
  const fifthIndex = (rootIndex + 5) % 12;

  const fourthNote = Object.entries(NOTE_TO_MIDI).find(([k, v]) => v === fourthIndex)?.[0] || 'C';
  const fifthNote = Object.entries(NOTE_TO_MIDI).find(([k, v]) => v === fifthIndex)?.[0] || 'D';

  const baseBeat = beat || (chords.length > 0 ? chords[chords.length - 1].beatStart + 2 : 0);

  chords.push(new Chord(root, quality, baseBeat, getScaleDegrees(root, quality)));
  chords.push(new Chord(fourthNote, quality, baseBeat + 2, getScaleDegrees(fourthNote, quality)));
  chords.push(new Chord(fifthNote, quality, baseBeat + 4, getScaleDegrees(fifthNote, quality)));

  renderChordList();
  document.getElementById('chord-beat').value = baseBeat + 6;
}

async function runAllTests() {
  const testProgressions = [
    {
      name: 'I-IV-V (C major)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'F', quality: 'maj', beatStart: 2 },
        { root: 'G', quality: '7', beatStart: 4 }
      ],
      phraseRole: 'statement',
      tensionLevel: 0.5,
      isAntecedent: false
    },
    {
      name: 'vi-IV-I-V (pop)',
      chords: [
        { root: 'A', quality: 'min', beatStart: 0 },
        { root: 'F', quality: 'maj', beatStart: 2 },
        { root: 'C', quality: 'maj', beatStart: 4 },
        { root: 'G', quality: '7', beatStart: 6 }
      ],
      phraseRole: 'statement',
      tensionLevel: 0.6,
      isAntecedent: true
    },
    {
      name: 'ii-V-I (jazz)',
      chords: [
        { root: 'D', quality: 'min', beatStart: 0 },
        { root: 'G', quality: '7', beatStart: 2 },
        { root: 'C', quality: 'maj7', beatStart: 4 }
      ],
      phraseRole: 'resolution',
      tensionLevel: 0.8,
      isAntecedent: false
    },
    {
      name: 'I-vi-IV-V (50s)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'A', quality: 'min', beatStart: 2 },
        { root: 'F', quality: 'maj', beatStart: 4 },
        { root: 'G', quality: '7', beatStart: 6 }
      ],
      phraseRole: 'statement',
      tensionLevel: 0.4,
      isAntecedent: false
    },
    {
      name: 'I-V-vi-IV (ballad)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'G', quality: '7', beatStart: 2 },
        { root: 'A', quality: 'min', beatStart: 4 },
        { root: 'F', quality: 'maj', beatStart: 6 }
      ],
      phraseRole: 'build',
      tensionLevel: 0.7,
      isAntecedent: true
    },
    {
      name: 'Single chord (drone)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 }
      ],
      phraseRole: 'release',
      tensionLevel: 0.2,
      isAntecedent: false
    },
    {
      name: 'I-iv-I (plagal)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'F', quality: 'min', beatStart: 2 },
        { root: 'C', quality: 'maj', beatStart: 4 }
      ],
      phraseRole: 'resolution',
      tensionLevel: 0.3,
      isAntecedent: false
    },
    {
      name: 'I-III-IV-V (bright)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'E', quality: 'maj', beatStart: 2 },
        { root: 'F', quality: 'maj', beatStart: 4 },
        { root: 'G', quality: '7', beatStart: 6 }
      ],
      phraseRole: 'climax',
      tensionLevel: 0.9,
      isAntecedent: false
    },
    {
      name: 'I-ii-iii-IV-V (ascending)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'D', quality: 'min', beatStart: 2 },
        { root: 'E', quality: 'min', beatStart: 4 },
        { root: 'F', quality: 'maj', beatStart: 6 }
      ],
      phraseRole: 'build',
      tensionLevel: 0.7,
      isAntecedent: true
    },
    {
      name: 'I-#iv°-V (diminished)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'F#', quality: 'dim', beatStart: 2 },
        { root: 'G', quality: '7', beatStart: 4 }
      ],
      phraseRole: 'statement',
      tensionLevel: 0.9,
      isAntecedent: true
    },
    {
      name: 'I-IV-IVm-I (minor plagal)',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'F', quality: 'maj', beatStart: 2 },
        { root: 'F', quality: 'min', beatStart: 4 },
        { root: 'C', quality: 'maj', beatStart: 6 }
      ],
      phraseRole: 'resolution',
      tensionLevel: 0.4,
      isAntecedent: false
    },
    {
      name: 'I-V/vi-vi-IV-I-V',
      chords: [
        { root: 'C', quality: 'maj', beatStart: 0 },
        { root: 'E', quality: 'maj', beatStart: 2 },
        { root: 'A', quality: 'min', beatStart: 4 },
        { root: 'F', quality: 'maj', beatStart: 6 },
        { root: 'C', quality: 'maj', beatStart: 8 },
        { root: 'G', quality: '7', beatStart: 10 }
      ],
      phraseRole: 'statement',
      tensionLevel: 0.6,
      isAntecedent: true
    }
  ];

  console.log('\n' + '='.repeat(80));
  console.log('  RUNNING ALL TEST PROGRESSIONS');
  console.log('  ' + '='.repeat(80));

  const results = [];

  for (const test of testProgressions) {
    try {
      const testChords = test.chords.map(c =>
        new Chord(c.root, c.quality, c.beatStart, getScaleDegrees(c.root, c.quality))
      );

      const orchestrator = new CompositionOrchestrator();
      orchestrator.registerPass(new StructuralPlanner());
      orchestrator.registerPass(new CadencePlanner());
      orchestrator.registerPass(new ConnectorPlanner());
      orchestrator.registerPass(new OrnamentPlanner());
      orchestrator.registerPass(new ExpectationRefiner());
      const testRhythmConfig = deriveRhythmEngineConfig(
        test.chords.map(c => ({ root: c.root, quality: c.quality })),
        test.phraseRole,
        test.tensionLevel
      );
      const testRhythmEngine = new RhythmEngine({
        aestheticMode: testRhythmConfig.aestheticMode,
        genre: testRhythmConfig.genre,
        density: testRhythmConfig.density,
      });
      orchestrator.registerPass(testRhythmEngine);

      // Post-processing engines
      const testPhraseEngine = new PhraseEngine({ divisions: 12 });
      orchestrator.registerPass(testPhraseEngine);
      const testExpectationEngine = new ExpectationEngine();
      orchestrator.registerPass(testExpectationEngine);
      const testVoiceLeadingEngine = new VoiceLeadingEngine();
      orchestrator.registerPass(testVoiceLeadingEngine);

      const phraseContext = new PhraseContext(
        test.phraseRole,
        test.tensionLevel,
        undefined,
        test.isAntecedent
      );

      const config = new GenerationConfig(
        testChords.map(c => ({
          root: c.root,
          quality: c.quality,
          beatStart: c.beatStart,
          scaleDegrees: c.scaleDegrees
        })),
        phraseContext,
        { density: test.tensionLevel, genre: 'none' }
      );

      // Update RhythmEngine from test config
      testRhythmEngine.setDensity(config.options.density || 0.5);
      testRhythmEngine.setGenre(config.options.genre || 'none');

      const result = await orchestrator.execute(config);
      const allNotes = result.allNotes;

      const roleCounts = allNotes.reduce((acc, n) => {
        const role = n.role || 'structural';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      const pitchSet = new Set(allNotes.map(n => n.pitch));
      const minPitch = Math.min(...allNotes.map(n => n.pitch));
      const maxPitch = Math.max(...allNotes.map(n => n.pitch));
      const totalDuration = Math.max(...allNotes.map(n => n.startTime + n.duration));

      const passOutputCounts = [];
      const allPassOutputs = orchestrator.getAllPassOutputs();
      allPassOutputs.forEach(p => passOutputCounts.push(p.noteCount));

      const testResult = {
        name: test.name,
        chordCount: testChords.length,
        noteCount: allNotes.length,
        uniquePitches: pitchSet.size,
        pitchRange: pitchSet.size > 1 ? `${midiToNoteName(minPitch)}-${midiToNoteName(maxPitch)}` : 'single',
        duration: totalDuration.toFixed(1),
        roles: roleCounts,
        passOutput: passOutputCounts,
        valid: allNotes.length > 0
      };

      results.push(testResult);

      console.log(`\n--- ${test.name} ---`);
      console.log(`  Chords: ${testChords.length} | Notes: ${allNotes.length} | Unique pitches: ${pitchSet.size}`);
      console.log(`  Pitch range: ${testResult.pitchRange} | Duration: ${totalDuration.toFixed(1)}s`);
      console.log(`  Roles: ${Object.entries(roleCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`);
      console.log(`  Pass outputs: [${passOutputCounts.join(', ')}]`);
      console.log(`  Chords used: ${testChords.map(c => `${c.root}${c.quality}`).join(' -> ')}`);
      console.log(`  Status: ${testResult.valid ? 'PASS' : 'FAIL (no notes generated)'}`);

    } catch (error) {
      results.push({
        name: test.name,
        valid: false,
        error: error.message
      });
      console.log(`\n--- ${test.name} --- FAILED: ${error.message}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.valid).length;
  const failed = results.filter(r => !r.valid).length;

  console.log('\n' + '='.repeat(80));
  console.log('  TEST SUMMARY');
  console.log('  ' + '='.repeat(80));
  console.log(`  Total: ${testProgressions.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('  ' + '-'.repeat(80));

  if (failed > 0) {
    results.filter(r => !r.valid).forEach(r => {
      console.log(`  FAIL: ${r.name} - ${r.error || 'no notes generated'}`);
    });
  }

  console.log('  ' + '-'.repeat(80));

  // Print detailed summary table
  console.log('\n  Detailed Results:');
  console.log('  ' + '-'.repeat(80));
  console.log('  #  Progression              Chords  Notes  Pitches  Duration  Pass Outputs');
  console.log('  ' + '-'.repeat(80));

  results.forEach((r, i) => {
    const name = r.name.padEnd(27);
    const chords = String(r.chordCount || '?').padStart(6);
    const notes = String(r.noteCount || 0).padStart(6);
    const pitches = String(r.uniquePitches || 0).padStart(8);
    const duration = `${r.duration || '0.0'}s`.padStart(8);
    const passOut = r.passOutput ? `[${r.passOutput.join(',')}]` : '[ERROR]';
    const status = r.valid ? 'PASS' : 'FAIL';
    console.log(`  ${i + 1}.  ${name}  ${chords}  ${notes}  ${pitches}  ${duration}  ${passOut}  ${status}`);
  });

  console.log('  ' + '='.repeat(80) + '\n');
}

async function testMicrotonalEngine() {
  const log = document.getElementById('execution-log');
  log.innerHTML = '';
  document.getElementById('pipeline-status').style.display = 'block';

  const tuningSystems = ['12tet', 'quartertone', 'just', 'pythagorean'];
  const testNotes = [
    new MelodyNote(60, 0, 1, 'structural'),
    new MelodyNote(62, 1, 1, 'cadence'),
    new MelodyNote(64, 2, 1, 'connector'),
    new MelodyNote(67, 3, 1, 'ornament'),
    new MelodyNote(69, 4, 1, 'expectation'),
  ];

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const tuningId of tuningSystems) {
    try {
      const engine = new MicrotonalEngine({ tuningSystem: tuningId });
      const result = await engine.execute(
        new GenerationConfig([], new PhraseContext('statement', 0.5, undefined, false)),
        testNotes,
        {}
      );

      const adjustedNotes = result.notes.filter(n => n.metadata && n.metadata.microtonalAdjusted);
      const consistencyScore = result.metrics.score;

      const testResult = {
        tuningId,
        tuningName: engine.getActiveTuning()?.name || tuningId,
        totalNotes: result.notes.length,
        adjustedNotes: adjustedNotes.length,
        consistencyScore,
        sampleNotes: result.notes.slice(0, 3),
        passed: adjustedNotes.length > 0 && consistencyScore > 0,
      };

      results.push(testResult);

      if (testResult.passed) {
        totalPassed++;
        addLogEntry(`[PASS] ${tuningId} (${testResult.tuningName}): ${testResult.adjustedNotes}/${testResult.totalNotes} notes adjusted, score: ${testResult.consistencyScore.toFixed(2)}`, 'success');
      } else {
        totalFailed++;
        addLogEntry(`[FAIL] ${tuningId} (${testResult.tuningName}): ${testResult.adjustedNotes}/${testResult.totalNotes} notes adjusted, score: ${testResult.consistencyScore.toFixed(2)}`, 'error');
      }

      console.log(`\n=== ${tuningId} Test Results ===`);
      console.log(`  Tuning: ${testResult.tuningName}`);
      console.log(`  Total notes: ${testResult.totalNotes}`);
      console.log(`  Microtonally adjusted: ${testResult.adjustedNotes}`);
      console.log(`  Consistency score: ${testResult.consistencyScore.toFixed(2)}`);
      console.log(`  Sample notes:`);
      testResult.sampleNotes.forEach((note, i) => {
        console.log(`    ${i + 1}. MIDI:${note.pitch} freq:${note.metadata?.frequency?.toFixed(2)} tuning:${note.metadata?.tuningSystem} interval:${note.metadata?.intervalName || 'N/A'} quarterToneOffset:${note.metadata?.quarterToneOffset ?? 'N/A'}`);
      });

    } catch (error) {
      totalFailed++;
      results.push({
        tuningId,
        passed: false,
        error: error.message,
      });
      addLogEntry(`[ERROR] ${tuningId}: ${error.message}`, 'error');
      console.error(`MicrotonalEngine test failed for ${tuningId}:`, error);
    }
  }

  // Summary
  const summaryPassed = results.filter(r => r.passed).length;
  const summaryFailed = results.filter(r => !r.passed).length;

  addLogEntry(`\nMicrotonalEngine Test Summary: ${summaryPassed}/${tuningSystems.length} tuning systems passed`, summaryFailed === 0 ? 'success' : 'warning');

  console.log('\n' + '='.repeat(60));
  console.log('  MICROTONAL ENGINE TEST SUMMARY');
  console.log('  ' + '='.repeat(60));
  console.log(`  Total: ${tuningSystems.length} | Passed: ${summaryPassed} | Failed: ${summaryFailed}`);
  console.log('  ' + '-'.repeat(60));
  results.forEach(r => {
    if (r.error) {
      console.log(`  ${r.tuningId}: FAIL - ${r.error}`);
    } else {
      console.log(`  ${r.tuningId}: ${r.passed ? 'PASS' : 'FAIL'} (${r.tuningName}) - score: ${r.consistencyScore.toFixed(2)}`);
    }
  });
  console.log('  ' + '='.repeat(60) + '\n');
}

async function testMotifEngine() {
  const log = document.getElementById('execution-log');
  log.innerHTML = '';
  document.getElementById('pipeline-status').style.display = 'block';

  const transformationTypes = ['transposition', 'sequence', 'inversion', 'retrograde', 'augmentation', 'diminution'];
  const testNotes = [
    new MelodyNote(60, 0, 1, 'structural'),
    new MelodyNote(62, 1, 1, 'structural'),
    new MelodyNote(64, 2, 1, 'structural'),
    new MelodyNote(67, 3, 1, 'structural'),
    new MelodyNote(69, 4, 1, 'structural'),
  ];

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const transformType of transformationTypes) {
    try {
      const engine = new MotifEngine({ allowedTransformations: [transformType], transformProbability: 1.0 });
      const result = await engine.execute(
        new GenerationConfig([], new PhraseContext('statement', 0.5, undefined, false)),
        testNotes,
        {}
      );

      const motifFamilies = result.metadata?.motifFamilies || [];
      const motifCount = result.metadata?.motifCount || 0;
      const transformedNotes = result.notes.filter(n => n.metadata && n.metadata.motifTransformation);
      const coherenceScore = result.metrics.score;

      const testResult = {
        transformType,
        totalNotes: result.notes.length,
        motifFamilies: motifFamilies.length,
        motifCount,
        transformedNotes: transformedNotes.length,
        coherenceScore,
        sampleFamilies: motifFamilies.slice(0, 2),
        sampleTransformedNotes: transformedNotes.slice(0, 3),
        passed: motifFamilies.length > 0 && transformedNotes.length > 0,
      };

      results.push(testResult);

      if (testResult.passed) {
        totalPassed++;
        addLogEntry(`[PASS] ${transformType}: ${testResult.motifFamilies} families, ${testResult.motifCount} motifs, ${testResult.transformedNotes}/${testResult.totalNotes} notes transformed, score: ${testResult.coherenceScore.toFixed(2)}`, 'success');
      } else {
        totalFailed++;
        addLogEntry(`[FAIL] ${transformType}: ${testResult.motifFamilies} families, ${testResult.motifCount} motifs, ${testResult.transformedNotes}/${testResult.totalNotes} notes transformed, score: ${testResult.coherenceScore.toFixed(2)}`, 'error');
      }

      console.log(`\n=== ${transformType} Test Results ===`);
      console.log(`  Total notes: ${testResult.totalNotes}`);
      console.log(`  Motif families: ${testResult.motifFamilies}`);
      console.log(`  Motif count: ${testResult.motifCount}`);
      console.log(`  Transformed notes: ${testResult.transformedNotes}`);
      console.log(`  Coherence score: ${testResult.coherenceScore.toFixed(2)}`);
      if (testResult.sampleFamilies.length > 0) {
        console.log(`  Sample motif families:`);
        testResult.sampleFamilies.forEach((family, i) => {
          console.log(`    ${i + 1}. id: ${family.id}, name: ${family.name}, notes: ${family.notes?.length || 0}, transformations: ${family.transformations?.length || 0}`);
          if (family.metadata) {
            console.log(`       metadata: ${JSON.stringify(family.metadata)}`);
          }
        });
      }
      if (testResult.sampleTransformedNotes.length > 0) {
        console.log(`  Sample transformed notes:`);
        testResult.sampleTransformedNotes.forEach((note, i) => {
          const meta = note.metadata || {};
          const transMeta = meta.motifTransformation || {};
          console.log(`    ${i + 1}. MIDI:${note.pitch} start:${note.startTime} motifId: ${transMeta.motifId || 'N/A'} type: ${transMeta.type || 'N/A'} params: ${JSON.stringify(transMeta.parameters || {})}`);
        });
      }

    } catch (error) {
      totalFailed++;
      results.push({
        transformType,
        passed: false,
        error: error.message,
      });
      addLogEntry(`[ERROR] ${transformType}: ${error.message}`, 'error');
      console.error(`MotifEngine test failed for ${transformType}:`, error);
    }
  }

  // Summary
  const summaryPassed = results.filter(r => r.passed).length;
  const summaryFailed = results.filter(r => !r.passed).length;

  addLogEntry(`\nMotifEngine Test Summary: ${summaryPassed}/${transformationTypes.length} transformation types passed`, summaryFailed === 0 ? 'success' : 'warning');

  console.log('\n' + '='.repeat(60));
  console.log('  MOTIF ENGINE TEST SUMMARY');
  console.log('  ' + '='.repeat(60));
  console.log(`  Total: ${transformationTypes.length} | Passed: ${summaryPassed} | Failed: ${summaryFailed}`);
  console.log('  ' + '-'.repeat(60));
  results.forEach(r => {
    if (r.error) {
      console.log(`  ${r.transformType}: FAIL - ${r.error}`);
    } else {
      console.log(`  ${r.transformType}: ${r.passed ? 'PASS' : 'FAIL'} - ${r.motifFamilies} families, ${r.motifCount} motifs, score: ${r.coherenceScore.toFixed(2)}`);
    }
  });
  console.log('  ' + '='.repeat(60) + '\n');
}

async function testStyleEngine() {
  const log = document.getElementById('execution-log');
  log.innerHTML = '';
  document.getElementById('pipeline-status').style.display = 'block';

  const styleIds = ['baroque', 'classical', 'jazz', 'pop'];
  const testNotes = [
    new MelodyNote(60, 0, 1, 'structural'),
    new MelodyNote(62, 1, 1, 'cadence'),
    new MelodyNote(64, 2, 1, 'connector'),
    new MelodyNote(67, 3, 1, 'ornament'),
    new MelodyNote(69, 4, 1, 'expectation'),
  ];

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const styleId of styleIds) {
    try {
      const engine = new StyleEngine({ activeStyle: styleId });
      const result = await engine.execute(
        new GenerationConfig([], new PhraseContext('statement', 0.5, undefined, false)),
        testNotes,
        {}
      );

      const adjustedNotes = result.notes.filter(n => n.metadata && n.metadata.styleAdjusted);
      const complianceScore = result.metrics.score;
      const activeStyle = engine.getActiveStyle();

      const testResult = {
        styleId,
        styleName: activeStyle?.name || styleId,
        totalNotes: result.notes.length,
        adjustedNotes: adjustedNotes.length,
        complianceScore,
        maxInterval: activeStyle?.rules?.maxInterval,
        ornamentDensity: activeStyle?.rules?.ornamentDensity,
        sampleNotes: result.notes.slice(0, 3),
        passed: adjustedNotes.length > 0 && complianceScore > 0,
      };

      results.push(testResult);

      if (testResult.passed) {
        totalPassed++;
        addLogEntry(`[PASS] ${styleId} (${testResult.styleName}): ${testResult.adjustedNotes}/${testResult.totalNotes} notes adjusted, score: ${testResult.complianceScore.toFixed(2)}, maxInterval: ${testResult.maxInterval}`, 'success');
      } else {
        totalFailed++;
        addLogEntry(`[FAIL] ${styleId} (${testResult.styleName}): ${testResult.adjustedNotes}/${testResult.totalNotes} notes adjusted, score: ${testResult.complianceScore.toFixed(2)}`, 'error');
      }

      console.log(`\n=== ${styleId} Test Results ===`);
      console.log(`  Style: ${testResult.styleName}`);
      console.log(`  Total notes: ${testResult.totalNotes}`);
      console.log(`  Style-adjusted: ${testResult.adjustedNotes}`);
      console.log(`  Compliance score: ${testResult.complianceScore.toFixed(2)}`);
      console.log(`  Max interval: ${testResult.maxInterval}`);
      console.log(`  Ornament density: ${testResult.ornamentDensity}`);
      console.log(`  Sample notes:`);
      testResult.sampleNotes.forEach((note, i) => {
        console.log(`    ${i + 1}. MIDI:${note.pitch} start:${note.startTime} dur:${note.duration} role:${note.role} adjusted:${note.metadata?.styleAdjusted} styleId:${note.metadata?.styleId || 'N/A'} ornament:${note.metadata?.ornamentType || 'N/A'}`);
      });

    } catch (error) {
      totalFailed++;
      results.push({
        styleId,
        passed: false,
        error: error.message,
      });
      addLogEntry(`[ERROR] ${styleId}: ${error.message}`, 'error');
      console.error(`StyleEngine test failed for ${styleId}:`, error);
    }
  }

  const summaryPassed = results.filter(r => r.passed).length;
  const summaryFailed = results.filter(r => !r.passed).length;

  addLogEntry(`\nStyleEngine Test Summary: ${summaryPassed}/${styleIds.length} styles passed`, summaryFailed === 0 ? 'success' : 'warning');

  console.log('\n' + '='.repeat(60));
  console.log('  STYLE ENGINE TEST SUMMARY');
  console.log('  ' + '='.repeat(60));
  console.log(`  Total: ${styleIds.length} | Passed: ${summaryPassed} | Failed: ${summaryFailed}`);
  console.log('  ' + '-'.repeat(60));
  results.forEach(r => {
    if (r.error) {
      console.log(`  ${r.styleId}: FAIL - ${r.error}`);
    } else {
      console.log(`  ${r.styleId}: ${r.passed ? 'PASS' : 'FAIL'} (${r.styleName}) - score: ${r.complianceScore.toFixed(2)}, adjusted: ${r.adjustedNotes}/${r.totalNotes}`);
    }
  });
  console.log('  ' + '='.repeat(60) + '\n');
}

async function testRhythmEngine() {
  const log = document.getElementById('execution-log');
  log.innerHTML = '';
  document.getElementById('pipeline-status').style.display = 'block';

  const aestheticModes = ['cantabile', 'declamatory', 'sighs', 'virtuoso'];
  const testNotes = [
    new MelodyNote(60, 0, 1, 'structural'),
    new MelodyNote(62, 1, 1, 'cadence'),
    new MelodyNote(64, 2, 1, 'connector'),
    new MelodyNote(67, 3, 1, 'ornament'),
    new MelodyNote(69, 4, 1, 'expectation'),
  ];

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const mode of aestheticModes) {
    try {
      const engine = new RhythmEngine({ aestheticMode: mode, density: 1.0 });
      const result = await engine.execute(
        new GenerationConfig([], new PhraseContext('statement', 0.5, undefined, false)),
        testNotes,
        {}
      );

      const adjustedNotes = result.notes.filter(n => n.metadata && n.metadata.rhythmAdjusted && n.duration > 0);
      const qualityScore = result.metrics.score;
      const activeTemplate = result.metadata?.activeTemplate;
      const activeSubdivision = result.metadata?.subdivisionProfile;

      const testResult = {
        mode,
        totalNotes: result.notes.length,
        adjustedNotes: adjustedNotes.length,
        qualityScore,
        template: activeTemplate,
        subdivision: activeSubdivision,
        sampleNotes: result.notes.slice(0, 3),
        passed: adjustedNotes.length > 0 && qualityScore > 0,
      };

      results.push(testResult);

      if (testResult.passed) {
        totalPassed++;
        addLogEntry(`[PASS] ${mode}: ${testResult.adjustedNotes}/${testResult.totalNotes} notes rhythmically adjusted, score: ${testResult.qualityScore.toFixed(2)}, template: ${testResult.template?.id || 'N/A'}`, 'success');
      } else {
        totalFailed++;
        addLogEntry(`[FAIL] ${mode}: ${testResult.adjustedNotes}/${testResult.totalNotes} notes rhythmically adjusted, score: ${testResult.qualityScore.toFixed(2)}`, 'error');
      }

      console.log(`\n=== ${mode} Test Results ===`);
      console.log(`  Aesthetic mode: ${testResult.mode}`);
      console.log(`  Total notes: ${testResult.totalNotes}`);
      console.log(`  Rhythmically adjusted: ${testResult.adjustedNotes}`);
      console.log(`  Quality score: ${testResult.qualityScore.toFixed(2)}`);
      console.log(`  Template: ${testResult.template?.id || 'N/A'} (${testResult.template?.name || 'N/A'})`);
      console.log(`  Subdivision: ${testResult.subdivision?.id || 'N/A'} (${testResult.subdivision?.name || 'N/A'})`);
      console.log(`  Sample notes:`);
      testResult.sampleNotes.forEach((note, i) => {
        const meta = note.metadata || {};
        console.log(`    ${i + 1}. MIDI:${note.pitch} start:${note.startTime} dur:${note.duration} role:${note.role} adjusted:${meta.rhythmAdjusted} templateId:${meta.templateId || 'N/A'} subdivisionId:${meta.subdivisionId || 'N/A'} subdivision:${meta.subdivision || 'N/A'}`);
      });

    } catch (error) {
      totalFailed++;
      results.push({
        mode,
        passed: false,
        error: error.message,
      });
      addLogEntry(`[ERROR] ${mode}: ${error.message}`, 'error');
      console.error(`RhythmEngine test failed for ${mode}:`, error);
    }
  }

  // Also test density variation
  try {
    const lowDensityEngine = new RhythmEngine({ aestheticMode: 'cantabile', density: 0.2 });
    const highDensityEngine = new RhythmEngine({ aestheticMode: 'virtuoso', density: 1.0 });
    const config = new GenerationConfig([], new PhraseContext('statement', 0.5, undefined, false));

    const lowResult = await lowDensityEngine.execute(config, testNotes);
    const highResult = await highDensityEngine.execute(config, testNotes);

    const lowActive = lowResult.notes.filter(n => n.duration > 0).length;
    const highActive = highResult.notes.filter(n => n.duration > 0).length;

    const densityTestPassed = highActive >= lowActive;
    results.push({
      mode: 'densityComparison',
      lowDensity: lowActive,
      highDensity: highActive,
      passed: densityTestPassed,
    });

    if (densityTestPassed) {
      totalPassed++;
      addLogEntry(`[PASS] Density comparison: low(0.2)=${lowActive} notes, high(1.0)=${highActive} notes — high density >= low density`, 'success');
    } else {
      totalFailed++;
      addLogEntry(`[FAIL] Density comparison: low(0.2)=${lowActive} notes, high(1.0)=${highActive} notes — expected high >= low`, 'error');
    }

    console.log(`\n=== Density Comparison ===`);
    console.log(`  Low density (0.2): ${lowActive} active notes`);
    console.log(`  High density (1.0): ${highActive} active notes`);
    console.log(`  ${densityTestPassed ? 'PASS' : 'FAIL'} — high density >= low density`);

  } catch (error) {
    totalFailed++;
    results.push({ mode: 'densityComparison', passed: false, error: error.message });
    addLogEntry(`[ERROR] Density comparison: ${error.message}`, 'error');
  }

  const summaryPassed = results.filter(r => r.passed).length;
  const summaryFailed = results.filter(r => !r.passed).length;

  addLogEntry(`\nRhythmEngine Test Summary: ${summaryPassed}/${results.length} tests passed`, summaryFailed === 0 ? 'success' : 'warning');

  console.log('\n' + '='.repeat(60));
  console.log('  RHYTHM ENGINE TEST SUMMARY');
  console.log('  ' + '='.repeat(60));
  console.log(`  Total: ${results.length} | Passed: ${summaryPassed} | Failed: ${summaryFailed}`);
  console.log('  ' + '-'.repeat(60));
  results.forEach(r => {
    if (r.error) {
      console.log(`  ${r.mode}: FAIL - ${r.error}`);
    } else if (r.mode === 'densityComparison') {
      console.log(`  densityComparison: ${r.passed ? 'PASS' : 'FAIL'} (low:${r.lowDensity} high:${r.highDensity})`);
    } else {
      console.log(`  ${r.mode}: ${r.passed ? 'PASS' : 'FAIL'} (template: ${r.template?.id || 'N/A'}) - score: ${r.qualityScore.toFixed(2)}, adjusted: ${r.adjustedNotes}/${r.totalNotes}`);
    }
  });
  console.log('  ' + '='.repeat(60) + '\n');
}

// ── Random Progression Generator UI ──

let fixtureChords = [];
let fixtureWithBass = false;
let fixtureWithDrums = false;

function generateRandomProgressionUI() {
  // Stop any ongoing playback before starting new pipeline
  stopPlayback();

  const count = parseInt(document.getElementById('fixture-count')?.value) || 6;
  const beatIncrement = parseInt(document.getElementById('fixture-beat-increment')?.value) || 2;
  const fixtureDensity = parseFloat(document.getElementById('fixture-density')?.value) || 0.5;
  const fixtureGenre = document.getElementById('fixture-genre')?.value || 'none';
  fixtureWithBass = document.getElementById('fixture-with-bass')?.checked || false;
  fixtureWithDrums = document.getElementById('fixture-with-drums')?.checked || false;
  const complexPatterns = document.getElementById('fixture-complex')?.checked || false;

  // Step 1: Generate chords
  const { chords: processedChords, progressData, rawChords } = generateProgressionWithTracks({
    count, beatIncrement, withBass: fixtureWithBass, withDrums: fixtureWithDrums, complexPatterns,
  });

  // Step 2: Run pipeline

  // Clear UI
  const log = document.getElementById('execution-log');
  if (log) log.innerHTML = '';
  const statusEl = document.getElementById('pipeline-status');
  if (statusEl) statusEl.style.display = 'block';
  const visEl = document.getElementById('visualization');
  if (visEl) visEl.style.display = 'block';
  renderPassStages(['A', 'B', 'C', 'D', 'E', 'F']);

  const fixturePhraseRole = document.getElementById('phrase-role')?.value || 'statement';
  const fixtureTensionLevel = parseFloat(document.getElementById('tension-level')?.value) || 0.5;
  const fixtureIsAntecedent = document.getElementById('is-antecedent')?.value === 'true';

  const phraseContext = new PhraseContext(
    fixturePhraseRole,
    fixtureTensionLevel,
    undefined,
    fixtureIsAntecedent
  );

  const tuningSystemId = document.getElementById('tuning-system')?.value || '12tet';
  const microtonalEngine = new MicrotonalEngine({ tuningSystem: tuningSystemId });
  const orchestrator = new CompositionOrchestrator();
  orchestrator.registerPass(new StructuralPlanner());
  orchestrator.registerPass(new CadencePlanner());
  orchestrator.registerPass(new ConnectorPlanner());
  orchestrator.registerPass(new OrnamentPlanner());
  orchestrator.registerPass(new ExpectationRefiner());
  const fixtureRhythmConfig = deriveRhythmEngineConfig(
    rawChords.map(c => ({ root: c.root, quality: c.quality })),
    phraseContext.role, phraseContext.tensionLevel
  );
  const fixtureRhythmEngine = new RhythmEngine({
    aestheticMode: fixtureRhythmConfig.aestheticMode,
    genre: fixtureRhythmConfig.genre,
    density: fixtureRhythmConfig.density,
  });
  orchestrator.registerPass(fixtureRhythmEngine);
  const fixturePhraseEngine = new PhraseEngine({ divisions: 12 });
  orchestrator.registerPass(fixturePhraseEngine);
  const fixtureExpectationEngine = new ExpectationEngine();
  orchestrator.registerPass(fixtureExpectationEngine);
  const fixtureVoiceLeadingEngine = new VoiceLeadingEngine();
  orchestrator.registerPass(fixtureVoiceLeadingEngine);

  const chordProgression = rawChords.map(chord => ({
    root: chord.root, quality: chord.quality, beatStart: chord.beatStart, scaleDegrees: chord.scaleDegrees, duration: chord.duration || beatIncrement,
  }));
  const phraseCtx = new PhraseContext(phraseContext.role, phraseContext.tensionLevel, undefined, phraseContext.isAntecedent);
  const mgenConfig = new GenerationConfig(chordProgression, phraseCtx, {
    density: fixtureDensity, genre: fixtureGenre,
    pitchDiversityWeight: (parseFloat(document.getElementById('pitch-diversity-weight')?.value) || 0) / 100,
  });
  fixtureRhythmEngine.setDensity(mgenConfig.options.density || 0.5);
  fixtureRhythmEngine.setGenre(mgenConfig.options.genre || 'none');

  orchestrator.execute(mgenConfig).then(async (result) => {
    const rhythmPassResult = result.metadata?.passResults?.find(p => p.passName === 'RhythmEngine');
    const rhythmAdjustedNotes = result.allNotes.filter(n => n.metadata && n.metadata.rhythmAdjusted);

    // Apply microtonal tuning to final result
    const microtonalResult = await microtonalEngine.execute(mgenConfig, result.allNotes, {});

    const finalNotes = result.allNotes;

    pipelineResults = {
      ...result,
      allNotes: microtonalResult?.notes || result.allNotes,
      metadata: {
        ...result.metadata,
        microtonalTuning: tuningSystemId,
        fixtureGenerated: true,
        fixtureChordCount: count,
        fixtureWithBass,
        fixtureWithDrums,
        rhythmEngineResult: rhythmPassResult,
        rhythmAdjustedNoteCount: rhythmAdjustedNotes.length,
      },
    };

    updatePassCards(result);
    renderVisualization(result);
    // Make play, stop, copy buttons visible
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.style.display = 'inline-block';
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.style.display = 'inline-block';
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) copyBtn.style.display = 'inline-block';

    addLogEntry(`Fixture-generated ${count} chords → ${microtonalResult.notes.length} melody notes.`, 'success');
  }).catch((error) => {
    addLogEntry(`Pipeline failed: ${error.message}`, 'error');
    console.error(error);
  });

  // Update UI flow indicator
  const flowEl = document.getElementById('fixture-flow');
  if (flowEl) {
    flowEl.style.display = 'block';
    const trackTags = [];
    if (fixtureWithBass) trackTags.push('🎸 Bass');
    if (fixtureWithDrums) trackTags.push('🥁 Drums');
    flowEl.innerHTML = `
      <div><span class="flow-step">FixtureGen</span> <span class="flow-arrow">→</span> <span class="flow-data">${count} random chords${trackTags.length > 0 ? ' (' + trackTags.join(' + ') + ')' : ''}</span> <span class="flow-arrow">→</span> <span class="flow-step">Bridge</span> <span class="flow-arrow">→</span> <span class="flow-data">${chords.length} processed Chord[]</span> <span class="flow-arrow">→</span> <span class="flow-step">MGen Pipeline</span> <span class="flow-arrow">→</span> <span class="flow-data">Melody</span></div>
    `;
  }

  // Render fixture chord chips
  const fixtureListEl = document.getElementById('fixture-chord-list');
  if (fixtureListEl) {
    fixtureListEl.innerHTML = rawChords.map((c, i) => {
      const bassTag = fixtureWithBass ? ' bass' : '';
      const drumTag = fixtureWithDrums ? ' drum' : '';
      return `<span class="fixture-chord-chip${bassTag}${drumTag}">${c.root}${c.quality} @ beat ${c.beatStart}</span>`;
    }).join('');
  }
}

function clearFixtureProgression() {
  fixtureChords = [];
  fixtureWithBass = false;
  fixtureWithDrums = false;

  const fixtureChordList = document.getElementById('fixture-chord-list');
  if (fixtureChordList) fixtureChordList.innerHTML = '';
  const fixtureFlow = document.getElementById('fixture-flow');
  if (fixtureFlow) fixtureFlow.style.display = 'none';
  const fixtureBassCheck = document.getElementById('fixture-with-bass');
  if (fixtureBassCheck) fixtureBassCheck.checked = false;
  const fixtureDrumsCheck = document.getElementById('fixture-with-drums');
  if (fixtureDrumsCheck) fixtureDrumsCheck.checked = false;

  // Reset the manual chord list too
  chords = [];
  renderChordList();

  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.style.display = 'none';
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) stopBtn.style.display = 'none';
  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) copyBtn.style.display = 'none';

  const pipelineStatus = document.getElementById('pipeline-status');
  if (pipelineStatus) pipelineStatus.style.display = 'none';
  const visualization = document.getElementById('visualization');
  if (visualization) visualization.style.display = 'none';
  const log = document.getElementById('execution-log');
  if (log) log.innerHTML = '';
  const passStages = document.getElementById('pass-stages');
  if (passStages) passStages.innerHTML = '';
  const stageTabs = document.getElementById('stage-tabs');
  if (stageTabs) stageTabs.innerHTML = '';
  const stageContent = document.getElementById('stage-content');
  if (stageContent) stageContent.innerHTML = '<div class="empty-state">Run the pipeline to see results</div>';
  const tableContent = document.getElementById('table-content');
  if (tableContent) tableContent.innerHTML = '';
  const pianoRoll = document.getElementById('piano-roll');
  if (pianoRoll) pianoRoll.style.display = 'none';

  stopPlayback();
}

function copyResultsToClipboard() {
  if (!pipelineResults || !pipelineResults.allNotes) return;
  const chords = pipelineResults.metadata?.chords || [];
  const notes = pipelineResults.allNotes;

  const chordStr = chords.map(c => `${c.root}${c.quality} @ beat ${c.beatStart}`).join(' | ');
  
  const noteLines = notes.map((n, i) => {
    const pitchName = midiToNoteName(n.pitch);
    return `${String(i + 1).padStart(3)}. Pitch: ${String(n.pitch).padStart(3)} (${pitchName.padEnd(4)}) | Start: ${n.startTime.toFixed(2)} | Duration: ${n.duration.toFixed(2)} | Role: ${n.role}`;
  }).join('\n');

  const settings = `
SETTINGS:
- Phrase Role: ${document.getElementById('phrase-role')?.value || 'N/A'}
- Tuning System: ${document.getElementById('tuning-system')?.value || 'N/A'}
- Tension Level: ${document.getElementById('tension-level')?.value || 'N/A'}
- Phrase Closure: ${document.getElementById('is-antecedent')?.value === 'true' ? 'Antecedent' : 'Consequent'}
- Pitch Diversity Weight: ${document.getElementById('pitch-diversity-weight')?.value || '0'}%
- Chords Count: ${document.getElementById('fixture-count')?.value || 'N/A'}
- Beats Per Chord: ${document.getElementById('fixture-beat-increment')?.value || 'N/A'}
- Density: ${document.getElementById('fixture-density')?.value || 'N/A'}
- Genre Style Profile: ${document.getElementById('fixture-genre')?.value || 'N/A'}
- Bass Accompaniment: ${document.getElementById('fixture-with-bass')?.checked ? 'Yes' : 'No'}
- Drum Track: ${document.getElementById('fixture-with-drums')?.checked ? 'Yes' : 'No'}
- Complex Patterns: ${document.getElementById('fixture-complex')?.checked ? 'Yes' : 'No'}
  `.trim();

  const stats = `
DIAGNOSTICS:
- Execution Time: ${pipelineResults.metadata?.executionTimeMs?.toFixed(1) || 'N/A'}ms
- Safe Mode: ${pipelineResults.metadata?.safeModeTriggered ? 'Yes' : 'No'}
- Backtracks: ${pipelineResults.metadata?.backtrackCount || 0}
- Note Count: ${notes.length}
- Pitch Diversity: ${(new Set(notes.map(n => n.pitch)).size / notes.length * 100).toFixed(1)}%
  `.trim();

  const textToCopy = `CHORD PROGRESSION:\n${chordStr}\n\n${settings}\n\n${stats}\n\nFINAL MELODY NOTES:\n${noteLines}`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const btn = document.getElementById('copy-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy results:', err);
  });
}

// Expose functions to window for onclick handlers
window.addChord = addChord;
window.removeChord = removeChord;
window.runPipeline = runPipeline;
window.resetAll = resetAll;
window.playMelody = playMelody;
window.stopPlayback = stopPlayback;
window.showStage = showStage;
window.add145Progression = add145Progression;
window.runAllTests = runAllTests;
window.testMicrotonalEngine = testMicrotonalEngine;
window.testMotifEngine = testMotifEngine;
window.testStyleEngine = testStyleEngine;
window.testRhythmEngine = testRhythmEngine;
window.generateRandomProgressionUI = generateRandomProgressionUI;
window.clearFixtureProgression = clearFixtureProgression;
window.copyResultsToClipboard = copyResultsToClipboard;
