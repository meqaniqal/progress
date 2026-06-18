# Bridge Update Plan — Progress ↔ MelodyGen

**Created:** 2025-06-16
**Last Updated:** 2025-06-17
**Status:** Ready for implementation
**Reference:** `progress_data_analysis.md` (concrete data format analysis)
**Preserves:** `melodygen_progress_bridge.md.v0.1-preserved` (original v0.1 content)

---

## Goal

Create a Jest-testable pre-processing module (`progressBridge.js`) that converts Progress app's raw multi-track data (chords + bass + drums) into a flat `Chord[]` array suitable for MelodyGen consumption.

**Full data format analysis is in:** `mgen/progress_data_analysis.md`

---

## Part A: Reference Documents

### Primary Reference: `progress_data_analysis.md`

This document contains the complete, verified data format analysis:
- Exact Progress chord object structure (every field, every default value)
- `deduceChordRootAndQuality` signature and full implementation details
- mgen's `Chord[]` interface definition with all supported values
- Bass/drum event boundary data structures
- Complete bridging example with code

### Secondary Reference: `melodygen_progress_bridge.md` (v0.2)

The living bridge document covering:
- Data models (Chord, MelodyNote, PhraseContext, GenerationConfig)
- Full integration flow (Progress → Bridge → mgen → Progress)
- Bass line integration, rest handling, wraparound behavior
- Engine integration (MicrotonalEngine, MotifEngine, StyleEngine)
- Glossary and revision history

---

## Part B: Pre-Processing Module Specification

### Files to Create
- `mgen/src/progressBridge.js` — Pre-processing module
- `mgen/tests/progressBridge.test.js` — Comprehensive Jest tests

### Module: `src/progressBridge.js`

**Purpose:** Convert Progress app's raw multi-track data (chords + bass + drums) into a flat `Chord[]` array suitable for MelodyGen consumption.

### Core Data Transformation

The pre-processor must perform this transformation:

```
Progress chord object (symbol, key, divisions, duration, ...)
  → deduceChordRootAndQuality(symbol, key, divisions)
  → { rootPitch, quality }
  → midiToNoteName(rootPitch) + quality
  → new Chord(noteName, quality, beatStart, scaleDegrees)
```

### Key Functions Required

**1. `deduceChordRootAndQuality(symbol, baseKey, divisions)`**
- **Source:** `melodyTuning.js` lines 281-323 (already exists in Progress)
- **Input:** `symbol` (string), `baseKey` (number), `divisions` (number)
- **Output:** `{ rootPitch: number, quality: string }` or `null`
- **Quality values:** `'major'`, `'minor'`, `'minor7'`, `'dominant'`, `'diminished'`, `'augmented'`, `'suspended'`
- **See:** `progress_data_analysis.md` section 3 for full implementation details and sample inputs/outputs

**2. `progressChordToMelodyGenChord(progressChord, globalBeatOffset)`**
- Converts a single Progress chord to a single mgen `Chord`
- Uses `deduceChordRootAndQuality` to extract root + quality
- Converts `rootPitch` (MIDI number) to note name (e.g., 60 → 'C')
- Extracts `scaleDegrees` from `progressChord.notes` as pitch classes (mod 12)
- Returns `new Chord(noteName, quality, beatStart, scaleDegrees)`

**3. `buildMgenChords(progressProgression)`**
- Iterates `progressProgression` array
- Accumulates `globalBeatOffset` from cumulative `chord.duration` values
- Calls `progressChordToMelodyGenChord` for each chord
- Returns flat `Chord[]` array

**4. `preprocessProgressData(progressData)`** (main entry point)
- Full multi-track pre-processing (see function signature below)

### Function Signature

```js
/**
 * Convert Progress app raw multi-track data into a flat Chord[] array.
 * @param {Object} progressData - Raw data from Progress app
 * @param {Object[]} progressData.chords - Chord progression array (Progress format)
 * @param {Object} [progressData.baseKey] - MIDI note number (default 60)
 * @param {number} [progressData.divisions] - EDO divisions (default 12)
 * @param {string} [progressData.mode] - Scale mode (default 'major')
 * @param {Object} [progressData.melodySettings] - Melody generation settings
 * @param {Object} [progressData.bassTrack] - Optional bass track data
 * @param {Object} [progressData.drumTrack] - Optional drum track data
 * @returns {Chord[]} Flat array of Chord objects with correct beatStart values
 */
export function preprocessProgressData(progressData) { ... }
```

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

### Key Behaviors

**1. Collect all event boundaries** — Find every unique time point where anything changes across all tracks:
   - Chord transitions (from `chords[].duration` cumulative positions)
   - Bass note changes (from `bassPattern.instances[].startTime` × chord duration)
   - Arpeggio slice boundaries (from `chordPattern.instances[].startTime` × chord duration)
   - Drum hit boundaries (from `drumPattern.hits[].time` × chord duration)

**2. Split at boundaries** — Create a `Chord` object for each slice between event boundaries, with correct `beatStart` and `duration`.

**3. Resolve bass notes** — For each slice, determine the effective root:
   - If a bass note exists at this time, use the bass pitch as the effective root
   - Otherwise, use the chord symbol's root

**4. Handle rest slices** — If a slice is marked as a rest:
   - Inherit the preceding chord's symbol, key, and notes
   - If no preceding chord exists (start of progression), wrap around to the last chord of the entire progression

**5. Preserve metadata** — Each resulting `Chord` carries:
   - `originalDuration` — total duration of the original sustained note before slicing
   - `sourceTrack` — which track contributed this slice's root ('chord' or 'bass')
   - `hasDrumHits` — whether any drum hits occurred during this slice
   - `isContinuation` — whether this chord continues the previous chord's pitch

**6. Backward compatibility** — If Progress passes only `chords` (no bass/drum), the module produces the same flat `Chord[]` array as if no pre-processing was needed.

---

## Part C: Test Specification

### Tests: `tests/progressBridge.test.js`

**Test cases (13 total):**

| # | Test Name | Description | Expected Output |
|---|-----------|-------------|-----------------|
| 1 | Simple chords-only input | No bass/drum — basic progression | Flat `Chord[]` with correct `beatStart` values |
| 2 | Chords + bass track | Bass note changes within a chord | Additional slices at bass change points |
| 3 | Chords + drum track | Drum hits within a chord | Additional slices at drum hit times |
| 4 | Chords + bass + drum | All boundaries combined | Slices at every unique event boundary |
| 5 | Arpeggiated chord patterns | `chordPattern.instances` with multiple slices | Slices at arpeggio slice boundaries |
| 6 | Rest slices | Rest inherits preceding chord | Same symbol/key/notes as preceding chord |
| 7 | Wraparound | Rest at start of progression | Wraps to last chord of full progression |
| 8 | Empty input | `chords: []` | Returns `[]` |
| 9 | Single chord | One chord, no subdivisions | Single-element `Chord[]` |
| 10 | Overlapping boundaries | Multiple events at same time | Single slice (no duplicate boundaries) |
| 11 | Metadata preservation | Verify all metadata fields | `originalDuration`, `sourceTrack`, `hasDrumHits`, `isContinuation` present and correct |
| 12 | Bass override | Bass note changes root | Effective root comes from bass, not chord symbol |
| 13 | No bass (chords-only mode) | Backward compatibility | Same output as test #1 (chords-only) |

### Test Data Examples

**Test #1 — Simple chords-only (from `progress_data_analysis.md` section 7):**
```js
const input = {
  chords: [
    { symbol: "I", key: 60, divisions: 12, duration: 2, notes: [60, 64, 67] },
    { symbol: "V7", key: 60, divisions: 12, duration: 2, notes: [67, 71, 74, 79] },
    { symbol: "IV", key: 60, divisions: 12, duration: 2, notes: [55, 59, 62] },
    { symbol: "I", key: 60, divisions: 12, duration: 2, notes: [60, 64, 67] }
  ]
};
// Expected: 4 Chord objects, beatStarts at 0, 2, 4, 6
```

**Test #4 — Full multi-track (from `progress_data_analysis.md` section 8):**
```js
const input = {
  chords: [{
    symbol: 'I', key: 60, divisions: 12, duration: 2, notes: [60, 64, 67],
    chordPattern: { instances: [
      { startTime: 0.0, duration: 0.5 },
      { startTime: 0.5, duration: 0.3 },
      { startTime: 0.8, duration: 1.2 }
    ]},
    bassPattern: { instances: [
      { startTime: 0.0, duration: 1.0, pitchOffset: 0 },
      { startTime: 1.0, duration: 1.0, pitchOffset: 7 }
    ]},
    drumPattern: { hits: [
      { time: 0.25, row: 'kick' },
      { time: 0.5, row: 'snare' }
    ]}
  }]
};
// Expected: Slices at times 0, 0.25, 0.5, 0.5, 0.8, 1.0 (unique sorted boundaries)
```

---

## Part D: Integration with mgen Pipeline

### Full Integration Flow (Actual)

```
Progress App                          MelodyGen Bridge                    MelodyGen Pipeline
────────────                         ──────────────────                    ──────────────────

1. User creates                      1. preprocessProgressData()
   chord progression                       collects event boundaries
   (with slices, rests,                    splits at boundaries
    variable subdivisions)                  resolves bass notes

2. Bridge builds                     2. Build PhraseContext
   Chord[] array                           from tensionCurve /
   (flat, sliced at                        macroTargetPlan
    event boundaries)

3. Bridge builds                     3. Create GenerationConfig
   PhraseContext                           (chords, phraseContext, options)

4. Bridge calls                      4. orchestrator.execute(config)
   orchestrator.execute()

5. MelodyGen returns                 5. MelodyResult { allNotes, metadata }

6. Bridge converts                   6. MelodyNote[] → Progress
   MelodyNote[] → Progress                 note objects (pitch, stepTime,
   note objects                            noteDuration, clusterRole, ...)
```

### Complete `GenerationConfig` Example

```js
// After preprocessing:
const mgenChords = preprocessProgressData(progressData);

// Build phrase context from Progress state:
const phraseContext = new PhraseContext(
  'statement',                    // derived from tensionCurve: 'arch' → 'statement'
  0.5,                            // tensionLevel — derive from tensionCurve position
  null,                            // registerTarget — derive from state.baseKey + 12
  false                            // isAntecedent
);

// Create full config:
const config = new GenerationConfig(
  mgenChords,
  phraseContext,
  {
    genre: state.melodySettings.genre,
    density: state.melodySettings.density,
    maxLeap: 12,
    baseRegister: state.baseKey
  }
);

// Execute:
const result = await orchestrator.execute(config);
```

---

## Part E: Implementation Order

1. **Reference document created** — `progress_data_analysis.md` (complete data format analysis)
2. **Create `src/progressBridge.js`** — implement pre-processing module with:
   - `deduceChordRootAndQuality` (reuse from Progress or inline the logic)
   - `progressChordToMelodyGenChord` (single chord conversion)
   - `buildMgenChords` (full progression conversion)
   - `preprocessProgressData` (multi-track entry point)
3. **Create `tests/progressBridge.test.js`** — 13 test cases as specified above
4. **Run `npm test`** — verify all 83 existing tests still pass + new tests pass

---

## Preserved Original

The original v0.1 bridge document has been saved as:
`mgen/melodygen_progress_bridge.md.v0.1-preserved`

This preserves all the original pseudocode and examples for future reference, in case any concepts need to be revisited when mgen development adds bass/rhythm support.

---

## Open Questions for Future Reference

1. **Playback behavior conflict:** If wraparound behavior conflicts with Progress app's current playback, Progress may need to be modified to adopt wraparound. This would be a Progress-side change, not an mgen change.

2. **hasDrumHits field:** If drum hits create a slice boundary, `hasDrumHits` indicates that a drum hit started at that time. This could be useful for rhythm-aware melody generation but may not be needed in the initial implementation.

3. **Rich mode timing:** Bass + rhythm integration in MelodyGen (Section 12 of bridge doc) is deferred until mgen development is complete. The Progress app pre-processing module will still produce the flat `Chord[]` array regardless.

4. **How many slices can mgen handle?** — The 5-pass pipeline processes `config.chords` as an array. There's no hard limit documented, but performance may degrade with very large arrays (100+ slices). This should be tested when the pre-processing module is implemented.

5. **Progress app integration:** The pre-processing module lives in mgen for testing purposes. When Progress is ready to integrate, it will either:
   - Import the module from mgen (if mgen is a dependency)
   - Replicate the logic in Progress app's own codebase
   - Call the module via a local copy

6. **Note name conversion:** `deduceChordRootAndQuality` returns `rootPitch` as a MIDI number (e.g., 60). The pre-processor must convert this to a note name string (e.g., 'C') for mgen's `Chord` constructor. This requires a `midiToNoteName(midiNumber)` helper. See `progress_data_analysis.md` section 3 for the full list of supported note names.

7. **Microtonal support:** When `divisions !== 12`, the `rootPitch` may be a float (e.g., 60.5 for quartertone). The pre-processor must handle this — either by rounding to the nearest MIDI note for mgen compatibility, or by extending mgen's `Chord` to support microtonal root pitches.
