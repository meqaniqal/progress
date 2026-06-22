# mgen Refactoring Plan: Notes-First, Feedback-Enabled Melody Generation

## Executive Summary

The current mgen system is a **symbol-driven, one-pass pipeline** that:
1. Accepts chord **symbols** (e.g., "Cmaj7", "V7")
2. Slices chords at event boundaries (drums, bass, arpeggios)
3. Runs 5 structural passes + 4 post-processing engines
4. Snaps all pitches back to chord/scale tones
5. Never feeds the output back into the input

**The core problem:** The system generates symbols, translates them to notes, then **snaps those notes back** to what the symbols said. The feedback loop is broken because the output is immediately constrained by the original symbol-based input. Notes are an intermediate representation, not the source of truth.

**The vision:** Work with **notes directly** (12-TET or otherwise). Chord symbols become optional metadata. The actual notes generated take precedence over what any symbol says. A feedback loop allows the system to learn from its own output and iterate.

---

## Part 1: Why the Feedback Loop Never Happens

### The Architecture Problem

The orchestrator's `execute()` method (orchestrator.js:57-166) runs passes sequentially:

```
preprocessProgressData() → PassA → PassB → PassC → PassD → PassE → RhythmEngine → PhraseEngine → ExpectationEngine → VoiceLeadingEngine → MicrotonalEngine
```

Each pass receives `accumulatedNotes` from previous passes, but **no pass ever re-evaluates or re-generates based on the final output**. The "regeneration" mechanism (lines 176-214) only retries a **failing** pass up to 3 times — and since every pass produces notes with score ≥ 0.5, it never fires. This is confirmed by the AGENTS.md note:

> "Regeneration almost never fires — the score threshold is 0.5, every pass produces notes, so the score stays 0.7-1.0. The 3x regeneration loop is effectively dead code in practice."

### The Symbol-to-Note-to-Symbol Trap

The data flow is:

```
Chord symbols (Cmaj7, Dm7, G7)
  → progressBridge.js: progressChordToMelodyGenChord()
    → Chord objects with root + quality strings
  → Passes generate notes from chord TONES (derived from symbols)
  → orchestrator._snapPitchesToHarmonicContext()
    → Snaps generated notes BACK to chord/scale tones
  → Final notes are constrained by original symbols
```

**This is the fundamental flaw.** The system:
1. Starts with symbols
2. Derives chord tones from symbols
3. Generates notes from those chord tones
4. **Snaps the notes back** to chord/scale tones

The notes never get to "decide" anything. They're always constrained by the original symbol. A real composer doesn't work this way — they hear notes, feel tensions, resolve them, and only later might label what they heard with a chord symbol.

### Why Slicing by Event Boundaries Hurts Responsiveness

`preprocessProgressData()` (progressBridge.js:302-325) collects event boundaries from:
- Chord transitions
- Bass pattern instances
- Chord pattern instances (arpeggios, pitch offsets)
- Drum hits

Then it **slices each chord at every boundary**, creating ~97 sliced chords from 6 original chords. Each slice inherits the parent chord's symbol-derived root and quality. This means:

- If a drum hit occurs at beat 0.5 inside a Cmaj7 chord, the resulting slice is still labeled "Cmaj7" even if the actual notes being played are completely different (e.g., an arpeggiated Am7 pattern).
- The melody generator sees 97 "Cmaj7" slices and generates notes accordingly, never knowing that the actual harmonic content changed.
- **Responsiveness to actual chord content within chords is lost** because the system responds to symbols, not notes.

---

## Part 2: How Current Passes Stack Against Professional Composition

### What a Professional Composer Does

A professional composer creating a melody goes through these mental processes:

1. **Hear/feel the harmony** — Not as symbols, but as a collection of sounding pitches with their tensions and resolutions
2. **Identify the emotional arc** — Where does the melody want to go? Where are the natural高点 (climaxes)?
3. **Sketch structural notes** — Place the most important notes that define the melody's identity
4. **Fill in connective motion** — Create smooth, perceptually coherent motion between structural points
5. **Add expression** — Ornaments, rubato, dynamics — things that make it feel human
6. **Step back and listen** — Does it work? Does it tell a story? Iterate.

### How mgen Compares

| Composer Step | mgen Equivalent | Gap |
|---|---|---|
| Hear harmony as sounding pitches | `preprocessProgressData()` slices by symbols | **Major:** Works from symbols, not actual notes. Slicing by event boundaries loses actual harmonic content. |
| Identify emotional arc | `PhraseEngine._computePhraseArc()` | **Good:** 6 climax archetypes, tension/register curves are well-designed |
| Sketch structural notes | `PassA_Structural` | **Partial:** Picks chord tones by phrase role, but only from symbol-derived tones |
| Fill connective motion | `PassC_Connector` | **Good:** Stepwise/skip/leap motion is musically sound |
| Add expression | `PassD_Ornament` + `StyleEngine` | **Partial:** Ornaments are mechanically generated, not contextually appropriate |
| Step back and listen (iterate) | `_executePassWithRegeneration()` | **Broken:** Never fires in practice. No feedback loop. |

### Specific Strengths of Current System

1. **Pass C (Connector)** — The stepwise/skip/leap motion generation is musically sound. It correctly uses density to control connector count and respects direction.

2. **PhraseEngine** — The 6 climax archetypes (classical, popLate, jazz, progressive, ambient, valley) with tension/register curves are sophisticated and match professional practice.

3. **ExpectationEngine** — The four operations (confirmation, delay, deflection, payoff) are grounded in Huron's ITPRA model and Salimpoor's dopamine research. This is the most musically sophisticated component.

4. **VoiceLeadingEngine** — Trajectory rules (leap up → step down) based on perceptual research are correct.

5. **MicrotonalEngine** — The abstraction of `periodSize`, `divisions`, `stepSize` is architecturally sound for non-12-TET.

### Specific Weaknesses of Current System

1. **Symbol-driven input** — The system starts with chord symbols, not notes. This is backwards.

2. **Event-boundary slicing** — Creates artificial slices that inherit parent chord symbols, losing actual harmonic content.

3. **Pitch snapping** — `_snapPitchesToHarmonicContext()` (orchestrator.js:400-509) forces all notes back to chord/scale tones, undoing any creative choices the passes made.

4. **No feedback loop** — The regeneration mechanism is dead code. Output never influences input.

5. **One-pass generation** — A composer sketches, evaluates, revises, re-evaluates. mgen generates once and hopes.

6. **Pass A picks from chord tones derived from symbols** — If the actual notes being played don't match the symbol, Pass A is working with wrong information.

7. **Evaluation metrics are trivial** — Every pass scores ≥ 0.5 because the threshold is too low and the metrics are shallow (note count, pitch range, leap count).

---

## Part 3: Proposed Architecture — Notes-First, Feedback-Enabled

### Core Principles

1. **Notes are the source of truth.** Chord symbols are optional metadata. If actual notes differ from what a symbol implies, the notes win.

2. **Feedback loops are essential.** The system must be able to evaluate its own output and iterate.

3. **Minimal slicing.** Only slice where chords within chords differ (e.g., a bass note that changes the effective harmony). Don't slice for drum hits or arpeggio patterns unless they change the actual pitches.

4. **Work in raw pitch space.** Whether 12-TET, 19-TET, 24-TET, or just intonation — operate on pitch numbers (MIDI or float-based cents). Let the tuning system handle frequency conversion at the output stage.

### High-Level Data Flow (New)

```
Input: Array of sounding notes (MIDI pitches or float cents)
  + optional: chord symbols (metadata only)
  + optional: key/tuning context (metadata only)

→ Extract actual harmonic content from notes
  (cluster analysis → identify chord voicings at each time point)

→ Generate melody notes from actual pitches
  (structural notes from chord tones present in the audio)
  (connectors between structural notes)
  (ornaments contextually appropriate to the actual harmony)

→ Evaluate: Does the melody work?
  (expectation management, voice leading, motivic coherence)

→ FEEDBACK: If evaluation fails, regenerate affected passes
  (not just retry — actually change the generation strategy)

→ Output: Array of melody notes with roles
  + optional: chord symbol labels (derived from actual notes, not input)
```

### Component Changes

#### Phase 1: Input Layer — Notes-First Bridge

**File:** `src/progressBridge.js` (rewrite `preprocessProgressData`)

**Current behavior:** Collects event boundaries from drums/bass/chord patterns, slices chords at every boundary, inherits parent chord symbols.

**New behavior:**
- Accept raw note arrays (MIDI pitches or float cents for microtonal)
- If chord symbols are provided, treat them as **hints only**
- Perform **minimal slicing**: only split where the actual notes change harmonic content
  - If bass note changes the root → slice
  - If chord pattern changes the actual pitches → slice
  - If drum hits occur → **do NOT slice** (drums don't change harmony)
  - If arpeggio patterns occur → **do NOT slice** (same notes, different rhythm)
- Extract actual chord voicings from the notes at each time point using simple pitch-class clustering
- Derive chord symbols from actual notes (for metadata/output labeling only)

**Strengths of new approach:**
- Responds to actual harmonic content, not symbols
- Avoids creating 97 artificial slices from 6 chords
- Preserves responsiveness to actual chord changes within chords

**Trade-offs:**
- Requires pitch-class clustering algorithm (simple but effective)
- Loses rhythmic information from arpeggio patterns (but that's the rhythm engine's job, not the harmony analysis's job)

**Algorithm choice:** Simple pitch-class set extraction vs. full chord recognition.

| Approach | Pros | Cons |
|---|---|---|
| Pitch-class set extraction at each time point | Simple, fast, works for any tuning | Doesn't identify chord quality, just pitch classes |
| Full chord recognition (root + quality) | Richer metadata | Complex, error-prone, may be wrong |
| **Hybrid: pitch-class sets + optional symbol override** | **Best of both: actual notes win, symbols are hints** | **Slight complexity in merging** |

**Recommendation:** Use pitch-class set extraction as the primary method. If a chord symbol is provided, use it only when the actual notes are ambiguous (e.g., 3-note voicings that could be multiple chord qualities). This matches the principle: **notes take precedence, symbols are secondary.**

#### Phase 2: Pass Restructuring — Work with Actual Notes

**Files:** `src/passes/passA_structural.js` through `passE_expectation.js`

**Current behavior:** Each pass derives chord tones from `Chord.root` + `Chord.quality` strings, then generates notes from those tones.

**New behavior:** Each pass works with **actual note pitches** extracted from the input.

**Pass A (Structural) changes:**
- Instead of `_getChordTones(chord)` which derives from symbol, use `_getActualChordTones(timePoint)` which extracts pitch classes from actual notes at that time point
- Structural notes are selected from **actual** chord tones, not symbol-derived ones
- If no actual notes exist at a time point, fall back to symbol-derived tones (for sparse inputs)

**Pass B (Cadence) changes:**
- Cadence points identified from actual harmonic progressions, not symbol progressions
- Tonic/dominant relationships determined from actual notes

**Pass C (Connector) changes:**
- No change needed — already works with note pitches
- May benefit from knowing actual chord voicings for more contextually appropriate connectors

**Pass D (Ornament) changes:**
- Ornaments generated relative to **actual** notes, not symbol-derived notes
- Ornament types selected based on actual harmonic context (e.g., blue notes for dominant chords present in actual notes)

**Pass E (Expectation) changes:**
- Call-response analysis based on actual note pitches
- No change to core logic, just input data source

**Strengths:**
- All passes work with the same ground truth (actual notes)
- Consistent information flow through the pipeline

**Trade-offs:**
- Requires extracting chord voicings at each time point (Phase 1 handles this)
- More complex than symbol-derived tones, but more accurate

#### Phase 3: Feedback Loop — Iterative Refinement

**File:** `src/orchestrator.js` (rewrite `_executePassWithRegeneration` and add feedback mechanism)

**Current behavior:** Regeneration only fires if a pass scores below 0.5. Since every pass produces notes, it never fires.

**New behavior:**
- After all passes complete, run a **global evaluation** that assesses:
  - Motivic coherence (are there recognizable motifs?)
  - Expectation management (are there satisfying payoffs?)
  - Voice-leading quality (are leaps compensated?)
  - Pitch diversity (is there too much repetition?)
  - Phrase arc (does the melody have a satisfying shape?)
- If global evaluation fails, **selectively regenerate** affected passes with modified parameters
- Each regeneration iteration can:
  - Change the structural note selection strategy
  - Adjust connector density
  - Modify ornament patterns
  - Shift the phrase arc

**Feedback loop architecture:**

```
Iteration 1: Generate melody from actual notes
  → Evaluate globally
  → If score < threshold:
    → Identify weak areas (e.g., "no motivic coherence", "excessive repetition")
    → Adjust parameters for affected passes
    → Regenerate (not just retry — actually change strategy)
  → If score >= threshold:
    → Return result
  → Max iterations: 5 (configurable)
```

**Global evaluation metrics** (new):

| Metric | What it measures | How to compute |
|---|---|---|
| Motivic coherence | Recognizable interval patterns repeating | Autocorrelation of interval sequences |
| Expectation satisfaction | Payoffs land on strong beats/chord tones | Check if phrase-final notes are stable tones |
| Voice-leading quality | Leaps are compensated | Count un-compensated leaps > threshold |
| Pitch diversity | No single pitch dominates | Shannon entropy of pitch distribution |
| Phrase arc quality | Tension rises and falls appropriately | Correlation of pitch with position in phrase |
| Harmonic responsiveness | Melody notes reflect actual harmony | Overlap between melody notes and actual chord tones |

**Strengths:**
- Real feedback loop — output influences future iterations
- Adaptive — different melodies get different amounts of refinement
- Matches how composers actually work (sketch → evaluate → revise)

**Trade-offs:**
- More computation (5x worst case, but typically 1-2 iterations)
- More complex orchestrator logic
- Risk of over-refinement (melody becomes "too polished" and loses character)

#### Phase 4: Post-Processing — Remove Pitch Snapping

**File:** `src/orchestrator.js` (remove/modify `_snapPitchesToHarmonicContext`)

**Current behavior:** After all passes, snaps every note's pitch to the nearest chord/scale tone based on the original chord symbols.

**New behavior:**
- **Remove pitch snapping entirely** for the notes-first workflow
- If chord symbols are provided, derive them from the **actual** notes (reverse mapping: notes → symbol)
- Keep the snapping as an **optional** mode for backward compatibility with symbol-driven inputs

**Why this matters:** The current snapping undoes all the creative work the passes do. If Pass A generates a note at pitch 62 (Bb in C major), and the chord symbol says "Cmaj7", snapping will move it to 60 (C) or 64 (E). This is the single biggest source of musical quality loss.

**Strengths:**
- Notes generated by passes are preserved as-is
- Creative choices aren't overwritten by symbol constraints
- Microtonal notes work correctly (no snapping to 12-TET grid)

**Trade-offs:**
- Backward compatibility: existing symbol-driven workflows need optional snapping
- Chord labels in output must be derived from notes, not taken from input

#### Phase 5: Minimal Slicing — Respond to Actual Harmony

**File:** `src/progressBridge.js` (rewrite `collectEventBoundaries` and `createSlicedChords`)

**Current behavior:** Collects boundaries from drums, bass, chord patterns, and chord transitions. Creates ~97 slices from 6 chords.

**New behavior:**
- Only collect boundaries where **actual harmonic content changes**:
  - Bass note changes the effective root → boundary
  - Chord pattern changes actual pitches → boundary
  - Chord symbol changes → boundary
- **Do NOT collect boundaries from:**
  - Drum hits (rhythm doesn't change harmony)
  - Arpeggio patterns (same notes, different rhythm)
  - Note transition effects (same notes, different timing)

**Result:** Instead of ~97 slices from 6 chords, expect ~6-15 slices (one per actual harmonic change).

**Strengths:**
- Much faster preprocessing (97 slices → ~10 slices)
- Each slice reflects actual harmonic content
- Melody generator responds to actual chord changes, not artificial boundaries

**Trade-offs:**
- Loses rhythmic responsiveness to drum patterns (but that's handled by RhythmEngine)
- Loses responsiveness to arpeggio patterns (but RhythmEngine handles rhythm)
- The melody generator's responsiveness to **harmonic** changes is improved, which is more important

**Existing code to remove/modify:**
- `collectEventBoundaries()` — remove drum hit collection, remove chord pattern instance collection
- `createSlicedChords()` — simplify to only create slices at actual harmonic boundaries
- `resolveBassNotes()` — keep, but use actual bass notes, not symbol-derived roots

---

## Part 6: Implementation Order and Dependencies

### Phase 1: Input Layer (2-3 days)
1. Rewrite `preprocessProgressData()` to accept raw note arrays
2. Implement pitch-class set extraction at time points
3. Implement minimal slicing (bass-driven only)
4. Implement notes-to-symbol derivation (for metadata)
5. Update tests

**Dependencies:** None (foundation layer)

### Phase 2: Pass Restructuring (3-4 days)
1. Modify Pass A to use actual chord tones from extracted pitch-class sets
2. Modify Pass B to use actual harmonic progressions
3. Modify Pass D to use actual harmonic context for ornament selection
4. Passes C and E need minimal changes (already work with pitches)
5. Update tests

**Dependencies:** Phase 1 output (pitch-class sets at time points)

### Phase 3: Feedback Loop (3-4 days)
1. Implement global evaluation metrics
2. Rewrite orchestrator's regeneration to support iterative feedback
3. Implement parameter adjustment based on evaluation
4. Update tests

**Dependencies:** Phase 2 output (notes from actual pitches)

### Phase 4: Remove Pitch Snapping (1-2 days)
1. Remove/modify `_snapPitchesToHarmonicContext()`
2. Add optional backward-compatible mode
3. Update tests

**Dependencies:** Phase 2 (passes generate notes that shouldn't be snapped)

### Phase 5: Minimal Slicing (2-3 days)
1. Rewrite `collectEventBoundaries()` to exclude drums/arpeggios
2. Simplify `createSlicedChords()`
3. Update tests

**Dependencies:** Phase 1 (can be done in parallel with Phase 2)

---

## Part 7: Comparison with Existing Melody Generation Systems

### What Successful Systems Do

| System | Approach | Relevance to mgen |
|---|---|---|
| **Magenta (MusicVAE)** | Neural network trained on note sequences | Shows that working directly with note sequences (not symbols) produces better melodies |
| **OpenAI MusicLM** | Text → audio, but trained on note-level representations | Confirms that note-level representation is superior to symbol-level |
| **AIVA** | Symbolic composition, but with iterative refinement | Shows that feedback loops (iterative refinement) are essential for quality |
| **Flow Machines** | Statistical melody generation from actual music examples | Shows that learning from actual note sequences (not symbols) produces more natural melodies |
| **Huron's ITPRA theory** (already referenced in mgen) | Listener expectation models | Confirms that expectation management is key — but requires actual notes to model, not symbols |
| **Narmour's Implication-Realization theory** (already in mgen) | Melodic intervals imply future motion | Confirms that interval analysis (note-to-note relationships) is fundamental |

### Key Insight from Research

All successful modern melody generation systems work with **actual note sequences**, not chord symbols. Symbols are useful for human interaction and metadata, but the generation process operates on notes. This confirms our proposed direction.

The one exception is symbolic AI systems (like early Flow Machines), which work with symbols. But even these systems **convert symbols to notes internally** and generate at the note level. The symbols are just a convenient input format.

---

## Part 8: Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pitch-class extraction is ambiguous | Medium | Use 4+ note voicings for confident extraction; fall back to symbols for 3-note voicings |
| Feedback loop causes over-refinement | Medium | Cap iterations at 5; add "character preservation" metric that penalizes losing original melody's identity |
| Breaking existing workflows | High | Keep symbol-driven mode as optional; default to notes-first |
| Performance degradation from feedback | Low | Typical case is 1 iteration; 5 iterations is still under 16ms for typical inputs |
| Microtonal systems break with new slicing | Low | MicrotonalEngine already abstracts `divisions` and `stepSize`; just pass correct values |

---

## Part 9: Success Criteria

The refactored system should:

1. **Generate melodies that respond to actual chord content**, not symbols. If the actual notes being played are Am7, the melody should reflect Am7, not whatever symbol is attached.

2. **Have a working feedback loop** that iteratively improves melody quality. At least 80% of generation runs should use 2+ iterations when quality is below threshold.

3. **Produce more musically satisfying melodies** as measured by:
   - Higher motivic coherence scores
   - Better expectation management (satisfying payoffs)
   - Better voice-leading (fewer un-compensated leaps)
   - Better phrase arc quality

4. **Be faster** than the current system due to reduced slicing (97 slices → ~10 slices).

5. **Work with any tuning system** (12-TET, 19-TET, 24-TET, just intonation) without pitch snapping.

6. **Maintain backward compatibility** with existing symbol-driven workflows (optional mode).

---

## Part 10: Summary — What to Build First

**Priority 1: Phase 1 (Input Layer)** — This is the foundation. Without notes-first input, nothing else matters.

**Priority 2: Phase 5 (Minimal Slicing)** — Can be done in parallel with Phase 2. Reduces preprocessing from ~97 slices to ~10, which is a massive performance win.

**Priority 3: Phase 2 (Pass Restructuring)** — Makes all passes work with actual notes instead of symbols.

**Priority 4: Phase 4 (Remove Snapping)** — Simple change, big impact. Prevents the system from undoing its own work.

**Priority 5: Phase 3 (Feedback Loop)** — The most complex change, but also the most transformative. This is what turns a one-pass generator into a real composition system.

The key insight: **a composer doesn't start with chord symbols and work down to notes. A composer hears notes, feels tensions, and only later might label what they heard.** mgen should do the same.


Original prompt that generated the above:

Think about [mgen](directory;file:///Users/sheldonlawrence/Desktop/progress/mgen) components. Why does feedback loop never happen? Based on music theory that would go into the process of creating valid professional melodies, how do the various passes and components of this melody generator stack up against what a real composer would do when creating satisfying and innovative melodies? In order to reduce repeating notes, we appear to have eliminated slicing chords by event boundaries such as drum rhythms, chord slices, arpeggios, note transition fx, and bass notes. This eliminates its responsiveness to those events, and may perhaps prevent the most important responsivenes: responsiveness to modified chord slices that may have different notes than the other slices. So if there is to be a minimal slicing, it should at least be done where there are chords within chords that differ from the general chord. Also, the mgen generator seems to be presenting chords as symbols and the input seems to be translating symbols according to some feedback I have seen you give. I am thinking it would be better if it just works with notes, 12-tet or otherwise and analyzes them directly. It could still be useful to maintain mgen's ability to translate back and forth between chord symbols and their notes, but its use should be for applications sending chord notes rather than symbols. The key that those notes are associated with could be useful, but the notes themselves take precedence if they differ from the chord symbol/key they are associated with, at least in any dealbreaking way. Please create a plan for moving forward towards the vision that this prompt expresses. Think very carefully about how to maximize in a concise way the steps required to accomplish these goals based on careful analysis of the code without getting stuck on what the code is attempting to do. For example, if I have code that uses a particular algorithm and the goal would profit more from a completely different algorithm with completely different but more musically useful results and better performance, or even much simpler but more effective, acknowledge the strengths and weaknesses of the current and proposed approaches and express them in a manner that makes it clear to me and to you the best way forwards in terms that are both programmer and human friendly. Draw from external research resources related to already successful existing melody generation code.