# Microtonal Harmony & Transitional Chords: Implementation Reference

This document serves as the architectural reference for implementing microtonal keys, chords, and transitions (specifically targeting dense clusters) into the chord progression generation engine.

## 1. Core Data Structures: Breaking Free from 12-TET
To support microtonality (such as 31-EDO, Just Intonation, or arbitrary tuning systems), the engine must decouple pitch from standard MIDI note numbers (0-127).

**Recommended Data Model:**
* `TuningSystem`: Defines the resolution of the octave (e.g., `divisions = 31` for 31-EDO).
* `MicroPitch`: A floating-point representation of pitch, or a composite of `BaseNote` + `CentOffset`.
    ```javascript
    // Example conceptual structure
    class MicroPitch {
      float frequency;      // Absolute Hz
      float midiPitch;      // e.g., 60.5 for a quarter-tone sharp C
      int tuningDivision;   // Which EDO/Scale step this belongs to
    }
    ```
* **MPE Requirement:** To output these chords to synths, the engine *must* support MPE (MIDI Polyphonic Expression), allocating different notes of the same chord to separate MIDI channels so they can receive independent pitch bend data.

## 2. Algorithmic Micro-Voice Leading (Pitch Interpolation)
When transitioning between `Chord A` and `Chord B`, the engine needs a pathfinding algorithm to calculate the smoothest microtonal shifts.

**Implementation Steps:**
1.  **Calculate Pitch Distance:** For every voice in Chord A, calculate the absolute distance (in cents or EDO steps) to every voice in Chord B.
2.  **Shortest-Path Resolution:** Assign voices to target pitches using a "least total movement" optimization (e.g., the Hungarian algorithm for assignment, or a simple greedy nearest-neighbor approach).
3.  **Enforce Contrary Motion:** Add a weighting penalty to parallel motion. If Voice 1 moves up by +50 cents, incentivize Voice 2 to move down if possible, preventing the chord from sounding like a localized pitch-bend glide.

## 3. Harmonic Segmentation (Clash Detection Engine)
Dense microtonal clusters sound muddy if handled as a single block. The engine must programmatically segment the chord.

**Implementation Steps:**
1.  **Roughness Calculation:** Iterate through all interval pairs in the transitional chord.
2.  **Identify Stable Cores:** Find intervals that closely approximate simple integer ratios (e.g., Perfect 5ths ~3:2, Perfect 4ths ~4:3). Group these pitches into `Block_Core`.
3.  **Identify Shimmer/Clash Tones:** Find interval pairs that are highly dissonant (e.g., microtonal seconds, intervals between 15 and 65 cents apart where acoustic beating is highest). Group these into `Block_Friction_Left` and `Block_Friction_Right`.

## 4. Automated Spatial Distribution (Pan-Leading)
Once the chord is segmented by the logic above, apply automated stereo panning to physically separate the dissonance in the listener's ear.

**Logic Flow:**
* `if (pitch in Block_Core) -> Pan = 0 (Center)`
* `if (pitch in Block_Friction_Left) -> Pan = -0.75 (Hard Left)`
* `if (pitch in Block_Friction_Right) -> Pan = +0.75 (Hard Right)`
* **Dynamic Panning:** As the voice leading algorithm moves a pitch from a dissonant cluster into a stable resolution, automate its pan value to smoothly glide back to the center.

## 5. Timbral & Spectral Hooks
To achieve the "vowel filtering" or timbral optimization effect, the progression engine should generate macro-control data alongside the MIDI notes.

**Implementation Concepts:**
* **Formant Tracking:** Output a CC (Continuous Controller) value that maps to synth filter cutoffs/formants, tracking the fundamental frequency of the target resolution chord.
* **Friction Velocity/Volume:** Automatically lower the MIDI velocity or channel volume of the notes flagged as `Block_Friction` by 10-20% to push them into the background, while boosting the `Block_Core` notes to anchor the transition.

---
*Note: When expanding the UI, ensure the user can select their target EDO (Equal Division of the Octave) and toggle "Auto Pan-Leading" for dense microtonal clusters.*
