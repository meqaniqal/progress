---
name: module-testing-protocol
description: Protocol for creating Jest tests for pure logic modules: co-located test files, test structure template, and testability map for music theory vs DOM/audio code.
---

# SKILL: Module Testing Protocol

**Load this file when creating, extracting, or refactoring any module.**
**Trigger:** Any session involving `create module`, `extract function`, `refactor`, or `add tests`.

---

## STEP 0 — DECIDE WHAT IS TESTABLE

Jest tests are appropriate for **pure logic only**. The rule is simple:

| Testable ✅ | Not testable with Jest ❌ |
|---|---|
| Music theory functions (Roman numeral → pitch, voice leading) | Web Audio API nodes and connections |
| `CONFIG` value derivations | DOM manipulation and render functions |

If a function requires `document`, `window`, or `AudioContext` to run, it is an integration concern — do not force it into a unit test.

---

## STEP 1 — TEST FILE NAMING AND LOCATION

Every new or extracted module with pure logic gets a co-located test file:

```
src/
  theory/
    voiceLeading.js
    voiceLeading.test.js   ← co-located, same directory
  store/
    storePersistence.js
    storePersistence.test.js
```

Never put test files in a separate `__tests__` root folder unless the project structure already uses that convention. Co-location is the rule here.

---
## STEP 2 - DOCUMENT PER-MODULE TEST REQUIREMENTS

Each entry should cover happy path, edge cases, and invalid input.
---

## STEP 3 — TEST STRUCTURE TEMPLATE

```js
// voiceLeading.test.js
import { buildVoicing } from './voiceLeading.js';

describe('buildVoicing', () => {
  // Happy path
  it('returns correct pitches for C major in root position', () => {
    expect(buildVoicing('I', 'C', null)).toEqual([60, 64, 67]);
  });

  // Edge case
  it('handles octave boundary without wrapping below MIDI 0', () => {
    expect(buildVoicing('I', 'C', null, -2)).toEqual([36, 40, 43]);
  });

  // Voice leading constraint
  it('minimizes interval distance from previous chord', () => {
    const prev = [64, 67, 71]; // E, G, B (Em)
    const result = buildVoicing('I', 'C', prev);
    const totalMotion = result.reduce((sum, p, i) => sum + Math.abs(p - prev[i]), 0);
    expect(totalMotion).toBeLessThan(12); // arbitrary threshold — adjust to spec
  });

  // Invalid input
  it('throws a descriptive error for unknown Roman numeral', () => {
    expect(() => buildVoicing('IX', 'C', null)).toThrow(/unknown numeral/i);
  });
});
```

**Rules:**
- One `describe` block per exported function
- Group by: happy path → edge cases → invalid input
- Never import `AppState` or DOM globals into a test file
- Use `toEqual` for arrays, not `toBe` (reference equality will always fail for arrays)

---

## STEP 4 — RUNNING TESTS

```bash
# Run all tests once
npx jest

# Run tests for a single module
npx jest voiceLeading

# Watch mode during active development
npx jest --watch
```

Tests must pass before any refactor diff is submitted. If a test breaks due to an intentional API change, update the test in the same commit as the change — never leave a broken test to "fix later."

---

## STEP 5 — WHAT A PASSING TEST SUITE MEANS BEFORE LANDING

*Run this before closing any test-related task. Projects may alias this to a shorthand (e.g. `land_the_plane`).*

Before running `land_the_plane`:
- [ ] All existing tests pass with `npx jest`
- [ ] Any new module has a `.test.js` file with at minimum: one happy path, one edge case, one invalid input test
- [ ] No test file imports from DOM or audio globals
- [ ] Test descriptions read as plain English specifications, not implementation details


## PROJECT NOTES
*Edit this section per project. Everything above is generic and should not be changed.*

### Testability Map

| Testable ✅ | Not Testable with Jest ❌ |
|---|---|
| `storePersistence.js` parse/sanitize/migrate logic | `MidiWriterJS` file output (integration, not unit) |
| Chord suggestion ranking logic (`progressionSuggestions.js`) | Drag-and-drop event handlers |
| Chord analyzer classification (`chordAnalyzer.js`) | Anything requiring `AudioContext` |
| Music theory / voice leading functions | Web Audio API node connections |

### What to Test in Each Module

### Theory / Math Functions
- Identity cases: does `C major` return `[60, 64, 67]`?
- Edge cases: chromatic extremes, octave boundaries, enharmonic equivalents
- Voice leading: does the output minimize interval jumps from the previous chord?
- Invalid input: non-existent Roman numerals, out-of-range octave values

### `storePersistence.js`
- A valid saved state round-trips without mutation
- An older schema version triggers migration and produces valid current shape
- Corrupted or missing `localStorage` data returns a clean default state without throwing
- Sanitization rejects unexpected keys rather than passing them through

### `progressionSuggestions.js`
- A known tonic chord returns expected diatonic candidates
- Suggestions are ranked (most common first) — verify ordering, not just membership
- Modal and chromatic edge cases return non-empty arrays

### `chordAnalyzer.js`
- A pitch array of `[60, 64, 67]` is classified as C major
- Inversions are detected correctly
- Unrecognized pitch sets return a graceful fallback, not an exception
