# Progress App - Development History

## Phase 1: Core Foundation (Complete)
- Real-time Web Audio API playback setup.
- Pure UI rendering of `currentProgression` state.
- MidiWriterJS integration for basic Track 1 (Chords) & Track 2 (Bass).
- Drag-and-drop UI and MIDI export integration.
- Core strict vanilla JS architecture and state rules defined.

## Phase 1.5: Professional Standards Refactoring (Complete)
- Fixed `server.js` path traversal vulnerability (URL decoding + strict boundary check).
- Implemented Audio Master Bus/Compressor to prevent digital clipping.
- Extracted all magic numbers to a central `CONFIG` block (`config.js`).
- Established Jest testing standards for pure logic modules (Node ESM support).
- Removed mixed CJS/ESM module syntax (100% pure ES6 modules).
- Centralized state into an in-memory object (eliminating DOM state reads).
- Optimized `renderProgression` (DOM node reconciliation, eliminating nuclear `innerHTML = ''` re-renders).
- Modularization: Extracted `theory.js`, `audio.js`, and `dragdrop.js` out of the main controller.
- Voice Leading math fix: Multi-octave inversion generation.

## Phase 2: Contextual Auditioning & Looping (Complete)
- Implemented UI section slice looping via drag-and-drop brackets.
- Added seamless live chord alternative swapping with instant audio injection.
- Built a Synesthetic Harmonic UI: mapped absolute chord roots to color hues via the Circle of Fifths.
- Added bi-directional tension ripple: chords dynamically adjust saturation and luminosity based on contextual harmonic tension.
- Supported true multi-key progressions by decoupling the global key selector from existing chords in the sequence.
- Integrated mobile-friendly touch drag-and-drop support and long-press deletion.
- Implemented global state history with an Undo button for all progression modifications.

## Phase 3: The "Mind-Bending" Harmonic Engine (Complete)
- Expanded chord dictionary with extended voicings (9ths, 11ths, 13ths, Sus4, and Altered Dominants like V7#9).
- Upgraded Voice Leading engine with "Drop 2" and "Shell" voicing optimization to prevent frequency mud.
- Built purely mathematical Pivot Chord detection and modulation suggestion mechanics.
- Addressed timbral muddiness by separating chord and bass waveforms (Triangle/Sine split).
- Implemented Low-Pass Filter (LPF) synth pads for warm, lush chord playback.
- Added an inline "Modulate" context menu for instant key shifts from specific chord badges.

## Phase 4: Sequence Architecture & AI Export (Complete)
- Refactored UI rendering by extracting inline CSS into `style.css` for strict presentation/logic separation.
- Added "Turnaround" chord suggestions to smoothly bridge the end of a sequence/loop back to its start.
- Built an AI Text Prompt generator that analyzes harmonic tension, modal mixture, and extensions to guide external AI music models.
- Implemented an offline WAV audio export feature using `OfflineAudioContext` for instant background rendering of the active progression.
- Created a mathematical timeline calculation module (`wavExport.js`) and binary WAV encoder to ensure audio export logic remains highly modular and fully testable.

## Phase 5: Advanced Electronica & AI Synergy (In Progress)
- Implemented Tension & Release Mapping UI using dynamic CSS gradient area graphs.
- Built Per-Chord Rhythm/Timing Editor with timeline slicing, moving, and grid snapping.
- Implemented Localized Arpeggiation for polyrhythmic MIDI and WAV export.
- Synced offline WAV export and MidiWriterJS to mathematically match the dynamic browser audio playback.
- Implemented Variable Chord Durations, allowing users to define the length of each chord (1, 2, 4, or 8 beats) directly from the UI popover.
- Updated Web Audio playback, offline WAV export, and MidiWriterJS logic to dynamically calculate slot durations based on individual chord beat lengths.
- Dynamically scaled Rhythm Editor grid snapping to perfectly align with variable chord durations.
- Resolved string-to-number coercion bugs in local state loading to ensure robust, glitch-free audio scheduling.
- Implemented Omni-Scale Theory updates, making harmonic tension analysis, modulations, and turnarounds fully mode-aware.
- Added Generative Multi-Pass Export UI controls and integrated multi-pass looping into both MIDI and offline WAV export engines.
- Implemented Probabilistic Pattern Sequencing, allowing users to assign per-slice and per-hit probabilities to create generative, organically evolving rhythms across loopthroughs.
- Established a continuous chord selection model with `localStorage` persistence to ensure seamless foldaway panel UX.
- Integrated `arp.js` into export pipelines to ensure 1:1 playback parity for polyrhythmic arpeggiation in WAV and MIDI files.
- Replaced hardcoded chord dictionaries with a generative mathematical Roman Numeral parser, unlocking full Omni-Scale support for exotic modes (Dorian, Lydian, Harmonic Minor, etc.).
- **Mobile UX Overhaul:** Disabled native double-tap-to-zoom to enable reliable global play/pause via touch. Removed vertical magnetic scroll-snapping for precision manual scrolling.
- **Smart Drag-and-Drop & Transport:** Converted the fixed bottom transport into a Floating Action Button (FAB) to maximize vertical real estate. Added dynamic CSS transitions to collapse inactive chord palettes during drag operations, instantly bringing the drop tray into the mobile viewport. Fixed HTML5 bracket-drag ghosting glitches.
- **Audio Engine & UI Polish:** Fixed lingering drum lookahead playback by comprehensively tracking and terminating all scheduled Web Audio API nodes on stop. Refined the mobile FAB transport button with a professional 'squircle' design, inner ring, and dark mode glow.
- **Experimental Draw Mode & Workflow Refactor:** Replaced the rigid Global/Local mode toggle with an intuitive "Edit-in-Place" Push/Pull workflow. Introduced a grid-aware Pencil Draw tool featuring Boolean "carving" mathematics for rapid, DAW-style sequence painting and gating.
- **Intelligent Bassline Generation:** Shipped the generative bassline engine that automatically extracts drum kick timings and chord slice timings to generate locked, genre-appropriate grooves. Added non-destructive "Avoid Kick Clash" (sidechain ducking) to the core playback engine.
- **3D Transport & Super Volume:** Moved the global play button to the bottom center, styled as a tactile 3D semi-circle hardware control. Added a hidden "Super Volume" overdrive slider (up to 400%) triggered by dragging upward.
- **Folder Tabs UI & Synesthetic Contrast:** Redesigned the Rhythm Editor tabs into a cohesive file folder layout with a 135-degree diagonal gradient border. Compressed the Circle-of-Fifths color mapping to guarantee the selection highlight always remains highly visible.
- **Drum Workflow & Presets:** The Drum tab now intelligently defaults to Global Mode when empty. Added a curated dropdown of advanced drum presets (House, Hip Hop, Breakbeat, DnB, Bossa Nova, Lo-Fi) utilizing velocity and probability dynamics.
- **Strict Component Modularization:** Drastically reduced monolithic files by extracting `inspectorController.js`, `drumRenderer.js`, `clipboardUtils.js`, `transportController.js`, `arpControls.js`, and `bassControls.js` into pure, focused ES6 modules.