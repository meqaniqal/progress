// progressBridge.js
// Bridge module that converts Progress app's raw multi-track data into
// a flat Chord[] array for MelodyGen's CompositionOrchestrator.
//
// Implements the pre-processing module contract from melodygen_progress_bridge.md section 8.5.

'use strict';

import { Chord, PhraseContext, GenerationConfig } from './interfaces.js';

// ── Note name lookup for MIDI numbers ──

const MIDI_TO_NOTE_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert a MIDI pitch number to a note name string.
 * @param {number} midi - MIDI pitch (0-127)
 * @returns {string} Note name (e.g., 'C', 'D#', 'Bb')
 */
export function midiToNoteName(midi) {
  const index = ((Math.floor(midi) % 12) + 12) % 12;
  return MIDI_TO_NOTE_NAME[index];
}

// ── Chord root/quality deduction ──

/**
 * Deduce chord root and quality from Progress app's symbol + key + divisions.
 * Handles Roman numerals and chord symbols (e.g., 'Dm7#9', 'V7sus4').
 *
 * @param {string} symbol - Roman numeral or chord symbol
 * @param {number} key - MIDI root key
 * @param {number} divisions - EDO divisions
 * @returns {{ rootPitch: number, quality: string }}
 */
export function deduceChordRootAndQuality(symbol, key, divisions) {
  const stepSize = 12.0 / divisions;

  // Handle chord symbols like 'Dm7', 'G7#9', 'Csus4'
  const chordSymbolMatch = symbol.match(/^([A-G][#b]?)(.*)$/);
  if (chordSymbolMatch) {
    const rootNote = chordSymbolMatch[1];
    const qualityStr = chordSymbolMatch[2] || '';
    const rootPitch = noteNameToMidi(rootNote, key);
    const quality = normalizeQuality(qualityStr);
    return { rootPitch, quality };
  }

  // Handle Roman numerals (I, ii, iii°, IV, V7, vii°7, bVI, etc.)
  const romanMatch = symbol.match(/^([b#]?)([IVX]+)(.*)$/i);
  if (romanMatch) {
    const accidental = romanMatch[1];
    const roman = romanMatch[2];
    const qualityStr = romanMatch[3] || '';
    const scaleDegrees = getRomanNumeralDegrees(roman, qualityStr);
    const baseDegree = getRomanBaseDegree(roman);
    let rootPitch = key + (baseDegree * stepSize);
    // Apply accidental to root pitch
    if (accidental) {
      for (const ch of accidental) {
        rootPitch += (ch === '#') ? stepSize : -stepSize;
      }
    }
    const quality = normalizeQuality(qualityStr, roman);
    return { rootPitch, quality };
  }

  // Fallback: treat as chord symbol with root at key
  return { rootPitch: key, quality: 'maj' };
}

/**
 * Convert a note name to MIDI pitch relative to a base key.
 * @param {string} noteName - Note name (e.g., 'C', 'D#', 'Bb')
 * @param {number} baseKey - Base MIDI key
 * @returns {number} MIDI pitch
 */
function noteNameToMidi(noteName, baseKey) {
  const note = noteName.replace(/[#b]$/, '');
  const accidental = noteName.match(/[#b]+/);
  const baseIndex = MIDI_TO_NOTE_NAME.indexOf(note);
  if (baseIndex === -1) return baseKey;

  let offset = baseIndex - (baseKey % 12);
  if (accidental) {
    for (const ch of accidental[0]) {
      offset += (ch === '#') ? 1 : -1;
    }
  }
  return baseKey + offset;
}

/**
 * Normalize quality string from chord symbol suffix.
 * @param {string} qualityStr - Suffix like 'm7#9', 'sus4', ''
 * @returns {string} Normalized quality
 */
function normalizeQuality(qualityStr, roman) {
  if (!qualityStr) {
    // For Roman numerals, lowercase indicates minor
    if (roman && roman.match(/[ivx]/)) return 'min';
    return 'maj';
  }
  if (qualityStr.includes('maj7') || qualityStr.includes('maj9') || qualityStr.includes('maj11') || qualityStr.includes('maj13')) return 'maj7';
  if (qualityStr.includes('min') || qualityStr.includes('m')) return 'min';
  if (qualityStr.includes('dim') || qualityStr === '°' || qualityStr.includes('°7')) return 'dim';
  if (qualityStr.includes('aug')) return 'aug';
  if (qualityStr.includes('7') && !qualityStr.includes('maj7') && !qualityStr.includes('min7')) return '7';
  if (qualityStr.includes('min7') || qualityStr.includes('m7')) return 'min7';
  return 'maj';
}

/**
 * Get the base degree for a Roman numeral.
 * @param {string} roman - Roman numeral (I, II, III, IV, V, VI, VII)
 * @returns {number} Scale degree (0 = tonic, 2 = supertonic, etc.)
 */
function getRomanBaseDegree(roman) {
  const degrees = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  return degrees[roman.toUpperCase()] ?? 0;
}

/**
 * Get scale degrees for a Roman numeral with quality suffix.
 * @param {string} roman - Roman numeral
 * @param {string} quality - Quality suffix
 * @returns {number[]} Scale degrees
 */
function getRomanNumeralDegrees(roman, quality) {
  const base = getRomanBaseDegree(roman);
  const degrees = [base];

  if (quality.includes('maj7') || quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    degrees.push((base + 2) % 12);
    degrees.push((base + 4) % 12);
    degrees.push((base + 7) % 12);
  } else {
    degrees.push((base + 2) % 12);
    degrees.push((base + 4) % 12);
  }

  return degrees.sort((a, b) => a - b);
}

// ── Bridging transformations ──

/**
 * Convert a Progress app chord object to a MelodyGen Chord.
 *
 * @param {Object} progressChord - Progress app chord object
 * @param {number} globalBeatOffset - Cumulative beat position
 * @returns {Chord} MelodyGen Chord
 */
export function progressChordToMelodyGenChord(progressChord, globalBeatOffset) {
  const parsed = deduceChordRootAndQuality(progressChord.symbol, progressChord.key, progressChord.divisions);

  const rootNoteName = midiToNoteName(parsed.rootPitch);
  const scaleDegrees = (progressChord.notes || []).map(n => n % 12);

  return new Chord(rootNoteName, parsed.quality, globalBeatOffset, scaleDegrees);
}

/**
 * Convert a Progress app state object to a MelodyGen GenerationConfig.
 *
 * @param {Object} state - Progress app state object
 * @returns {GenerationConfig} MelodyGen generation config
 */
export function progressStateToGenerationConfig(state) {
  const chords = state.currentProgression.map((chord, i) => {
    let beatStart = 0;
    for (let j = 0; j < i; j++) {
      beatStart += state.currentProgression[j].duration;
    }
    return progressChordToMelodyGenChord(chord, beatStart);
  });

  const tensionCurveMap = {
    'arch': 'statement',
    'linear': 'statement',
    'valley': 'release',
    'staircase': 'build',
    'launch': 'climax',
  };

  const phraseContext = new PhraseContext(
    tensionCurveMap[state.melodySettings.tensionCurve] || 'statement',
    0.5,
    state.baseKey + 12,
    false
  );

  // Derive aesthetic mode from the first chord's quality and tension curve
  // This mirrors the Progress app's selectAestheticMode heuristic so that
  // RhythmEngine can pick appropriate templates.
  const firstChord = state.currentProgression && state.currentProgression.length > 0
    ? state.currentProgression[0]
    : null;
  const parsed = firstChord
    ? deduceChordRootAndQuality(firstChord.symbol, firstChord.key, state.divisions || 12)
    : null;
  const quality = parsed ? normalizeQualityForRhythm(parsed.quality) : 'major';
  const tensionCurve = state.melodySettings.tensionCurve || 'arch';
  const density = state.melodySettings.density || 0.5;
  const phraseRole = tensionCurveMap[tensionCurve] || 'statement';

  let aestheticMode = 'cantabile';
  if (quality === 'major') {
    aestheticMode = (phraseRole === 'build') ? 'declamatory' : 'cantabile';
  } else if (quality === 'minor') {
    aestheticMode = (phraseRole === 'build') ? 'sighs' : 'cantabile';
  } else if (quality === 'dominant') {
    aestheticMode = (phraseRole === 'climax') ? 'virtuoso' : 'declamatory';
  } else if (quality === 'diminished') {
    aestheticMode = (phraseRole === 'climax' || phraseRole === 'build') ? 'declamatory' : 'sighs';
  } else if (quality === 'augmented') {
    aestheticMode = (phraseRole === 'build') ? 'declamatory' : 'cantabile';
  }

  // Role overrides
  if (phraseRole === 'resolution') aestheticMode = 'cantabile';
  if (phraseRole === 'climax') aestheticMode = (quality !== 'diminished') ? 'virtuoso' : 'sighs';

  return new GenerationConfig(chords, phraseContext, {
    genre: state.melodySettings.genre,
    density: state.melodySettings.density,
    maxLeap: 12,
    baseRegister: state.baseKey,
    aestheticMode: aestheticMode,
  });
}

/**
 * Normalize chord quality names for RhythmEngine's selectAestheticMode.
 * The bridge uses 'maj'/'min'/'7'/'dim'/'aug', while the Progress app
 * uses 'major'/'minor'/'dominant'/'diminished'/'augmented'.
 * @param {string} quality - Quality string
 * @returns {string} Normalized quality
 */
function normalizeQualityForRhythm(quality) {
  const map = { 'maj': 'major', 'min': 'minor', '7': 'dominant', 'dim': 'diminished', 'aug': 'augmented' };
  return map[quality] || quality;
}

/**
 * Derive RhythmEngine config from chord data, phrase role, and tension level.
 * Mirrors the Progress app's selectAestheticMode heuristic so that
 * RhythmEngine can pick appropriate templates based on the musical context.
 *
 * @param {Object[]} chordList - Array of chord objects with root and quality
 * @param {string} phraseRole - Phrase role (statement, build, climax, release, resolution)
 * @param {number} tensionLevel - Tension level (0.0-1.0)
 * @returns {{ aestheticMode: string, genre: string, density: number }}
 */
export function deriveRhythmEngineConfig(chordList, phraseRole, tensionLevel) {
  const firstChord = chordList.length > 0 ? chordList[0] : null;
  // Normalize quality names: bridge uses 'maj'/'min'/'7'/'dim'/'aug',
  // while Progress app's selectAestheticMode uses 'major'/'minor'/'dominant'/'diminished'
  const quality = firstChord ? normalizeQualityForRhythm(firstChord.quality) : 'major';
  const firstSlotTension = Math.max(0.0, Math.min(1.0, 0.5 * 0.4 + tensionLevel * 0.6));

  let mode = 'cantabile';
  if (quality === 'major') {
    mode = (phraseRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
  } else if (quality === 'minor') {
    mode = (phraseRole === 'build' || firstSlotTension > 0.6) ? 'sighs' : 'cantabile';
  } else if (quality === 'dominant') {
    mode = (phraseRole === 'climax' || firstSlotTension > 0.6) ? 'virtuoso' : 'declamatory';
  } else if (quality === 'diminished') {
    mode = (phraseRole === 'climax' || phraseRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'sighs';
  } else if (quality === 'augmented') {
    mode = (phraseRole === 'build' || firstSlotTension > 0.6) ? 'declamatory' : 'cantabile';
  }

  // Role overrides
  if (phraseRole === 'resolution') mode = 'cantabile';
  if (phraseRole === 'climax') mode = (quality !== 'diminished') ? 'virtuoso' : 'sighs';

  return { aestheticMode: mode, genre: 'none', density: 0.5 };
}

// ── Pre-processing module (section 8.5) ──

/**
 * Pre-process Progress app's raw multi-track data into a flat Chord[] array.
 *
 * Responsibilities:
 * 1. Collect all event boundaries across all tracks
 * 2. Split at boundaries, resolving bass notes to effective roots
 * 3. Handle rest slices with wraparound logic
 * 4. Preserve metadata on each chord
 *
 * @param {Object} progressData - Raw data from Progress app
 * @param {Object[]} progressData.chords - Chord progression array
 * @param {Object} [progressData.bassTrack] - Optional bass track
 * @param {Object} [progressData.drumTrack] - Optional drum track
 * @returns {Chord[]} Flat array of Chord objects with correct beatStart values
 */
export function preprocessProgressData(progressData) {
  const { chords, bassTrack, drumTrack } = progressData;

  if (!chords || chords.length === 0) {
    return [];
  }

  // Step 1: Collect all event boundaries
  const boundaries = collectEventBoundaries(chords, bassTrack, drumTrack);

  // Step 2: Sort and deduplicate boundaries
  const sortedBoundaries = [...new Set(boundaries)].sort((a, b) => a - b);

  // Step 3: Create sliced chords at each boundary
  const slicedChords = createSlicedChords(chords, sortedBoundaries);

  // Step 4: Resolve bass notes to effective roots
  resolveBassNotes(slicedChords, bassTrack);

  // Step 5: Handle rest slices with wraparound
  handleRestSlices(slicedChords);

  return slicedChords;
}

/**
 * Collect all event boundaries from chords, bass, and drum tracks.
 * @param {Object[]} chords - Chord progression
 * @param {Object} [bassTrack] - Optional bass track
 * @param {Object} [drumTrack] - Optional drum track
 * @returns {number[]} Array of beat positions where events occur
 */
function collectEventBoundaries(chords, bassTrack, drumTrack) {
  const boundaries = new Set();

  // Chord transitions
  let cumulativeBeat = 0;
  for (const chord of chords) {
    cumulativeBeat += chord.duration;
    boundaries.add(cumulativeBeat);
  }

  // Bass pattern instances
  if (bassTrack) {
    for (const chord of chords) {
      if (chord.bassPattern && chord.bassPattern.instances) {
        for (const instance of chord.bassPattern.instances) {
          const absoluteTime = chord._beatStart + (instance.startTime * chord.duration);
          boundaries.add(absoluteTime);
          const endAbsolute = absoluteTime + (instance.duration * chord.duration);
          boundaries.add(endAbsolute);
        }
      }
    }
  }

  // Chord pattern instances
  for (const chord of chords) {
    if (chord.chordPattern && chord.chordPattern.instances) {
      for (const instance of chord.chordPattern.instances) {
        const absoluteTime = chord._beatStart + (instance.startTime * chord.duration);
        boundaries.add(absoluteTime);
        const endAbsolute = absoluteTime + (instance.duration * chord.duration);
        boundaries.add(endAbsolute);
      }
    }
  }

  // Drum hits
  for (const chord of chords) {
    if (chord.drumPattern && chord.drumPattern.hits) {
      for (const hit of chord.drumPattern.hits) {
        const absoluteTime = chord._beatStart + (hit.time * chord.duration);
        boundaries.add(absoluteTime);
      }
    }
  }

  return [...boundaries];
}

/**
 * Create sliced Chord objects at each event boundary.
 * @param {Object[]} chords - Original Progress chords
 * @param {number[]} boundaries - Sorted event boundaries
 * @returns {Chord[]} Array of sliced Chord objects
 */
function createSlicedChords(chords, boundaries) {
  const slicedChords = [];

  for (const chord of chords) {
    const chordStart = chord._beatStart || 0;
    const chordEnd = chordStart + chord.duration;

    // Find boundaries within this chord
    const chordBoundaries = boundaries.filter(b => b >= chordStart && b <= chordEnd);

    // Add chord start if not already a boundary
    if (!chordBoundaries.includes(chordStart)) {
      chordBoundaries.unshift(chordStart);
    }

    // Create slices between boundaries
    for (let i = 0; i < chordBoundaries.length - 1; i++) {
      const sliceStart = chordBoundaries[i];
      const sliceEnd = chordBoundaries[i + 1];
      const sliceDuration = sliceEnd - sliceStart;

      const slicedChord = progressChordToMelodyGenChord(chord, sliceStart);
      slicedChord.originalDuration = chord.duration;
      slicedChord.sourceTrack = 'chord';
      slicedChord.sliceIndex = i;
      slicedChord._parentChord = chord;

      // Mark if this slice has drum hits
      if (chord.drumPattern && chord.drumPattern.hits) {
        const hasHits = chord.drumPattern.hits.some(hit => {
          const hitTime = chordStart + (hit.time * chord.duration);
          return hitTime >= sliceStart && hitTime < sliceEnd;
        });
        if (hasHits) {
          slicedChord.hasDrumHits = true;
        }
      }

      slicedChords.push(slicedChord);
    }
  }

  return slicedChords;
}

/**
 * Resolve bass notes to effective chord roots.
 * If a bass note exists at this time, use the bass pitch as effective root.
 * @param {Chord[]} slicedChords - Sliced chord array
 * @param {Object} [bassTrack] - Optional bass track
 */
function resolveBassNotes(slicedChords, bassTrack) {
  if (!bassTrack || !bassTrack.instances) return;

  for (const slicedChord of slicedChords) {
    // Find bass instance that overlaps with this slice
    const overlappingBass = bassTrack.instances.find(instance => {
      const bassStart = slicedChord._parentChord?._beatStart || 0;
      const bassAbsoluteStart = bassStart + (instance.startTime * (slicedChord.originalDuration || 1));
      const bassAbsoluteEnd = bassAbsoluteStart + (instance.duration * (slicedChord.originalDuration || 1));
      return slicedChord.beatStart >= bassAbsoluteStart && slicedChord.beatStart < bassAbsoluteEnd;
    });

    if (overlappingBass) {
      // Calculate effective root from bass pitch offset
      const bassPitch = slicedChord.key + overlappingBass.pitchOffset;
      const effectiveRoot = midiToNoteName(bassPitch);

      // Override the chord root with bass-derived root, keep quality for upper voices
      slicedChord.root = effectiveRoot;
      slicedChord.effectiveRoot = effectiveRoot;
      slicedChord.bassPitchOffset = overlappingBass.pitchOffset;
    }
  }
}

/**
 * Handle rest slices with wraparound logic.
 * Rest slices inherit the preceding chord's properties.
 * If at start of progression, wrap to last chord of entire progression.
 * @param {Chord[]} slicedChords - Sliced chord array
 */
function handleRestSlices(slicedChords) {
  for (let i = 0; i < slicedChords.length; i++) {
    const parentChord = slicedChords[i]._parentChord;
    if (!parentChord || parentChord.isRest) {
      // Find the original Progress chord to check isRest
      const originalChord = findOriginalChord(slicedChords, i);
      if (originalChord && originalChord.isRest) {
        inheritPrecedingChord(slicedChords, i);
      }
    }
  }
}

/**
 * Find the original Progress chord for a sliced chord index.
 * @param {Chord[]} slicedChords - Sliced chord array
 * @param {number} index - Sliced chord index
 * @returns {Object} Original Progress chord
 */
function findOriginalChord(slicedChords, index) {
  // Walk backwards to find the original chord reference
  for (let i = index; i >= 0; i--) {
    if (slicedChords[i]._parentChord) {
      return slicedChords[i]._parentChord;
    }
  }
  return null;
}

/**
 * Make a rest slice inherit the preceding chord's harmonic context.
 * Wraps to last chord if at start of progression.
 * @param {Chord[]} slicedChords - Sliced chord array
 * @param {number} restIndex - Index of the rest slice
 */
function inheritPrecedingChord(slicedChords, restIndex) {
  let precedingIndex = restIndex - 1;

  // Wraparound: if at start of progression, use last chord
  if (precedingIndex < 0) {
    precedingIndex = slicedChords.length - 1;
  }

  const preceding = slicedChords[precedingIndex];
  const rest = slicedChords[restIndex];

  // Inherit root and quality from preceding chord
  rest.root = preceding.root;
  rest.quality = preceding.quality;
  rest.scaleDegrees = preceding.scaleDegrees ? [...preceding.scaleDegrees] : [];
  rest.isContinuation = true;
  rest.inheritedFrom = precedingIndex;
}

// ── Output mapping ──

/**
 * Convert a MelodyGen MelodyResult to Progress app note objects.
 *
 * @param {Object} melodyResult - MelodyGen result (allNotes + metadata)
 * @param {number} [bpm] - Optional BPM for time conversion
 * @returns {Object[]} Array of Progress app note objects
 */
export function melodyGenResultToProgressNotes(melodyResult, bpm) {
  const allNotes = melodyResult.allNotes || [];

  return allNotes.map(note => ({
    pitch: note.pitch,
    stepTime: note.startTime,
    noteDuration: note.duration,
    melodyInst: 'melody',
    isAnchor1Step: note.role === 'structural',
    isAnchor2Step: note.role === 'cadence',
    isIsolated: note.role === 'connector',
    clusterRole: note.role,
    metadata: note.metadata,
  }));
}

/**
 * Convert beat position to seconds using BPM.
 * @param {number} beatPosition - Beat position
 * @param {number} bpm - Beats per minute
 * @returns {number} Time in seconds
 */
export function beatToSeconds(beatPosition, bpm) {
  return (60.0 / bpm) * beatPosition;
}

export default {
  preprocessProgressData,
  progressChordToMelodyGenChord,
  progressStateToGenerationConfig,
  melodyGenResultToProgressNotes,
  beatToSeconds,
  midiToNoteName,
  deriveRhythmEngineConfig,
};
