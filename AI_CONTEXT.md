# PROGRESS APP: AI SYSTEM PROTOCOL
ROLE: Sr. Audio/Frontend Eng.
TECH: Vanilla JS (ES6, Strict), MidiWriterJS, Web Audio API. Host: Static (GitHub/Cloudflare Pages).

## ARCHITECTURE & STATE
- SSOT: Pure JS `AppState` object. UI reads only; dispatches intents. No direct mutation. **Never read state from the DOM during performance-critical loops.**
- UI: Pure render logic. Zero music theory/math inside UI components.
- AUDIO/MIDI: Chords (Track 1). Bassline (Track 2: roots -2 octaves). **All audio must pass through a Master Bus/Compressor to prevent digital clipping.**
- THEORY: Roman Numeral -> MIDI Pitch Array `[60, 64, 67]`. Math/Voice Leading fns must be pure.
- CONSTANTS: No magic numbers in code. Extract all configuration values to a top-level `CONFIG` object.
- MOBILE DRAG & DROP: Never rely on `e.dataTransfer.getData()` to pass payloads. Always use module-scoped variables (e.g., `draggedSourceChord`, `draggedIndex`) to pass state between `dragstart` and `drop` to maintain strict compatibility with the mobile polyfill.

## MANDATORY WORKFLOW
1. PROFESSIONAL STANDARDS FIRST: Proactively align the codebase with rigorous professional practices so it endures all scrutiny by senior code reviewers. Ensure existing code meets these standards before adding features, taking extreme care not to break functionality or introduce regressions.
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
**Current State:** Phase 4 Complete. Sequence architecture and AI export capabilities are fully integrated and tested.

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
- [x] **Architectural Refactoring - State:** Clean up module-scoped mutable state variables in `rhythmEditor.js`.
- [x] **Architectural Refactoring - Events:** Implement Event Delegation for the Chord Inspector in `ui.js` to prevent memory leaks from orphaned listeners.
- [x] Generative Multi-Pass Export (UI and multi-pass looping engine fully integrated for both MIDI and WAV).
- [x] **UI Decluttering:** Moved Theme, BPM, Mixer, and Voice Leading settings into a dedicated Settings Modal via the top bar gear icon. Added independent Master volume control.
- [x] Probabilistic Pattern Sequencing (Per-slice and per-hit probability sliders for generative, organically evolving rhythms).
- [x] Unified Pattern Architecture: Global/Local cascading state (Reset inherits Global, Clear forces 1-block local override).
- [x] Drum Machine Synthesis & Grid Editor: 4-piece kit (Kick, Snare, CHH, OHH). Includes a dual-view workflow: a scrollable, independent-length Global pattern that loops continuously across the entire progression (featuring non-destructive truncation, smart duplication, panning, and DAW-style page-flipping), and a zoomed-in Local override view featuring "ghost notes" for precise drum fills.
- [ ] Intelligent Bassline Generation (Shares rhythm editor tech, single note focus).
- [x] **True Minor Key & Omni-Scale Theory Framework:**
  - [x] Decouple global key state to support modes (Major/Minor).
  - [x] Dynamic UI palettes that render correct diatonic chords for the active scale.
  - [x] Context-aware tension analysis based on the active scale's tonic.
  - [x] Mode-aware modulation and turnaround suggestions.
  - [x] Omni-scale support (Dorian, Lydian, Harmonic/Melodic Minor, etc.).
- [ ] **Experimental Draw Mode & Global/Local UX Refactor (Current Focus):**
  - Shift from Global/Local toggle to an "Edit-in-Place" Push/Pull workflow (`Set Global` / `From Global` buttons).
  - Change default Global pattern to a single, continuous chord block.
  - Introduce a "Pencil" Draw tool.
  - Implement grid-aware sequence painting (Grid ON) vs. continuous block extension (Grid OFF).
  - Implement Boolean "Carving/Erasing" math for drawing over existing slices.
  - *Protocol requirement:* The Boolean overlap/carving math must be isolated in a pure, Jest-testable module before integration.
  - *Protocol requirement:* Hide this new editor behind a persistent Settings toggle (`enableExperimentalDrawMode`) during development to preserve legacy stability.

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