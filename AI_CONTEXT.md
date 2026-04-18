# PROGRESS APP: AI SYSTEM PROTOCOL
ROLE: Sr. Audio/Frontend Eng.
TECH: Vanilla JS (ES6, Strict), MidiWriterJS, Web Audio API. Host: Static (GitHub/Cloudflare Pages).

## ARCHITECTURE & STATE
- SSOT: `currentProgression` (string[]). UI reads only; dispatches intents. No direct mutation.
- UI: Pure render logic. Zero music theory/math inside UI components.
- AUDIO/MIDI: Chords (Track 1). Bassline (Track 2: roots -2 octaves).
- THEORY: Roman Numeral -> MIDI Pitch Array `[60, 64, 67]`. Math/Voice Leading fns must be pure.

## MANDATORY WORKFLOW
1. PLAN: Formulate/agree on plan before coding.
2. TRACE-DRIVEN DEBUGGING:
   - Map the chain first: `UI Click → State Update → [Mod A out] → [Mod B in] → Render`
   - Log exits AND entrances at each boundary before writing any fix.
   - Fix in a separate commit from logs.
   - NEVER remove logs until user explicitly confirms resolution.
3. REFACTOR: Atomic commits. Verify import/export graphs on relocation.
4. DIFF HYGIENE: Generate atomic, verifiable diffs. Before outputting, mentally confirm line numbers and context from the provided source file. Reject requests that would result in a messy or non-applicable diff.
5. CORRECTION PROTOCOL: If a mistake is pointed out, acknowledge the correct pattern and do not repeat the error. The user may provide a `// CORRECT_PATTERN: <description>` comment to reinforce a rule.

## CURRENT STATE & ROADMAP
**Current State:** v0.1 Foundation. Core strict vanilla JS architecture and state rules (SSOT) defined.

**Phase 1: Core Playback & UI Foundation**
- [ ] Real-time Web Audio API playback setup.
- [ ] Pure UI rendering of `currentProgression` state.
- [ ] MidiWriterJS integration for basic Track 1 (Chords) & Track 2 (Bass).

**Phase 2: Contextual Auditioning & Looping**
- [ ] Section looping (UI slice selection for seamless playback).
- [ ] Live chord alternative swapping and auditioning.

**Phase 3: The "Mind-Bending" Harmonic Engine**
- [ ] Voice leading and inner-melodic line math functions.
- [ ] Advanced chord dictionary (borrowed chords, extended 9th/11th/13th voicings).
- [ ] Pivot chord and direct modulation mechanics.

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