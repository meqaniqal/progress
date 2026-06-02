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
- Track active sprint items, immediate tasks, and focus goals in [CURRENT_FOCUS.md](file:///Users/sheldonlawrence/Desktop/progress/CURRENT_FOCUS.md).
- Long-term feature lists, music theory pillars, and completed project history reside in [PROGRESS_VISION.md](file:///Users/sheldonlawrence/Desktop/progress/PROGRESS_VISION.md). Refer to it only on-demand when starting new milestones or updating historical logs.

## AGENTIC & TOKEN OPTIMIZATION PROTOCOLS
- **SUBAGENTS:** Never automatically spawn subagents (`invoke_subagent` tool). Only propose spawning them if a task is highly parallelizable, and wait for explicit user approval.
- **RESEARCH LOOP LIMITS:** Limit codebase research (grep, view_file, list_dir) to 2-3 iterations. If information cannot be found, stop and ask the user for clarification rather than looping.
- **SUGGEST FIRST:** For token-intensive operations (e.g., major refactors, multi-file edits, or running heavy command scripts), draft or suggest the edits/commands first and let the user approve them or execute them manually.
- **PREFER TARGETED EDITS:** Use targeted replacement blocks rather than rewriting entire files to keep prompt/response tokens low.

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