# PROGRESS APP: AI SYSTEM PROTOCOL
ROLE: Sr. Audio/Frontend Eng.
TECH: Vanilla JS (ES6, Strict), MidiWriterJS, Web Audio API. Host: Static (GitHub/Cloudflare Pages). Jest for testing.

## ARCHITECTURE & STATE
- SSOT: Pure JS `AppState` object. UI reads only; dispatches intents. No direct mutation. **Never read state from the DOM during performance-critical loops.**
- UI: Pure render logic. Zero music theory/math inside UI components.
- AUDIO/MIDI: Chords (Track 1). Bassline (Track 2: roots -2 octaves). **All audio must pass through a Master Bus/Compressor to prevent digital clipping.**
- THEORY: Roman Numeral -> MIDI Pitch Array `[60, 64, 67]`. Math/Voice Leading fns must be pure.
- CONSTANTS: No magic numbers in code. Extract all configuration values to a top-level `CONFIG` object.
- MOBILE DRAG & DROP: Never rely on `e.dataTransfer.getData()` to pass payloads. Always use module-scoped variables (e.g., `draggedSourceChord`, `draggedIndex`) to pass state between `dragstart` and `drop` to maintain strict compatibility with the mobile polyfill.
- STYLING: Keep unnecessary CSS out of `index.html`. Only CSS absolutely critical for preventing initial FOUC should be inline. All other styles belong in appropriate `.css` files.

## MANDATORY WORKFLOW
1. **CONTEXT PROVISIONING:** For any new session or task, always include `AI_CONTEXT.md` and `PROJECT_STRUCTURE.txt`. This ensures architectural alignment and prevents incorrect assumptions about the codebase.
2. PROFESSIONAL STANDARDS FIRST: Proactively align the codebase with rigorous professional practices so it endures all scrutiny by senior code reviewers. Ensure existing code meets these standards before adding features, taking extreme care not to break functionality or introduce regressions.
2. PLAN: Formulate/agree on plan before coding.
3. TRACE-DRIVEN DEBUGGING:
   - Map the chain first: `UI Click → State Update → [Mod A out] → [Mod B in] → Render`
   - Log exits AND entrances at each boundary before writing any fix.
   - Fix in a separate commit from logs.
   - NEVER remove logs until user explicitly confirms resolution.
4. REFACTOR: Atomic commits. Verify import/export graphs on relocation.
5. TESTING: All factored-out modules must be Jest-testable by default (wherever appropriate). Include a `.test.js` file with tests verifying common edge cases, problem areas, and expected behaviors for pure logic when creating or extracting new modules.
6. DIFF HYGIENE: Generate atomic, verifiable diffs. Before outputting, mentally confirm line numbers and context from the provided source file. Reject requests that would result in a messy or non-applicable diff.
7. CORRECTION PROTOCOL: If a mistake is pointed out, acknowledge the correct pattern and do not repeat the error. The user may provide a `// CORRECT_PATTERN: <description>` comment to reinforce a rule.

## CURRENT STATE & ROADMAP
**Current State:** Phase 8 Complete. The core application features are stable. The next phase will likely focus on advanced synthesis or new generative music theory modules.

**Phase 2: Contextual Auditioning & Looping (Complete)**
- [x] Section looping (UI slice selection for seamless playback).
- [x] Live chord alternative swapping, auditioning, and Synesthetic UI dynamic coloring.
- [x] Mobile UX polish (touch drag-and-drop, long-press context menu) and global Undo history.

**Phase 3: The "Mind-Bending" Harmonic Engine (Complete)**
- [x] Advanced chord dictionary (borrowed chords, extended 9th/11th/13th voicings).
- [x] Voice leading upgrades (Drop 2 voicings, basic muddiness optimization).
- [x] Pivot chord and direct modulation mechanics.
- [x] Sound Design: Implement Low-Pass Filter (LPF) synth pads.
- [x] Direct "Modulate" context menu on chord badges.

**Phase 4: Sequence Architecture & AI Export (Complete)**
- [x] Multi-progression sequencing (Turnaround mechanics & sequence loops).
- [x] MIDI Export finalized (including dynamic state resolution).
- [x] AI text prompt generation (for copy-pasting into models like ACE Studio 2.0, Suno).
- [x] Reference audio export (.wav of a clean synth pad via OfflineAudioContext).

**Phase 5: Advanced Electronica & AI Synergy (Current Focus)**
- [x] Tension & Release Mapping UI.
- [x] Per-Chord Rhythm/Timing Editor (Timeline view, manual/auto slicing, grid snapping, and edge-dragging resizing).
- [x] Localized Arpeggiation (Replace selected notes with arp patterns).
- [x] Variable Chord Durations (Adjust individual chord lengths via UI, dynamically scaling playback/export).
- [x] **UI Architecture Shift:** Establish a "Foldaway Panel" paradigm. Convert the Inspector, Rhythm Editor, Bassline, and future Melody editors into collapsible sections to support both sequential and concurrent workflows.
- [x] **Inspector Auto-Transpose:** Modulating the key from the Chord Inspector should automatically transpose the selected chord to that new key.
- [x] **Always-Visible Transport:** Move transport controls (Play, Loop, BPM, Export) above the foldaway panels so they are never pushed off-screen.
- [x] **Architectural Refactoring - State:** Extract global state and history management from `progressmain.js` into a dedicated `store.js` module.
- [x] **Architectural Refactoring - DOM:** Optimize `rhythmEditor.js` timeline rendering to update existing DOM nodes instead of using `innerHTML = ''` to prevent dropped frames.
- [x] **Progressive Disclosure:** Beginner/Advanced mode toggle to streamline the UI for new users.
- [x] **Architectural Refactoring - State:** Clean up module-scoped mutable state variables in `rhythmEditor.js`.
- [x] **Architectural Refactoring - Events:** Implement Event Delegation for the Chord Inspector in `ui.js` to prevent memory leaks from orphaned listeners.
- [x] **Architectural Refactoring - CSS:** Purged massive inline styles from JS and HTML into strict, semantic CSS classes.
- [x] Generative Multi-Pass Export (UI and multi-pass looping engine fully integrated for both MIDI and WAV).
- [x] **UI Decluttering:** Moved Theme, BPM, Mixer, and Voice Leading settings into a dedicated Settings Modal via the top bar gear icon. Added independent Master volume control.
- [x] Probabilistic Pattern Sequencing (Per-slice and per-hit probability sliders for generative, organically evolving rhythms).
- [x] Unified Pattern Architecture: Global/Local cascading state (Reset inherits Global, Clear forces 1-block local override).
- [x] Drum Machine Synthesis & Grid Editor: 4-piece kit (Kick, Snare, CHH, OHH). Includes a dual-view workflow: a scrollable, independent-length Global pattern that loops continuously across the entire progression (featuring non-destructive truncation, smart duplication, panning, and DAW-style page-flipping), and a zoomed-in Local override view featuring "ghost notes" for precise drum fills.
- [x] **Intelligent Bassline Generation:** Shares rhythm editor tech, single note focus, contextual pitch suggestions, and rhythmic locking.
- [x] **True Minor Key & Omni-Scale Theory Framework:**
  - [x] Decouple global key state to support modes (Major/Minor).
  - [x] Dynamic UI palettes that render correct diatonic chords for the active scale.
  - [x] Context-aware tension analysis based on the active scale's tonic.
  - [x] Mode-aware modulation and turnaround suggestions.
  - [x] Omni-scale support (Dorian, Lydian, Harmonic/Melodic Minor, etc.).
- [x] **Experimental Draw Mode & Global/Local UX Refactor (Complete):**
  - [x] Shift from Global/Local toggle to an "Edit-in-Place" Push/Pull workflow (`Set Global` / `From Global` buttons).
  - [x] Change default Global pattern to a single, continuous chord block.
  - [x] Introduce a "Pencil" Draw tool.
  - [x] Implement grid-aware sequence painting (Grid ON) vs. continuous block extension (Grid OFF).
  - [x] Implement Boolean "Carving/Erasing" math for drawing over existing slices.
  - [x] *Protocol requirement:* The Boolean overlap/carving math must be isolated in a pure, Jest-testable module before integration.
  - [x] *Protocol requirement:* Hide this new editor behind a persistent Settings toggle (`enableExperimentalDrawMode`) during development to preserve legacy stability.

**Phase 6: Song Mode & Macro-Arrangement (Complete)**
- [x] Nested section state architecture allowing multiple independent progressions.
- [x] Dedicated UI Song Tray for sequencing parts (Verse, Chorus) via drag-and-drop.
- [x] Global playback and export evaluation wrapping seamlessly across sections.
- [x] Real-time live audio traversal with perfect UI sequence tracking.
- [x] Isolated voice-leading boundaries for macro playback and offline MIDI export.

**Phase 6.5: Architectural Refactoring (Complete)**
- [x] Extract heavy macro-arrangement sequencing logic (`getExportState`) out of `store.js` into dedicated utility modules.
- [x] Fix custom dropdown memory leaks in song section UI.
- [x] Upgrade sequencer UI syncing from `setTimeout` to a V-Sync aligned `requestAnimationFrame` event queue.
- [x] Break down monolithic render functions in `ui.js` (Complete).

**Phase 7: True Mobile Adaptive UX (Complete)**
- [x] Viewport-aware FAB positioning (`env(safe-area-inset-bottom)`, `dvh`) to prevent transport bar from vanishing behind mobile browser chrome.
- [x] Swipeable Single-Tab UI for Song Sections on narrow screens (< 450px viewport).
- [x] Eliminate horizontal scroll fatigue in favor of gesture-based navigation.
- [x] Responsive flex-wrapping for Rhythm Editor toolbars to prevent UI clipping on narrow (<360px) viewports.
**Phase 7.5: Core Microtonal Engine (Complete)**
- [x] Decouple pitch representation (Float-based MIDI math and EDO scale mapping).
- [x] Harmonic Segmentation Engine (Identify and separate stable cores from clashing microtonal beats).
- [x] Auto Pan-Leading (Spatial separation of dissonant micro-clusters in Web Audio).
- [x] MPE MIDI Export (14-bit Pitch Bend routing across 14 independent MIDI channels).
- [x] Global Tuning Settings (12-TET, 19-EDO, 24-EDO, 31-EDO exposed to user).

**Phase 8: True Microtonal Modularity (Complete)**
- [x] **Tuning Lock State:** Implemented a `divisions` override at the chord object level to protect microtonal structures from global state changes.
- [x] **Isolated Microtonal Sandbox:** Created `microtonalDictionary.js` to define true microtonal scales (e.g., Bohlen-Pierce, Pelog) outside the 12-TET Roman Numeral parser.
- [x] **Float-Based Suggestions:** Created `microtonalSuggestions.js` to calculate harmonic swaps via Cent-based interval arrays and Least Squares Distance, completely replacing `modulo 12` integer logic.
- [x] **Exotic UI Bridge:** Updated the scale selector to dynamically generate custom micro-chord badges (e.g., `BP1`) instead of diatonic numerals.

**Phase 9: Advanced Composition & UX Polish (Upcoming)**
- [ ] **Enharmonic Context Dimming:** Subdue palette/inspector chords that are identical to chords already in the active progression.
- [ ] **Loop Block Dragging:** A new button representing the current loop bounds that allows drag-and-dropping the entire looped sequence at once.
- [ ] **Polyphonic Slice Pitch Editing:** Expand Pitch Mode in the Pattern Editor to allow pitch adjustments of individual notes within a chord slice, plus copy/pasting of these modifications.
- [ ] **Intelligent Bassline Enhancements:** Refine generation logic to produce interesting, multi-note rhythms instead of overly strict short slices, accounting for surrounding chord context.

## SHORTHANDS
- `fix_diff`: Fix diff + output Fresh Session Prompt.
- `move_protocol`: Relocate via 1) Delete diff 2) Insert diff. Never combine.
- `land_the_plane`: Remove logs -> Update Vision docs -> Refactor -> Write commit msg.

## META-PROTOCOL & EVOLUTION
- **CONTEXT PRUNING:** To prevent context bloat, the user may ask `prune_context`. Respond by listing files that seem irrelevant to the current task.
- **SELF-CORRECTION & ADAPTATION:** Proactively suggest modifications to this `AI_CONTEXT.md` file if you observe:
    1. A recurring error or miscommunication pattern.
    2. A shift in project goals (e.g., from prototyping to optimization) that requires new standards.
    3. An opportunity to compress existing rules into a more efficient, generalized protocol.