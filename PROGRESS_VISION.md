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

### 3. Smart Chord Alternatives & Swapping
- **Guided & Non-Destructive Selection:** Click a chord to view functional theory alternatives. The app suggests options that can be temporarily swapped in without immediately losing the original chord.
- **Live Auditioning (Multi-Temporary):** Hear the results of selected alternatives *live* while the progression (or looped section) is playing. Multiple chords across the sequence can be in this "temporary/unfinalized" state simultaneously, allowing you to audition entire alternate phrases.
- **Visual Indicators:** Temporary alternative chords are displayed in a distinct color to clearly differentiate them from finalized chords in the sequence.
- **Inline Finalization:** Once an alternative chord proves to be the best fit, the user can finalize the choice via an inline indicator/icon directly on the chord badge (rather than a separate, disjointed UI element), permanently replacing the original.

### 4. Advanced Sequencer View (Future Goal)
- **Visual Timeline:** Instead of a simple tray, view chords on a timeline or piano-roll-style grid.
- **Adjustable Duration:** Click and drag to change the length of each chord.
- **Snap to Grid:** Toggle a grid for precise rhythmic alignment (e.g., whole, half, quarter notes).
- **Free Positioning:** Drag chords freely along the timeline when snap is off.
- **Ripple Editing:** Optionally, have the timeline automatically push subsequent chords forward when a preceding chord's duration is extended, maintaining the overall sequence.

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

#### 2. Inner Melodic Lines
The professional's secret weapon.
- Deliberately choose voicings so that one hidden voice descends (or ascends) stepwise across the whole progression.
- Example: A hidden line moving `B -> A -> G -> F` through four chords is almost unfailingly moving.

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

---

## Advanced Electronica & AI Synergy (Future Expansion)
To achieve a "mind-bending" electronica aesthetic, the app will eventually support:
- **Tension & Release Mapping:** A visual UI curve that maps the harmonic tension of the progression, allowing the user to architect dramatic emotional arcs before rendering notes.
- **Extended & Altered Voicings:** 9ths, 11ths, 13ths, and altered dominants (e.g., `7♯9♭13`) specifically voiced for lush, atmospheric synth pads.
- **Polyrhythmic Arpeggiation:** Exporting the chords not just as blocks, but as sequenced MIDI patterns typical of advanced electronica (e.g., 5/16 arp patterns over a 4/4 bassline).
- **AI Text Prompt Generation:** The app will generate a separate, copy-able text block describing the progression's key, mood, and harmonic rhythm. This text is designed to be pasted directly into the prompt field of AI music generators to guide the style of the generated track.
- **Reference Audio Rendering:** Exporting the progression as a clean WAV file (e.g., using a simple sine/pad synth) to serve as a clear harmonic audio prompt for full-fledged AI music generators like ACE Studio 2.0, or for audio-to-MIDI conversion in a DAW.
- **Microtonal/Jazz Modulations:** Support for complex Neo-Riemannian transformations and Coltrane changes to push the boundaries of standard pop/electronic structures.