# PROGRESS: Current Focus & Active Tasks

This document contains the immediate objectives and active task checklists. To prevent context bloat, keep this file lightweight and focused only on the current sprint. Once tasks are completed, move them to the historical roadmap in [PROGRESS_VISION.md](file:///c:/Users/mekka/OneDrive/Desktop/progress/PROGRESS_VISION.md).

---

## 🎯 Current Objectives

1. **Genre Presets & Groove Synchronization (Phase 12)**:
   - Formulate pre-designed patterns for genres like Lofi, Neo-Soul, IDM, Synthwave, Afrobeat, and Eastern rhythms.
   - Build a global swing/shuffle timing offset module.
   - Implement MIDI groove import/extraction.

---

## 📝 Active Task Checklist

### 1. Genre Rhythmic Presets (Planned 🚧)
- [ ] **Curate Presets**: Define standard preset templates for arpeggios, drum patterns, and chord rhythms.
- [ ] **Eastern Rhythms**: Map specific Eastern odd-meter cycles (e.g. 5/8, 7/8, 9/8) and maqam-linked templates.
- [ ] **UI Category**: Introduce a dropdown or selector in the pattern tab to apply presets.

### 2. Adjustable Swing & Groove Sync (Planned 🚧)
- [ ] **Swing Slider**: Add a global swing/shuffle control in General settings or above the transport.
- [ ] **Sequencer Delay Math**: Adjust audio scheduling tick math to delay offbeats based on the swing amount.
- [ ] **MIDI Groove Extraction**:
  - [ ] Implement a basic MIDI parser to read note-on timing offsets.
  - [ ] Adapt the sequencer timeline scheduler to play with micro-timing offsets extracted from the loaded MIDI file.

---

## 🔍 Verification & Testing Goals
- Confirm that swing delay math applies consistently across Chords, Bass, Drums, Melody, and Countermelody sequencers.
- Test MIDI groove file uploading and ensure correct ticks calculation.
- Run Jest tests (`npm test`) on timing calculations.
