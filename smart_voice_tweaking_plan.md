# Smart Voice Tweaking & Generative Transitions: Implementation Plan

## Architectural Paradigm: "Voice Tweak Mode"
Rather than creating a 4th tab in the Pattern Editor, this feature will be implemented as a dedicated **Mode** within the existing `[ Chords ]` tab (alongside Draw Mode and Pitch Mode). 

**Why this maintains Separation of Concerns:**
The tweaks (suspensions, passing tones) fundamentally belong to the harmonic structure of the chord. By keeping it in the Chords tab, the `state.currentProgression[index].chordPattern` (or the chord object itself) remains the Single Source of Truth for all chord-related data. The UI will simply swap from rendering rhythmic slices to rendering horizontal, continuous "Voice Lanes".

## The Data Structure (SSOT)
We will introduce a `voiceTweaks` array to the chord state. This acts as a set of rules evaluated by the audio engine (`sequencer.js`) at runtime, preserving the underlying chord data non-destructively.

```json
{
    "symbol": "V",
    "key": 67,
    "duration": 2,
    "voiceTweaks": [
        { 
            "voiceIndex": "master", // 'master' or an integer (e.g., 2 for the 3rd voice)
            "type": "passing",      // 'suspend', 'passing', 'anticipate', 'random'
            "syncTarget": "grid",   // V2: 'kick', 'snare' for cross-layer rhythmic anchoring
            "probability": 1.0
        }
    ]
}
```

## Phase 1: The Foundation & Hybrid Workflow
**Goal:** Establish the UI workspace, the SSOT data structure, and the core algorithmic transitions.

1. **The Workspace (UI):** 
   - Add a `🎹 Voice Tweaks` toggle button in the Chords tab toolbar.
   - When active, the timeline renders continuous horizontal lanes for every voice in the current chord, plus a special "Master Tweak" lane at the top.
2. **Contextual Auditioning:** 
   - Clicking a specific voice lane isolates that voice at 100% volume while dimming the rest of the chord/bass to 30%.
   - Selecting a tweak (e.g., "Suspend") instantly plays a brief preview of the transition resolving into the next chord.
3. **The Micro Tweaks:** 
   - Users can click a specific voice lane and apply: *Passing Tone*, *Suspension*, or *Anticipation*.
4. **The Macro Tweak (High-Level):** 
   - Clicking the Master Lane allows selecting "Auto-Smooth" or "Add Suspensions". The engine calculates the optimal moves and auto-populates the individual voice lanes below, revealing the algorithmic decisions so the user can modify them.

## Phase 2: Generative Intelligence & Cross-Layer Physics
**Goal:** Make the transitions react to the rest of the track and evolve over time (hooking into Multi-Pass Export).

1. **Generative Personas (Random Mode):** 
   - Introduce probabilistic behaviors: *The Restless Voice* (trills/flutters) or *The Lazy Voice* (holds notes across boundaries). Evaluated uniquely on every loop cycle.
2. **Rhythmic Anchoring (Cross-Layer Sync):** 
   - Allow a voice tweak to sync its trigger timing strictly to the `drumPattern` (e.g., "Trigger passing tone exactly when the snare hits") rather than a blind mathematical ratio.
3. **Collision Physics:** 
   - Upgrade the `theory.js` voice-leading engine to detect if a generative tweak causes two inner voices to crash into a muddy minor-second interval, automatically nudging one to a safe consonance.
4. **Tension Triggers:** 
   - Allow tweaks to activate based on emotional context (e.g., "Only play trills if moving to a chord with a Tension score > 0.5").

## Necessary Context Files for Implementation
When developing this feature, provide the following files to the AI context:
- `store.js` (To implement `voiceTweaks` in the schema and state handlers)
- `theory.js` (To build the mathematical transition calculators for Suspensions and Passing tones)
- `rhythmEditor.js` / `rhythmRenderer.js` (To build the Voice Tweak UI mode and lanes)
- `timelineEditor.js` (To handle pointer events and lane selection)
- `sequencer.js` (To evaluate `voiceTweaks` in real-time during playback)
- `patternUtils.js` (For helper functions managing tweak data)