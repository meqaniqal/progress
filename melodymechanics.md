# Melody & Countermelody Generation Mechanics

This document explains the current internal design, algorithms, and parameter mappings of the **Melody Generator** in the Progress app (located in [melodyGenerator.js](file:///Users/sheldonlawrence/Desktop/progress/melodyGenerator.js)). It details how the melody interacts with the chord progression, EDO (tuning) divisions, voice leading transitions, and user-adjustable settings.

---

## 1. System Integration & Entry Point

The melody generator's main entry point is `scheduleMelody()`. It is called during the sequencer scheduling pass for each chord slot.

### Input Parameters
- **Time/Duration**: The absolute audio context start time, slot duration, and current tempo (BPM).
- **Chords Context**: The current chord object (`chordObj`), the next chord (`nextChordObj`), and the previous chord (`prevChordObj`).
- **Tonal/Tuning Parameters**: The active chord tones (`chordNotes`), base key, active mode, and tuning divisions (EDO).
- **Voice Events**: Voiced transition events from the voice-leading / transition engine.

### Global State Persistence
To prevent melodic ideas from abruptly resetting at each chord slot boundary:
- State trackers (`globalPrevPitch`, `globalPrevCounterPitch`, `globalLastInterval`, and `globalMelodyHistory`) are declared globally at the module level.
- `melodyHistory` keeps a running window of the last 32 notes across chords, allowing call-and-response quotes to span chord changes.
- All state variables are cleared via `clearMelodyMemory()` when the transport stops or resets.

### Diagnostic Logging
The generator logs details of scheduled notes in a compact, structured console output format for each chord slot:
```text
[MelodyGen] Chord: I | Bass PC: 0
  ├─ Melody: [0:60, 3:65, 4:62, 5:64, 6:62, 7:60, 8:62, 9:65, 10:71, 14:69]
  └─ Counter: [4:48, 8:50]
```

---

## 2. Pitch Pool Construction & Scale Snapping

To ensure melody notes are always in key while respecting custom microtonal scales, the generator builds a dynamically adjusted scale grid:

1. **EDO step size**:
   $$\text{Step Size} = \frac{12.0}{\text{divisions}}$$
2. **EDO-Aware Scale Pitch Calculation**: Instead of looping standard integer MIDI numbers, the generator loops through actual microtonal steps from the bottom range to the top range ceiling, ensuring EDO compatibility:
   $$\text{Pitch} = \text{keyRoot} + \text{step} \times \text{stepSize}$$
   It projects each EDO step into 12-semitone space to check interval alignment against the scale definition, snapping to exact microtonal scale pitches.
3. **Merging Chord Tones**: It merges the scale pitches with the active chord tones to form `validPitches`.
4. **Transition Capture**: It identifies any out-of-scale transition note pitches scheduled by the voice-leading engine and includes them as targets to make ornaments sound deliberate.

---

## 3. Motivic Development & Motif Families

Instead of generating pure random notes or looping a single static motif, the generator uses **Motif Families**:

- **Motif Family Cache**: A family of three related motif cells is generated and cached:
  - **The Hook** (primary): 4-note motif array.
  - **The Connector** (transitional): 3-note fragment (last 2 notes of hook + 1 generated step note).
  - **The Cadence** (ending): 4-note retrograde of the hook shifted diatonically down.
- **Phrasing Selection**: Selects the active cell based on progression phrasing position:
  - Phrase beginning ($<0.25$ progression): **Hook**
  - Phrase ending ($\ge 0.75$ progression): **Cadence**
  - Phrase middle ($0.25 \le \text{progress} < 0.75$): **Connector**
- **Sequential Indexing**: Rather than indexing notes modulo the motif's length (which creates repetitive groupings of 3 or 4 notes), notes are indexed sequentially using a phrase-bound note counter (`noteCountThisPhrase % sliceMotif.length`), which resets every 4 chord slots.
- **Runs / Stepwise Continuation**: During sixteenth-note runs, the engine allows stepwise scale continuation in the current direction instead of wrapping back to the beginning of the motif.
- **Variations**: Based on the variation depth, the active cell is transformed via Inversion (depth $>0.3$), Retrograde (depth $>0.5$), or Sequence shifting (depth $>0.7$).

---

## 4. Phrasing, Rhythmic Rate Variation & Tension Curves

Rhythm is generated dynamically using a flexible grid that supports rate changes and phrase resolution:

- **Tension Curve Automation**: The tension curve serves as a master automation bus. The current tension level dynamically shapes:
  - **Rhythmic Density**: Sparser at low tension, denser at high tension.
  - **Note Durations**: Slower values (quarter/eighth notes) at low tension, faster (sixteenths) at high tension.
  - **Register Ceiling**: Extends the upper octave range limits at peak tension.
  - **Ornament Probability**: More grace notes/bends at peak tension.
  - **Chromatic Probability**: Restricts chromatic alterations to jazz/blues profiles under high tension.
- **Rhythmic Rate Variation**: Instead of a static 16th-note grid, the subdivision rate is chosen beat-by-beat based on current tension (e.g. alternating between eighths and sixteenths runs).
- **Phrase Resolution**: If a note is followed by silence (due to rests or beat endings) and lands on a tense pitch class (e.g. 7ths, tritones), the engine automatically resolves it to a stable chord tone (root, 3rd, 5th) before the pause.

---

## 5. Countermelody Orchestration

If enabled, the countermelody runs concurrently using contrary, harmonize, or call-and-response relationships:

- **Walking Contrary Lines**: If the contrary mode is selected and the melody is silent, the countermelody walks stepwise (`findClosestStep`) along the scale, avoiding static drone repetitions.
- **Advanced Call & Response**: The response quotes the ending notes of the preceding melody call, shifted lower, and resolves harmonic tension to stable chord tones.

---

## 6. Genre-Specific Rules & Enclosures

- **Jazz**: 
  - Restricts the **Vertical Congruence** (doubling avoidance) filter to jazz, demoting active chord/bass pitch class weights by 60% to favor extensions.
  - Bebop major, minor, and mixolydian scales are used to introduce scale-tone passing notes.
  - Encirclements targeting strong beats approach chord tones from a semitone above/below.
- **Blues**: 
  - Introduces flat 3rd/5th blue note offsets and bend glides.

---

## 7. Expectation Violation (Surprise Gestures)

To make the melody expressive and narrative, a `surpriseQuotient` (scaling with `variationDepth * 0.2`) periodically triggers expectation-breaking gestures:
1. **Unexpected Octave Leap**: Jump a full EDO octave (+ or - divisions).
2. **Deceptive Landing**: Resolve to the scale degree 6/b6 instead of the expected root.
3. **Delayed Resolution**: Sustain a leading/tense tone instead of resolving on the downbeat.
4. **Motivic Interruption**: Insert an unexpected rest (silence).

The Leap contrary motion resolution check runs right before final pitch snapping, ensuring any leap greater than 4 semitones (or surprise leap) is resolved by moving in the contrary direction in the next step.

---

## Claude's Previous Recommendations & Feedback

*(The following is the feedback from Claude on the initial architecture, which has since been implemented in the updates above)*

This is genuinely impressive work — the motif cache, EDO-aware pitch pools, countermelody orchestration, and genre profiles show real sophistication. Here's what I'd push Gemini on next, organized by impact:

### 1. The Motif Cache Is Too Static — Composers Think in *Families*
The current system seeds one motif per key/mode. A real composer thinks in **motivic families** — a constellation of related cells that share DNA but serve different dramatic functions:
- **The Hook** (primary motif): 3–4 notes, strong rhythmic identity, used at phrase starts and returns
- **The Connector** (transitional cell): A 2–3 note fragment derived from the hook by inversion or diminution — used to bridge phrases and modulate energy
- **The Cadential Tag**: A fixed rhythmic/melodic ending gesture that always signals phrase closure — listeners subconsciously learn to expect it

These three cells should be **derived from each other** at seed time (not independently generated), so everything feels like it belongs together. The hook's last two notes become the connector's first two. The cadential tag is the hook in retrograde, compressed. This is how Beethoven, Brahms, and Monk all worked.

### 2. Syncopation Needs a Rhythmic *Personality*, Not a Probability
The current density/rest approach treats rhythm as a statistical distribution. But syncopation isn't random omission — it's **deliberate displacement with expectation**. A pro thinks about it this way:
- **Level 1 — Anticipation**: Move a note that would land on beat 3 to the "and" of beat 2 (one 8th early). The listener's body still feels beat 3 arriving even though the note was early.
- **Level 2 — Backbeat displacement**: In R&B/funk/hip-hop, the melodic phrase *consistently* starts on beat 2 or the "and" of 1 — never on the downbeat. This is structural, not random.
- **Level 3 — Hemiola**: Group notes in 3s inside a 4/4 grid, creating a polyrhythmic pull. Extremely satisfying when resolved.
- **Level 4 — Metric modulation feeling**: Phrases written to imply a different tempo than the underlying grid (e.g. a phrase that feels like it's in 3/4 inside a 4/4 loop)

### 3. Vertical Congruence — Think in *Functional Layers*, Not Just Chord Tones
The document mentions this as an open question. Here's the professional framework:
The melody, chords, and bass should occupy **distinct harmonic roles** at any moment:
- **Bass**: Root or 5th (structural foundation — never doubled in melody unless intentional for power)
- **Chords (inner voices)**: 3rd and 7th (the "guide tones" that define chord quality)  
- **Melody**: Extensions and alterations (9th, 11th, 13th, ♭9, ♯11) *or* a chord tone not already prominent in the voicing

This means the melody engine should **query what the chord and bass tracks are currently playing** and prioritize notes *not already covered*. In jazz this is called **avoiding doublings** — a master orchestrator never stacks the same pitch class across melody and inner voices unless making a deliberate unison statement.

For microtonal/EDO scales this becomes even more critical: with 19 or 31 divisions there are neutral intervals that sound dissonant if doubled at the wrong octave but consonant as unique voices.

### 4. The Jazz Enclosure Logic Is Incomplete
The current jazz implementation does chromatic approach from ±1 semitone. Real bebop encircling is more specific:
- **Standard enclosure**: Approach from one chromatic step *above*, then one diatonic step *below*, then land on target. (e.g., targeting C: play C♯ → B → C)
- **Double chromatic**: Both from above and below chromatically (C♯ → B♭ → C)
- **Scale-tone enclosure**: Upper neighbor is diatonic, lower neighbor is chromatic
- The enclosure always resolves **on a strong beat** — the approach notes are rhythmically weak (offbeats or 16th note pickups)
- Enclosures should only target **chord tones**, never passing tones

Also missing from the jazz profile: **bebop scale** usage, where a chromatic passing tone is inserted between scale degree 7 and the root (or between 5 and 6) so that chord tones always land on downbeats when running the scale in 8th notes. This is the fundamental mechanism of bebop line construction and it's purely algorithmic.

### 5. Tension Curve Should Drive *Multiple* Parameters Simultaneously
Currently tension drives density. But a composer uses tension curves to shape everything at once:

| Tension Level | Density | Rhythmic Value | Pitch Range | Chromaticism | Ornaments |
|---|---|---|---|---|---|
| Low (opening) | Sparse | Quarter/Half notes | Low register | Diatonic only | Minimal |
| Building | Moderate | 8th notes dominant | Rising | Occasional chromatic | Grace notes |
| Peak | Dense | 16th notes + syncopation | Upper register | Approach notes, alterations | Trills, bends |
| Release | Sparse again | Longer values | Settling down | Resolving | None |

### 6. Call & Response Is Architecturally Correct But Musically Underdeveloped
The countermelody's call & response splits time mechanically at `dialogueSplitTime`. A real composer makes the *content* of the response meaningful:
- The response should **quote the end of the call** — take the last 2 notes of the melody phrase and use them as the *first* 2 notes of the counter response (motivic connection)
- The response should answer the **harmonic implication** of the call: if the call ends on a tense note (7th, leading tone), the response *must* resolve it
- Response phrases in blues/gospel traditions are often *shorter* than the call — the call speaks at length, the response is a pointed one-word reply
- In jazz, the response can be **rhythmically displaced** — the call ends, a beat of silence passes, then the response enters slightly late (conversational timing, not mechanical)

### 7. Missing Entirely: *Expectation Violation* as a Compositional Tool
Every technique so far makes the melody more correct. But what makes melody *interesting* — what makes a listener lean in — is the **controlled violation of expectation**. A composer with 50 years of experience knows exactly when to break the rule:
- **The unexpected leap**: After 8 bars of mostly stepwise motion, a sudden octave leap is electrifying. The engine should detect long runs of stepwise motion and occasionally inject a deliberate, harmonically justified leap.
- **The delayed resolution**: Arrive at the leading tone but *don't resolve it immediately* — sustain the tension for an extra beat before stepping up to the tonic. This is one of the most effective expressive devices in tonal music.
- **The deceptive landing**: The phrase sounds like it's heading to the tonic (root) but lands on the 6th instead (deceptive cadence equivalent in melody). Surprising but not wrong.
- **The motivic interruption**: Start the main motif, play 2 notes, then cut to silence or a completely different register. Incomplete statements create powerful forward pull.

---

## 8. Latest Music Theory & Bug Fixes (June 2026)

Based on diagnostic log auditing, several critical music theory and state bugs have been resolved:

1. **Index-Based Step Transitions (Countermelody Drone & Boundary Bounce Fix)**: Instead of adding floating-point semitones to pitch values (which frequently snapped back to the same note on sparse scale degrees), `findClosestStep` and the contrary movement mode now step by index in the active scale pitches array (e.g. index $\pm 1$ or $\pm 2$). When a step hits the boundary (index 0 or array length), it reverses direction (bounces back) rather than capping, completely preventing the countermelody from getting stuck in a single-note drone or boundary stall.
2. **Cross-Chord Range Continuity**: The transposition anchor is calculated by finding the chord tone closest to the final pitch of the previous chord slot (`globalPrevPitch`) instead of blindly using the lowest chord tone. This prevents wild $18$-semitone leaps between chord transitions and transposes non-octave scales (such as Bohlen-Pierce) into the correct auditory register.
3. **Repeated Pitch Prevention (Conjunct Step Rule)**: If a scheduled note is identical to the preceding step's note, the engine forces the pitch to move by $1$ index degree in the active direction. If the note is at the edge of the scale boundary, the direction is inverted.
4. **Empty Slot Mitigation**: Configured an `activeDensity` floor of `0.2` and validated the chosen rhythmic templates. If a template consists entirely of rests, a note is automatically forced on the downbeat to guarantee minimal melodic activity.
5. **Harmonic Resolution Gating**: The phrase-ending resolution logic is gated to bypass dominant, diminished, and half-diminished chords, as well as antecedent phrases. This keeps harmonic tensions (7ths, leading tones, tritones) active exactly where they are expected in the progression.
6. **Slot Step Index Boundary Capping**: The step scheduling loop calculates `maxSteps` dynamically using the exact slot duration, ensuring that notes are not scheduled beyond the slot boundary and preventing bleeds between chord transitions.
7. **Refined Vertical Congruence**: Tightened `rangeLimit` to $2.1$ EDO steps, ensuring the doubling avoidance filter shifts notes by at most a step, preserving conjunct scale runs.

---

## 9. Active Concerns & Unresolved Issues

### Unresolved Rhythmic Run Audibility (Fast Runs)
- **Problem**: Despite relaxing the tension-based subdivision caps (allowing triplets up to 3 at tension $<0.25$, and sixteenth triplets up to 6 at tension $<0.55$) and decreasing density-based silencing thresholds to `Math.min(0.95, activeDensity * 2.2)`, fast rhythmic runs (triplets, sixteenth triplets, or thirty-second notes) are still not audibly playing in the sequencer during playback.
- **Current State**:
  - The generator successfully computes subdivision blueprints (e.g. `acceleration` containing 6s and 8s) and maps them to steps correctly.
  - Synthesizer ADSR envelopes in [synthEngines.js](file:///Users/sheldonlawrence/Desktop/progress/synthEngines.js) have been fixed to clamp envelope values based on note `duration` instead of the buffer's `sampleLen`.
  - All Jest unit tests pass with 100% determinism.
- **Next Steps for Investigation**:
  - **Scheduler/Transport Dropping**: Investigate if the browser's audio clock or scheduler loop (e.g. in `sequencer.js`) is dropping or skipping notes with extremely short duration/offsets, or if the note scheduler is collapsing notes scheduled too close together.
  - **Tension/Density Slider Mapping**: Verify if changes to the density/tension UI sliders are actually propagating to the `settings.density` object that `melodyGenerator.js` relies on.
  - **Audio Node Clamping**: Confirm if the Web Audio API nodes in the melody sampler/oscillator engines have a threshold duration below which the gain nodes clamp to zero.