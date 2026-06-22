// Pass A - Structural Skeleton
// Generates primary structural notes that define melodic identity
// This is the foundational pass that constrains all downstream passes

import {
  MelodyNote,
  Chord,
  PhraseContext,
  EvaluationMetrics,
  PassResult,
  GenerationConfig,
} from '../interfaces.js';

/**
 * Pass A: Structural Skeleton Generator.
 * Selects key structural targets per bar based on chord progression.
 * Defines melodic identity before any decorations are added.
 */
export class StructuralPlanner {
  /**
   * @param {Object} options - Pass-specific options
   * @param {number} [options.baseRegister=60] - Base register for structural notes (MIDI)
   * @param {number} [options.maxLeap=12] - Maximum allowed leap between structural notes
   * @param {Array<number>} [options.strongBeats=[1, 3]] - Beats considered structurally significant
   */
  constructor(options = {}) {
    this.baseRegister = options.baseRegister || 60;
    this.maxLeap = options.maxLeap || 12;
    this.strongBeats = options.strongBeats || [1, 3];
  }

  /**
   * Execute Pass A: Generate structural skeleton.
   * @param {GenerationConfig} config - Generation configuration
   * @param {MelodyNote[]} [previousNotes=[]] - Notes from previous passes (empty for Pass A)
   * @param {Object} [context] - Execution context
   * @returns {PassResult} Structural skeleton result
   */
  async execute(config, previousNotes = [], context = {}) {
    const { chords, phraseContext } = config;
    const notes = [];
    const options = config.options || {};
    this.baseRegister = options.baseRegister !== undefined ? options.baseRegister : this.baseRegister;
    const pitchDiversityMode = options.pitchDiversityMode || 'avoid-previous';
    let pitchDiversityWeight = parseFloat(options.pitchDiversityWeight) || 0.0;

    // If backtracking feedback was provided, boost pitch diversity to find alternative shapes
    if (options.backtrackFeedback) {
      pitchDiversityWeight = Math.min(1.0, pitchDiversityWeight + 0.4);
    }

    let previousStructuralPitch = null;

    // Select structural targets for each chord
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      let structuralNote = this._selectStructuralTarget(chord, phraseContext, i, chords, previousStructuralPitch, pitchDiversityMode, pitchDiversityWeight);
      
      // Apply feed-forward register ranges if specified
      if (structuralNote && options.registerRange) {
        const minPitch = options.registerRange.min || 48;
        const maxPitch = options.registerRange.max || 72;
        const boundedPitch = Math.max(minPitch, Math.min(maxPitch, structuralNote.pitch));
        structuralNote = new MelodyNote(boundedPitch, structuralNote.startTime, structuralNote.duration, structuralNote.role, structuralNote.metadata);
      }

      if (structuralNote) {
        previousStructuralPitch = structuralNote.pitch;
        notes.push(structuralNote);
      }
    }

    // Bypass expensive voice-leading optimization in safeMode for speed
    const refinedNotes = options.safeMode ? notes : this._applyVoiceLeadingConstraints(notes);

    return new PassResult(
      'PassA_Structural',
      refinedNotes,
      new EvaluationMetrics('PassA_Structural', 1.0, [], true),
      {
        phraseContext,
        chordCount: chords.length,
        structuralNoteCount: refinedNotes.length,
      }
    );
  }

  /**
   * Select the best structural target for a chord.
   * Considers chord tones, phrase role, and register constraints.
   * @param {Chord} chord - Current chord
   * @param {PhraseContext} phraseContext - Phrase context
   * @param {number} chordIndex - Index of this chord in progression
   * @param {Chord[]} allChords - Full chord progression
   * @returns {MelodyNote} Structural target note
   * @private
   */
   _selectStructuralTarget(chord, phraseContext, chordIndex, allChords, previousStructuralPitch, pitchDiversityMode, pitchDiversityWeight) {
     const chordTones = this._getChordTones(chord);
     const phraseRole = phraseContext.role;

     // Select chord tone based on phrase role
     let targetPitch;

     switch (phraseRole) {
       case 'statement':
         // Statement phrases tend to use root or third
         targetPitch = chordTones[0] || this._fallbackRegister(chord, 0);
         break;
       case 'build':
         // Build phrases may use fifth or seventh for tension
         targetPitch = chordTones[2] || chordTones[0] || this._fallbackRegister(chord, 0);
         break;
       case 'climax':
         // Climax phrases target higher register
         targetPitch = this._selectHighestChordTone(chordTones);
         break;
       case 'release':
         // Release phrases move toward tonic
         targetPitch = this._findTonicApproach(chord, chordTones, allChords);
         break;
       case 'resolution':
         // Resolution phrases land on tonic
         targetPitch = this._findTonicNote(chord, chordTones);
         break;
       default:
         targetPitch = chordTones[0] || this._fallbackRegister(chord, 0);
     }

     // Pitch diversity override: vary structural notes within the same chord
     if (pitchDiversityWeight > 0 && chordTones.length > 1) {
       const shouldApply = Math.random() < pitchDiversityWeight;
       if (shouldApply) {
         const sliceIndex = chord.sliceIndex || 0;
         if (pitchDiversityMode === 'cycle') {
           // Cycle through chord tones based on slice index
           const cycleIndex = (sliceIndex + 1) % chordTones.length;
           targetPitch = chordTones[cycleIndex];
         } else {
           // Avoid-previous: pick a different chord tone if current matches previous
           if (targetPitch === previousStructuralPitch) {
             const alternatives = chordTones.filter(t => t !== previousStructuralPitch);
             if (alternatives.length > 0) {
               targetPitch = alternatives[sliceIndex % alternatives.length];
             }
           }
         }
       }
     }

     // Apply register constraints from phrase context
    if (phraseContext.registerTarget !== null) {
      targetPitch = this._adjustToRegister(targetPitch, phraseContext.registerTarget);
    }

    // Place on strong beat within the chord
     const beatPosition = this._selectStrongBeat(chordIndex, allChords.length, chord);

    return new MelodyNote(targetPitch, beatPosition, 1.0, 'structural', {
      chordRoot: chord.root,
      chordQuality: chord.quality,
      phraseRole,
      isStructuralTarget: true,
    });
  }

  /**
   * Get chord tones for a given chord.
   * @param {Chord} chord - Chord to analyze
   * @returns {number[]} Array of MIDI pitch numbers for chord tones
   * @private
   */
  _getChordTones(chord) {
    if (chord.notes && chord.notes.length > 0) {
      const pitchClasses = new Set(chord.notes.map(n => ((n % 12) + 12) % 12));
      return [...pitchClasses].map(pc => this.baseRegister + pc);
    }
    const rootMidi = this._noteNameToMidi(chord.root);
    const intervals = this._getChordIntervals(chord.quality);

    return intervals.map((interval) => rootMidi + interval);
  }

  /**
   * Get chord intervals based on quality.
   * @param {string} quality - Chord quality
   * @returns {number[]} Array of intervals from root
   * @private
   */
  _getChordIntervals(quality) {
    switch (quality) {
      case 'maj':
        return [0, 4, 7];
      case 'min':
        return [0, 3, 7];
      case 'dim':
        return [0, 3, 6];
      case 'aug':
        return [0, 4, 8];
      case '7':
        return [0, 4, 7, 10];
      case 'maj7':
        return [0, 4, 7, 11];
      case 'min7':
        return [0, 3, 7, 10];
      default:
        return [0, 4, 7];
    }
  }

  /**
   * Convert note name to MIDI pitch.
   * @param {string} noteName - Note name (e.g., 'C4', 'D#5')
   * @returns {number} MIDI pitch number
   * @private
   */
  _noteNameToMidi(noteName) {
    const noteValues = {
      C: 0,
      Csh: 1,
      Dbb: 0,
      Db: 1,
      D: 2,
      Dsh: 3,
      Ebb: 1,
      Eb: 3,
      E: 4,
      Esh: 5,
      Fbb: 3,
      Fb: 3,
      F: 5,
      Fsh: 6,
      Gbb: 4,
      Gb: 6,
      G: 7,
      Gsh: 8,
      Abb: 7,
      Ab: 8,
      A: 9,
      Ash: 10,
      Bbb: 8,
      Bb: 10,
      B: 11,
      Bsh: 12,
    };

    // Parse note name (e.g., 'C4', 'D#5')
    const match = noteName.match(/^([A-G][b#]?)(\d+)?$/);
    if (!match) return 60; // Default to C4

    let note = match[1];
    const octave = match[2] ? parseInt(match[2], 10) : 4;

    // Convert sharp/flat symbols to internal notation
    if (note.endsWith('#')) {
      note = note.slice(0, -1) + 'sh';
    } else if (note.endsWith('b')) {
      note = note.slice(0, -1) + 'b';
    }

    const baseNote = noteValues[note] || 0;
    return 12 * (octave + 1) + baseNote;
  }

  /**
    * Fallback register selection.
    * Uses the actual chord root to determine register, avoiding the C4 default.
    * @param {Chord} chord - Current chord
    * @param {number} toneIndex - Which chord tone to use
    * @returns {number} MIDI pitch
    * @private
    */
   _fallbackRegister(chord, toneIndex) {
     const rootMidi = this._noteNameToMidi(chord.root);
     // Use the chord's actual root in a reasonable register (C3-B3 range: 48-59)
     // rather than forcing everything into C4 (60)
     const baseRegister = 48; // C3
     return baseRegister + (rootMidi % 12) + toneIndex * 3;
   }

  /**
   * Select highest chord tone.
   * @param {number[]} chordTones - Chord tones
   * @returns {number} Highest pitch
   * @private
   */
  _selectHighestChordTone(chordTones) {
    return Math.max(...chordTones);
  }

  /**
   * Find tonic approach for release phrases.
   * @param {Chord} chord - Current chord
   * @param {number[]} chordTones - Chord tones
   * @param {Chord[]} allChords - Full progression
   * @returns {number} Target pitch
   * @private
   */
  _findTonicApproach(chord, chordTones, allChords) {
    // Find the home key (first chord root)
    if (allChords.length > 0) {
      const homeRoot = allChords[0].root;
      const homeMidi = this._noteNameToMidi(homeRoot);
      return homeMidi;
    }
    return chordTones[0];
  }

  /**
   * Find tonic note for resolution phrases.
   * @param {Chord} chord - Current chord
   * @param {number[]} chordTones - Chord tones
   * @returns {number} Tonic pitch
   * @private
   */
  _findTonicNote(chord, chordTones) {
    // If current chord is tonic, return root
    if (chord.quality === 'maj' || chord.quality === 'min') {
      return this._noteNameToMidi(chord.root);
    }
    // Otherwise find nearest chord tone to tonic
    const homeRoot = this._noteNameToMidi(chord.root);
    return chordTones.reduce((prev, curr) =>
      Math.abs(curr - homeRoot) < Math.abs(prev - homeRoot) ? curr : prev
    );
  }

  /**
   * Adjust pitch to target register.
   * @param {number} pitch - Original pitch
   * @param {number} registerTarget - Target register
   * @returns {number} Adjusted pitch
   * @private
   */
  _adjustToRegister(pitch, registerTarget) {
    const diff = registerTarget - pitch;
    if (Math.abs(diff) > 12) {
      return pitch + Math.sign(diff) * 12;
    }
    return pitch;
  }

  /**
    * Select strong beat position.
    * Places notes on beats within each chord's duration for full coverage.
    * @param {number} chordIndex - Current chord index
    * @param {number} totalChords - Total chord count
    * @param {Chord} chord - Current chord (for duration info)
    * @returns {number} Beat position
    * @private
    */
   _selectStrongBeat(chordIndex, totalChords, chord) {
     // Place structural notes on strong, standard beats (0.0 or mid-beat)
     // rather than syncopated divisions to prevent "fluttering" melodies
     const chordDuration = chord?.duration || 2;
     const beatPattern = chordIndex % 2;
     
     if (beatPattern === 0) {
       return chord.beatStart;
     } else {
       return chord.beatStart + chordDuration * 0.5;
     }
   }

  /**
   * Apply voice-leading constraints to structural notes.
   * Ensures perceptually coherent motion.
   * @param {MelodyNote[]} notes - Structural notes
   * @returns {MelodyNote[]} Refined notes
   * @private
   */
  _applyVoiceLeadingConstraints(notes) {
    if (notes.length <= 1) return notes;

    const refined = [notes[0]];

    for (let i = 1; i < notes.length; i++) {
      const prevNote = refined[refined.length - 1];
      const currentNote = notes[i];
      const interval = Math.abs(currentNote.pitch - prevNote.pitch);

      // If leap exceeds maximum, adjust to stay within constraints
      if (interval > this.maxLeap) {
        const direction = currentNote.pitch > prevNote.pitch ? 1 : -1;
        const adjustedPitch = prevNote.pitch + direction * this.maxLeap;

        refined.push(
          new MelodyNote(
            adjustedPitch,
            currentNote.startTime,
            currentNote.duration,
            'structural',
            {
              ...currentNote.metadata,
              adjustedForVoiceLeading: true,
              originalPitch: currentNote.pitch,
            }
          )
        );
      } else {
        refined.push(currentNote);
      }
    }

    return refined;
  }
}

export default StructuralPlanner;
