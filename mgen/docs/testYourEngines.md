# MotifEngine Integration Plan

## Overview
Replicate the `testMicrotonalEngine()` pattern from `app.js` and its corresponding button from `index.html` for the `MotifEngine`.

## Step 1: Import MotifEngine into app.js
**File:** `app.js` (line 8)
- Add `import { MotifEngine, MotifFamily, MotifTransformation } from './src/engines/MotifEngine.js';`
- This mirrors the existing `MicrotonalEngine` import on line 8 (shift it to line 9)

## Step 2: Create the `testMotifEngine()` function in app.js
**File:** `app.js` (after line 1028, before window exports)
- Create an `async function testMotifEngine()` following the exact pattern of `testMicrotonalEngine()` (lines 937-1028)
- The function should:
  1. Clear the execution log and show the pipeline-status panel
  2. Create test structural notes (5-6 notes with varying pitches, similar to microtonal test at lines 943-949)
  3. Iterate over transformation types: `['transposition', 'sequence', 'inversion', 'retrograde', 'augmentation', 'diminution']`
  4. For each type, instantiate `new MotifEngine({ allowedTransformations: [type] })`
  5. Call `engine.execute(config, testNotes, {})`
  6. Capture results: `motifFamilies`, `motifCount`, transformation metadata on notes (check `note.metadata.motifTransformation`)
  7. Determine pass/fail: families extracted > 0 AND notes have motifTransformation metadata
  8. Log pass/fail to execution-log via `addLogEntry()` with 'success'/'error' type
  9. Log detailed results to console (motif families, transformation type applied, sample transformed notes with metadata fields like `motifId`, `transpositionSemitones`, `sequenceLevel`, `inversionAxis`, `augmentationMultiplier`, `diminutionDivisor`)
  10. Print a summary table to console (similar to microtonal summary at lines 1015-1027)

## Step 3: Expose the function to window
**File:** `app.js` (line 1040)
- Add `window.testMotifEngine = testMotifEngine;`

## Step 4: Add button to index.html
**File:** `index.html` (line 526)
- Add a new button alongside the existing "Test Microtonal Engine" button:
  ```html
  <button class="secondary" onclick="testMotifEngine()">Test Motif Engine</button>
  ```

## Step 5: Verify
- Open `index.html` in a browser
- Click "Test Motif Engine" button
- Verify:
  - Execution log shows per-transformation pass/fail entries
  - Console shows detailed motif family extraction and transformation results
  - Console shows summary table with transformation types, pass/fail status
  - No JavaScript errors

## Key details to match the microtonal pattern:
- Use `GenerationConfig` with empty chords array and a `PhraseContext`
- Use `MelodyNote` instances with explicit pitches, startTimes, durations, and roles
- Check `result.metadata.motifFamilies` for extracted families
- Check `result.metadata.motifCount` for number of motifs
- Check individual note metadata for transformation-specific fields (e.g., `transpositionSemitones`, `sequenceLevel`, `inversionAxis`, `motifId`)
- Score = coherence ratio (from `result.metrics.score`)

## Files modified:
1. `app.js` - import + function + window export (3 changes)
2. `index.html` - button addition (1 change)

## Session resume points:
- If interrupted after Step 1: import is added, proceed to Step 2
- If interrupted after Step 2: function is written, proceed to Step 3
- If interrupted after Step 3: window export added, proceed to Step 4
- If interrupted after Step 4: button added, proceed to Step 5
