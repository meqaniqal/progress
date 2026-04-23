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

### Phase 5: Advanced Electronica & AI Synergy (Up Next 🚧)
- **Tension & Release Mapping UI:** Architect dramatic emotional arcs visually before rendering notes.
- **Polyrhythmic Arpeggiation:** Export chords as sequenced MIDI patterns (e.g., 5/16 arp patterns over a 4/4 bassline).
- **Intelligent Bassline Generation:** Rhythm-informed, genre-appropriate basslines.
- **Omni-Scale & Microtonal Framework:** Dynamic support for global scales and microtonal systems.

## 🛠️ Local Development

This application is built with zero dependencies using strictly Vanilla JS (ES6 Modules), HTML, and CSS. 

Because it uses ES6 Modules (`<script type="module">`), it must be served over `http://` rather than `file://` to avoid CORS blocks.

1. Clone the repository.
2. Run the included lightweight Node server:
   ```bash
   node server.js
   ```
3. Open `http://localhost:3000` in your browser.