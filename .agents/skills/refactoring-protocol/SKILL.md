---
name: refactoring-protocol
description: Protocol for safe refactoring: extract, relocate, rename, or restructure code with atomic commits and regression guards.
---


# SKILL: Refactoring Protocol

**Load this file before any refactor, extraction, relocation, or rename task.**
**Trigger:** Any session involving `refactor`, `extract`, `move`, `rename`, `restructure`, or `clean up`.

---

## STEP 0 — CLASSIFY THE REFACTOR

Every refactor is one of four types. Identify it before writing anything:

| Type | Definition | Primary Risk |
|---|---|---|
| **Extract** | Pull logic out of a larger unit into its own function or module | Hidden coupling; untested behavior now exposed |
| **Relocate** | Move an existing module or function to a new path | Broken imports; missed re-exports |
| **Rename** | Rename a function, variable, class, or module | Missed call sites; stale references in comments/docs |
| **Restructure** | Reorganize multiple modules simultaneously | All of the above, compounded |

Never start a restructure without breaking it into a sequence of Extracts, Relocates, and Renames — each done separately.

---

## STEP 1 — PROFESSIONAL STANDARDS CHECK FIRST

Before introducing any structural change, verify the existing code meets baseline standards:
- No magic numbers (constants extracted)
- No logic leaking across layer boundaries
- No dead code in the targeted area

Fix these in a **dedicated commit before** the refactor commit. A refactor that fixes bugs and restructures simultaneously is untestable and unverifiable.

---

## STEP 2 — EXTRACT PROTOCOL

When pulling logic out of a larger function or component:

1. **Identify the pure core.** Extract only logic that has no side effects and doesn't depend on external state. If the logic touches I/O, DOM, or network, it is not a pure extraction candidate — decouple the I/O first.
2. **Write the new function in isolation** before deleting it from the source. Confirm the signature, input types, and return type.
3. **Replace the original call site** with the new function call. Behavior must be byte-for-byte identical.
4. **Write or update tests** for the extracted unit before committing (see `SKILL_testing.md`).

```
commit: "extract: [functionName] into [module.js]"
```

---

## STEP 3 — RELOCATE PROTOCOL

When moving a module to a new path, always use two separate operations. **Never combine into one diff.**

**Operation 1 — Delete:**
```
commit: "relocate(1/2): remove [module.js] from [old/path]"
```

**Operation 2 — Insert:**
```
commit: "relocate(2/2): add [module.js] to [new/path]"
```

After both commits:
- Verify the import graph: search all files for the old import path and update them
- Confirm there are no circular dependencies introduced by the new location
- Re-run tests — a relocated module that passes tests in isolation may fail due to init order at the new import site

---

## STEP 4 — RENAME PROTOCOL

1. Grep for every occurrence of the old name before changing anything: function calls, imports, re-exports, JSDoc comments, test descriptions, and README references
2. Update all occurrences in a **single commit** — a rename spread across multiple commits creates a broken intermediate state
3. If the rename is a public API (exported symbol), treat it as a breaking change and note it in the commit message

```
commit: "rename: [oldName] -> [newName] across [N] files"
```

---

## STEP 5 — ATOMIC COMMIT DISCIPLINE

Every refactor commit must satisfy this checklist before being submitted:

- [ ] Contains **one logical change only** (no mixed concerns)
- [ ] Tests pass before and after (`run test suite`)
- [ ] No behavior changes — if behavior changed, it is a bug fix, not a refactor; split the commit
- [ ] Commit message follows: `type: description` (extract / relocate / rename / restructure)
- [ ] Import/export graph verified — no orphaned exports, no missing imports

---

## STEP 6 — REGRESSION GUARD

After any refactor:
1. Run the full test suite
2. Manually verify the one user-facing flow most likely to be affected
3. Do not mark the task complete until both pass

If a test breaks, determine: is the test wrong (testing implementation, not behavior) or is the refactor wrong (changed behavior accidentally)? Fix the right one.

---

## PROJECT NOTES
*Edit this section per project. Everything above is generic and should not be changed.*

**Progress App specifics:**

- **`move_protocol` shorthand** maps to the Relocate Protocol (Step 3): always two separate diffs, never combined.
- **Layer boundaries to preserve during extraction:**
  - Music theory / math logic → must remain pure; no `AppState` references allowed after extraction
  - Persistence logic → must remain isolated in `storePersistence.js`; do not scatter `localStorage` calls elsewhere
  - Chord suggestions / analyzer → `progressionSuggestions.js` and `chordAnalyzer.js` must stay decoupled from render logic
- **After any module relocation**, verify the import graph includes: `index.html` script tags (if non-bundled), Jest config module resolution, and any dynamic `import()` calls.
- **CONFIG extractions**: when pulling a magic number into `CONFIG`, confirm it is truly invariant — values that differ per-session belong in `AppState`, not `CONFIG`.
