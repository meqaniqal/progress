# PROGRESS: Current Focus & Active Tasks

This document contains the immediate objectives and active task checklists. To prevent context bloat, keep this file lightweight and focused only on the current sprint. Once tasks are completed, move them to the historical roadmap in [PROGRESS_VISION.md](file:///c:/Users/mekka/OneDrive/Desktop/progress/PROGRESS_VISION.md).

---

## 🎯 Current Objectives

1. **Melody Structural Paradigm Shift (Next Session Priority)**:
   - Transition the melody generation engine from local note-level constraints to a **Hierarchical Structural Tone Layer** as outlined in [melodymechanics.md#10-chatgpt-architectural-advice--paradigm-shift-june-2026](file:///Users/sheldonlawrence/Desktop/progress/melodymechanics.md#10-chatgpt-architectural-advice--paradigm-shift-june-2026).
   - Implement structural melody planning (planning a singular target structural pitch per bar before generating decorations).
   - Integrate high-level phrase intent roles (`antecedent`, `consequent`, `climax`, `release`) and manage climax peaks to avoid redundant high notes.
   - Refactor motivic development to prioritize human transformations (rhythmic variation, partial recall, expansion/compression) over geometric alterations.

---

## 📝 Active Task Checklist

### 1. Structural Tone Layer & Hierarchical Melody Generation (Planned ⏳)
- [ ] **Structural Planner**: Implement first-pass planner to select key structural targets per bar based on active chord progression.
- [ ] **Decorative Fill Engine**: Refactor note-generation loop to treat intermediate pitches strictly as resolutions or connective decorations around targets.
- [ ] **Phrase Intent Roles**: Map `phraseRole` states to control ending pitches (preventing tonic resolution on antecedents).
- [ ] **Climax Management**: Add `phraseHighestPitch` / `songHighestPitch` checks to restrict multiple climax repetitions.
- [ ] **Human Motivic Transforms**: Implement partial recall and rhythmic motif variation.

---

## 🔍 Verification & Testing Goals
- Confirm that tests in [melodyGenerator.test.js](file:///Users/sheldonlawrence/Desktop/progress/melodyGenerator.test.js) pass successfully.
- Manually audit generated output to ensure structural grounding and check that isolated notes no longer clank outside the home key.
