# Music Production App Audit: Progress

## Executive Summary

Progress is a sophisticated browser-based chord progression builder with an impressive scope: multi-track synthesis (chords, bass, melody, countermelody, drums), microtonal support (12 EDO systems, Just Intonation, Bohlen-Pierce, Slendro), a full voice-leading engine, pattern-based rhythm editing, song arrangement, and multi-format export (MIDI, WAV, AI prompts). The codebase demonstrates professional-grade audio engineering in several areas (look-ahead scheduler, pre-allocated noise buffers, OfflineAudioContext for sample decoding, compressor/soft-clipping signal chain). However, significant issues remain in DOM isolation during playback, memory management of oscillators, export fidelity (MIDI channel routing), and microtonal arithmetic correctness. The app is **near-production-ready for personal use** but requires targeted fixes before distribution to musicians who depend on timing accuracy and export reliability.

---

## Compliance Matrix

| Area | Standard | Status | Severity |
|------|----------|--------|----------|
| Voice Leading | Minimizes total semitone movement across all voices | **PASS** | - |
| Audio Scheduling | Look-ahead scheduler with `audioCtx.currentTime` | **PASS** | - |
| Buffer Management | Pre-allocated noise/sample buffers | **PASS** | - |
| Memory Management | Oscillator lifecycle tracked and cleaned | **FAIL** | Critical |
| MIDI Export | Multi-track, proper velocity, 128 ticks/beat | **FAIL** | Critical |
| WAV Export | Offline rendering with tail padding | **PASS** | - |
| Microtonal Support | Correct EDO/.scl/.tun arithmetic | **FAIL** | Warning |
| Mobile UX | Touch targets, viewport handling, no double-tap zoom | **PASS** | - |
| State Persistence | Non-blocking localStorage with migrations | **FAIL** | Warning |
| DOM Isolation | Theory/audio logic never reads DOM | **FAIL** | Critical |
| Export Quality | Multi-track MIDI (chords/bass/drums separate) | **FAIL** | Warning |
| Groove/Timing | Groove offsets applied sample-accurately | **PASS** | - |
| Synthesis Quality | ADSR envelopes, filtering, compression | **PASS** | - |
| Undo/History | 50-level undo with structuredClone | **PASS** | - |

---

## Detailed Findings

### 1. Audio Scheduling - PASS

**Location:** `sequencer.js:138-546`

The scheduler implements a proper look-ahead model:
- `nextNoteTime` accumulator advances by chord duration (line 463)
- Schedules `CONFIG.SCHEDULE_AHEAD_SEC` (0.1s = 100ms) ahead (line 513)
- Uses `setTimeout` only to trigger the next scheduling window at `CONFIG.LOOKAHEAD_MS` (25ms) intervals (line 527)
- UI highlighting is decoupled from audio scheduling via separate `uiTimeouts` array (lines 12-13, 36-40, 442-450)
- `stopThisPlayback()` properly clears all timers and calls `stopOscillators()` (lines 530-541)

**Strengths:**
- Groove offsets are applied per-event via `getGrooveOffset()` (lines 236, 288, 294, 323, 383, 420)
- Empty section handling returns a no-op stop function (line 167)
- Chord deletion during playback is handled with bounds checking (lines 181-194)

---

### 2. Memory Management - FAIL (Critical)

**Location:** `synth.js:9,364-374,416-429`

**Issue:** The `activeOscillators` array is used as a global pool, but oscillators are only pruned via the `onCleanup` callback (line 365). This callback fires on `osc.onended`, which is unreliable in OfflineAudioContext (used for WAV export) where `onended` may never fire. Additionally, `stopOscillators()` (line 416) clears the array but does not disconnect nodes that have already finished, leading to orphaned AudioNodes accumulating in the graph.

**Evidence:**
```javascript
// synth.js:364-367
const osc = engine(audioCtx, finalFreq, startTime, duration, finalDest, (deadOsc) => {
    activeOscillators = activeOscillators.filter(o => o !== deadOsc);
    if (panner) panner.disconnect();
}, engineParams);
```

The cleanup callback only fires when `osc.onended` fires. In the scheduler loop, notes are scheduled far into the future (up to 100ms), but the `activeOscillators` array grows unbounded between cleanup events.

**Fix:** Implement a periodic garbage collection sweep:
```javascript
// Add to synth.js module scope
let gcInterval = null;
export function startOscillatorGC() {
    gcInterval = setInterval(() => {
        const now = audioCtx.currentTime;
        activeOscillators = activeOscillators.filter(osc => {
            if (osc.endTime && now > osc.endTime) {
                try { osc.disconnect(); } catch(e) {}
                return false;
            }
            return true;
        });
    }, 1000);
}
```

---

### 3. DOM Isolation During Playback - FAIL (Critical)

**Location:** `sequencer.js:175-176,218-219,230,305,341`

**Issue:** The `scheduleNote()` function reads `state` (the global store) on every scheduled note (line 175: `const state = getState()`), and within that reads DOM-dependent values like `state.instruments.chords` (line 218), `state.autoPanLeading` (line 264), and `state.bpm` (line 207). While this reads from a JS object rather than the DOM directly, it reads from the live state object which is mutated by UI interactions. If a user changes the instrument or BPM while playback is active, the scheduler will pick up the new value mid-sequence, causing inconsistent playback.

**Evidence:**
```javascript
// sequencer.js:218
const chordInst = state.instruments && state.instruments.chords ? state.instruments.chords : 'sawtooth';
// sequencer.js:207
const chordSlotDuration = (60.0 / Number(state.bpm)) * beats;
```

**Fix:** Capture all configuration values at the start of `playProgression()` and pass them as closure-captured constants rather than reading from `getState()` on every note:
```javascript
// In playProgression(), capture once:
const initialConfig = {
    bpm: initialState.bpm,
    chordInst: initialState.instruments?.chords || 'sawtooth',
    bassInst: 'sine',
    autoPan: initialState.autoPanLeading
};
```

---

### 4. MIDI Export - FAIL (Critical)

**Location:** `midi.js:90-522`

**Issue 1:** In non-MPE "clean" mode, all voices (chords, bass) are exported on **Channel 1** (line 275, 394), not on separate channels. The multi-track mode creates separate tracks but puts all voices of a single chord on the same track (lines 257-280), meaning a 4-note chord produces 4 notes on Track 1 with no voice separation.

**Issue 2:** The drum track uses `channel: 10` correctly (line 483), but the bass track also uses `channel: 1` (line 394), which conflicts with the chord track in single-track mode.

**Issue 3:** No Program Change messages are sent for non-piano tracks. The bass and drum tracks should have appropriate program changes (e.g., bass = `ProgramChangeEvent` for electric bass, drums = `ProgramChangeEvent` for drum kit).

**Evidence:**
```javascript
// midi.js:389-395 - Bass uses channel 1, same as chords in clean mode
events.push(new MidiWriter.NoteEvent({ 
    pitch: [bassPitch], 
    duration: `T${instanceDurationTicks}`, 
    wait: `T${waitTicks}`,
    velocity: Math.min(127, Math.round(CONFIG.MIDI_BASS_VELOCITY * (bassVol / 0.8))),
    channel: 1  // <-- Same as chord track!
}));
```

**Fix:** In multi-track mode, add Program Change events for bass (electric bass, program 33) and drums (drum kit, program 0):
```javascript
// After bassTrack creation:
bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 33, channel: 2 }));
drumTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0, channel: 10 }));
```

---

### 5. Microtonal Support - FAIL (Warning)

**Location:** `theory.js:629-692, microtonalDictionary.js:84-152`

**Issue 1:** `snapToGrid()` for EDO systems (line 690-691) uses integer step arithmetic but does not handle period-wrap correctly for non-octave scales like Bohlen-Pierce (period = tritave ≈ 19.02 semitones). The formula `60 + (edoStep * (tuning.divisions / tuning.periodSize))` maps EDO steps to MIDI space but doesn't preserve the correct pitch-class relationships across periods.

**Issue 2:** `getMicrotonalChord()` (microtonalDictionary.js:144-146) computes `snappedPitch` using EDO step rounding, but the result is a MIDI pitch in 12-TET space, losing the microtonal precision of the original scale.

**Evidence:**
```javascript
// theory.js:690-691
const edoStep = Math.round((floatPitch - 60) * (tuning.divisions / tuning.periodSize));
return 60 + (edoStep * (tuning.divisions / tuning.periodSize));
```

This maps a float MIDI pitch to an EDO grid, but the result is expressed in 12-TET MIDI numbers, which is musically incorrect for non-octave tunings.

**Fix:** For non-octave tunings (Bohlen-Pierce), the snap-to-grid should return the actual frequency-ratio-based pitch, not a 12-TET approximation. The result should be stored as a frequency or as a "steps from root" value, not forced through `Math.round()` into 12-TET MIDI space.

---

### 6. State Persistence - FAIL (Warning)

**Location:** `store.js:676-703, storage.js:1-29`

**Issue:** `persistAppState()` uses a 500ms debounce timer (line 690-693), which is good for avoiding excessive writes. However, there is **no schema versioning or migration system**. When the state shape changes (e.g., new fields added to `melodySettings`), old saved state will silently lack those fields, leading to runtime errors or degraded functionality.

**Evidence:**
```javascript
// store.js:689-693
if (persistTimer) clearTimeout(persistTimer);
persistTimer = setTimeout(() => {
    saveState(state);
    persistTimer = null;
}, 500);
```

**Fix:** Add a schema version to saved state and implement migrations:
```javascript
const STORAGE_VERSION = 3;
export function saveState(state) {
    const { history, ...stateToSave } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: STORAGE_VERSION,
        ...stateToSave
    }));
}
export function loadState() {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data) return null;
    // Migrate from older versions
    if (data.v < 3) { /* apply migrations */ }
    return data.v ? { ...defaultState, ...data } : null;
}
```

---

### 7. Export Quality (Multi-Track MIDI) - FAIL (Warning)

**Location:** `midi.js:508-513`

**Issue:** In multi-track mode, chord voices are split across tracks (one track per voice index), but there's no mechanism to export bass and drums on separate tracks when the user selects "multi-track" routing. The bass track is created (line 325) and drum track (line 405), but they're only appended to `finalTracks` if `hasBassNotes`/`hasDrumNotes` are true (lines 509-510). If a progression has no drums, the exported MIDI file will be missing the expected 3-track structure.

**Additionally:** The `MIDI_CHORD_VELOCITY` is 80 and `MIDI_BASS_VELOCITY` is 90 (config.js:17-18), which is correct. However, drum velocities are computed as `Math.round((hit.velocity || 1.0) * 100 * (drumsVol / 0.8))` (line 466), which can exceed 127 and is clamped, but the formula doesn't match the chord/bass velocity scaling.

**Fix:** Always include all 3 tracks (chords, bass, drums) in the export, using silent rests for missing instruments:
```javascript
const finalTracks = [...chordTracks];
// Always include bass track (even if silent)
finalTracks.push(bassTrack);
// Always include drum track (even if silent)  
finalTracks.push(drumTrack);
```

---

### 8. Voice Leading - PASS

**Location:** `voiceLeading.js:24-103`

The voice-leading engine correctly implements:
- Cost-based inversion selection minimizing total semitone movement (lines 60-96)
- Gravity weighting toward center pitch (lines 65-72)
- Cross-tether penalty when switching between different tuning systems (lines 68-71)
- Root mismatch penalty for auto voicing (lines 77-84)
- Extreme range penalties (lines 87-90)
- Extended chord optimization (dropping 5ths and roots for dense chords, lines 6-19)
- Macrotonal protection with 12-semitone octave shifts (lines 151-162)

**Strengths:** The `calculateDistance()` function (lines 326-345) properly handles chords of different lengths by inserting the best-padded duplicate, ensuring minimum voice-leading distance calculation.

---

### 9. Synthesis Quality - PASS

**Location:** `synth.js:99-182, synthEngines.js:69-752, drumEngines.js:44-255`

The audio engine demonstrates professional-grade design:
- Master compressor with configurable threshold/knee/ratio (lines 104-109)
- Per-bus gain staging with `setTargetAtTime` for click-free volume transitions (lines 42-58)
- Bass/shaper signal chain with 4x oversampling (lines 127-133, 153-160)
- Pre-allocated 2-second white noise buffer for drum synthesis (lines 168-174)
- OfflineAudioContext for sample decoding to bypass autoplay policy (lines 184-202)
- ADSR envelope generation with safe time clamping (synthEngines.js:3-45)
- Karplus-Strong synthesis with configurable damping (lines 433-507)
- Sample playback with playback rate control (lines 508-751)

---

### 10. WAV Export - PASS

**Location:** `wavExport.js:25-471`

- Uses `OfflineAudioContext` with correct sample rate (line 320)
- Tail padding of 0.5s applied (line 315)
- Full signal chain replicated (compressor, shapers, gain staging)
- Multi-pass rendering supported

---

### 11. Mobile UX - PASS

**Location:** `index.html:1-703`

- Viewport meta: `maximum-scale=1.0, user-scalable=no` (line 4)
- Touch targets are consistently styled with adequate sizing
- Mobile-specific UI elements (single tab, swipe navigation) present
- FOUC prevention via CSS visibility toggling (lines 22-70)

---

## Priority Roadmap

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | **Memory Management** - Oscillator GC | Critical: Memory leaks during long sessions | 2 hours |
| 2 | **DOM Isolation** - Capture config at start | Critical: Inconsistent playback on parameter change | 1 hour |
| 3 | **MIDI Export** - Channel routing & Program Changes | Critical: Exported files unusable in DAWs | 3 hours |
| 4 | **State Persistence** - Schema versioning | Warning: Silent failures on app updates | 1 hour |
| 5 | **Microtonal snapToGrid** - Non-octave arithmetic | Warning: Incorrect pitch mapping for BP/Slendro | 4 hours |
| 6 | **Export Quality** - Always include all tracks | Warning: Incomplete MIDI files | 30 minutes |
| 7 | **Chord dictionary** - Memoize `getChordNotes` | Performance: O(n) lookup per note | 2 hours |
| 8 | **GrooveEngine** - Add MIDI groove import | Feature: User-defined grooves from existing music | 3 hours |
| 9 | **Melody generation** - Deterministic seeding | Quality: Reproducible melody generation | 4 hours |
| 10 | **Transition evaluator** - Cache stepPitches | Performance: Redundant pitch calculation | 1 hour |

---

## Testing Recommendations

### Voice Leading Tests
1. Test voice-leading with 24-EDO chords across 5 consecutive modulations
2. Test cross-tuning transitions (12-TET → Bohlen-Pierce → 12-TET) with gravity penalty verification
3. Test extended chords (9ths, 11ths, 13ths, altered dominants) with `optimizeVoicing()` - verify 5th/root dropping
4. Test macrotonal inversion with offset values exceeding chord length (e.g., 7-note chord, offset=10)

### Audio Scheduling Tests
5. Test scheduler timing accuracy: schedule 60 notes at 120 BPM, measure actual inter-arrival times (should be < 1ms deviation)
6. Test BPM change mid-playback: change BPM from 120 → 180 during active playback, verify no silence or glitch
7. Test chord deletion during playback: delete chord at index 3 while playing a 6-chord loop, verify bounds handling
8. Test loop bounds change mid-playback: move loopStart from 0 → 2 during playback, verify no double-play

### Memory Management Tests
9. Run 10-minute continuous playback, measure `activeOscillators.length` at 1-minute intervals (should stabilize, not grow linearly)
10. Start/stop playback 100 times rapidly, verify no AudioNode accumulation in Web Audio API inspector

### MIDI Export Tests
11. Export a 4-chord progression with bass and drums → verify 3-track MIDI file with correct channel assignments
12. Export in "clean" mode → verify all notes on Channel 1 with proper velocity scaling
13. Export in "multi-track" mode → verify Program Change messages for bass (electric bass) and drums (drum kit)
14. Export a progression with no drums → verify bass track still present (no missing-track bug)

### WAV Export Tests
15. Export a 30-second progression with 1.0s release times → verify tail padding captures full release (render duration = music + 0.5s)
16. Export with all 6 tracks active → verify stem export produces 4 separate WAV files (chords, bass, bassHarmonic, drums)

### Microtonal Tests
17. Test `snapToGrid()` with Bohlen-Pierce (13-ED3): snap MIDI 60-80, verify pitch-class relationships preserve tritave periodicity
18. Test `.scl` import: parse a 53-EDO scale file, verify `parseScl()` produces correct offsets
19. Test `.tun` import: parse a custom tuning file, verify `parseTun()` produces correct 128-entry map
20. Test microtonal voice-leading: 5 consecutive chords in 24-EDO, verify total semitone movement is minimized

### State Persistence Tests
21. Save state with current melodySettings, clear storage, reload → verify all fields present (no silent field loss)
22. Simulate app update adding new `melodySettings` field → verify migration restores default value

### Performance Tests
23. Profile `getChordNotes()` call frequency during 2-minute playback at 120 BPM (expected: ~480 calls for 4/4, 2-beat chords)
24. Profile `getCachedPlayableNotes()` memoization hit rate (should be > 90% for static progressions)
