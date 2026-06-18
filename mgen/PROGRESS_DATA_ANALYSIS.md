# Progress → MelodyGen Data Format Analysis

**Version:** 1.0
**Date:** 2025-06-16
**Purpose:** Documents the exact data format Progress outputs, enabling accurate pre-processing into MelodyGen's `Chord[]` interface.

---

## 1. Progress Chord Object (Current Output)

**Source:** `store.js` lines 287-302 (`addChord()`)

A single chord in `state.currentProgression` is a flat object with these fields:

```js
{
  // === CORE CHORD IDENTITY ===
  symbol: "V7",              // Roman numeral or chord symbol: "I", "ii7", "V7#9", "iv", "bVI", "Imaj9", "Vsus4"
  key: 60,                   // MIDI note number for chord root (60 = C4)
  divisions: 12,             // EDO divisions (12, 19, 24, 31, 72)
  duration: 2,               // Duration in beats (integer, default 2)
  inversionOffset: 0,        // Integer for manual inversion (0 = root position)
  voicingType: "global",     // "global" | "auto" | "close" | "spread" | "quartal"
  voicing: null,             // Manual voicing override object (null by default)
  customNotes: null,         // Array of float MIDI pitches for user-designed custom chords

  // === PATTERN SET (injected via initPatternSet()) ===
  chordPattern: {
    isLocalOverride: false,
    avoidKick: false,
    generative: { mode: "off", history: [] },
    transitions: [],
    instances: [{
      id: "a3f8k2x1",
      startTime: 0.0,        // Normalized 0.0 to 1.0 within chord slot
      duration: 1.0,         // Normalized 0.0 to 1.0
      type: "chord",         // "chord" = plays all notes; "note" = single pitch
      pitchOffset: 0,
      pitchOffsets: [],
      isSelected: true,
      arpSettings: null,     // { style: "up", rate: 0.25, gate: 0.8 } or null
      probability: 1.0
    }]
  },
  bassPattern: {             // Same structure as chordPattern
    isLocalOverride: false,
    avoidKick: false,
    generative: { mode: "off", history: [] },
    transitions: [],
    instances: [{
      id: "b7d9m4w2",
      startTime: 0.0,
      duration: 1.0,
      type: "chord",
      pitchOffset: 0,
      pitchOffsets: [],
      isSelected: true,
      arpSettings: null,
      probability: 1.0
    }]
  },
  drumPattern: {
    isLocalOverride: false,
    lengthBeats: 4,          // Independent beat length for global patterns
    hits: [{
      id: "a3f8k2x1",
      time: 0.25,            // Normalized 0.0 to <1.0 within chord slot
      row: "kick",           // "ohh" | "chh" | "snare" | "kick"
      velocity: 1.0,         // 0.0 to 1.0
      probability: 1.0
    }]
  }
}
```

### Valid `symbol` Values (from `chordDictionary.js`)

- **Triads:** `I`, `i`, `ii`, `ii°`, `iii`, `III`, `IV`, `V`, `v`, `vi`, `VI`, `VII`, `iv`, `bVI`, `bVII`
- **7ths:** `Imaj7`, `i7`, `ii7`, `ii°7`, `iii7`, `IIImaj7`, `IVmaj7`, `v7`, `VImaj7`, `VII7`, `V7`, `vi7`
- **Extended:** `Imaj9`, `IVmaj9`, `ii9`, `ii11`, `V9`, `V11`, `Vsus4`, `V7sus4`, `V7#9`, `V7b13`, `iv7`, `bVImaj7`, `bVII7`

### Valid `mode` Values (from `state.mode`)

`major`, `minor`, `harmonicMinor`, `melodicMinor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `wholeTone`, `diminishedWH`, `altered`

### Valid `divisions` Values

`12` (TET12), `19` (EDO19), `24` (EDO24), `31` (EDO31), `72` (EDO72)

---

## 2. Progression Structure

**Source:** `store.js` lines 10-136

- **Top-level container:** `state` object (flat, not nested)
- **Progression location:** `state.currentProgression` — a **flat array** of chord objects
- This is a reference to `state.sections[activeSectionId].progression`
- **Sections support:** `songSequence` (array of section IDs), `loopStart`/`loopEnd` (slicing indices)
- **Temporary swaps overlay:** `state.temporarySwaps` (Map of index → partial chord override)
- **Active progression resolution:** `getActiveProgression()` (store.js lines 157-172) merges `temporarySwaps` onto base progression via spread: `{ ...deepClonedChord, ...swap }`

### Section Object

```js
{
  id: "sec-a3f8k2x1",
  name: "Section 1",
  progression: [ /* array of chord objects */ ],
  globalPatterns: {
    chordPattern: { /* same structure as chord.chordPattern */ },
    bassPattern: { /* same structure as chord.bassPattern */ },
    drumPattern: { /* same structure as chord.drumPattern */ }
  },
  loopStart: 0,
  loopEnd: 0,
  temporarySwaps: {}
}
```

---

## 3. `deduceChordRootAndQuality` — THE KEY BRIDGE FUNCTION

**Source:** `melodyTuning.js` lines 281-323

```js
export function deduceChordRootAndQuality(symbol, baseKey, divisions)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Chord symbol string (e.g., `"V7"`, `"ii°"`, `"IVmaj9"`, `"bVI"`) |
| `baseKey` | `number` | MIDI key number of the chord's root (e.g., `60` for C4) |
| `divisions` | `number` | EDO divisions (default `12`) |

### Returns

- **On success:** `{ rootPitch: number, quality: string }`
- **On failure** (no symbol, non-string, or no matching numeral): `null`

### Quality Values Returned

`'major'`, `'minor'`, `'minor7'`, `'dominant'`, `'diminished'`, `'augmented'`, `'suspended'`

### Sample Inputs/Outputs

| Input | Output |
|-------|--------|
| `deduceChordRootAndQuality("V", 60, 12)` | `{ rootPitch: 67, quality: "major" }` |
| `deduceChordRootAndQuality("ii", 60, 12)` | `{ rootPitch: 62, quality: "minor" }` |
| `deduceChordRootAndQuality("V7", 60, 12)` | `{ rootPitch: 67, quality: "dominant" }` |
| `deduceChordRootAndQuality("iv°", 60, 12)` | `{ rootPitch: 58, quality: "diminished" }` |
| `deduceChordRootAndQuality("bVI", 60, 12)` | `{ rootPitch: 58, quality: "major" }` |
| `deduceChordRootAndQuality("ii°7", 60, 12)` | `{ rootPitch: 62, quality: "diminished" }` |
| `deduceChordRootAndQuality("Imaj9", 60, 12)` | `{ rootPitch: 60, quality: "major" }` |
| `deduceChordRootAndQuality("V7#9", 60, 12)` | `{ rootPitch: 67, quality: "dominant" }` |
| `deduceChordRootAndQuality("Cmaj7", 60, 12)` | `null` (no Roman numeral match) |
| `deduceChordRootAndQuality(null, 60, 12)` | `null` |

### How It Works (step by step)

1. **Guard clause:** Returns `null` if `symbol` is falsy or not a string.
2. **Strip trailing modifiers:** Removes trailing `+` or `-` characters (e.g., `"V+"` becomes `"V"`).
3. **Parse accidental:** Checks for leading `b` (flat, -1 semitone) or `#` (sharp, +1 semitone).
4. **Roman numeral matching:** Matches one of: `IV, III, II, I, VII, VI, V` (uppercase = major) or `iv, iii, ii, i, vii, vi, v` (lowercase = minor).
5. **Degree index lookup:** Maps the numeral to a scale degree index (0-6).
6. **Scale interval lookup:** Calls `getScaleIntervals(state.mode || 'major', 'none', divisions)` to get the current scale's interval pattern.
7. **Root offset calculation:** `scaleIntervals[degreeIndex] * (12.0 / divisions) + accidental` — converts scale degree into MIDI semitone offset, accounting for microtonal divisions.
8. **Quality determination:**
   - Default: `isMinor ? 'minor' : 'major'`
   - If `remainder` contains `dim` or `°` → `'diminished'`
   - If `remainder` contains `aug` or `+` → `'augmented'`
   - If `remainder` contains `7`, `9`, `11`, or `13` (but NOT `maj`, `M7`, or `j7`) → `isMinor ? 'minor7' : 'dominant'`
   - If `remainder` contains `sus` → `'suspended'`
9. **Root pitch:** `baseKey + rootOffset`
10. **Returns:** `{ rootPitch, quality }` or `null`

---

## 4. Relevant State/Context from `state` Object

**Source:** `store.js`

```js
state = {
  baseKey: 60,              // MIDI note number (60 = C4)
  bpm: 120,                 // Beats per minute (40-300)
  divisions: 12,            // EDO divisions (12, 19, 24, 31, 72)
  mode: 'major',            // "major" | "minor" | "harmonicMinor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "wholeTone" | "diminishedWH" | "altered"
  melodySettings: {
    enabled: false,
    genre: 'none',
    motifRecurrence: 0.5,
    variationDepth: 0.5,
    density: 0.5,
    restProbability: 0.3,
    ornamentIntensity: 0.5,
    countermelodyEnabled: false,
    countermelodyMode: 'contrary',
    behaviorDuringArp: 'simplify',
    behaviorDuringTransitions: 'simplify',
    tensionCurve: 'arch',   // "arch" | "linear" | "valley" | "staircase" | "launch"
    seedSource: 'procedural',
    activeMotifId: 'preset-rise',
    midiExtractionMode: 'highest',
    macroPlannerEnabled: false,
    macroContourArchetype: 'auto',
    shortestNoteLimit: 16
  },
  customTuning: null,       // Custom .scl/.tun file mapping: { name, type, offsets/map, periodSize, divisions }
  importedTunings: [],      // List of imported custom tuning objects
  globalVoicing: 'auto',    // "auto" | "close" | "spread" | "quartal"
  volumes: {
    chords: 0.8,
    bass: 0.8,
    bassHarmonic: 0.0,
    drums: 0.8,
    melody: 0.8,
    countermelody: 0.0
  },
  instruments: {
    chords: 'sawtooth',
    bass: 'sine',
    bassSecondary: 'sawtooth',
    melody: 'sine',
    countermelody: 'sine'
  },
  // ... (many more fields for synth params, drum params, UI state, etc.)
}
```

---

## 5. mgen's Expected `Chord[]` Format

**Source:** `mgen/src/interfaces.js` lines 36-49

```js
class Chord {
  constructor(root, quality, beatStart, scaleDegrees = [])
}
```

### Field Definitions

| Field | Type | Required | Description | Sample Values |
|-------|------|----------|-------------|---------------|
| `root` | `string` | **Yes** | Root note name in standard notation | `'C'`, `'D#'`, `'Bb'`, `'F#'`, `'A'`, `'E'`, `'G'`, `'D'` |
| `quality` | `string` | **Yes** | Chord quality identifier | `'maj'`, `'min'`, `'dim'`, `'aug'`, `'7'`, `'maj7'`, `'min7'` |
| `beatStart` | `number` | **Yes** | Beat position where this chord begins (float, >= 0) | `0`, `2`, `4`, `6`, `8`, `10`, `12`, `16` |
| `scaleDegrees` | `number[]` | No (default `[]`) | Scale degrees (MIDI pitch class values 0-11) forming the chord | `[0, 4, 7]`, `[0, 3, 7]`, `[0, 4, 7, 10]`, `[0, 4, 7, 11]` |

### Supported Quality Values (from passA/passB `_getChordIntervals`)

| Quality | Intervals (semitones from root) | Number of chord tones |
|---------|--------------------------------|----------------------|
| `'maj'` | `[0, 4, 7]` | 3 |
| `'min'` | `[0, 3, 7]` | 3 |
| `'dim'` | `[0, 3, 6]` | 3 |
| `'aug'` | `[0, 4, 8]` | 3 |
| `'7'` | `[0, 4, 7, 10]` | 4 |
| `'maj7'` | `[0, 4, 7, 11]` | 4 |
| `'min7'` | `[0, 3, 7, 10]` | 4 |

### Supported Root Note Values (from passA `_noteNameToMidi`)

`'C'`, `'C#'`/`'Csh'`, `'Db'`, `'D'`, `'D#'`/`'Dsh'`, `'Eb'`, `'E'`, `'E#'`/`'Esh'`, `'F'`, `'F#'`/`'Fsh'`, `'Gb'`, `'G'`, `'G#'`/`'Gsh'`, `'Ab'`, `'A'`, `'A#'`/`'Ash'`, `'Bb'`, `'B'`, `'B#'`/`'Bsh'`

### Complete `GenerationConfig` for `CompositionOrchestrator.execute()`

**Source:** `mgen/src/interfaces.js` lines 124-135

```js
constructor(chords, phraseContext, options = {})
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chords` | `Chord[]` | **Yes** | Array of Chord objects forming the chord progression |
| `phraseContext` | `PhraseContext` | **Yes** | Phrase-level context object |
| `options` | `Object` | No (defaults to `{}`) | Additional generation options (e.g., `{ genre, density, maxLeap, baseRegister }`) |

### `PhraseContext` Object

**Source:** `mgen/src/interfaces.js` lines 54-67

```js
constructor(role, tensionLevel, registerTarget = null, isAntecedent = false)
```

| Field | Type | Required | Description | Sample Values |
|-------|------|----------|-------------|---------------|
| `role` | `string` | **Yes** | Phrase role | `'statement'`, `'build'`, `'climax'`, `'release'`, `'resolution'`, `'antecedent'`, `'consequent'` |
| `tensionLevel` | `number` | **Yes** | Tension level 0.0-1.0 | `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9` |
| `registerTarget` | `number \| null` | No (defaults to `null`) | Target MIDI register | `null`, `72` |
| `isAntecedent` | `boolean` | No (defaults to `false`) | No tonic resolution if true | `true`, `false` |

### `MelodyNote` Output (from all passes)

**Source:** `mgen/src/interfaces.js` lines 7-31

```js
constructor(pitch, startTime, duration, role = 'structural', metadata = {})
```

| Field | Type | Required | Description | Sample Values |
|-------|------|----------|-------------|---------------|
| `pitch` | `number` | **Yes** | MIDI pitch number (0-127, supports microtonal floats) | `60` (C4), `65` (F4), `72` (C5) |
| `startTime` | `number` | **Yes** | Beat position within the measure (float, >= 0) | `0`, `1`, `2`, `4`, `8`, `12` |
| `duration` | `number` | **Yes** | Duration in beats (float) | `1.0`, `0.5`, `0.25`, `2.0` |
| `role` | `string` | No (defaults to `'structural'`) | Structural role of the note | `'structural'`, `'cadence'`, `'connector'`, `'ornament'`, `'expectation'` |
| `metadata` | `Object` | No (defaults to `{}`) | Pass-specific metadata | See below |

### Role Priority for Deduplication (from `orchestrator.js` line 213)

`structural(5) > cadence(4) > connector(3) > ornament(2) > expectation(1)`

---

## 6. Bassline & Drum Data (Event Boundaries for Splitting)

### Bass Pattern Instances

**Source:** `bassPattern.instances` on each chord

```js
{
  id: "b7d9m4w2",
  startTime: 0.0,        // Normalized 0.0 to 1.0 within chord slot
  duration: 1.0,         // Normalized 0.0 to 1.0
  type: "chord",         // "chord" = plays all notes; "note" = single pitch
  pitchOffset: 0,        // Semitone offset from chord root (0 = root, 7 = fifth)
  pitchOffsets: [],      // Polyphonic offsets for individual chord notes
  isSelected: true,
  arpSettings: null,
  probability: 1.0
}
```

### Drum Hits

**Source:** `drumPattern.hits`

```js
{
  id: "a3f8k2x1",
  time: 0.25,            // Normalized 0.0 to <1.0 within chord slot
  row: "kick",           // "ohh" | "chh" | "snare" | "kick"
  velocity: 1.0,         // 0.0 to 1.0
  probability: 1.0
}
```

### Drum MIDI Mapping (from `midi.js`)

| Drum Row | MIDI Note | General MIDI Name |
|----------|-----------|-------------------|
| `'kick'` | 36 | Bass Drum 1 |
| `'snare'` | 38 | Acoustic Snare |
| `'chh'` | 42 | Closed Hi-Hat |
| `'ohh'` | 46 | Open Hi-Hat |

### Event Boundary Splitting (from `midi.js` and `exportStateBuilder.js`)

The pre-processing module must split the chord progression at **every unique time point** where anything changes across all tracks:

1. **Chord boundaries:** End of each chord's `duration` (cumulative beat positions)
2. **Arpeggio slice boundaries:** `chordPattern.instances[].startTime` (normalized 0-1, multiplied by chord duration)
3. **Bass note changes:** `bassPattern.instances[].startTime` (normalized 0-1, multiplied by chord duration)
4. **Drum hit boundaries:** `drumPattern.hits[].time` (normalized 0-1, multiplied by chord duration)
5. **Transition boundaries:** `chordPattern.transitions[].startTime` (within-chord splits via `evaluateVerticalSlices`)

### Bass Generation (from `bassGenerator.js`)

`generateIntelligentBassline(drumPattern, chordPattern, options)` generates bass instances at the **intersection of kick drum times and chord pattern slice times**, clamped to `1.0` (chord end). Two modes:

- **Walking bass:** One instance per quarter note, root on beat 1, approach tone before next chord root
- **Rhythm-informed:** Generates instances at merged kick+chord trigger points

---

## 7. Complete Bridging Example

### Progress Output (flat array from `state.currentProgression`)

```js
const progressChords = [
  { symbol: "I", key: 60, divisions: 12, duration: 2, notes: [60, 64, 67] },
  { symbol: "V7", key: 60, divisions: 12, duration: 2, notes: [67, 71, 74, 79] },
  { symbol: "IV", key: 60, divisions: 12, duration: 2, notes: [55, 59, 62] },
  { symbol: "I", key: 60, divisions: 12, duration: 2, notes: [60, 64, 67] }
];
```

### Pre-Processing Transformation

```js
function progressChordToMelodyGenChord(progressChord, globalBeatOffset) {
  const parsed = deduceChordRootAndQuality(
    progressChord.symbol,
    progressChord.key,
    progressChord.divisions
  );
  // rootPitch is a MIDI number — convert to note name for mgen
  const rootNoteName = midiToNoteName(parsed.rootPitch);
  // scaleDegrees = pitch classes (0-11) from progressChord.notes
  const scaleDegrees = (progressChord.notes || []).map(n => n % 12);
  return new Chord(rootNoteName, parsed.quality, globalBeatOffset, scaleDegrees);
}

function buildMgenChords(progressProgression) {
  const mgenChords = [];
  let globalBeatOffset = 0;

  for (const chord of progressProgression) {
    const mgenChord = progressChordToMelodyGenChord(chord, globalBeatOffset);
    mgenChords.push(mgenChord);
    globalBeatOffset += chord.duration;
  }

  return mgenChords;
}
```

### Result (flat `Chord[]` for mgen)

```js
[
  new Chord('C', 'major', 0, [0, 4, 7]),
  new Chord('G', 'dominant', 2, [7, 11, 2, 9]),
  new Chord('F', 'major', 4, [5, 9, 2]),
  new Chord('C', 'major', 6, [0, 4, 7])
]
```

### Full `GenerationConfig` Example

```js
const phraseContext = new PhraseContext(
  'statement',    // from tensionCurve: 'arch' → 'statement'
  0.5,            // tensionLevel - derive from tensionCurve position
  null,            // registerTarget - derive from state.baseKey + 12
  false            // isAntecedent
);

const config = new GenerationConfig(
  buildMgenChords(progressChords),
  phraseContext,
  {
    genre: state.melodySettings.genre,
    density: state.melodySettings.density,
    maxLeap: 12,
    baseRegister: state.baseKey
  }
);

const result = await orchestrator.execute(config);
```

---

## 8. Pre-Processing Module Contract (for `mgen/src/progressBridge.js`)

### Input Format (from Progress app)

```js
{
  chords: [
    {
      symbol: 'I',
      key: 60,
      divisions: 12,
      duration: 2,
      notes: [60, 64, 67],
      chordPattern: {
        instances: [
          { startTime: 0.0, duration: 0.5, pitchOffsets: [0, 4, 7] },
          { startTime: 0.5, duration: 0.3, pitchOffsets: [0, 4, 7] },
          { startTime: 0.8, duration: 1.2, pitchOffsets: [0, 4, 7] }
        ]
      },
      bassPattern: {
        instances: [
          { startTime: 0.0, duration: 1.0, pitchOffset: 0 },
          { startTime: 1.0, duration: 1.0, pitchOffset: 7 }
        ]
      },
      drumPattern: {
        hits: [
          { time: 0.25, row: 'kick', velocity: 1.0 },
          { time: 0.5, row: 'snare', velocity: 0.8 }
        ]
      }
    },
    {
      symbol: 'V7',
      key: 60,
      divisions: 12,
      duration: 2,
      notes: [67, 71, 74, 79],
      chordPattern: { instances: [...] },
      bassPattern: { instances: [...] },
      drumPattern: { hits: [...] }
    }
  ],
  // Optional global state:
  baseKey: 60,
  bpm: 120,
  divisions: 12,
  mode: 'major',
  melodySettings: {
    genre: 'none',
    density: 0.5,
    tensionCurve: 'arch'
  }
}
```

### Output Format (for MelodyGen)

```js
[
  new Chord('C', 'maj', 0, [0, 4, 7]),       // beatStart: 0, duration: 2
  new Chord('C', 'maj', 1, [0, 4, 7]),       // beatStart: 1, bass changed (event boundary)
  new Chord('G', '7', 2, [7, 11, 2, 9]),     // beatStart: 2, chord changed
  new Chord('G', '7', 3, [7, 11, 2, 9]),     // beatStart: 3, bass changed (event boundary)
  // ... one Chord per distinct time slice
]
```

### Pre-Processing Module Responsibilities

1. **Collect all event boundaries** — Find every unique time point where anything changes across all tracks:
   - Chord transitions (from `chords[].duration` cumulative positions)
   - Bass note changes (from `bassPattern.instances[].startTime` × chord duration)
   - Arpeggio slice boundaries (from `chordPattern.instances[].startTime` × chord duration)
   - Drum hit boundaries (from `drumPattern.hits[].time` × chord duration)

2. **Split at boundaries** — Create a `Chord` object for each slice between event boundaries, with correct `beatStart` and `duration`.

3. **Resolve bass notes** — For each slice, determine the effective root:
   - If a bass note exists at this time, use the bass pitch as the effective root
   - Otherwise, use the chord symbol's root

4. **Handle rest slices** — If a slice is marked as a rest:
   - Inherit the preceding chord's symbol, key, and notes
   - If no preceding chord exists (start of progression), wrap around to the last chord of the entire progression

5. **Preserve metadata** — Each resulting `Chord` carries:
   - `originalDuration` — total duration of the original sustained note before slicing
   - `sourceTrack` — which track contributed this slice's root ('chord' or 'bass')
   - `hasDrumHits` — whether any drum hits occurred during this slice
   - `isContinuation` — whether this chord continues the previous chord's pitch

6. **Backward compatibility** — If Progress passes only `chords` (no bass/drum), the module produces the same flat `Chord[]` array as if no pre-processing was needed.

### Function Signature

```js
/**
 * Convert Progress app raw multi-track data into a flat Chord[] array.
 * @param {Object} progressData - Raw data from Progress app
 * @param {Object[]} progressData.chords - Chord progression array
 * @param {Object} [progressData.bassTrack] - Optional bass track
 * @param {Object} [progressData.drumTrack] - Optional drum track
 * @returns {Chord[]} Flat array of Chord objects with correct beatStart values
 */
export function preprocessProgressData(progressData) { ... }
```

---

## 9. Key Source File Reference

| File | What It Contains | Key Lines |
|------|------------------|-----------|
| `store.js` | Full state object, chord construction, progression storage, section management | 10-136, 287-302, 157-172 |
| `melodyTuning.js` | `deduceChordRootAndQuality(symbol, baseKey, divisions)` → `{ rootPitch, quality }` | 281-323 |
| `melodyTuning.js` | `getScaleIntervals(mode, genre, divisions)` → interval arrays | 9-44 |
| `melodyTuning.js` | `getLocalScaleMode(quality, settingsGenre)` → mode string | 325-342 |
| `theory.js` | `getChordNotes(symbolOrChord, baseKey, divisions)` → `number[]` (MIDI pitches) | 68-190 |
| `theory.js` | `getBassNote(rootChordNotes, tuning)` → normalized bass pitch (C2-B2) | 43-53 |
| `theory.js` | `getEffectiveTuning(chordSymbol, globalDivisions, customTuning)` | 549-596 |
| `melodyGenerator.js` | `scheduleMelody(time, chordObj, nextChordObj, prevChordObj, ...)` | 162 |
| `exportStateBuilder.js` | `getExportState(isMacro)` — how chords are serialized for export | 4-122 |
| `midi.js` | How chord/bass/drum data converts to MIDI events (event boundary splitting) | 154-490 |
| `bassGenerator.js` | `generateIntelligentBassline(drumPattern, chordPattern, options)` | 48-176 |
| `mgen/src/interfaces.js` | `Chord`, `MelodyNote`, `PhraseContext`, `GenerationConfig` definitions | 7-135 |
| `mgen/src/orchestrator.js` | `CompositionOrchestrator.execute(config)` — expects `{ chords, phraseContext }` | 55-84 |
| `mgen/melodygen_progress_bridge.md` | Full bridge documentation (v0.2 with bass/drum integration) | 1-654 |
| `mgen/BRIDGE_UPDATE_PLAN.md` | Implementation plan for `progressBridge.js` pre-processing module | 1-291 |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **Chord block** | A Progress app chord with a duration (≥ 1 beat) that may be subdivided |
| **Slice** | A subdivision of a chord block, which may be a chord or a rest |
| **Sub-chord** | A MelodyGen `Chord` object representing one slice of a Progress chord |
| **Beat position** | Float value representing time in beats (MelodyGen's time unit) |
| **Step index** | Integer grid position in 16th-note units (Progress app's internal timing) |
| **ED** | Equal divisions of the octave (12 = standard, 24 = quartertone, etc.) |
| **Period size** | Size of the octave in the current tuning system (default 12.0) |
| **Phrase role** | High-level musical intent: statement, build, climax, release, resolution |
| **Tension curve** | How tension evolves across a phrase (arch, linear, valley, staircase, launch) |
| **Motif** | A recognizable melodic fragment (3-8 notes) that can be transformed |
| **Cadence** | A structural resolution point (full or half) |
| **Connector** | Notes bridging structural/cadence points |
| **Ornament** | Decorative notes (grace notes, trills, turns, appoggiaturas) |
| **Expectation** | Notes added by call-response analysis to resolve large intervals |
| **Bass track** | Separate Progress app track with independent notes that modify the effective chord root for melody generation |
| **Effective root** | The bass note at a given time, which overrides the chord symbol's root for melody purposes |
| **Rest slice** | A subdivision of a chord block that is silent but inherits the preceding chord's harmonic context |
| **Wraparound** | When a rest slice has no preceding chord, it inherits from the last slice of the entire progression (not the looped subsection) |
| **Looped subsection** | A user-defined portion of the progression used for auditioning, which may be shorter than the full progression |
| **Pre-processing module** | The `progressBridge.js` module that converts Progress app's raw multi-track data into a flat `Chord[]` array |
| **Event boundary** | A time point where any track changes (chord transition, bass change, arpeggio slice, drum hit) |
| **Sliced chord** | A `Chord` object representing one slice of a Progress app chord block, created at event boundaries |
| **Continuation** | A sliced chord that has the same pitch as the previous slice, indicating a sustained note that was split at a boundary |

---

## 11. Revision History

| Version | Date | Changes |
|---------|------|-----------|
| 1.0 | 2025-06-16 | Initial analysis. Documents exact Progress chord object structure, `deduceChordRootAndQuality` signature, mgen `Chord[]` interface, bass/drum event boundary data, and complete bridging example. |
