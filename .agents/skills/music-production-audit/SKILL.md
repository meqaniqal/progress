---
name: music-production-audit
description: Discovers, analyzes, and audits music production applications for algorithmic quality, runtime performance, and production-grade usability. Produces a structured audit report with specific, actionable recommendations for architecture, logic, algorithms, and user interface changes required to meet professional music production standards.
---

# Music Production App Audit & Standards Compliance

Discovers, analyzes, and audits music production applications for algorithmic quality, runtime performance, and production-grade usability. Produces a structured audit report with specific, actionable recommendations for architecture, logic, algorithms, and user interface changes required to meet professional music production standards.

## USE FOR

- audit music app, review music production app, analyze audio app, check app quality, music production standards, DAW audit, synthesizer audit, audio engine review, music theory engine audit, performance profiling, usability audit, recommend improvements, architecture review, algorithm review, UI/UX review for music apps, Web Audio API audit, MIDI engine review, sequencer audit, mixer audit, drum machine audit, synth engine audit, melody generator audit, harmony engine audit, voice leading audit, export quality review

## DO NOT USE FOR

- actually implementing the changes (hand off to a coding agent), deploying or hosting the app, creating music content, or general web app audits unrelated to music production

---

## PHASE 1: DISCOVERY & SCOPE

### 1.1 Inventory All Music Production Layers

Identify every module responsible for music generation, audio synthesis, sequencing, or export. Categorize them:

- **Music Theory / Harmony:** Chord dictionaries, Roman numeral parsers, voice-leading engines, modulation logic, tension analysis, suggestion engines, microtonal systems.
- **Audio Synthesis:** Oscillator engines, drum synthesis, sample playback, filter/synth parameter routing, envelope generators (ADSR), LFO routing, distortion/saturation nodes.
- **Sequencing & Scheduling:** Main playback loops, look-ahead schedulers, groove/timing engines, arpeggiators, pattern resolvers, transition/voice-event evaluators.
- **Export & I/O:** MIDI export, WAV offline rendering, AI prompt generation, stem separation, file encoding.
- **User Interface:** Chord tray, pattern editor, drum grid, mixer, inspector panels, tension mapping UI, synesthetic color systems.

### 1.2 Map Data Flow

Trace how user input flows through state management, theory computation, audio scheduling, and rendering. Identify any places where DOM state is read during performance-critical paths.

---

## PHASE 2: ALGORITHM ANALYSIS

### 2.1 Music Theory Engine Audit

Examine all music theory modules for:

- **Correctness:** Do chord interval mappings, Roman numeral parsing, and scale degree calculations produce musically valid results across all supported modes and microtonal systems?
- **Completeness:** Are extended chords (9ths, 11ths, 13ths, altered dominants), modal mixture chords, and exotic scale degrees properly represented?
- **Edge Cases:** How does the engine handle microtonal intervals (EDO systems, Bohlen-Pierce, Slendro), cross-tuning transitions, and float-precision pitch comparisons?
- **Performance:** Are chord lookup tables pre-computed, or are intervals recalculated on every frame? Is the Roman numeral parser O(n) where n is the number of chord types?

**Standards Check:**
- Voice-leading algorithms must minimize total semitone movement between consecutive chords using a proper cost function (not simple root movement).
- Tension calculation must account for all interval pairs within a chord, weighted by psychoacoustic dissonance curves (not just presence/absence of tritones).
- Modulation suggestions must find true pivot chords (exact pitch-class matches across keys), not just approximate ones.
- Microtonal snapping must handle .scl and .tun formats with correct period-size arithmetic, not force everything through 12-TET modulo.

### 2.2 Audio Synthesis Audit

Examine all synthesis modules for:

- **CPU Efficiency:** Are audio buffers pre-allocated (e.g., noise buffers for drum synthesis) rather than created inside the scheduler loop?
- **Clipping Prevention:** Is there a master compressor with appropriate threshold/knee/ratio? Are soft-clipping waveShapers applied per-bus before gain staging?
- **Sample Playback:** Are custom samples decoded using OfflineAudioContext (to bypass autoplay policy) and cached? Is waveform peak extraction done once at decode time, not per-frame?
- **Oscillator Management:** Are oscillators properly tracked, stopped, and disconnected to prevent memory leaks? Is there a clean lifecycle for `activeOscillators` arrays?
- **Routing Architecture:** Is the signal chain logical (oscillator -> envelope -> filter -> gain -> panner -> bus -> compressor -> destination)? Are per-track volume controls using `setTargetAtTime` for click-free transitions?

**Standards Check:**
- The scheduler must use a look-ahead model (scheduling 25ms+ ahead) with `requestAnimationFrame`-driven UI sync, not `setTimeout`-only scheduling.
- All envelope parameters (attack, decay, sustain, release) must be mapped to Web Audio API `gainNode.gain.setValueAtTime` / `setTargetAtTime` calls, not manual amplitude multiplication.
- Drum synthesis must pre-allocate a 2-second white noise buffer at init time, not create it per-hit.
- Custom sample loading must use `decodeAudioData` on an `OfflineAudioContext` to avoid autoplay blocks, with results cached in module-scoped `AudioBuffer` variables.

### 2.3 Sequencer & Scheduler Audit

Examine the main playback engine for:

- **Timing Accuracy:** Does the scheduler use `audioCtx.currentTime` for sample-accurate scheduling with look-ahead? Is groove/timing offset applied correctly to every scheduled event?
- **State Consistency:** Does the scheduler read from a canonical state object rather than the DOM? Are section transitions (song mode) handled without state desynchronization?
- **Resource Leaks:** Are all `setTimeout` IDs tracked and cleared on stop? Are oscillators disconnected after stopping? Is melody memory cleared properly?
- **Edge Cases:** What happens when chords are deleted during playback? When loop bounds change mid-sequence? When BPM changes during playback?

**Standards Check:**
- The scheduler must maintain a `nextNoteTime` accumulator and schedule events into the Web Audio API future, not rely on JS timer precision.
- UI highlighting must be decoupled from audio scheduling; use separate timeout IDs for audio events vs. visual events.
- All scheduled audio events must have explicit `stop()` calls with graceful error handling for `InvalidStateError`.
- The scheduler must handle empty sections, deleted chords, and re-bounding without crashing or producing silence.

### 2.4 Export Engine Audit

Examine export modules for:

- **MIDI Fidelity:** Are chord and bass tracks exported on separate channels? Are velocity values appropriate (chords ~80, bass ~90)? Is the MIDI tick resolution sufficient (128 ticks/beat)?
- **WAV Quality:** Does offline rendering use `OfflineAudioContext` with the correct sample rate? Is tail padding applied to capture reverb/release tails?
- **AI Prompt Quality:** Do generated text prompts accurately describe key, mode, harmonic rhythm, and emotional character?

**Standards Check:**
- MIDI export must produce multi-track files (chords on Track 1, bass on Track 2, drums on Track 10) with proper program change messages.
- WAV export must render at the project's sample rate with sufficient buffer length to capture full release tails (minimum 0.5s padding beyond last note).
- Exported files must be valid per MIDI 1.0 specification and WAV RIFF standard.

---

## PHASE 3: PERFORMANCE PROFILING

### 3.1 Runtime Performance

Identify and flag:

- **Main Thread Blocking:** Any synchronous DOM manipulation during playback. Any heavy theory calculations (chord note generation, voice-leading) executed during the scheduler loop.
- **Memory Leaks:** Uncleared timeouts, un-disconnected audio nodes, unremoved event listeners, growing arrays (e.g., `activeOscillators` not pruned).
- **GC Pressure:** Object creation inside tight loops (scheduler runs at ~40-100Hz). String concatenation in per-frame code. Array allocations in per-note scheduling.
- **DOM Thrashing:** Re-rendering entire chord trays on every beat. Creating/destroying DOM nodes for rhythm editor slices instead of updating attributes.

**Profiling Checklist:**
- [ ] No `document.querySelector` or DOM reads inside `scheduleNote()`
- [ ] No `new Array()`, `new Object()`, or template literals inside the scheduler loop
- [ ] All `setTimeout` IDs are tracked in `uiTimeouts` and cleared on stop
- [ ] `activeOscillators` array is pruned when oscillators complete (via callback)
- [ ] Audio buffers (noise, custom samples) are allocated once at init, not per-frame
- [ ] State is read from a plain JS object, never from DOM attributes or `data-*` properties

### 3.2 Startup & Load Performance

- Are ES6 modules loaded asynchronously or deferred?
- Is the audio context created on first user interaction (not on page load)?
- Are heavy calculations (chord dictionary population, scale generation) deferred or memoized?

---

## PHASE 4: USABILITY & UI/UX AUDIT

### 4.1 Interaction Design

Evaluate the user interface for:

- **Responsiveness:** Do UI updates keep pace with user input? Is there visual feedback within 100ms of any interaction?
- **Mobile Support:** Are touch targets large enough (minimum 44x44px)? Is native double-tap-to-zoom disabled on the canvas? Are viewports below 450px handled?
- **Accessibility:** Are color mappings (synesthetic chord colors) accompanied by non-color indicators? Is keyboard navigation possible?
- **State Persistence:** Is user state saved to `localStorage` without blocking the main thread? Are migrations handled for schema changes?

### 4.2 Music Production Workflow

Evaluate whether the UI supports professional music production workflows:

- **Non-Destructive Editing:** Can users undo/redo changes? Are temporary swaps reversible? Is there a clear distinction between local and global pattern edits?
- **Real-Time Auditioning:** Can users audition chord substitutions, bass variations, and drum patterns without interrupting playback?
- **Export Flexibility:** Can users export MIDI, WAV, and AI prompts simultaneously? Are export settings configurable (BPM, loop bounds, section selection)?
- **Song Structure:** Can users arrange multi-section songs (verse, chorus, bridge) with independent patterns per section?

### 4.3 Documentation & Discoverability

- Are feature capabilities discoverable through UI labels, tooltips, or onboarding?
- Is there documentation for music theory concepts (voice leading, modal mixture, modulation) accessible to users?
- Are keyboard shortcuts documented and consistent?

---

## PHASE 5: STANDARDS COMPLIANCE MATRIX

Produce a compliance table mapping each finding to a professional standard:

| Area | Standard | Status | Recommendation |
|------|----------|--------|----------------|
| Voice Leading | Minimizes total semitone movement across all voices | Pass/Fail | [Specific fix] |
| Audio Scheduling | Look-ahead scheduler with `audioCtx.currentTime` | Pass/Fail | [Specific fix] |
| Buffer Management | Pre-allocated noise/sample buffers | Pass/Fail | [Specific fix] |
| Memory Management | Oscillator lifecycle tracked and cleaned | Pass/Fail | [Specific fix] |
| MIDI Export | Multi-track, proper velocity, 128 ticks/beat | Pass/Fail | [Specific fix] |
| WAV Export | Offline rendering with tail padding | Pass/Fail | [Specific fix] |
| Microtonal Support | Correct EDO/.scl/.tun arithmetic | Pass/Fail | [Specific fix] |
| Mobile UX | Touch targets, viewport handling, no double-tap zoom | Pass/Fail | [Specific fix] |
| State Persistence | Non-blocking localStorage with migrations | Pass/Fail | [Specific fix] |
| DOM Isolation | Theory/audio logic never reads DOM | Pass/Fail | [Specific fix] |

---

## PHASE 6: RECOMMENDATIONS

For each failed standard, provide:

### 6.1 Architecture Changes

- Module restructuring (e.g., extract theory calculations from UI modules)
- State management improvements (e.g., introduce immutable state snapshots for undo)
- Audio graph reorganization (e.g., add per-bus compressors, add reverb sends)

### 6.2 Algorithm Improvements

- Specific algorithm replacements (e.g., replace linear search in chord dictionary with hash map)
- Complexity reductions (e.g., memoize `getChordNotes` results by symbol+key+tuning tuple)
- Correctness fixes (e.g., fix microtonal period-wrap arithmetic in `snapToGrid`)

### 6.3 Performance Optimizations

- Specific code locations to optimize (e.g., pre-compute `getDiatonicChords` at module load)
- Memory allocation reductions (e.g., reuse arrays in `generateInversions` instead of allocating new ones per chord)
- DOM update batching (e.g., batch rhythm editor slice updates into a single `requestAnimationFrame`)

### 6.4 UI/UX Enhancements

- Interaction improvements (e.g., add keyboard shortcuts for chord insertion, pattern copying)
- Visual feedback enhancements (e.g., add audio waveform visualization for exported WAV)
- Workflow additions (e.g., add a "compare" mode to A/B test different chord voicings)

---

## OUTPUT FORMAT

Produce the audit as a structured document with:

1. **Executive Summary:** One-paragraph assessment of overall quality and production-readiness.
2. **Compliance Matrix:** Pass/Fail for each standard with severity (Critical, Warning, Info).
3. **Detailed Findings:** Grouped by layer (Theory, Synthesis, Sequencing, Export, UI), each with:
   - Current behavior description
   - Why it fails (or passes) the standard
   - Specific code references (file:line)
   - Recommended fix with code sketch if non-trivial
4. **Priority Roadmap:** Ordered list of recommended changes by impact/effort ratio.
5. **Testing Recommendations:** Specific test cases that should be added to verify fixes (e.g., "Test voice-leading with 24-EDO chords across 5 consecutive modulations").

---

## EXAMPLE AUDIT OUTPUT

```
## Music Production App Audit: [App Name]

### Executive Summary
[1-2 sentences on production readiness]

### Compliance Matrix
| Area | Status | Severity |
|------|--------|----------|
| Voice Leading | PASS | - |
| Audio Scheduling | FAIL | Critical |
| ... | ... | ... |

### Detailed Findings

#### Audio Scheduling - FAIL (Critical)
**Current:** Scheduler uses `setTimeout` with no look-ahead buffer.
**Location:** `sequencer.js:479-507`
**Issue:** JS timer drift causes timing inaccuracies exceeding 10ms over 30-second sequences, unacceptable for music production.
**Fix:** Implement look-ahead scheduler: schedule notes 25ms ahead using `audioCtx.currentTime`, use `setTimeout` only to trigger the next scheduling window.

[... rest of findings ...]

### Priority Roadmap
1. [Critical] Fix scheduler look-ahead (2 hours)
2. [Critical] Pre-allocate noise buffer (30 minutes)
3. [Warning] Memoize chord dictionary lookups (1 hour)
...
```
