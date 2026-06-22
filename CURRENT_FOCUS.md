# PROGRESS: Current Focus & Active Tasks

This document contains the immediate objectives and active task checklists. To prevent context bloat, keep this file lightweight and focused only on the current sprint. Once tasks are completed, move them to the historical roadmap in [PROGRESS_VISION.md](file:///c:/Users/mekka/OneDrive/Desktop/progress/PROGRESS_VISION.md).

---

## 🎯 Current Objectives

1. **Investigate Mgen-to-Progress Translation Discrepancies (Next Session Priority)**:
   - Identify why melody generation sounds better in the standalone `mgen` testing app compared to playback in the main `progress` app.
   - Investigate note timing (start beats, durations) and pitch translation/interpretation during the bridge phase (`melodyGenResultToProgressNotes`) and playback scheduling in `melodyScheduler.js`.
   - Eliminate isolated off-notes (notes outside the active scale/harmony or poorly timed) to match the harmonic alignment improvements.

2. **Melody Structural Paradigm Shift (Completed ✅)**:
   - Transitioned the melody generation engine to a Hierarchical Structural Tone Layer.
   - Implemented structural target planning (Pass A / StructuralPlanner), cadence resolution rules (Pass B / CadencePlanner), connective fills (Pass C / ConnectorPlanner), and expressiveness (Pass D / OrnamentPlanner).
   - Refactored `RhythmEngine` to support dynamic chord slot durations and protect essential structural/cadence notes.

---

## 📝 Active Task Checklist

### 1. Mgen-to-Progress Playback & Note Translation Audit (Planned ⏳)
- [ ] **Timing Analysis**: Trace how beats are scaled from mgen output to the progress BPM/divisions in `melodyGenResultToProgressNotes`.
- [ ] **Pitch & Harmony Audit**: Check if chord slots in the main app swap notes/tuning scales in a way that differs from what `mgen` processed during pregeneration.
- [ ] **Off-note Elimination**: Implement final filtering or snapping checks in the playback bridge to eliminate isolated off-keys/clashing steps.

---

## 🔍 Verification & Testing Goals
- Run `npm test` to ensure all 728 unit and integration tests remain green.
- Verify playback in both the standalone dashboard (`mgen/fulltest.html`) and the main application to ensure auditory parity.

---

## 🎯 Added From User Prompt (To Be Re-evaluated)

- **Console Debugging**: Add console debugging for `mgen`'s generated notes while using it within `progress`.
- **Rhythmic & Tonal Evaluator Module**: Implement an evaluator module within `progress` to determine if generated notes are rhythmically and tonally compatible with melodic and rhythmic information present at any time in the `progress` timeline.
- **Robust Musical Tests**: Ensure tests for `mgen` components are robust enough to test for truly professional musical results (aligned with studies on what sounds enjoyable, innovative, professional, and highly advanced), rather than just passing basic programmatic/incorrect musical assumptions.

