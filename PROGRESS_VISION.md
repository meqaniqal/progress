# PROGRESS: App Vision & Roadmap

## Overview
**Progress** is an interactive application designed for building, sequencing, and refining advanced chord progressions. It goes beyond simple chord generation by integrating professional music theory concepts to craft emotionally powerful, mind-bending, and complex harmonic sequences. The app is specifically tailored to act as a "creative frontend" for AI song generation (e.g., prompting "advanced music theory electronica"). It allows users to contextually audition, tweak, and perfect their progressions, ultimately exporting them as rich MIDI data or structural text prompts that yield chart-worthy AI generations.

## Core Application Features

### 1. Progression Sequencing & Library
- **Curated Library:** Maintain a library of curated chord progressions to select from and drop into larger progression sequences.
- **Sequence Building:** Construct not just individual chord progressions, but sequences of multiple progressions to form full song structures (e.g., Verse -> Pre-Chorus -> Chorus).
- **Exporting:** Save and export any chord progression sequence (e.g., via MIDI) to be dropped directly into a DAW for song production.

### 2. Advanced Auditioning & Looping
- **Contextual Editing:** Audition and edit all chords in real-time.
- **Section Looping:** Select specific sections of a chord progression sequence to loop continuously. This allows the user to tweak individual notes and voicings to ensure they work perfectly in context.

### 3. Synesthetic Harmonic UI & Seamless Chord Swapping
- **Fluid Auditioning:** Where there are several functional alternatives for a specific chord in a sequence, the user can seamlessly swap them in. The audio engine adapts instantly.
- **Live Auditioning:** Hear the results of a selected alternative *live* while the progression (or looped section) is playing, without losing the original chord.
- **Reverting & History:** The app remembers the original chord of any swapped position, allowing the user to seamlessly revert via the contextual menu.
- **Dynamic Color Mapping:** Chords are not static badges. Their background colors dynamically shift based on their harmonic relationship to the base key and surrounding context. By mapping the Circle of Fifths to the Color Wheel (Hue), Harmonic Function to Luminosity, and Modal Mixture to Saturation, users intuitively *see* tension, release, and dissonance.

### 4. Advanced Sequencer View & Pattern Editing
- **Visual Timeline:** Instead of a simple tray, view chords on a timeline or piano-roll-style grid.
- **Global Drum & Rhythm Construction:** Construct master drum rhythms that act as the foundational basis for the track. Drums have a global rhythm but can be locally edited for each individual chord segment.
- **Per-Chord Rhythm/Timing Editor:** When a chord is selected, a dedicated timeline opens where the chord initially extends through the entire edit window. Users can slice and break the chord up into multiple rhythmic instances of itself manually or via automatic modification options.
- **Grid & Free-Time Manipulation:** Instances can be moved around at user-defined grid intervals, or nudged completely off-grid (by toggling the grid off, or holding `Shift` while dragging on a desktop).
- **Intelligent Rhythm Snapping:** If a drum rhythm is programmed for that chord's timeline, a single-click option allows users to intelligently (or via musical randomization) snap and syncopate unedited chord instances directly to the underlying drum groove.
- **Localized Arpeggiation:** Users can drag a selection box around specific notes or chord instances in the editor. Applying arpeggiation *replaces* these selected notes with an arpeggiated version, allowing for intricate, localized polyrhythms.
- **Generative Arp Modes:** Arpeggiation includes several modes, such as static sequences, one-shot randomization, or continuous regeneration applied every time the playback loop restarts.
- **Multi-Pass Generative Export:** If continuous per-loop randomization is active, users can choose to export multiple passes of the sequence to MIDI or WAV. This captures the exact randomized output that occurred in the last *x* set of loopthroughs (or *x* loops since active), ensuring fleeting generative magic is permanently captured for the DAW.
- **Micro-Arrangement:** Within the pattern editor, apply octave shifts, specific inversions, and custom voicings to individual instances of the chord. All edits render into the final exported MIDI.
- **Contrapuntal Voice Tweaking:** Manually nudge individual notes within a generated chord to fix unpleasant intervals or create intersecting melodies, even if it conceptually alters the chord's pure theoretical name. The app supports "listening" over strict "theory".
- **Adjustable Duration:** Click and drag to change the length of each chord.
- **Ripple Editing:** Optionally, have the timeline automatically push subsequent chords forward when a preceding chord's duration is extended, maintaining the overall sequence.
- **Loop-Aware Resolution:** The voice-leading and suggestion engines analyze the progression as a continuous cycle, ensuring the transition from the *last* chord back to the *first* chord is as smooth and emotionally satisfying as any internal internal transition.
*(Note: A Melody editor is planned for the future, but current scope strictly targets Chords, Drums, and Bass.)*

### 5. Intelligent Bassline Generation (Future Goal)
- **Unified Editor Technology:** The Bassline editor will utilize the exact same underlying technology and timeline logic as the Per-Chord Rhythm Editor, but restricted to a single note focus.
- **Rhythm-Informed Generation:** Utilize the constructed drum and chord rhythms to generate intelligent, genre-appropriate basslines.
- **Contextual Suggestions:** The engine acts as a safety net, suggesting the best locations and pitches for bass notes based on the current harmonic progression.
- **Symbiotic Editing:** If the user manually edits the chord pattern or the bassline, the system dynamically informs changes across the board. The bassline notes, chord pattern elements, and master rhythm continually cross-reference each other to ensure everything locks together musically from moment to moment.

---

## The Music Theory Foundation

The app's logic and user guidance are built on a conceptual map of how professionals write emotionally powerful chord progressions.

### The Core Workflow
Writing a progression involves three primary stages:
1. **Choose a harmonic foundation:** Establish the key, mode, and tension targets.
2. **Voice each chord with intention:** Decide on register, spacing, and doubling. 
3. **Craft the transitions:** Focus on how the chords move into one another.
*Crucial Habit:* Draft the bass line first. This single habit transforms amateur writing into something that truly moves.

### The Piano Roll & Voicing
The placement of notes on the piano roll matters enormously. The top note of each chord naturally creates its own melody—so it must be placed intentionally.
- **Close Voicings:** Stacked closely in the middle register, these sound warm, intimate, and focused.
- **Open/Spread Voicings:** Spread wide across the piano roll, these feel cinematic, exposed, and orchestral.
- **Shell Voicings:** Consisting of just the bass and 7th (omitting the middle), these feel spacious and leave room for a soloist or the listener's imagination to fill the gap, creating its own emotional pull.

### The Four Pillars of Harmonic Magic

#### 1. Voice Leading
The single highest-leverage technique for chord transitions. 
- Keep notes close so they naturally "pull" into each other.
- When inner voices move by half-step rather than leaping, transitions stop sounding "composed" and start sounding felt. It’s the difference between chord changes that thud and chord changes that breathe.

#### 2. Inner & Shifting Melodic Lines
The professional's secret weapon.
- Deliberately choose voicings so that hidden voices descend (or ascend) stepwise across the progression.
- **Fluid Melody Handoff:** The primary melody does not always have to sit on the top note. The emotional core of a sequence often comes from handing the melodic focus between the top, middle, and bottom voices to avoid predictability.
- **Contrapuntal Weaving:** Multiple voices within the chord sequence can carry their own simultaneous, intertwining melodies.

#### 3. Borrowed Chords & Modal Mixture
The "color spice rack" of the progression.
- Temporarily steal color from a parallel key.
- Chords like `♭VII`, `♭VI`, and `iv` (borrowed from the parallel minor into a major key) are incredibly powerful. They darken the mood without fully committing to a minor key.
- *Best Practice:* Use one borrowed chord per phrase for impact, rather than oversaturating the progression.

#### 4. Modulation
The structural climax tool.
- Moving the tonal center entirely provides intense drama or relief.
- Save modulations for pivotal moments like the bridge or the final chorus.
- **Pivot Chord Modulation:** Uses a shared chord between two keys; feels earned and smooth.
- **Direct Half-Step Modulation:** Shifts the key center abruptly; acts like a release valve. Both are enormously effective when timed right.

#### 5. Acoustic Clarity & Timbral Contrast
The richest harmony sounds like mud if the sound design overlaps.
- **Waveform Separation:** The bass requires clean, fundamental energy (e.g., a pure Sine wave) to prevent low-end rumble from bleeding into the chords.
- **Harmonic Roll-off (LPF):** Complex extended chords (9ths, 11ths) require waveforms with upper harmonics (like Sawtooth) so the ear can distinguish the close intervals, but passed through a Low-Pass Filter (LPF) to remove piercing high frequencies, creating a warm, lush pad.

#### 6. Intelligent Key & Emotional Architecture
- **Base Key Selection:** Establish a global base key that the user can dynamically alter.
- **Context-Aware Modulation Suggestions:** Intelligently suggest transition chords (pivot chords, secondary dominants) to bridge the old key and the newly selected key, preserving smooth musicality.
- **Algorithmic Key Recommendations:** Suggest potential keys to modulate to based on the user's immediate context (e.g., the last clicked, inserted, or modified chords in the tray) to encourage seamless, professional transitions.
- **Tension & Release Mechanics:** Analyze how adding, deleting, replacing, or swapping chords shifts the tension, emotional weight, and release of the surrounding sequence in real-time.
- **Generative Harmonic Analysis:** Evolve beyond descriptive, table-based correlations (like simple shared-tone counting). Implement a generative engine that mathematically analyzes the frequency relationships and intervals within and between chords. This will calculate a "harmonic tension" or "consonance" score, enabling the system to suggest and even auto-generate novel, previously unexplored chord progressions that are guaranteed to be musically and emotionally resonant.
- **Emotional Evocation Palette:** Provide a UI palette of known emotional evocations mapped to specific chord transitions and groups (e.g., "Nostalgic", "Triumphant", "Anxious"). Users can select a target emotion to filter the app's suggested chords and modulation paths, turning abstract music theory into pure emotional guidance.

---

## Advanced Electronica & AI Synergy (Phase 5 - Current Focus)
To achieve a "mind-bending" electronica aesthetic, the app is currently expanding to support:
- **Tension & Release Mapping (Completed):** A visual UI curve that maps the harmonic tension of the progression, allowing the user to architect dramatic emotional arcs before rendering notes.
- **Extended & Altered Voicings (Completed):** 9ths, 11ths, 13ths, and altered dominants specifically voiced for lush, atmospheric synth pads.
- **Per-Chord Rhythm/Timing Editor:** A timeline for slicing chords, snapping to drum grooves, and moving instances on/off-grid.
- **Localized Arpeggiation:** Applying arpeggiator effects to specific drag-box selected notes within the chord editor to create polyrhythmic movement.
- **AI Text Prompt Generation (Completed):** The app generates a separate, copy-able text block describing the progression's key, mood, and harmonic rhythm to be pasted directly into the prompt field of AI music generators.
- **Reference Audio Rendering (Completed):** Exporting the progression as a clean WAV file to serve as a clear harmonic audio prompt for full-fledged AI music generators like ACE Studio 2.0.
- **Per-Chord Rhythm/Timing Editor (Completed):** A timeline for slicing chords, snapping to drum grooves, and moving instances on/off-grid.
- **Localized Arpeggiation (Completed):** Applying arpeggiator effects to specific selected instances within the chord editor to create polyrhythmic movement.
- **Always-Visible Editor (Completed):** Removed the Rhythm Editor from the swap menu and anchored it to the main UI, automatically updating when a chord is selected.
- **Rhythm Editor UX Redesign (Completed):** Unified press/drag interactions, smart boundary collisions, vertical slider for slicing/filling gaps, and a comprehensive grid slider with triplet support.
- **Edge-Dragging to Resize (Completed):** Ability to click and drag the left or right edges of a slice in the Rhythm Editor to dynamically resize it without moving its opposite boundary.
- **Variable Chord Durations (Completed):** Allow changing the total time dedicated to a chord in the sequence (1, 2, 4, or 8 beats) via the chord swap popover. The Rhythm Editor timeline visually and mathematically adapts its normalized `0.0 - 1.0` space to reflect this variable length during audio playback and MIDI/WAV export.
- **Intelligent Bassline & Drum Generation:** Drum tracks with global/local edits, and basslines built on the same rhythm editor tech.
- **Omni-Scale & Microtonal Framework:** Expand the harmonic foundation far beyond traditional Western major/minor keys.