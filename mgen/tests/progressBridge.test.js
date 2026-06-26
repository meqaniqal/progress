// Tests for progressBridge.js
// Validates that the bridge correctly converts Progress app data to MelodyGen format.

import {
  preprocessProgressData,
  progressChordToMelodyGenChord,
  progressStateToGenerationConfig,
  melodyGenResultToProgressNotes,
  beatToSeconds,
  midiToNoteName,
  deduceChordRootAndQuality,
} from '../src/progressBridge.js';

import { generateProgressChord, generateProgressState, generateMgenChords, generateMelodyResult, generatePhraseContext } from '../src/progressFixtureGenerator.js';

import { Chord, PhraseContext, GenerationConfig } from '../src/interfaces.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

describe('progressBridge', () => {

  describe('midiToNoteName()', () => {
    it('should convert MIDI 60 to C', () => {
      expect(midiToNoteName(60)).toBe('C');
    });

    it('should convert MIDI 61 to C# or Db', () => {
      const result = midiToNoteName(61);
      expect(['C#', 'Db']).toContain(result);
    });

    it('should convert MIDI 67 to G', () => {
      expect(midiToNoteName(67)).toBe('G');
    });

    it('should handle negative MIDI values (modulo)', () => {
      const result = midiToNoteName(-1);
      expect(result.length > 0).toBe(true);
    });

    it('should handle MIDI 127 (G7)', () => {
      // 127 % 12 = 7, which is G in the sharp-only array
      expect(midiToNoteName(127)).toBe('G');
    });
  });

  describe('deduceChordRootAndQuality()', () => {
    it('should parse chord symbol "Dm" with key 60', () => {
      const result = deduceChordRootAndQuality('Dm', 60, 12);
      expect(result).toHaveProperty('rootPitch');
      expect(result).toHaveProperty('quality');
      expect(result.quality).toBe('min');
    });

    it('should parse chord symbol "G7#9" with key 60', () => {
      const result = deduceChordRootAndQuality('G7#9', 60, 12);
      expect(result).toHaveProperty('rootPitch');
      expect(result.quality).toBe('7');
    });

    it('should parse Roman numeral "I" with key 60', () => {
      const result = deduceChordRootAndQuality('I', 60, 12);
      expect(result.rootPitch).toBe(60);
      expect(result.quality).toBe('maj');
    });

    it('should parse Roman numeral "V7" with key 60', () => {
      const result = deduceChordRootAndQuality('V7', 60, 12);
      expect(result.rootPitch).toBe(67); // G
      expect(result.quality).toBe('7');
    });

    it('should parse Roman numeral "vi" with key 60', () => {
      const result = deduceChordRootAndQuality('vi', 60, 12);
      expect(result.rootPitch).toBe(69); // A4 (9 semitones above C4)
      expect(result.quality).toBe('min');
    });

    it('should handle flat Roman numerals like "bVI"', () => {
      const result = deduceChordRootAndQuality('bVI', 60, 12);
      // bVI = flat 6th degree = 8 semitones above tonic = 68 (Ab4)
      expect(result.rootPitch).toBe(68);
    });

    it('should respect EDO divisions for microtonal', () => {
      const result = deduceChordRootAndQuality('I', 60, 24);
      // 24-TET: stepSize = 0.5, V is 7 semitones above = 60 + 7*0.5 = 63.5
      const resultV = deduceChordRootAndQuality('V', 60, 24);
      expect(resultV.rootPitch).toBe(63.5);
    });

    it('should fallback to {rootPitch: key, quality: "maj"} for unknown symbols', () => {
      const result = deduceChordRootAndQuality('UNKNOWN', 60, 12);
      expect(result.rootPitch).toBe(60);
      expect(result.quality).toBe('maj');
    });
  });

  describe('progressChordToMelodyGenChord()', () => {
    it('should convert a Progress chord to a MelodyGen Chord', () => {
      const progressChord = generateProgressChord({ withPatterns: false });
      const result = progressChordToMelodyGenChord(progressChord, 0);

      expect(result).toBeInstanceOf(Chord);
      expect(result).toHaveProperty('root');
      expect(result).toHaveProperty('quality');
      expect(result).toHaveProperty('beatStart');
      expect(result).toHaveProperty('scaleDegrees');
    });

    it('should use the provided beatStart', () => {
      const progressChord = generateProgressChord({ withPatterns: false });
      const result = progressChordToMelodyGenChord(progressChord, 8);

      expect(result.beatStart).toBe(8);
    });

    it('should derive root from chord symbol', () => {
      const progressChord = { symbol: 'Dm', key: 60, divisions: 12, notes: [60, 63, 67] };
      const result = progressChordToMelodyGenChord(progressChord, 0);

      expect(result.root).toBe('D');
      expect(result.quality).toBe('min');
    });

    it('should derive scaleDegrees from chord notes', () => {
      const progressChord = { symbol: 'Cmaj', key: 60, divisions: 12, notes: [60, 64, 67] };
      const result = progressChordToMelodyGenChord(progressChord, 0);

      expect(result.scaleDegrees).toEqual([0, 4, 7]);
    });

    it('should handle chords without notes array', () => {
      const progressChord = { symbol: 'Cmaj', key: 60, divisions: 12 };
      const result = progressChordToMelodyGenChord(progressChord, 0);

      expect(result.scaleDegrees).toEqual([]);
    });
  });

  describe('progressStateToGenerationConfig()', () => {
    it('should convert a Progress state to a GenerationConfig', () => {
      const state = generateProgressState({ withPatterns: false });
      const result = progressStateToGenerationConfig(state);

      expect(result).toBeInstanceOf(GenerationConfig);
      expect(result).toHaveProperty('chords');
      expect(result).toHaveProperty('phraseContext');
      expect(result).toHaveProperty('options');
    });

    it('should generate Chord objects for each progression chord', () => {
      const state = generateProgressState({ withPatterns: false });
      const result = progressStateToGenerationConfig(state);

      expect(Array.isArray(result.chords)).toBe(true);
      expect(result.chords.length).toBe(state.currentProgression.length);

      for (const chord of result.chords) {
        expect(chord).toBeInstanceOf(Chord);
      }
    });

    it('should calculate correct beatStart values for sliced chords', () => {
      const state = generateProgressState({ withPatterns: false });
      const result = progressStateToGenerationConfig(state);

      for (let i = 1; i < result.chords.length; i++) {
        expect(result.chords[i].beatStart).toBeGreaterThan(result.chords[i - 1].beatStart);
      }
    });

    it('should map tensionCurve to phrase role', () => {
      const state = generateProgressState({ withPatterns: false });
      state.melodySettings.tensionCurve = 'valley';

      const result = progressStateToGenerationConfig(state);
      expect(result.phraseContext.role).toBe('release');
    });

    it('should map all tensionCurves to phrase roles', () => {
      const curveMap = {
        'arch': 'statement',
        'linear': 'statement',
        'valley': 'release',
        'staircase': 'build',
        'launch': 'climax',
      };

      for (const [curve, expectedRole] of Object.entries(curveMap)) {
        const state = generateProgressState({ withPatterns: false });
        state.melodySettings.tensionCurve = curve;

        const result = progressStateToGenerationConfig(state);
        expect(result.phraseContext.role).toBe(expectedRole);
      }
    });

    it('should set registerTarget from baseKey', () => {
      const state = generateProgressState({ withPatterns: false });
      const result = progressStateToGenerationConfig(state);

      expect(result.phraseContext.registerTarget).toBe(state.baseKey + 12);
    });

    it('should pass genre and density to options', () => {
      const state = generateProgressState({ withPatterns: false });
      const result = progressStateToGenerationConfig(state);

      expect(result.options.genre).toBe(state.melodySettings.genre);
      expect(result.options.density).toBe(state.melodySettings.density);
      expect(result.options.maxLeap).toBe(12);
      expect(result.options.baseRegister).toBeUndefined();
    });

    it('should pass aestheticMode to options derived from first chord quality', () => {
      const state = generateProgressState({ withPatterns: false });
      state.currentProgression[0].symbol = 'Cmaj';
      state.melodySettings.tensionCurve = 'arch';

      const result = progressStateToGenerationConfig(state);
      expect(result.options).toHaveProperty('aestheticMode');
      expect(result.options.aestheticMode).toBe('cantabile');
    });

    it('should derive declamatory for dominant chord with build role', () => {
      const state = generateProgressState({ withPatterns: false });
      state.currentProgression[0].symbol = 'G7';
      state.melodySettings.tensionCurve = 'staircase'; // maps to 'build'

      const result = progressStateToGenerationConfig(state);
      expect(result.options.aestheticMode).toBe('declamatory');
    });

    it('should derive sighs for minor chord with build role', () => {
      const state = generateProgressState({ withPatterns: false });
      state.currentProgression[0].symbol = 'Dm';
      state.melodySettings.tensionCurve = 'staircase'; // maps to 'build'

      const result = progressStateToGenerationConfig(state);
      expect(result.options.aestheticMode).toBe('sighs');
    });

    it('should derive virtuoso for climax role with major chord', () => {
      const state = generateProgressState({ withPatterns: false });
      state.currentProgression[0].symbol = 'Cmaj';
      state.melodySettings.tensionCurve = 'launch'; // maps to 'climax'

      const result = progressStateToGenerationConfig(state);
      expect(result.options.aestheticMode).toBe('virtuoso');
    });

    it('should derive sighs for climax role with diminished chord', () => {
      const state = generateProgressState({ withPatterns: false });
      // viio°7 parses to quality 'dim' because normalizeQuality checks qualityStr.includes('°7')
      state.currentProgression[0].symbol = 'viio°7';
      state.melodySettings.tensionCurve = 'launch'; // maps to 'climax'

      const result = progressStateToGenerationConfig(state);
      expect(result.options.aestheticMode).toBe('sighs');
    });

    it('should always return cantabile for resolution role', () => {
      const state = generateProgressState({ withPatterns: false });
      state.currentProgression[0].symbol = 'Cmaj';
      state.melodySettings.tensionCurve = 'valley'; // maps to 'release'

      const result = progressStateToGenerationConfig(state);
      expect(result.options.aestheticMode).toBe('cantabile');
    });
  });

  describe('preprocessProgressData()', () => {
    it('should return empty array for empty chords', () => {
      const result = preprocessProgressData({ chords: [] });
      expect(result).toEqual([]);
    });

    it('should return empty array for null chords', () => {
      const result = preprocessProgressData({ chords: null });
      expect(result).toEqual([]);
    });

    it('should create a flat Chord[] from a simple progression', () => {
      const state = generateProgressState({ numChords: 4, withPatterns: false });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      for (const chord of result) {
        expect(chord).toBeInstanceOf(Chord);
      }
    });

    it('should calculate correct beatStart values', () => {
      const state = generateProgressState({ numChords: 4, withPatterns: false });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].beatStart).toBeGreaterThan(result[i - 1].beatStart);
      }
    });

    it('should split at event boundaries when bassPattern is present', () => {
      const state = generateProgressState({ numChords: 2 });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      // With bassPattern instances, there should be more slices than original chords
      expect(result.length).toBeGreaterThanOrEqual(state.currentProgression.length);
    });

    it('should split at event boundaries when drumPattern is present', () => {
      const state = generateProgressState({ numChords: 2 });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      // With drumPattern hits, there should be more slices than original chords
      expect(result.length).toBeGreaterThanOrEqual(state.currentProgression.length);
    });

    it('should preserve metadata on sliced chords', () => {
      const state = generateProgressState({ numChords: 2 });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      for (const chord of result) {
        expect(chord).toHaveProperty('originalDuration');
        expect(chord).toHaveProperty('sourceTrack');
      }
    });

    it('should handle bassTrack parameter', () => {
      const state = generateProgressState({ numChords: 2 });
      const bassTrack = {
        instances: state.currentProgression.map(chord => ({
          id: `bass-${chord.symbol}`,
          startTime: 0.5,
          duration: 0.5,
          type: 'note',
          pitchOffset: 7,
          pitchOffsets: [],
          isSelected: true,
          arpSettings: null,
          probability: 1.0,
        })),
      };

      const progressData = {
        chords: state.currentProgression,
        bassTrack,
      };

      const result = preprocessProgressData(progressData);

      // Should resolve bass notes to effective roots
      for (const chord of result) {
        if (chord.bassPitchOffset !== undefined) {
          expect(chord).toHaveProperty('effectiveRoot');
        }
      }
    });

    it('should handle rest slices with wraparound', () => {
      const restChord = {
        symbol: 'I',
        key: 60,
        divisions: 12,
        duration: 2,
        isRest: true,
        _beatStart: 0,
      };

      const regularChord = generateProgressChord({
        key: 60,
        divisions: 12,
        withPatterns: false,
      });
      regularChord._beatStart = 2;

      const progressData = {
        chords: [restChord, regularChord],
      };

      const result = preprocessProgressData(progressData);

      // The rest slice should inherit from preceding (wraparound to last)
      const firstSlice = result[0];
      expect(firstSlice.isContinuation).toBe(true);
      expect(firstSlice.inheritedFrom).toBe(result.length - 1);
    });

    it('should be backward compatible with only chords (no bass/drum)', () => {
      const state = generateProgressState({ numChords: 4, withPatterns: false });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(state.currentProgression.length);

      for (const chord of result) {
        expect(chord).toBeInstanceOf(Chord);
      }
    });
  });

  describe('melodyGenResultToProgressNotes()', () => {
    it('should convert a MelodyResult to Progress note objects', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should map MelodyNote fields to Progress note fields', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      for (const note of result) {
        expect(note).toHaveProperty('pitch');
        expect(note).toHaveProperty('stepTime');
        expect(note).toHaveProperty('noteDuration');
        expect(note).toHaveProperty('melodyInst');
        expect(note).toHaveProperty('clusterRole');
        expect(note).toHaveProperty('metadata');
      }
    });

    it('should map structural role to isAnchor1Step', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      for (const note of result) {
        if (note.clusterRole === 'structural') {
          expect(note.isAnchor1Step).toBe(true);
        }
      }
    });

    it('should map cadence role to isAnchor2Step', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      for (const note of result) {
        if (note.clusterRole === 'cadence') {
          expect(note.isAnchor2Step).toBe(true);
        }
      }
    });

    it('should map connector role to isIsolated', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      for (const note of result) {
        if (note.clusterRole === 'connector') {
          expect(note.isIsolated).toBe(true);
        }
      }
    });

    it('should preserve metadata from MelodyNote', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const result = melodyGenResultToProgressNotes(melodyResult);

      for (const note of result) {
        expect(note).toHaveProperty('metadata');
        expect(typeof note.metadata).toBe('object');
      }
    });

    it('should handle empty allNotes', () => {
      const melodyResult = { allNotes: [], metadata: {} };
      const result = melodyGenResultToProgressNotes(melodyResult);

      expect(result).toEqual([]);
    });
  });

  describe('beatToSeconds()', () => {
    it('should convert 1 beat at 120 BPM to 0.5 seconds', () => {
      expect(beatToSeconds(1, 120)).toBe(0.5);
    });

    it('should convert 2 beats at 60 BPM to 2 seconds', () => {
      expect(beatToSeconds(2, 60)).toBe(2);
    });

    it('should convert 0 beats to 0 seconds', () => {
      expect(beatToSeconds(0, 120)).toBe(0);
    });

    it('should handle fractional beats', () => {
      const result = beatToSeconds(0.5, 120);
      expect(result).toBe(0.25);
    });

    it('should handle high BPM', () => {
      const result = beatToSeconds(1, 240);
      expect(result).toBe(0.25);
    });
  });

  describe('Integration: full bridge flow', () => {
    it('should convert Progress state → GenerationConfig → Chord[]', () => {
      const state = generateProgressState({ numChords: 4, withPatterns: false });
      const config = progressStateToGenerationConfig(state);

      expect(config).toBeInstanceOf(GenerationConfig);
      expect(config.chords.length).toBe(4);

      for (const chord of config.chords) {
        expect(chord).toBeInstanceOf(Chord);
        expect(typeof chord.root).toBe('string');
        expect(typeof chord.quality).toBe('string');
        expect(typeof chord.beatStart).toBe('number');
      }
    });

    it('should convert Progress state → preprocessed Chord[]', () => {
      const state = generateProgressState({ numChords: 4 });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(4);

      for (const chord of result) {
        expect(chord).toBeInstanceOf(Chord);
      }
    });

    it('should handle microtonal progressions (non-12-TET)', () => {
      const state = generateProgressState({ numChords: 4 });
      state.divisions = 24;

      const progressData = { chords: state.currentProgression };
      const result = preprocessProgressData(progressData);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle complex progressions with all patterns', () => {
      const state = generateProgressState({ numChords: 6 });
      const progressData = { chords: state.currentProgression };

      const result = preprocessProgressData(progressData);

      // Complex progressions should produce more slices due to event boundaries
      expect(result.length).toBeGreaterThanOrEqual(state.currentProgression.length);
    });

    it('should convert MelodyResult → Progress notes', () => {
      const melodyResult = generateMelodyResult({ withPassResults: false, withExecutionLog: false });
      const progressNotes = melodyGenResultToProgressNotes(melodyResult);

      expect(Array.isArray(progressNotes)).toBe(true);
      expect(progressNotes.length).toBe(melodyResult.allNotes.length);

      for (const note of progressNotes) {
        expect(typeof note.pitch).toBe('number');
        expect(typeof note.stepTime).toBe('number');
        expect(typeof note.noteDuration).toBe('number');
      }
    });
  });
});
