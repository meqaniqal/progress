# MelodyGen ↔ Progress App Bridging Document

**Version 0.2** — Updated with verified data format analysis. This document defines the shared interface contract between the **MelodyGen Isolated** project (5-pass hierarchical melody generator) and the **Progress** app (DAW/chord progression tool). It is a living document that evolves as both projects develop.

**Reference:** `progress_data_analysis.md` contains the complete, verified data format analysis with exact field names, types, and sample values for every structure.

---

## 1. Purpose

Enable the Progress app to use the MelodyGen isolated project as a melody generation engine, and vice versa. The two projects share:

- **Chord progression data** (harmonic structure)
- **Phrase-level intent** (tension, role, register)
- **Note-level output** (pitch, timing, duration, role)
- **Microtonal tuning** (arbitrary EDO systems)
- **Stylistic constraints** (genre-specific realization)

The bridge allows the Progress app to feed chord progressions into MelodyGen and receive structurally coherent, stylistically appropriate melodies back — while preserving the Progress app's existing capabilities (on-grid/off-grid subdivisions, variable BPM, user-defined rhythmic slicing).

---

## 2. Core Data Models

### 2.1 Chord

**MelodyGen `Chord`** (src/interfaces.js):
```js
constructor(root, quality, beatStart, scaleDegrees = [])
```

| Field | Type | Description |
|-------|------|-------------|
| `root` | `string` | Root note name (e.g., `'C'`, `'D#'`, `'Bb'`) |
| `quality` | `string` | Chord quality: `'maj'`, `'min'`, `'dim'`, `'aug'`, `'7'`, `'maj7'`, `'min7'` |
| `beatStart` | `number` | Beat position where this chord begins (float, ≥ 0) |
| `scaleDegrees` | `number[]` | Scale degrees forming the chord (optional) |

**Progress app chord object** (store.js / theory.js):
```js
{ symbol, key, divisions, duration, notes, customNotes, inversionOffset, voicing, ... }
```

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | `string` | Roman numeral or chord symbol (e.g., `'I'`, `'vi'`, `'Dm7'`, `'G7#9'`) |
| `key` | `number` | Root key in MIDI (default 60 = C4) |
| `divisions` | `number` | EDO divisions (default 12) |
| `duration` | `number` | Duration in beats (always ≥ 1.0) |
| `notes` | `number[]` | Array of MIDI pitch numbers |
| `customNotes` | `number[]` | User-defined chord notes |
| `inversionOffset` | `number` | Inversion level |

**Bridging transformation:**
```js
function progressChordToMelodyGenChord(progressChord, globalBeatOffset) {
  const parsed = deduceChordRootAndQuality(
    progressChord.symbol,
    progressChord.key,
    progressChord.divisions
  );
  // rootPitch is a MIDI number — convert to note name for mgen (e.g., 60 → 'C')
  const rootNoteName = midiToNoteName(parsed.rootPitch);
  // scaleDegrees = pitch classes (0-11) from progressChord.notes
  const scaleDegrees = (progressChord.notes || []).map(n => n % 12);
  return new Chord(rootNoteName, parsed.quality, globalBeatOffset, scaleDegrees);
}
```

**Key insight:** The Progress app's `symbol` + `key` + `divisions` must be parsed into `root` + `quality` for MelodyGen. The `deduceChordRootAndQuality()` function from `melodyTuning.js` (lines 281-323) already exists in the Progress app and handles this. See `progress_data_analysis.md` section 3 for the full implementation, sample inputs/outputs, and quality values returned.

### 2.2 MelodyNote

**MelodyGen `MelodyNote`** (src/interfaces.js):
```js
constructor(pitch, startTime, duration, role = 'structural', metadata = {})
```

| Field | Type | Description |
|-------|------|-------------|
| `pitch` | `number` | MIDI pitch (0-127, supports microtonal floats) |
| `startTime` | `number` | Beat position (float, relative to phrase start) |
| `duration` | `number` | Duration in beats (float) |
| `role` | `string` | `'structural'` / `'cadence'` / `'connector'` / `'ornament'` / `'expectation'` |
| `metadata` | `Object` | Pass-specific metadata (see below) |

**Progress app note representation** (melodyGenerator.js):
```js
{ pitch, stepTime, noteDuration, melodyInst, step, isAnchor1Step, isAnchor2Step, isIsolated, clusterRole, ... }
```

**Bridging transformation:**
```js
function progressNoteToMelodyGenNote(progressNote, role) {
  return new MelodyNote(
    progressNote.pitch,
    progressNote.stepTime,        // convert from step index to beat position
    progressNote.noteDuration,    // convert from step count to beats
    role,
    buildMetadata(progressNote)   // map progress metadata → MelodyGen metadata
  );
}
```

**Key insight:** The Progress app uses **step indices** (16th-note grid positions) while MelodyGen uses **beat positions** (floats). The bridge must convert between these coordinate systems.

### 2.3 PhraseContext

**MelodyGen `PhraseContext`** (src/interfaces.js):
```js
constructor(role, tensionLevel, registerTarget = null, isAntecedent = false)
```

| Field | Type | Description |
|-------|------|-------------|
| `role` | `string` | `'statement'` / `'build'` / `'climax'` / `'release'` / `'resolution'` |
| `tensionLevel` | `number` | 0.0-1.0 |
| `registerTarget` | `number|null` | Target MIDI register |
| `isAntecedent` | `boolean` | No tonic resolution if true |

**Progress app phrase planning** (macroMelody.test.js / melodyGenerator.js):
```js
// planMacroMelodyTargets() returns:
{ targetPitch, role, contourValue }
```

**Bridging:** The Progress app's `macroTargetPlan` (array of `{ targetPitch, role, contourValue }` per chord) maps directly to a single `PhraseContext` for MelodyGen. The `tensionLevel` is derived from the `contourValue` at the phrase's position.

### 2.4 GenerationConfig

**MelodyGen `GenerationConfig`** (src/interfaces.js):
```js
constructor(chords, phraseContext, options = {})
```

| Field | Type | Description |
|-------|------|-------------|
| `chords` | `Chord[]` | Chord progression (required) |
| `phraseContext` | `PhraseContext` | Phrase-level context (required) |
| `options` | `Object` | Additional options (register, maxLeap, etc.) |

**Progress app state** (store.js):
```js
state = {
  baseKey: 60,
  bpm: 120,
  divisions: 12,
  periodSize: 12.0,
  mode: 'major',
  melodySettings: {
    genre: 'none',
    density: 0.5,
    tensionCurve: 'arch',
    macroPlannerEnabled: false,
    // ... many more
  },
  currentProgression: [...],
  // ...
}
```

**Bridging transformation:**
```js
function progressStateToGenerationConfig(state) {
  const chords = state.currentProgression.map((chord, i) => {
    let beatStart = 0;
    for (let j = 0; j < i; j++) {
      beatStart += state.currentProgression[j].duration;
    }
    return progressChordToMelodyGenChord(chord, beatStart);
  });

  const phraseContext = new PhraseContext(
    state.melodySettings.tensionCurve === 'arch' ? 'statement' : 'statement',
    0.5,  // tensionLevel - derive from tensionCurve
    state.baseKey + 12,  // registerTarget
    false  // isAntecedent
  );

  return new GenerationConfig(chords, phraseContext, {
    genre: state.melodySettings.genre,
    density: state.melodySettings.density,
    maxLeap: 12,
    baseRegister: state.baseKey,
  });
}
```

---

## 3. Bass Line Integration

### 3.1 The Problem

The Progress app has a **separate bass track** with its own notes, independent from the melody track. The melody generator must consider the bass line as part of the harmonic context — the bass note at any point is effectively part of the chord.

**Example:** If the chord symbol is `Cmaj7` but the bass is playing `G` (the 5th), the melody should treat `G` as a chord tone (stable target) for that slice, not as a passing tone.

### 3.2 Bass Pattern Data Model (Actual)

**Progress app bass pattern** (from `bassPattern.instances` on each chord, `store.js`):
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

**Bass generation** (from `bassGenerator.js`): `generateIntelligentBassline(drumPattern, chordPattern, options)` generates bass instances at the **intersection of kick drum times and chord pattern slice times**, clamped to `1.0` (chord end). Two modes: walking bass (one instance per quarter note) and rhythm-informed (instances at merged kick+chord trigger points).

**Bridging:** The pre-processing module must extract bass `pitchOffset` values and convert them to effective roots:
- `effectiveRoot = chord.key + pitchOffset` (MIDI number)
- Convert to note name for mgen: `midiToNoteName(effectiveRoot)`
- Keep the chord quality for upper voices

### 3.3 Melody Consideration of Bass

When generating melody notes, the bridge must pass the **effective chord** (bass note + chord symbol) to MelodyGen. The pre-processing module resolves bass notes at event boundaries (see `progress_data_analysis.md` section 8 for the full multi-track input/output format).

**Key insight:** The melody generator should snap structural notes to the **effective chord** (bass note + upper voices), not just the chord symbol. This ensures melodic notes are harmonically coherent with the bass line.

---

## 4. Rest Attribution & Wraparound

### 4.1 Rest Slices

**Problem:** The Progress app allows rest slices within chord blocks. These create gaps in the harmonic content but must still be handled for melody generation.

**Rule:** Rest slices **inherit the chord properties** (symbol, key, notes) from the preceding chord slice. This means:

1. A rest slice is not harmonically silent — it carries forward the harmonic context of the previous chord
2. The melody generator should generate notes for rest slices using the inherited chord's harmonic information
3. The rest slice's `beatStart` is still calculated (cumulative), but the chord context comes from the preceding slice

### 4.2 Wraparound Behavior

**Problem:** When a rest slice appears at the start of a chord progression (or at the start of a looped subsection), there is no preceding chord to inherit from.

**Rule:** Rest slices wrap around to the **preceding chord independently of the looped subsection**:

1. If a rest slice is at the very start of the progression (first slice of the first chord), it wraps to the **last slice of the last chord of the entire progression** (not the looped subsection).
2. This ensures musical integrity — the melody is always harmonically coherent regardless of which subsection is being looped.
3. For the **first playthrough** of a progression, if there is no preceding chord (e.g., the very first note of a brand new progression), the melody generator uses a default root (typically `state.baseKey + 12`) and the phrase's tension curve to determine the starting pitch.

### 4.3 Subdivision Model (Actual)

The pre-processing module subdivides each Progress app chord at **event boundaries** (see `progress_data_analysis.md` section 8). Each slice (chord or rest) becomes a `Chord` with correct `beatStart`.

**Event boundaries that trigger slicing:**
1. Chord transitions (from `chords[].duration` cumulative positions)
2. Bass note changes (from `bassPattern.instances[].startTime` × chord duration)
3. Arpeggio slice boundaries (from `chordPattern.instances[].startTime` × chord duration)
4. Drum hit boundaries (from `drumPattern.hits[].time` × chord duration)

**Subdivision rules:**
1. Each chord's `duration` (≥ 1 beat) is divided according to user-defined slices
2. Each slice becomes a sub-chord with its own `beatStart` (cumulative)
3. Rest slices inherit the preceding chord's symbol, key, and notes
4. Sub-chord `duration` = slice length (float, can be off-grid)
5. BPM is used to convert beat positions to absolute time for audio playback (not used by MelodyGen directly)

### 4.4 Wraparound Example

```
Progression: [Chord A, Chord B, Chord C]
Subsection loop: [Chord B, Chord C]  (user is auditioning a subsection)

Rest at start of Chord B:
  → Wraps to last slice of Chord C (entire progression, not subsection)
  → Melody generated using Chord C's harmonic context

This ensures the melody is musically coherent whether the user:
- Loops the entire progression
- Loops a subsection for auditioning
```

---

## 5. BPM Handling

**Progress app:**
- `state.bpm` is global, adjustable
- `beatDuration = (60.0 / bpm) * beats` (seconds per chord slot)
- `stepsPerBeat` derived from `shortestNoteLimit` (16, 32, 64)
- `totalSteps = beats * stepsPerBeat`

**MelodyGen:**
- Works in **beat units** (floats), not seconds
- BPM is irrelevant to melody generation — it's only needed for audio playback

**Bridge:** BPM is passed through the bridge but not consumed by MelodyGen. It's used by the Progress app to convert MelodyGen's beat-based output back to absolute time for audio scheduling.

```js
function beatToSeconds(beatPosition, bpm) {
  return (60.0 / bpm) * beatPosition;
}
```

------

## 6. Output: MelodyResult → Progress App

**MelodyGen output:**
```js
MelodyResult {
  allNotes: MelodyNote[],    // Deduplicated, sorted by startTime
  metadata: {
    passResults: PassResult[],
    executionLog: Object[],
    phraseContext: PhraseContext,
    chords: Chord[],
    originalNoteCount: number,
    finalNoteCount: number
  }
}
```

**Progress app consumption:**
```js
function melodyGenResultToProgressNotes(melodyResult, bpm) {
  return melodyResult.allNotes.map(note => ({
    pitch: note.pitch,
    stepTime: note.startTime,        // beat position (Progress uses beat-based timing internally)
    noteDuration: note.duration,     // beats
    melodyInst: 'melody',
    isAnchor1Step: note.role === 'structural',
    isAnchor2Step: note.role === 'cadence',
    isIsolated: note.role === 'connector',
    clusterRole: note.role,
    metadata: note.metadata,         // preserve pass-specific metadata
  }));
}
```

---

## 7. Engine Integration Points

The three integrated engines (Microtonal, Motif, Style) can be used as **post-processing passes** on MelodyGen output, or as **standalone processors**:

### 6.1 MicrotonalEngine

**Input:** `MelodyNote[]` (any source)
**Output:** `MelodyNote[]` (same count, pitches adjusted, metadata updated)
**Use in Progress:** Apply after melody generation to convert to the desired tuning system (12-TET, quartertone, just intonation, pythagorean).

### 6.2 MotifEngine

**Input:** `MelodyNote[]` (structural notes preferred)
**Output:** `MelodyNote[]` (with motif transformations applied)
**Use in Progress:** Extract motifs from generated melody, apply transformations (transposition, sequence, inversion, retrograde, augmentation, diminution) for variation.

### 6.3 StyleEngine

**Input:** `MelodyNote[]` (any source)
**Output:** `MelodyNote[]` (same count, pitches/durations adjusted)
**Use in Progress:** Apply genre-specific rules (baroque, classical, jazz, pop) to refine melody realization.

---

## 8. Full Integration Flow (Actual)

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

---

## 8.5 Pre-Processing Module Contract```

---

## 8.5 Pre-Processing Module Contract

The pre-processing module (`progressBridge.js`) is the bridge between Progress's raw multi-track data and MelodyGen's `Chord[]` interface.

**Full specification:** See `progress_data_analysis.md` section 8 for complete input/output formats.

**Key responsibilities:**
1. **Collect all event boundaries** — Find every unique time point where anything changes across all tracks (chord transitions, bass changes, arpeggio slices, drum hits)
2. **Split at boundaries** — Create a `Chord` object for each slice between event boundaries, with correct `beatStart`
3. **Resolve bass notes** — If a bass note exists at this time, use the bass pitch as the effective root; otherwise use the chord symbol's root
4. **Handle rest slices** — Inherit preceding chord's properties; wraparound to last chord if at start of progression
5. **Preserve metadata** — `originalDuration`, `sourceTrack`, `hasDrumHits`, `isContinuation` on each chord
6. **Backward compatibility** — If Progress passes only `chords` (no bass/drum), produces the same flat `Chord[]` array

**Function signature:**
```js
export function preprocessProgressData(progressData)
  @param {Object} progressData - Raw data from Progress app
  @param {Object[]} progressData.chords - Chord progression array
  @param {Object} [progressData.bassTrack] - Optional bass track
  @param {Object} [progressData.drumTrack] - Optional drum track
  @returns {Chord[]} Flat array of Chord objects with correct beatStart values
```

**Input format (from Progress app):** See `progress_data_analysis.md` section 8 for complete example.

**Output format (for MelodyGen):** See `progress_data_analysis.md` section 8 for complete example.

---

## 9. Current Limitations & Future Work

### 8.1 Limitations

1. **No PhraseEngine**: The 6-engine architecture (PhraseEngine, MotifEngine, ExpectationEngine, VoiceLeadingEngine, StyleEngine, MicrotonalEngine) currently only has 3 engines + 5 passes. The PhraseEngine (macro contour planning) and ExpectationEngine (listener prediction) are not yet implemented.

2. **No VoiceLeadingEngine**: Large leaps are not compensated by counter-directional motion (leap up → step down pattern).

3. **Fixed phrase structure**: The current pipeline generates one phrase per execution. Multi-phrase compositions require multiple executions.

4. **No counter-melody**: The Progress app supports counter-melody modes (contrary, harmonize, call-response), but MelodyGen's Pass E only handles basic call-response pitch correction.

5. **No rhythmic freedom within chords**: The 5-pass pipeline generates notes at chord boundaries and fills between them. It doesn't support the Progress app's per-slice rhythmic freedom.

### 8.2 Future Work

1. **PhraseEngine**: Generate phrase roles, tension curves, register trajectories, cadence plans, and climax plans before any pitches are selected.

2. **ExpectationEngine**: Model listener predictions at multiple scales (pitch, motif, phrase, form, style) to create meaningful anticipation and resolution.

3. **VoiceLeadingEngine**: Maintain perceptually coherent motion with leap compensation and momentum tracking.

4. **Multi-phrase support**: Generate melodies spanning multiple phrases with narrative arcs.

5. **Counter-melody generation**: Generate independent but complementary melodic lines.

6. **Rhythmic freedom within chords**: Support per-slice rhythmic decisions within chord blocks.

7. **Progress app melody generator replacement**: Once MelodyGen's quality, capabilities, and accuracy exceed the existing `melodyGenerator.js`, replace it entirely.

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
| **Effective root** | The bass note at a given time, which overrides the chord symbol's root for melody purposes (Progress app pre-processing) |
| **Continuation** | A sliced chord that has the same pitch as the previous slice, indicating a sustained note that was split at a boundary |

---

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2025-06-16 | Initial draft. Covers data models, timing/subdivision model, BPM handling, output mapping, engine integration, full integration flow, limitations, and glossary. |
| 0.2 | 2025-06-16 | Added bass line integration (separate bass track, effective root, melody consideration of bass). Added rest attribution (rest slices inherit preceding chord). Added wraparound behavior (rest at start wraps to last slice of entire progression, not subsection). Updated subdivision model diagram and bridging code. |
| 0.2 | 2025-06-17 | Updated with verified data format analysis from `progress_data_analysis.md`. Replaced pseudocode in Sections 3, 4, 5 with actual data structures from store.js, melodyTuning.js, bassGenerator.js. Added pre-processing module contract (Section 8.5). Updated integration flow to show actual data passing. Added glossary entries for pre-processing module, event boundary, sliced chord, effective root, continuation. Reference `progress_data_analysis.md` for complete field names, types, and sample values. |

---

*This is a living document. Update it as both projects evolve and as new integration requirements are discovered.*
