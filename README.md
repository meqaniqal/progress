# Progress

**Progress** is an interactive application designed for building, sequencing, and refining advanced, neuroharmonic chord progressions. It goes beyond simple chord generation by integrating professional music theory concepts to craft emotionally powerful, mind-bending, and complex harmonic sequences. 

The app is specifically tailored to act as a "creative frontend" for AI song generation tools (like ACE Studio 2.0 or Suno). It allows users to contextually audition, tweak, and perfect their progressions, ultimately exporting them as rich MIDI data or structural text prompts that yield chart-worthy AI generations.

## 🚀 Current Features

- **Interactive Chord Builder:** Add diatonic and borrowed (modal mixture) chords with a single click.
- **Drag-and-Drop Sequencing:** Easily click and drag chords in the tray to reorganize your progression on the fly.
- **Real-Time Web Audio Engine:** Audition your progressions with a clean sine-wave pad and a sub-bass triangle wave (tracking the root note -2 octaves).
- **Contextual Auditioning:** Click any chord in the tray to instantly hear it.
- **Looping & BPM Control:** Set your tempo and toggle seamless playback looping for continuous auditioning.
- **Visual Sync:** Chords light up in the UI as they play, keeping you perfectly in sync with the audio.
- **Voice Leading Engine:** Automatically calculates the shortest melodic distance between chords to ensure incredibly smooth, professional transitions.
- **MIDI Export:** Download your progression instantly as a `.mid` file, completely formatted with a chord track and a dedicated bass track, ready for your DAW.
- **Persistent State:** Close the browser or refresh the page—your progression, BPM, and settings are automatically saved locally.
- **Tension & Release Mapping UI:** Architect dramatic emotional arcs visually using dynamic area graphs before rendering notes.
- **Per-Chord Rhythm Editor:** Timeline view for slicing, moving, and generating complex rhythms within individual chord slots.
- **Polyrhythmic Arpeggiation:** Apply localized arpeggiator settings to slices of your chord to create intricate polyrhythms.
- **Variable Chord Durations:** Adjust individual chord lengths (1, 2, 4, or 8 beats) directly from the UI, scaling playback, exports, and timeline grids dynamically.

## 🗺️ Development Roadmap

### Phase 1: Core Foundation (Complete ✅)
- Vanilla JS strict architecture with a Single Source of Truth (SSOT).
- Real-time Web Audio API playback.
- Drag-and-drop UI and MIDI export integration.

### Phase 2: Contextual Auditioning & Looping (Complete ✅)
- **Section Looping:** UI slice selection for seamless playback of specific sequence sections.
- **Synesthetic Harmonic UI:** Chords dynamically change color based on absolute root note (Circle of Fifths), harmonic tension, and bi-directional contextual ripple.
- **Seamless Chord Swapping:** Swap and audition chord alternatives instantly without interrupting workflow, with full support for multi-key modulations.

### Phase 3: The "Mind-Bending" Harmonic Engine (Complete ✅)
- **Advanced Chord Dictionary:** Extended 9ths, 11ths, 13ths, and altered dominants.
- **Complex Voice Leading:** Inner-melodic line math to dictate moving hidden voices.
- **Modulation:** Pivot chord and direct modulation mechanics.
- **Sound Design:** Low-Pass Filter (LPF) synth pads and clean bass separation.

### Phase 4: Sequence Architecture & AI Export (Complete ✅)
- **Multi-Progression Sequencing:** Chain together full song structures (Verse -> Pre -> Chorus).
- **AI Text Prompt Generation:** Generate copy-pasteable text prompts detailing the key, mood, and harmonic rhythm to feed into AI models.
- **Reference Audio Export:** Direct `.wav` export of the clean synth pad.

### Phase 5: Advanced Electronica & AI Synergy (In Progress 🚧)
- **Tension & Release Mapping UI:** Architect dramatic emotional arcs visually before rendering notes. (Complete ✅)
- **Per-Chord Rhythm Editor:** Timeline view for slicing, moving, and generating complex rhythms within individual chord slots. (Complete ✅)
- **Rhythm Editor UX Redesign:** Unified press/drag interactions, smart boundary collisions, and a comprehensive grid slider with triplet support. (Complete ✅)
- **Edge-Dragging to Resize:** Click and drag the left or right edges of a slice in the Rhythm Editor to dynamically resize it. (Complete ✅)
- **Rhythm Pattern Copy/Paste:** Copy sliced/arpeggiated rhythm patterns from one chord and paste them to another. (Complete ✅)
- **Polyrhythmic Arpeggiation:** Export chords as sequenced MIDI/WAV patterns (e.g., 5/16 arp patterns over a 4/4 bassline). (Complete ✅)
- **Variable Chord Durations:** Adjust individual chord lengths (1, 2, 4, or 8 beats) directly from the UI, dynamically scaling playback, exports, and timeline grids. (Complete ✅)
- **Foldaway Workspace UI:** Establish a collapsible panel paradigm for the Inspector and Rhythm Editors, keeping the UI compact. (Complete ✅)
- **Inspector Auto-Transpose:** Modulating the key from the Inspector automatically transposes the currently selected chord to the new key. (Complete ✅)
- **Always-Visible Transport:** Relocate transport controls above foldaway panels for consistent, easy access. (Complete ✅)
- **Functional Transposition:** Context-aware button in the Inspector to instantly transpose any out-of-key chord to the currently selected global key. (Complete ✅)
- **Workflow & Defaults Adjustments:** Optimized defaults (120bpm, 2 beats) and immediate UI feedback for rapid sequencing. (Complete ✅)
- **Architectural Refactoring:** Extract global state to a dedicated store, optimize DOM reconciliation in the Rhythm Editor, and implement strict event delegation in the Inspector. (Complete ✅)
- **Generative Multi-Pass Export:** Multi-pass export logic and UI fully integrated for both MIDI and offline WAV rendering. (Complete ✅)
- **Probabilistic Pattern Sequencing:** Allow assigning percent-based probabilities to specific rhythm/arp patterns or drum hits, creating organically evolving grooves. (Complete ✅)
- **Unified Tabbed Pattern Editor:** Consolidating Chords, Bass, and Drums into a single tabbed UI. Features a Global/Local cascade system where local changes detach from the global pattern, "Reset to Global" re-inherits the global pattern, and "Clear" explicitly overrides to a single un-sliced block. (Complete ✅)
- **Mobile UX & Transport Overhaul:** Replaced the bottom transport with a Floating Action Button (FAB), removed magnetic scrolling, fixed background double-tap-to-play, and added smart drag-and-drop palette collapsing to save vertical space. (Complete ✅)
- **Experimental Draw Mode & Workflow Refactor:** Shifted to an "Edit-in-Place" Push/Pull workflow. Added a new Pencil Draw tool with Boolean overlap math for rapid sequence painting and gating. (Complete ✅)
- **Intelligent Bassline Generation (Complete ✅):** Generates dynamic basslines that algorithmically lock to the drum pattern. Features a non-destructive "Avoid Kick" sidechain effect for a clean low-end.
- **Advanced Modular Synthesis:** Pluggable, editable synths for Chords and Basslines, optimized for AI audio recognition and professional WAV export.
- **Integrated Drum Machine (Complete ✅):** Built-in synthesized 4-piece kit with a multi-row grid editor. Features a dual-view workflow (Global/Local) and comes with a library of generative presets (House, Hip Hop, DnB, Bossa Nova, Lo-Fi) utilizing hit probabilities and velocity dynamics. Supports full MIDI/WAV export.
- **True Minor Key & Omni-Scale Framework:**
  - Decouple global key state to support modes (Major/Minor). (Complete ✅)
  - Dynamic UI palettes that render correct diatonic chords for the active scale. (Complete ✅)
  - Context-aware tension analysis based on the active scale's tonic.

## 🛠️ Local Development

This application is built with zero dependencies using strictly Vanilla JS (ES6 Modules), HTML, and CSS. 

Because it uses ES6 Modules (`<script type="module">`), it must be served over `http://` rather than `file://` to avoid CORS blocks.

1. Clone the repository.
2. Run the included lightweight Node server:
   ```bash
   node server.js
   ```
3. Open `http://localhost:3000` in your browser.