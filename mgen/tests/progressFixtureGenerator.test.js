// Tests for progressFixtureGenerator.js
// Validates that all generated fixtures conform to the Progress app data format
// documented in progress_data_analysis.md and melodygen_progress_bridge.md.

import {
  generateProgressChord,
  generateProgressState,
  generateMelodyNotes,
  generateMelodyResult,
  generatePhraseContext,
  generateMgenChords,
  generateProgressWithRestAtStart,
  generateMicrotonalProgress,
  generateEmptyProgression,
  generateComplexProgression,
  setSeed,
  generateChordNotes,
  generateChordPattern,
  generateBassPattern,
  generateDrumPattern,
} from '../src/progressFixtureGenerator.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

describe('progressFixtureGenerator', () => {

  describe('generateProgressChord()', () => {
    it('should generate a chord with all required fields', () => {
      const chord = generateProgressChord();

      expect(chord).toHaveProperty('symbol');
      expect(chord).toHaveProperty('key');
      expect(chord).toHaveProperty('divisions');
      expect(chord).toHaveProperty('duration');
      expect(chord).toHaveProperty('inversionOffset');
      expect(chord).toHaveProperty('voicingType');
      expect(chord).toHaveProperty('voicing');
      expect(chord).toHaveProperty('customNotes');
    });

    it('should generate valid symbol values', () => {
      const validSymbols = [
        'I', 'i', 'ii', 'ii°', 'iii', 'III', 'IV', 'V', 'v', 'vi', 'VI', 'VII', 'iv', 'bVI', 'bVII',
        'Imaj7', 'i7', 'ii7', 'ii°7', 'iii7', 'IIImaj7', 'IVmaj7', 'v7', 'VImaj7', 'VII7', 'V7', 'vi7',
        'Imaj9', 'IVmaj9', 'ii9', 'ii11', 'V9', 'V11', 'Vsus4', 'V7sus4', 'V7#9', 'V7b13', 'iv7', 'bVImaj7', 'bVII7',
      ];

      for (let i = 0; i < 50; i++) {
        const chord = generateProgressChord();
        expect(validSymbols).toContain(chord.symbol);
      }
    });

    it('should generate valid key (MIDI) values', () => {
      for (let i = 0; i < 20; i++) {
        const chord = generateProgressChord();
        expect(chord.key).toBeGreaterThanOrEqual(36);
        expect(chord.key).toBeLessThanOrEqual(84);
      }
    });

    it('should generate valid divisions values', () => {
      const validDivisions = [12, 19, 24, 31, 72];

      for (let i = 0; i < 50; i++) {
        const chord = generateProgressChord();
        expect(validDivisions).toContain(chord.divisions);
      }
    });

    it('should generate valid duration (>= 1)', () => {
      for (let i = 0; i < 20; i++) {
        const chord = generateProgressChord();
        expect(chord.duration).toBeGreaterThanOrEqual(1);
        expect(chord.duration).toBeLessThanOrEqual(4);
      }
    });

    it('should respect forced symbol parameter', () => {
      const chord = generateProgressChord({ symbol: 'V7' });
      expect(chord.symbol).toBe('V7');
    });

    it('should respect forced key parameter', () => {
      const chord = generateProgressChord({ key: 72 });
      expect(chord.key).toBe(72);
    });

    it('should respect forced divisions parameter', () => {
      const chord = generateProgressChord({ divisions: 24 });
      expect(chord.divisions).toBe(24);
    });

    it('should respect forced duration parameter', () => {
      const chord = generateProgressChord({ duration: 3 });
      expect(chord.duration).toBe(3);
    });

    it('should include pattern data by default', () => {
      const chord = generateProgressChord();
      expect(chord).toHaveProperty('chordPattern');
      expect(chord).toHaveProperty('bassPattern');
      expect(chord).toHaveProperty('drumPattern');
    });

    it('should omit pattern data when withPatterns=false', () => {
      const chord = generateProgressChord({ withPatterns: false });
      expect(chord).not.toHaveProperty('chordPattern');
      expect(chord).not.toHaveProperty('bassPattern');
      expect(chord).not.toHaveProperty('drumPattern');
    });

    it('should mark rest chords with isRest flag', () => {
      const chord = generateProgressChord({ isRest: true });
      expect(chord.isRest).toBe(true);
    });

    it('should not mark non-rest chords with isRest flag', () => {
      const chord = generateProgressChord({ isRest: false });
      expect(chord.isRest).toBeUndefined();
    });

    it('should generate inversionOffset in valid range', () => {
      for (let i = 0; i < 20; i++) {
        const chord = generateProgressChord();
        expect(chord.inversionOffset).toBeGreaterThanOrEqual(0);
        expect(chord.inversionOffset).toBeLessThanOrEqual(3);
      }
    });

    it('should generate valid voicingType values', () => {
      const validVoicingTypes = ['global', 'auto', 'close', 'spread', 'quartal'];

      for (let i = 0; i < 50; i++) {
        const chord = generateProgressChord();
        expect(validVoicingTypes).toContain(chord.voicingType);
      }
    });
  });

  describe('generateChordNotes()', () => {
    it('should generate 3-5 notes for a chord', () => {
      for (let i = 0; i < 20; i++) {
        const notes = generateChordNotes(60, 12);
        expect(notes.length).toBeGreaterThanOrEqual(3);
        expect(notes.length).toBeLessThanOrEqual(5);
      }
    });

    it('should include the root note as the first note', () => {
      for (let i = 0; i < 20; i++) {
        const notes = generateChordNotes(60, 12);
        expect(notes[0]).toBe(60);
      }
    });

    it('should sort notes in ascending order', () => {
      for (let i = 0; i < 20; i++) {
        const notes = generateChordNotes(60, 12);
        for (let j = 1; j < notes.length; j++) {
          expect(notes[j]).toBeGreaterThan(notes[j - 1]);
        }
      }
    });

    it('should respect EDO divisions for microtonal chords', () => {
      const notes12 = generateChordNotes(60, 12);
      // 12-TET notes should be integers
      notes12.forEach(n => {
        expect(Number.isInteger(n)).toBe(true);
      });
    });

    it('should generate notes around the root key', () => {
      for (let i = 0; i < 20; i++) {
        const root = randInt(48, 72);
        const notes = generateChordNotes(root, 12);
        notes.forEach(n => {
          expect(n).toBeGreaterThanOrEqual(root);
          expect(n).toBeLessThanOrEqual(root + 12);
        });
      }
    });
  });

  describe('generateChordPattern()', () => {
    it('should generate a valid chordPattern object', () => {
      const pattern = generateChordPattern(4);

      expect(pattern).toHaveProperty('isLocalOverride');
      expect(pattern).toHaveProperty('avoidKick');
      expect(pattern).toHaveProperty('generative');
      expect(pattern).toHaveProperty('transitions');
      expect(pattern).toHaveProperty('instances');
      expect(Array.isArray(pattern.instances)).toBe(true);
    });

    it('should generate instances with valid fields', () => {
      const pattern = generateChordPattern(4);

      for (const instance of pattern.instances) {
        expect(instance).toHaveProperty('id');
        expect(instance).toHaveProperty('startTime');
        expect(instance).toHaveProperty('duration');
        expect(instance).toHaveProperty('type');
        expect(instance).toHaveProperty('pitchOffset');
        expect(instance).toHaveProperty('pitchOffsets');
        expect(instance).toHaveProperty('isSelected');
        expect(instance).toHaveProperty('arpSettings');
        expect(instance).toHaveProperty('probability');
      }
    });

    it('should generate normalized startTime values (0-1)', () => {
      for (let i = 0; i < 20; i++) {
        const pattern = generateChordPattern(4);
        for (const instance of pattern.instances) {
          expect(instance.startTime).toBeGreaterThanOrEqual(0);
          expect(instance.startTime).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should generate valid type values', () => {
      const validTypes = ['chord', 'note'];

      for (let i = 0; i < 20; i++) {
        const pattern = generateChordPattern(4);
        for (const instance of pattern.instances) {
          expect(validTypes).toContain(instance.type);
        }
      }
    });

    it('should generate valid arpSettings when present', () => {
      for (let i = 0; i < 50; i++) {
        const pattern = generateChordPattern(4);
        const arpInstances = pattern.instances.filter(inst => inst.arpSettings !== null);

        for (const arp of arpInstances) {
          expect(arp.arpSettings).toHaveProperty('style');
          expect(arp.arpSettings).toHaveProperty('rate');
          expect(arp.arpSettings).toHaveProperty('gate');
          expect(['up', 'down', 'random', 'arpeggiated']).toContain(arp.arpSettings.style);
          expect(arp.arpSettings.rate).toBeGreaterThanOrEqual(0.125);
          expect(arp.arpSettings.rate).toBeLessThanOrEqual(0.5);
          expect(arp.arpSettings.gate).toBeGreaterThanOrEqual(0.5);
          expect(arp.arpSettings.gate).toBeLessThanOrEqual(0.95);
        }
      }
    });
  });

  describe('generateBassPattern()', () => {
    it('should generate a valid bassPattern object', () => {
      const pattern = generateBassPattern(4);

      expect(pattern).toHaveProperty('isLocalOverride');
      expect(pattern).toHaveProperty('avoidKick');
      expect(pattern).toHaveProperty('generative');
      expect(pattern).toHaveProperty('transitions');
      expect(pattern).toHaveProperty('instances');
    });

    it('should generate bass instances with pitchOffset in valid range', () => {
      for (let i = 0; i < 20; i++) {
        const pattern = generateBassPattern(4);
        for (const instance of pattern.instances) {
          expect(instance.pitchOffset).toBeGreaterThanOrEqual(-12);
          expect(instance.pitchOffset).toBeLessThanOrEqual(7);
        }
      }
    });

    it('should always have null arpSettings for bass', () => {
      for (let i = 0; i < 20; i++) {
        const pattern = generateBassPattern(4);
        for (const instance of pattern.instances) {
          expect(instance.arpSettings).toBeNull();
        }
      }
    });

    it('should generate valid generative mode values', () => {
      const validModes = ['off', 'walking', 'rhythmInformed'];

      for (let i = 0; i < 20; i++) {
        const pattern = generateBassPattern(4);
        expect(validModes).toContain(pattern.generative.mode);
      }
    });
  });

  describe('generateDrumPattern()', () => {
    it('should generate a valid drumPattern object', () => {
      const pattern = generateDrumPattern(4);

      expect(pattern).toHaveProperty('isLocalOverride');
      expect(pattern).toHaveProperty('lengthBeats');
      expect(pattern).toHaveProperty('hits');
      expect(Array.isArray(pattern.hits)).toBe(true);
    });

    it('should generate hits with valid fields', () => {
      const pattern = generateDrumPattern(4);

      for (const hit of pattern.hits) {
        expect(hit).toHaveProperty('id');
        expect(hit).toHaveProperty('time');
        expect(hit).toHaveProperty('row');
        expect(hit).toHaveProperty('velocity');
        expect(hit).toHaveProperty('probability');
      }
    });

    it('should generate valid drum row values', () => {
      const validRows = ['kick', 'snare', 'chh', 'ohh'];

      for (let i = 0; i < 20; i++) {
        const pattern = generateDrumPattern(4);
        for (const hit of pattern.hits) {
          expect(validRows).toContain(hit.row);
        }
      }
    });

    it('should generate hits sorted by time', () => {
      for (let i = 0; i < 20; i++) {
        const pattern = generateDrumPattern(4);
        for (let j = 1; j < pattern.hits.length; j++) {
          expect(pattern.hits[j].time).toBeGreaterThanOrEqual(pattern.hits[j - 1].time);
        }
      }
    });

    it('should generate valid velocity values (0.3-1.0)', () => {
      for (let i = 0; i < 20; i++) {
        const pattern = generateDrumPattern(4);
        for (const hit of pattern.hits) {
          expect(hit.velocity).toBeGreaterThanOrEqual(0.3);
          expect(hit.velocity).toBeLessThanOrEqual(1.0);
        }
      }
    });

    it('should sometimes generate empty hits array', () => {
      let emptyCount = 0;
      for (let i = 0; i < 50; i++) {
        const pattern = generateDrumPattern(4);
        if (pattern.hits.length === 0) emptyCount++;
      }
      expect(emptyCount).toBeGreaterThan(0);
    });
  });

  describe('generateProgressState()', () => {
    it('should generate a complete state object with all top-level fields', () => {
      const state = generateProgressState();

      expect(state).toHaveProperty('baseKey');
      expect(state).toHaveProperty('bpm');
      expect(state).toHaveProperty('divisions');
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('melodySettings');
      expect(state).toHaveProperty('currentProgression');
    });

    it('should generate valid baseKey values', () => {
      const validKeys = [48, 51, 54, 57, 60, 63, 66, 69, 72];

      for (let i = 0; i < 50; i++) {
        const state = generateProgressState();
        expect(validKeys).toContain(state.baseKey);
      }
    });

    it('should generate valid BPM values (60-200)', () => {
      for (let i = 0; i < 20; i++) {
        const state = generateProgressState();
        expect(state.bpm).toBeGreaterThanOrEqual(60);
        expect(state.bpm).toBeLessThanOrEqual(200);
      }
    });

    it('should generate valid mode values', () => {
      const validModes = ['major', 'minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'wholeTone', 'diminishedWH', 'altered'];

      for (let i = 0; i < 50; i++) {
        const state = generateProgressState();
        expect(validModes).toContain(state.mode);
      }
    });

    it('should generate melodySettings with all required fields', () => {
      const state = generateProgressState();
      const ms = state.melodySettings;

      expect(ms).toHaveProperty('enabled');
      expect(ms).toHaveProperty('genre');
      expect(ms).toHaveProperty('motifRecurrence');
      expect(ms).toHaveProperty('variationDepth');
      expect(ms).toHaveProperty('density');
      expect(ms).toHaveProperty('restProbability');
      expect(ms).toHaveProperty('ornamentIntensity');
      expect(ms).toHaveProperty('countermelodyEnabled');
      expect(ms).toHaveProperty('countermelodyMode');
      expect(ms).toHaveProperty('behaviorDuringArp');
      expect(ms).toHaveProperty('behaviorDuringTransitions');
      expect(ms).toHaveProperty('tensionCurve');
      expect(ms).toHaveProperty('seedSource');
      expect(ms).toHaveProperty('activeMotifId');
      expect(ms).toHaveProperty('midiExtractionMode');
      expect(ms).toHaveProperty('macroPlannerEnabled');
      expect(ms).toHaveProperty('macroContourArchetype');
      expect(ms).toHaveProperty('shortestNoteLimit');
    });

    it('should generate valid tensionCurve values', () => {
      const validCurves = ['arch', 'linear', 'valley', 'staircase', 'launch'];

      for (let i = 0; i < 50; i++) {
        const state = generateProgressState();
        expect(validCurves).toContain(state.melodySettings.tensionCurve);
      }
    });

    it('should generate valid shortestNoteLimit values', () => {
      const validLimits = [16, 32, 64];

      for (let i = 0; i < 50; i++) {
        const state = generateProgressState();
        expect(validLimits).toContain(state.melodySettings.shortestNoteLimit);
      }
    });

    it('should generate currentProgression as array of valid chords', () => {
      const state = generateProgressState();

      expect(Array.isArray(state.currentProgression)).toBe(true);
      expect(state.currentProgression.length).toBeGreaterThanOrEqual(4);
      expect(state.currentProgression.length).toBeLessThanOrEqual(8);

      for (const chord of state.currentProgression) {
        expect(chord).toHaveProperty('symbol');
        expect(chord).toHaveProperty('key');
        expect(chord).toHaveProperty('divisions');
        expect(chord).toHaveProperty('duration');
      }
    });

    it('should respect forced parameters', () => {
      const state = generateProgressState({
        numChords: 6,
        baseKey: 72,
        mode: 'dorian',
        bpm: 140,
      });

      expect(state.currentProgression.length).toBe(6);
      expect(state.baseKey).toBe(72);
      expect(state.mode).toBe('dorian');
      expect(state.bpm).toBe(140);
    });

    it('should include sections when withSections=true', () => {
      const state = generateProgressState({ withSections: true });

      expect(state).toHaveProperty('sections');
      expect(Array.isArray(state.sections)).toBe(true);
      expect(state.sections.length).toBeGreaterThanOrEqual(2);
      expect(state.sections.length).toBeLessThanOrEqual(4);

      expect(state).toHaveProperty('songSequence');
      expect(state).toHaveProperty('activeSectionId');
      expect(state).toHaveProperty('loopStart');
      expect(state).toHaveProperty('loopEnd');
    });

    it('should not include sections when withSections=false (default)', () => {
      const state = generateProgressState({ withSections: false });
      expect(state.sections).toBeUndefined();
    });

    it('should generate valid volumes object', () => {
      const state = generateProgressState();

      expect(state).toHaveProperty('volumes');
      expect(state.volumes).toHaveProperty('chords');
      expect(state.volumes).toHaveProperty('bass');
      expect(state.volumes).toHaveProperty('bassHarmonic');
      expect(state.volumes).toHaveProperty('drums');
      expect(state.volumes).toHaveProperty('melody');
      expect(state.volumes).toHaveProperty('countermelody');

      for (const value of Object.values(state.volumes)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('should generate valid instruments object', () => {
      const state = generateProgressState();

      expect(state).toHaveProperty('instruments');
      expect(state.instruments).toHaveProperty('chords');
      expect(state.instruments).toHaveProperty('bass');
      expect(state.instruments).toHaveProperty('bassSecondary');
      expect(state.instruments).toHaveProperty('melody');
      expect(state.instruments).toHaveProperty('countermelody');

      const validInstruments = ['sawtooth', 'square', 'triangle', 'sine', 'noise'];
      for (const value of Object.values(state.instruments)) {
        expect(validInstruments).toContain(value);
      }
    });
  });

  describe('generateMelodyNotes()', () => {
    it('should generate an array of note objects', () => {
      const notes = generateMelodyNotes();
      expect(Array.isArray(notes)).toBe(true);
      expect(notes.length).toBeGreaterThanOrEqual(8);
      expect(notes.length).toBeLessThanOrEqual(20);
    });

    it('should generate notes with all required fields', () => {
      const notes = generateMelodyNotes();

      for (const note of notes) {
        expect(note).toHaveProperty('pitch');
        expect(note).toHaveProperty('startTime');
        expect(note).toHaveProperty('duration');
        expect(note).toHaveProperty('role');
      }
    });

    it('should generate notes sorted by startTime', () => {
      for (let i = 0; i < 10; i++) {
        const notes = generateMelodyNotes();
        for (let j = 1; j < notes.length; j++) {
          expect(notes[j].startTime).toBeGreaterThanOrEqual(notes[j - 1].startTime);
        }
      }
    });

    it('should generate valid role values', () => {
      const validRoles = ['structural', 'cadence', 'connector', 'ornament', 'expectation'];

      for (let i = 0; i < 20; i++) {
        const notes = generateMelodyNotes();
        for (const note of notes) {
          expect(validRoles).toContain(note.role);
        }
      }
    });

    it('should generate valid pitch values (48-96)', () => {
      for (let i = 0; i < 20; i++) {
        const notes = generateMelodyNotes();
        for (const note of notes) {
          expect(note.pitch).toBeGreaterThanOrEqual(48);
          expect(note.pitch).toBeLessThanOrEqual(96);
        }
      }
    });

    it('should respect forced numNotes parameter', () => {
      const notes = generateMelodyNotes({ numNotes: 15 });
      expect(notes.length).toBe(15);
    });

    it('should respect forced totalDuration parameter', () => {
      const notes = generateMelodyNotes({ totalDuration: 32 });
      const maxStart = Math.max(...notes.map(n => n.startTime));
      expect(maxStart).toBeLessThanOrEqual(32);
    });

    it('should respect forced baseKey parameter', () => {
      const notes = generateMelodyNotes({ baseKey: 72 });
      for (const note of notes) {
        expect(note.pitch).toBeGreaterThanOrEqual(60);
        expect(note.pitch).toBeLessThanOrEqual(96);
      }
    });

    it('should respect forced roles parameter', () => {
      const notes = generateMelodyNotes({ roles: ['structural', 'cadence'] });
      for (const note of notes) {
        expect(['structural', 'cadence']).toContain(note.role);
      }
    });

    it('should omit metadata when withMetadata=false', () => {
      const notes = generateMelodyNotes({ withMetadata: false });
      for (const note of notes) {
        expect(note.metadata).toBeUndefined();
      }
    });

    it('should include metadata when withMetadata=true (default)', () => {
      const notes = generateMelodyNotes({ withMetadata: true });
      for (const note of notes) {
        expect(note).toHaveProperty('metadata');
        expect(typeof note.metadata).toBe('object');
      }
    });
  });

  describe('generatePhraseContext()', () => {
    it('should generate a valid PhraseContext object', () => {
      const ctx = generatePhraseContext();

      expect(ctx).toHaveProperty('role');
      expect(ctx).toHaveProperty('tensionLevel');
      expect(ctx).toHaveProperty('registerTarget');
      expect(ctx).toHaveProperty('isAntecedent');
    });

    it('should generate valid role values', () => {
      const validRoles = ['statement', 'build', 'climax', 'release', 'resolution', 'antecedent', 'consequent'];

      for (let i = 0; i < 50; i++) {
        const ctx = generatePhraseContext();
        expect(validRoles).toContain(ctx.role);
      }
    });

    it('should generate tensionLevel in range 0.1-0.95', () => {
      for (let i = 0; i < 20; i++) {
        const ctx = generatePhraseContext();
        expect(ctx.tensionLevel).toBeGreaterThanOrEqual(0.1);
        expect(ctx.tensionLevel).toBeLessThanOrEqual(0.95);
      }
    });

    it('should respect forced parameters', () => {
      const ctx = generatePhraseContext({
        role: 'climax',
        tensionLevel: 0.75,
        registerTarget: 72,
        isAntecedent: true,
      });

      expect(ctx.role).toBe('climax');
      expect(ctx.tensionLevel).toBe(0.75);
      expect(ctx.registerTarget).toBe(72);
      expect(ctx.isAntecedent).toBe(true);
    });

    it('should sometimes generate null registerTarget', () => {
      let nullCount = 0;
      for (let i = 0; i < 50; i++) {
        const ctx = generatePhraseContext();
        if (ctx.registerTarget === null) nullCount++;
      }
      expect(nullCount).toBeGreaterThan(0);
    });

    it('should sometimes generate antecedent=true', () => {
      let antCount = 0;
      for (let i = 0; i < 50; i++) {
        const ctx = generatePhraseContext();
        if (ctx.isAntecedent === true) antCount++;
      }
      expect(antCount).toBeGreaterThan(0);
    });
  });

  describe('generateMgenChords()', () => {
    it('should generate an array of Chord objects', () => {
      const chords = generateMgenChords();
      expect(Array.isArray(chords)).toBe(true);
      expect(chords.length).toBeGreaterThanOrEqual(2);
      expect(chords.length).toBeLessThanOrEqual(6);
    });

    it('should generate chords with all required fields', () => {
      const chords = generateMgenChords();

      for (const chord of chords) {
        expect(chord).toHaveProperty('root');
        expect(chord).toHaveProperty('quality');
        expect(chord).toHaveProperty('beatStart');
        expect(chord).toHaveProperty('scaleDegrees');
      }
    });

    it('should generate valid root note values', () => {
      const validRoots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

      for (let i = 0; i < 20; i++) {
        const chords = generateMgenChords();
        for (const chord of chords) {
          expect(validRoots).toContain(chord.root);
        }
      }
    });

    it('should generate valid quality values', () => {
      const validQualities = ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'min7'];

      for (let i = 0; i < 20; i++) {
        const chords = generateMgenChords();
        for (const chord of chords) {
          expect(validQualities).toContain(chord.quality);
        }
      }
    });

    it('should generate increasing beatStart values', () => {
      for (let i = 0; i < 20; i++) {
        const chords = generateMgenChords();
        for (let j = 1; j < chords.length; j++) {
          expect(chords[j].beatStart).toBeGreaterThan(chords[j - 1].beatStart);
        }
      }
    });

    it('should respect forced count parameter', () => {
      const chords = generateMgenChords({ count: 5 });
      expect(chords.length).toBe(5);
    });

    it('should respect forced startBeat parameter', () => {
      const chords = generateMgenChords({ startBeat: 8 });
      expect(chords[0].beatStart).toBe(8);
    });

    it('should generate valid scaleDegrees (0-11, sorted, unique)', () => {
      for (let i = 0; i < 20; i++) {
        const chords = generateMgenChords();
        for (const chord of chords) {
          expect(Array.isArray(chord.scaleDegrees)).toBe(true);
          expect(chord.scaleDegrees.length).toBeGreaterThanOrEqual(3);
          expect(chord.scaleDegrees.length).toBeLessThanOrEqual(4);

          for (const deg of chord.scaleDegrees) {
            expect(deg).toBeGreaterThanOrEqual(0);
            expect(deg).toBeLessThanOrEqual(11);
          }

          // Check sorted
          for (let j = 1; j < chord.scaleDegrees.length; j++) {
            expect(chord.scaleDegrees[j]).toBeGreaterThan(chord.scaleDegrees[j - 1]);
          }

          // Check unique
          const unique = new Set(chord.scaleDegrees);
          expect(unique.size).toBe(chord.scaleDegrees.length);
        }
      }
    });
  });

  describe('generateMelodyResult()', () => {
    it('should generate a valid MelodyResult object', () => {
      const result = generateMelodyResult();

      expect(result).toHaveProperty('allNotes');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.allNotes)).toBe(true);
    });

    it('should generate metadata with all required fields', () => {
      const result = generateMelodyResult();

      expect(result.metadata).toHaveProperty('phraseContext');
      expect(result.metadata).toHaveProperty('chords');
      expect(result.metadata).toHaveProperty('originalNoteCount');
      expect(result.metadata).toHaveProperty('finalNoteCount');
    });

    it('should generate passResults when withPassResults=true', () => {
      const result = generateMelodyResult({ withPassResults: true });

      expect(result.metadata).toHaveProperty('passResults');
      expect(Array.isArray(result.metadata.passResults)).toBe(true);
      expect(result.metadata.passResults.length).toBe(8); // 5 passes + 3 engines
    });

    it('should omit passResults when withPassResults=false', () => {
      const result = generateMelodyResult({ withPassResults: false });
      expect(result.metadata.passResults).toBeUndefined();
    });

    it('should generate executionLog when withExecutionLog=true', () => {
      const result = generateMelodyResult({ withExecutionLog: true });

      expect(result.metadata).toHaveProperty('executionLog');
      expect(Array.isArray(result.metadata.executionLog)).toBe(true);

      for (const entry of result.metadata.executionLog) {
        expect(entry).toHaveProperty('passName');
        expect(entry).toHaveProperty('score');
        expect(entry).toHaveProperty('issues');
        expect(entry).toHaveProperty('noteCount');
      }
    });

    it('should omit executionLog when withExecutionLog=false', () => {
      const result = generateMelodyResult({ withExecutionLog: false });
      expect(result.metadata.executionLog).toBeUndefined();
    });

    it('should generate valid PassResult objects', () => {
      const result = generateMelodyResult({ withPassResults: true });

      for (const pr of result.metadata.passResults) {
        expect(pr).toHaveProperty('passName');
        expect(pr).toHaveProperty('notes');
        expect(pr).toHaveProperty('metrics');
        expect(pr).toHaveProperty('context');
        expect(pr).toHaveProperty('success');
      }
    });

    it('should generate valid metrics for each PassResult', () => {
      const result = generateMelodyResult({ withPassResults: true });

      for (const pr of result.metadata.passResults) {
        expect(pr.metrics).toHaveProperty('passName');
        expect(pr.metrics).toHaveProperty('score');
        expect(pr.metrics).toHaveProperty('issues');
        expect(pr.metrics).toHaveProperty('passesThreshold');
        expect(typeof pr.metrics.score).toBe('number');
        expect(Array.isArray(pr.metrics.issues)).toBe(true);
        expect(typeof pr.metrics.passesThreshold).toBe('boolean');
      }
    });

    it('should generate correct pass names for all 8 passes', () => {
      const result = generateMelodyResult({ withPassResults: true });
      const expectedNames = [
        'PassA_Structural',
        'PassB_Cadence',
        'PassC_Connector',
        'PassD_Ornament',
        'PassE_Expectation',
        'MotifEngine',
        'StyleEngine',
        'MicrotonalEngine',
      ];

      for (let i = 0; i < expectedNames.length; i++) {
        expect(result.metadata.passResults[i].passName).toBe(expectedNames[i]);
      }
    });

    it('should generate valid context per pass type', () => {
      const result = generateMelodyResult({ withPassResults: true });

      const passContexts = result.metadata.passResults.map(pr => pr.passName);

      // PassA context
      const passA = result.metadata.passResults.find(pr => pr.passName === 'PassA_Structural');
      expect(passA.context).toHaveProperty('phraseContext');
      expect(passA.context).toHaveProperty('chordCount');
      expect(passA.context).toHaveProperty('structuralNoteCount');

      // PassB context
      const passB = result.metadata.passResults.find(pr => pr.passName === 'PassB_Cadence');
      expect(passB.context).toHaveProperty('cadencePoints');
      expect(Array.isArray(passB.context.cadencePoints)).toBe(true);

      // PassE context
      const passE = result.metadata.passResults.find(pr => pr.passName === 'PassE_Expectation');
      expect(passE.context).toHaveProperty('callResponsePairs');
      expect(passE.context).toHaveProperty('originalNoteCount');
      expect(passE.context).toHaveProperty('finalNoteCount');
    });

    it('should respect forced chord and phraseContext parameters', () => {
      const chords = [{ root: 'C', quality: 'maj', beatStart: 0, scaleDegrees: [0, 4, 7] }];
      const phraseCtx = { role: 'climax', tensionLevel: 0.8, registerTarget: 72, isAntecedent: false };

      const result = generateMelodyResult({
        chords,
        phraseContext: phraseCtx,
      });

      expect(result.metadata.chords).toBe(chords);
      expect(result.metadata.phraseContext).toBe(phraseCtx);
    });

    it('should force failures when forceFailure=true', () => {
      const result = generateMelodyResult({ forceFailure: true });

      for (const pr of result.metadata.passResults) {
        expect(pr.success).toBe(false);
        expect(pr.metrics.score).toBeLessThan(0.5);
      }
    });
  });

  describe('Edge case generators', () => {

    describe('generateProgressWithRestAtStart()', () => {
      it('should generate a progression with a rest slice at the start', () => {
        const state = generateProgressWithRestAtStart();
        const firstChord = state.currentProgression[0];

        expect(firstChord.isRest).toBe(true);
        expect(state.currentProgression.length).toBeGreaterThan(1);
      });

      it('should respect forced numChords parameter', () => {
        const state = generateProgressWithRestAtStart({ numChords: 6 });
        // 1 rest + 6 regular = 7 total
        expect(state.currentProgression.length).toBe(7);
      });

      it('should respect forced baseKey and divisions', () => {
        const state = generateProgressWithRestAtStart({ baseKey: 72, divisions: 24 });
        expect(state.baseKey).toBe(72);
        expect(state.divisions).toBe(24);
      });
    });

    describe('generateMicrotonalProgress()', () => {
      it('should generate a progression with microtonal divisions', () => {
        const state = generateMicrotonalProgress();

        expect([24, 31, 72]).toContain(state.divisions);
        expect(state.currentProgression.length).toBeGreaterThanOrEqual(4);
      });

      it('should include customTuning for microtonal progressions', () => {
        const state = generateMicrotonalProgress();

        expect(state).toHaveProperty('customTuning');
        expect(state.customTuning).toHaveProperty('name');
        expect(state.customTuning).toHaveProperty('type');
        expect(state.customTuning).toHaveProperty('periodSize');
        expect(state.customTuning).toHaveProperty('divisions');
      });

      it('should respect forced divisions parameter', () => {
        const state = generateMicrotonalProgress({ divisions: 31 });
        expect(state.divisions).toBe(31);
      });
    });

    describe('generateEmptyProgression()', () => {
      it('should generate a state with empty currentProgression', () => {
        const state = generateEmptyProgression();

        expect(Array.isArray(state.currentProgression)).toBe(true);
        expect(state.currentProgression.length).toBe(0);
      });

      it('should have default values for all fields', () => {
        const state = generateEmptyProgression();

        expect(state.baseKey).toBe(60);
        expect(state.bpm).toBe(120);
        expect(state.divisions).toBe(12);
        expect(state.mode).toBe('major');
      });
    });

    describe('generateComplexProgression()', () => {
      it('should generate a progression with maximum complexity', () => {
        const state = generateComplexProgression();

        expect(state.currentProgression.length).toBeGreaterThanOrEqual(6);
        expect(state.currentProgression.length).toBeLessThanOrEqual(6); // default is 6

        // Each chord should have dense patterns
        for (const chord of state.currentProgression) {
          expect(chord.chordPattern.instances.length).toBeGreaterThanOrEqual(3);
          expect(chord.bassPattern.instances.length).toBeGreaterThanOrEqual(2);
          expect(chord.drumPattern.hits.length).toBeGreaterThanOrEqual(4);
        }
      });

      it('should include advanced melodySettings', () => {
        const state = generateComplexProgression();

        expect(state.melodySettings.macroPlannerEnabled).toBe(true);
        expect(state.melodySettings.countermelodyEnabled).toBe(true);
        expect(state.melodySettings.countermelodyMode).toBeDefined();
      });

      it('should include sections and songSequence', () => {
        const state = generateComplexProgression();

        expect(state).toHaveProperty('sections');
        expect(state).toHaveProperty('songSequence');
        expect(state).toHaveProperty('loopStart');
        expect(state).toHaveProperty('loopEnd');
      });

      it('should respect forced parameters', () => {
        const state = generateComplexProgression({ numChords: 8, baseKey: 72, bpm: 140 });
        expect(state.currentProgression.length).toBe(8);
        expect(state.baseKey).toBe(72);
        expect(state.bpm).toBe(140);
      });
    });
  });

  describe('setSeed() / deterministic generation', () => {
    it('should produce identical output with the same seed', () => {
      setSeed(42);
      const result1 = generateProgressState();

      setSeed(42);
      const result2 = generateProgressState();

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    it('should produce different output with different seeds', () => {
      setSeed(42);
      const result1 = generateProgressState();

      setSeed(99);
      const result2 = generateProgressState();

      expect(JSON.stringify(result1)).not.toBe(JSON.stringify(result2));
    });

    it('should produce deterministic chord fixtures', () => {
      setSeed(123);
      const chord1 = generateProgressChord();

      setSeed(123);
      const chord2 = generateProgressChord();

      expect(JSON.stringify(chord1)).toBe(JSON.stringify(chord2));
    });

    it('should produce deterministic melody notes', () => {
      setSeed(456);
      const notes1 = generateMelodyNotes({ numNotes: 10 });

      setSeed(456);
      const notes2 = generateMelodyNotes({ numNotes: 10 });

      expect(JSON.stringify(notes1)).toBe(JSON.stringify(notes2));
    });
  });

  describe('Integration: full bridge flow', () => {
    it('should generate a complete Progress state that can be bridged to MelodyGen', () => {
      const state = generateProgressState({ withSections: true });

      // Verify the state has all the data needed for bridging
      expect(state.currentProgression.length).toBeGreaterThan(0);

      for (const chord of state.currentProgression) {
        expect(chord).toHaveProperty('symbol');
        expect(chord).toHaveProperty('key');
        expect(chord).toHaveProperty('divisions');
        expect(chord).toHaveProperty('duration');
        expect(chord).toHaveProperty('chordPattern');
        expect(chord).toHaveProperty('bassPattern');
        expect(chord).toHaveProperty('drumPattern');
      }

      // Verify melodySettings has tensionCurve for PhraseContext mapping
      expect(state.melodySettings).toHaveProperty('tensionCurve');
      expect(state.melodySettings).toHaveProperty('density');
    });

    it('should generate a MelodyResult that matches the expected output format', () => {
      const result = generateMelodyResult({
        withPassResults: true,
        withExecutionLog: true,
      });

      // Verify allNotes structure
      expect(Array.isArray(result.allNotes)).toBe(true);
      for (const note of result.allNotes) {
        expect(note).toHaveProperty('pitch');
        expect(note).toHaveProperty('startTime');
        expect(note).toHaveProperty('duration');
        expect(note).toHaveProperty('role');
        expect(note).toHaveProperty('metadata');
      }

      // Verify metadata structure
      expect(result.metadata).toHaveProperty('passResults');
      expect(result.metadata).toHaveProperty('executionLog');
      expect(result.metadata).toHaveProperty('phraseContext');
      expect(result.metadata).toHaveProperty('chords');
      expect(result.metadata).toHaveProperty('originalNoteCount');
      expect(result.metadata).toHaveProperty('finalNoteCount');

      // Verify passResults have correct structure
      for (const pr of result.metadata.passResults) {
        expect(pr).toHaveProperty('passName');
        expect(pr).toHaveProperty('notes');
        expect(pr).toHaveProperty('metrics');
        expect(pr).toHaveProperty('success');
      }
    });

    it('should generate compatible Progress state and MelodyResult for bridge testing', () => {
      const state = generateProgressState();
      const result = generateMelodyResult();

      // Both should use consistent musical parameters
      expect(state.baseKey).toBeGreaterThanOrEqual(48);
      expect(state.baseKey).toBeLessThanOrEqual(72);

      for (const note of result.allNotes) {
        expect(note.pitch).toBeGreaterThanOrEqual(48);
        expect(note.pitch).toBeLessThanOrEqual(96);
      }
    });
  });
});
