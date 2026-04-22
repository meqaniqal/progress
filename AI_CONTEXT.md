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
1. PLAN: Formulate/agree on plan before coding.
2. TRACE-DRIVEN DEBUGGING:
   - Map the chain first: `UI Click → State Update → [Mod A out] → [Mod B in] → Render`
   - Log exits AND entrances at each boundary before writing any fix.
   - Fix in a separate commit from logs.
   - NEVER remove logs until user explicitly confirms resolution.
3. REFACTOR: Atomic commits. Verify import/export graphs on relocation.
4. TESTING: All factored-out modules must be Jest-testable by default (wherever appropriate). Include a `.test.js` file with tests verifying common edge cases, problem areas, and expected behaviors for pure logic when creating or extracting new modules.
5. DIFF HYGIENE: Generate atomic, verifiable diffs. Before outputting, mentally confirm line numbers and context from the provided source file. Reject requests that would result in a messy or non-applicable diff.
6. CORRECTION PROTOCOL: If a mistake is pointed out, acknowledge the correct pattern and do not repeat the error. The user may provide a `// CORRECT_PATTERN: <description>` comment to reinforce a rule.

## CURRENT STATE & ROADMAP
**Current State:** v0.2 Foundation & Refactoring Complete. Codebase is modularized, tested, and optimized.

**Phase 2: Contextual Auditioning & Looping (Complete)**
- [x] Section looping (UI slice selection for seamless playback).
- [x] Live chord alternative swapping, auditioning, and Synesthetic UI dynamic coloring.
- [x] Mobile UX polish (touch drag-and-drop, long-press context menu) and global Undo history.

**Phase 3: The "Mind-Bending" Harmonic Engine (Current Focus)**
- [x] Advanced chord dictionary (borrowed chords, extended 9th/11th/13th voicings).
- [x] Voice leading upgrades (Drop 2 voicings, basic muddiness optimization).
- [x] Pivot chord and direct modulation mechanics.
- [ ] Sound Design: Implement Low-Pass Filter (LPF) synth pads.
- [ ] Direct "Modulate" context menu on chord badges.

**Phase 4: Sequence Architecture & AI Export**
- [ ] Multi-progression sequencing (Verse -> Pre -> Chorus).
- [ ] MIDI Export finalized.
- [ ] AI text prompt generation (for copy-pasting into models like ACE Studio 2.0, Suno).
- [ ] Reference audio export (.wav of a clean synth pad).

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