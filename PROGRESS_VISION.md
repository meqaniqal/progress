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
- **Reverting & History:** The app remembers the original chord of any swapped position, allowing the user to seamlessly revert via the selected chord's Inspector Panel.
- **Dynamic Color Mapping:** Chords are not static badges. Their background colors dynamically shift based on their harmonic relationship to the base key and surrounding context. By mapping the Circle of Fifths to the Color Wheel (Hue), Harmonic Function to Luminosity, and Modal Mixture to Saturation, users intuitively *see* tension, release, and dissonance.

### 4. Advanced Sequencer View & Pattern Editing
- **Unified Tabbed Editor Paradigm:** To prevent vertical scrolling fatigue and keep the UI hyper-compact, all pattern editing (Chords, Bass, Drums) occurs in a single, anchored "Pattern Editor" panel. A top-level tab bar (`[ Chords ] [ Bass ] [ Drums ]`) allows users to quickly switch instrument focus. The tab state persists when clicking different chords in the sequence, enabling lightning-fast workflow.
- **Edit-in-Place & Push/Pull Workflow:** The editor removes abstract mode toggling. The default global pattern is a single, continuous block. Users always edit the pattern locally for the chord they are viewing. 
  - If modified, the user can click **"Set Global"** to push their design to the master pattern, updating all other untouched chords.
  - If modified, a **"From Global"** button appears, allowing the user to reset the chord back to the master inheritance.
- **Per-Chord Rhythm/Timing Editor:** When a chord is selected in the tray, a dedicated timeline opens where the chord initially extends through the entire edit window. Users can slice and break the chord up into multiple rhythmic instances of itself manually or via automatic modification options.
- **Grid & Free-Time Manipulation:** Instances can be moved around at user-defined grid intervals, or nudged completely off-grid (by toggling the grid off, or holding `Shift` while dragging on a desktop).
- **Pencil Draw Tool (DAW-style Interaction):** A toggleable draw mode allows rapid sequence creation. With the Grid ON, click-and-drag paints a quantized sequence of blocks. With the Grid OFF, click-and-drag paints one continuous, freely resizable block. Drawing over an existing block inversely "carves" a hole into it, enabling rapid rhythmic gating.
- **Intelligent Bassline Editing:** The Bass tab inherits the rhythmic slices of the Chord tab by default, ensuring tight lock-step. However, users can slice the bass independently and assign custom pitches to each slice relative to the chord (e.g., forcing a 5th in the bass creates a slash chord like C/G; assigning scalar steps creates a walking bassline).
- **Integrated Drum Machine & Advanced Workflow:** The Drums tab provides a multi-row grid tailored for a 4-piece kit. To solve mobile "fat-finger" limitations, it uses a dual-view architecture:
  - **Global Mode (The Main Beat):** Features an independent, horizontally scrollable timeline (e.g., 4, 8, 16, or 32 beats). **Crucially, this timeline is completely decoupled from individual chord lengths.** It continuously loops over the entire chord progression. If the progression is shorter than the drum pattern, the excess drum data is non-destructively hidden/truncated during playback. If the user reduces the global pattern length, old data is preserved unless explicitly removed via a "Crop" mechanism. A smart "Duplicate Loop" button allows instant extension of short grooves into longer patterns.
  - **Local Mode (Zoomed-in Fills):** When a specific chord is selected and "Local Override" is active, the timeline automatically zooms to that exact chord's duration. Global hits are rendered as semi-transparent "ghost notes" in the background, allowing users to precisely program localized fills, rolls, and variations that seamlessly replace the global groove for that chord.
  - **Interactions & Playback:** Users double-click the grid to add/remove hits, drag hits between rows to change drum types, and drag empty space to pan the timeline. During playback, the timeline features instantaneous, DAW-style "page-flipping" to track the playhead without visual blurring.
- **Localized Arpeggiation:** Users can drag a selection box around specific notes or chord instances in the editor. Applying arpeggiation *replaces* these selected notes with an arpeggiated version, allowing for intricate, localized polyrhythms.
- **Generative Arp Modes:** Arpeggiation includes several modes, such as static sequences, one-shot randomization, or continuous regeneration applied every time the playback loop restarts.
- **Multi-Pass Generative Export:** If continuous per-loop randomization is active, users can choose to export multiple passes of the sequence to MIDI or WAV. This captures the exact randomized output that occurred in the last *x* set of loopthroughs (or *x* loops since active), ensuring fleeting generative magic is permanently captured for the DAW.
- **Probabilistic Pattern Sequencing:** Assign probabilities to different rhythm or arpeggiator patterns occurring on a given loopthrough. This allows the progression's rhythm to organically shift and evolve over time, hooking perfectly into the Multi-Pass Generative Export.
- **Smart Voice Tweaking (Future):** Algorithmic, macro-level controls to alter inner voices (e.g., injecting passing tones or suspensions) rather than manual piano-roll micro-editing. This keeps the UI mobile-friendly and hyper-compact while still achieving complex, DAW-ready contrapuntal movement.
- **Adjustable Duration:** Click and drag to change the length of each chord.
- **Ripple Editing:** Optionally, have the timeline automatically push subsequent chords forward when a preceding chord's duration is extended, maintaining the overall sequence.
- **Loop-Aware Resolution:** The voice-leading and suggestion engines analyze the progression as a continuous cycle, ensuring the transition from the *last* chord back to the *first* chord is as smooth and emotionally satisfying as any internal internal transition.
*(Note: A Melody editor is planned for the future, but current scope strictly targets Chords, Drums, and Bass.)*

### 5. Intelligent Bassline Generation (Complete ✅)
- **Unified Editor Technology:** The Bassline editor will utilize the exact same underlying technology and timeline logic as the Per-Chord Rhythm Editor, but restricted to a single note focus.
- **Rhythm-Informed Generation:** Utilize the constructed drum and chord rhythms to generate intelligent, genre-appropriate basslines.
- **Non-Destructive Ducking:** The engine automatically extracts kicks and applies a non-destructive sidechain "ducking" effect to bass slices to keep low-end frequencies clean.
- **Symbiotic Editing:** If the user manually edits the chord pattern or the bassline, the system dynamically informs changes across the board. The bassline notes, chord pattern elements, and master rhythm continually cross-reference each other to ensure everything locks together musically from moment to moment.
- **Bassline Engine & Slash Chords:** Implement the `Bass` tab, allowing users to detach bass slices from the chord rhythm and assign explicit pitches to create slash chords and walking lines.
- **Drum Sequencer Engine (Complete ✅):** Implement the `Drums` tab and audio scheduler for integrated beats. Includes intelligent defaulting to Global Mode and a curated library of generative groove presets.
- **Probabilistic Pattern Sequencing (Completed):** Allow assigning percent-based probabilities to specific rhythm/arp patterns and drum hits per loop cycle to create generative variation.

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

## Advanced Electronica & AI Synergy (Phase 5 - Complete ✅)
To achieve a "mind-bending" electronica aesthetic, the app is currently expanding to support:
- **Tension & Release Mapping (Completed):** A visual UI curve that maps the harmonic tension of the progression, allowing the user to architect dramatic emotional arcs before rendering notes.
- **Extended & Altered Voicings (Completed):** 9ths, 11ths, 13ths, and altered dominants specifically voiced for lush, atmospheric synth pads.
- **AI Text Prompt Generation (Completed):** The app generates a separate, copy-able text block describing the progression's key, mood, and harmonic rhythm to be pasted directly into the prompt field of AI music generators.
- **Reference Audio Rendering (Completed):** Exporting the progression as a clean WAV file to serve as a clear harmonic audio prompt for full-fledged AI music generators like ACE Studio 2.0.
- **Per-Chord Rhythm/Timing Editor (Completed):** A timeline for slicing chords, snapping to drum grooves, and moving instances on/off-grid.
- **Localized Arpeggiation (Completed):** Applying arpeggiator effects to specific selected instances within the chord editor to create polyrhythmic movement.
- **Always-Visible Editor (Completed):** Removed the Rhythm Editor from the swap menu and anchored it to the main UI, automatically updating when a chord is selected.
- **Rhythm Editor UX Redesign (Completed):** Unified press/drag interactions, smart boundary collisions, vertical slider for slicing/filling gaps, and a comprehensive grid slider with triplet support.
- **Edge-Dragging to Resize (Completed):** Ability to click and drag the left or right edges of a slice in the Rhythm Editor to dynamically resize it without moving its opposite boundary.
- **Variable Chord Durations (Completed):** Allow changing the total time dedicated to a chord in the sequence (1, 2, 4, or 8 beats) via the chord swap popover. The Rhythm Editor timeline visually and mathematically adapts its normalized `0.0 - 1.0` space to reflect this variable length during audio playback and MIDI/WAV export.
- **UI Architecture Shift (Completed):** Replacing the vertical context menu with a permanent, horizontal "Inspector Panel" bridging smoothly with the tray via native scroll-snapping, to keep the interface highly accessible without vertical scroll bloat.
- **Inspector Auto-Transpose (Completed):** Modulating the key directly from a chord's Inspector panel automatically transposes that specific chord into the new key, streamlining workflow.
- **Always-Visible Transport (Completed):** Transport and global controls are positioned above the foldaway panels, ensuring playback and export features are never pushed off-screen when deep-editing a chord.
- **Architectural Scaling (Completed):** Extracting the global state machine from the main controller to a dedicated store, implementing targeted DOM node reconciliation in the Rhythm Editor for 60fps dragging, and applying strict event delegation in the UI to prevent memory leaks.
- **Generative Multi-Pass Export (Completed):** Export Passes UI added and multi-pass looping integrated into MIDI/WAV offline rendering engines.
- **True Minor Key & Omni-Scale Theory Framework (Completed):** 
  - **State & UI (Completed):** `state.mode` supports modes (`major`, `minor`) with dynamic UI palettes swapping diatonic/borrowed chords.
  - **Context-Aware Math (Completed):** Tension analysis (`getHarmonicProfile`), modulation, and turnaround suggestions accurately contextualize relative to the active mode.
  - **Omni-Scale Math (Completed):** Generative interval math supports Dorian, Lydian, Harmonic Minor, and custom scales, replacing hardcoded dictionaries with a dynamic Roman Numeral parser. Microtonal systems planned for future.
- **Workflow & Defaults Adjustments (Completed):** Update default tempo to 120bpm and default chord duration to 2 beats. Ensure duration button highlighting updates immediately upon selection.
- **Rhythm Pattern Copy/Paste (Completed):** Ability to copy a sliced/arpeggiated rhythm pattern from one chord and paste it to another.
- **Functional Transposition (Completed):** Added a context-aware button in the Swap Menu to instantly transpose any out-of-key chord to the currently selected global key.
- **Unified Tabbed Pattern Editor:** Transform the current Rhythm Editor into a multi-tabbed interface (`Chords` | `Bass` | `Drums`) with a `Global / Local` toggle for sequence-wide vs per-chord pattern building.
- [x] **Mobile Viewport & Double-Tap:** Disable native browser double-tap-to-zoom to ensure global background double-taps reliably trigger play/pause on touch devices. Removed vertical scroll-snapping for precise manual scrolling.
- [x] **Floating Transport:** Convert the bottom transport bar into a bottom-corner Floating Action Button (FAB) to maximize vertical real estate while keeping playback accessible.
- [x] **Smart Drag-and-Drop:** Dynamically collapse inactive chord palettes during drag operations to instantly bring the chord tray drop-zone into the mobile viewport.
- **Experimental Draw Mode & Workflow Refactor (Complete ✅):** Shifted to an "Edit-in-Place" Push/Pull workflow. Added a new Pencil Draw tool with Boolean overlap math for rapid sequence painting and gating.

### 6. Advanced Modular Synthesis & Sound Design (Future Goal)
- **Editable AI-Targeted Synths:** The default sine/sawtooth engines will become options among multiple modular synths. Planned are highly customizable synths specifically geared toward producing maximum clarity for AI audio recognition or direct integration into professional DAW projects via WAV export.
- **Bass-Geared Synthesizers:** A dedicated, modular synth for the bassline layer, featuring editable parameters for sub-harmonics and drive to anchor AI generations.
- **Professional Generative Drums:** A drum editor that uses professional-grade sampling or synthesis to produce high-quality drum exports.
- **Modular UI Architecture:** Each of these engines (Synth, Bass, Drums) will exist as entirely decoupled modules with their own localized UI logic to ensure the app remains performant, testable, and clean.

### 7. Progressive Disclosure & Simple Mode (Complete ✅)
- **Beginner-Friendly Defaults:** A default "Simple Mode" upon app load that hides advanced theory configurations, the timeline editor, and complex voicings.
- **Progressive Interface:** A settings gear that allows users to progressively turn on "Advanced Mode" features (like the Rhythm Editor, Borrowed/Extended chords palettes, and specific sound design tools) as they gain familiarity with the workflow.
- **Beginner/Advanced Toggle (Completed):** A dedicated toggle button located next to the Manual button. When set to "Beginner", the Pattern Editor, Section Tabs, and Song Sequencer are hidden, reverting the app to a simple, single-loop chord sketching tool. Turning it to "Advanced" reveals the full suite of production tools.

### 8. Song Mode & Macro-Arrangement (Phase 6 - Complete ✅)
Transform the app from a single-loop sketchpad into a full song structure arranger, allowing users to build, sequence, and export multi-section tracks (Intro, Verse, Chorus, etc.).

**1. Data Architecture & Migration**
- **Nested State:** The `currentProgression` array evolves into a library of `sections` (e.g., `{ id, name, progression: [], globalPatterns: {} }`).
- **The Macro-Sequence:** A new `songSequence` array stores references to these sections (e.g., `['intro', 'verse_1', 'chorus_1', 'verse_1']`).
- **Linked Sections:** If the same section name appears more than once in the song sequencer, they are linked references. Editing one edits all instances. For independent copies, users create a numbered duplicate (e.g., "Chorus 2"), inherit the original's data, and edit independently.

**2. UI Layout: The Section Tabs & Song Tray**
- **Section Tabs:** Situated directly above the chord tray. Displays the active section being edited.
- **Section Creation:** A `[+ Section]` button allows adding new parts via a dropdown (Intro, Verse, Chorus, Bridge, Outro).
- **Smart Naming & Renaming:** Clicking an active tab opens a custom inline dropdown populated with common section names (Intro, Verse, Chorus) and a text input with a blinking cursor for custom names. Hitting return applies the name. The dropdown is smart—it automatically closes if the cursor moves a certain distance away, saving the user an extra click.
- **First-Time Flow:** If the user has a sequence built and clicks `[+ Section]` for the first time, the app intercepts, prompts the user to name their *existing* work (creating the first tab), then prompts the user to choose the section type for the *new* tab, and finally creates the new empty tab.
- **The Song Sequencer Tray:** An unfoldable tray that sits at the very top of the progression area. It remains completely hidden if the app only has one section or no sections have been created.

**3. "Empty State" Inheritance & Global Patterns**
- **Section-Specific Global Patterns:** Each section (Verse, Chorus) maintains its own "Global Pattern" for drums, chords, and bass.
- **Inherit From Dropdown:** When a new section is created and is empty, an "Inherit From" dropdown appears. This allows the user to populate the section with the chords, loop brackets, and global patterns from another chosen section. 
- **Smart Default Inheritance:** By default, the first new section inherits global patterns from the original section. If a numbered duplicate (e.g., "Chorus 2") is created, it defaults to inheriting from "Chorus". If multiple similar sections exist, the user chooses which to inherit from via the dropdown.
- **Disappearance/Reappearance:** The "Inherit From" dropdown disappears as soon as the user drags in chords or makes edits. It reappears if the user deletes all chords from that section.

**4. "Song Mode" Interactions**
- **Macro Drag & Drop:** The Song Tray acts just like the Chord Tray. Users can drag a section button directly into the Song Tray to insert it at a specific desired location, double-tap buttons to append them to the end, and drag-and-drop to reorder sections within the tray. Code reuse of `dragdrop.js` will handle both block types natively.
- **Focus Shifting:** When the Song Tray is unfolded, "Song Mode" is active. The Chord Chooser, Inspector, and Pattern Editor panels automatically fold away to reduce visual clutter.
- **Auto-Folding:** Clicking anywhere in the underlying Chord Tray (except the tabs) folds the Song Tray away and exits Song Mode, returning focus to local editing tools.

**5. Playback & Export in Song Mode**
- **Single Source of Truth Playback:** Playback evaluates the `songSequence` array directly. The audio engine traverses the sections seamlessly.
- **Auto-Tab Tracking & State Sync:** During Song Mode playback, the UI automatically switches the active Section Tab to match the currently playing section. If the user stops playback, the chord tray retains focus on that section for immediate editing.
- **Playback Start Position:** Playback starts from the currently *selected* section in the song tray, rather than restarting from the beginning of the song every time playback is stopped and started. Manual selection during playback gracefully cues the next section.
- **Sequence Wrapping:** Playback seamlessly wraps from the last section in the song sequencer back to the first section (or adheres to the Macro-Loop brackets).
- **Empty Sections:** If playback hits an empty section, the engine pauses for the duration of the gap and displays a message indicating there is no song data for that section yet, ensuring the user realizes something is missing.
- **Macro-Looping:** Loop brackets (`[` and `]`) in the Song Tray allow auditioning macro-transitions (e.g., looping the end of the Bridge into the Chorus).
- **Contextual Export & Capping:** If the Song Tray is open, Export handles the entire macro-sequence. Because `exportPasses` multiplied by a full song could result in massive files (e.g., 15+ minutes), the app will detect if an export will exceed 1 minute and prompt the user, offering to cap the export to a 3-minute limit, with a dropdown to increase or bypass the cap if deliberately desired.

**6. Song Tray UI Polish**
- **Exclusive View Toggle:** The "♫ Song View" button above the chord tray hides itself when the Song Tray is open, ensuring a cleaner UI.

### 9. Architectural Refactoring & Optimization (Phase 6.5 - Next)
Before introducing the mathematical complexity of microtonal harmony, the codebase will undergo a strict optimization pass to ensure maximum maintainability and modularity:
- **UI Rendering De-Cluttering:** Break down massive, monolithic render functions (like those in `ui.js` and `songController.js`) into atomic, descriptive sub-renderers.
- **State Manager Purification:** Extract heavy calculation and macro-baking loops (`getExportState`) out of `store.js` and into dedicated pure utility modules.
- **Memory Leak Audit:** Perform a rigorous pass over all dynamic UI injections (modals, dropdowns, inspectors) to ensure 100% reliable event listener cleanup on element destruction.
