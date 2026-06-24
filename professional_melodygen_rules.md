# Professional Melody Generator — Optimized & Extended Rules

> **Upgrade philosophy**: The legacy system is *step-local* — it makes note-by-note decisions with
> only the previous pitch as memory. Professional composers think in arcs, phrases, and motifs —
> they know the climax before playing the first note. Every addition below corrects a specific
> gap between "procedural note picker" and "composed melody."

---

## Table of Contents
1. [Core Composition Principles Added](#1-core-composition-principles-added)
2. [New Global State](#2-new-global-state)
3. [Stage 0 *(NEW)*: Phrase Architecture Pre-computation](#3-stage-0-phrase-architecture-pre-computation)
4. [Stage 1 *(Enhanced)*: Rhythmic Intelligence](#4-stage-1-rhythmic-intelligence)
5. [Stage 2 *(Enhanced)*: Full Non-Chord Tone Taxonomy](#5-stage-2-full-non-chord-tone-taxonomy)
6. [Stage 3 *(Enhanced)*: Voice Leading + Register Architecture](#6-stage-3-voice-leading--register-architecture)
7. [Stage 4 *(Enhanced)*: Blues/Jazz + Chromatic Enclosures + Guide Tones](#7-stage-4-bluesjazz--chromatic-enclosures--guide-tones)
8. [Stage 5 *(Enhanced)*: Ornaments + Approach Notes + Cambiata](#8-stage-5-ornaments--approach-notes--cambiata)
9. [Stage 6 *(NEW)*: Scale Degree Tendency & Tension Lifecycle](#9-stage-6-scale-degree-tendency--tension-lifecycle)
10. [Stage 7 *(NEW)*: Motivic Development Engine](#10-stage-7-motivic-development-engine)
11. [Stage 8 *(NEW)*: Cadential Shaping & Phrase Endings](#11-stage-8-cadential-shaping--phrase-endings)
12. [Helper Procedures](#12-helper-procedures)
13. [Optimization Notes & Known Tradeoffs](#13-optimization-notes--known-tradeoffs)

---

## 1. Core Composition Principles Added

| Gap in Legacy System | Professional Principle Added |
|---|---|
| No phrase-level planning | **Arch contour + climax pre-computation** (Huron 1996) |
| No motivic memory | **Motivic registry + development operations** (Schoenberg/Ratz) |
| Tension is accidental | **Explicit tension curve, tracked per-step** |
| Only passing tones as NCTs | **Full 8-type NCT taxonomy** (Aldwell/Schachter) |
| No scale degree gravity | **Tendency tone weighting** (^7→^1, ^4→^3, etc.) |
| Phrase endings random | **Cadential formula library** (authentic, half, deceptive, plagal) |
| Rhythm re-randomized each step | **Rhythmic motif locking + syncopation budget** |
| Single register awareness | **Tessitura management + climax delivery gate** |
| No sequence detection | **Melodic sequence promotion (exact + tonal)** |
| No jazz approach logic | **Chromatic enclosure + guide-tone targeting** |
| No phrase-type differentiation | **Antecedent/consequent + sentence structure** |

---

## 2. New Global State

```pascal
// ═══════════════════════════════════════════════════════════════════════
// PHRASE ARCHITECTURE STATE
// Pre-computed once at the start of each phrase.
// ═══════════════════════════════════════════════════════════════════════

STATE PhraseArchitecture
    climaxStep       : INTEGER           // Planned step index of melodic peak
    climaxPitch      : PITCH             // Highest (or lowest) pitch of phrase
    contourShape     : ENUM {
                         ARCH,           // Rise then fall — most universally satisfying
                         INV_ARCH,       // Fall then rise — melancholic, question-like
                         ASCENDING,      // Builds to cadence — urgency, triumph
                         DESCENDING,     // Opens high, winds down — resignation, lullaby
                         HOVERING,       // Ornamental, decorative — used sparingly
                         CONVEX          // Multiple smaller peaks — through-composed feel
                       }
    phraseType       : ENUM {
                         ANTECEDENT,     // Half-cadence ending, creates expectation
                         CONSEQUENT,     // Authentic cadence, resolves antecedent
                         SENTENCE_PRES,  // Bars 1-2: basic idea + repetition
                         SENTENCE_CONT,  // Bars 3-4: fragmentation + cadence drive
                         FREE            // Unconstrained — for through-composed sections
                       }
    tensionCurve     : ARRAY[0..15] OF FLOAT  // Per-step target tension [0.0..1.0]
    cadenceTarget    : ENUM {AUTHENTIC, HALF, DECEPTIVE, PLAGAL}
    cadenceMelodyDeg : INTEGER           // Target scale degree in melody at final cadence
                                         // AUTHENTIC → 1, HALF → 2 or 7, DECEPTIVE → 1 or 3
    cadenceStartStep : INTEGER           // Step where cadential approach begins (typically step 12-13)
    phraseLengthSteps: INTEGER           // Supports asymmetrical lengths: 10, 12, 14, 18...
ENDSTATE

// ═══════════════════════════════════════════════════════════════════════
// MOTIVIC REGISTRY
// Extracts, stores, and transforms melodic cells for coherent development.
// ═══════════════════════════════════════════════════════════════════════

STRUCT Motif
    intervalPattern  : ARRAY OF INTEGER  // Semitone intervals (e.g. [+2, -1, +2])
    rhythmPattern    : ARRAY OF FLOAT    // Duration ratios relative to quarter note
    contourSig       : ARRAY OF INTEGER  // Contour signature: +1, -1, 0
    useCount         : INTEGER
    firstHeardStep   : INTEGER
    confidenceScore  : FLOAT             // Higher if heard multiple times = worth developing
ENDSTRUCT

STATE MotifRegistry
    stored           : LIST OF Motif
    active           : Motif OR NULL
    barsSinceReuse   : INTEGER           // Prevents over-repetition; reuse every 2-4 bars
    lastOperation    : ENUM {
                         NONE, EXACT_REPEAT, TONAL_SEQUENCE, CHROMATIC_SEQUENCE,
                         INVERSION, RETROGRADE, AUGMENTATION, DIMINUTION,
                         FRAGMENTATION, EXTENSION, RHYTHMIC_DISPLACEMENT, MUTATION
                       }
    sequenceStreak   : INTEGER           // Consecutive steps following a sequence pattern
ENDSTATE

// ═══════════════════════════════════════════════════════════════════════
// TENSION TRACKER
// Tension is a first-class compositional variable, not a side effect.
// ═══════════════════════════════════════════════════════════════════════

STATE TensionTracker
    value            : FLOAT             // Current tension [0.0..1.0]
    target           : FLOAT             // This step's target from PhraseArchitecture.tensionCurve
    consecutiveLeaps : INTEGER           // Leaps accumulate tension
    stepsInHighReg   : INTEGER           // High register = sustained tension
    pendingResolution: BOOLEAN           // Tension has peaked, resolution expected
    resolutionDir    : INTEGER           // -1 descend, +1 ascend (from leap direction)
    dissonanceDebt   : FLOAT             // Unresolved dissonance carried forward
    blueNoteDebt     : BOOLEAN
ENDSTATE

// ═══════════════════════════════════════════════════════════════════════
// REGISTER TRACKER
// Manages tessitura, climax delivery, and register variation.
// ═══════════════════════════════════════════════════════════════════════

STATE RegisterTracker
    recent           : CIRCULAR_QUEUE[8] OF PITCH
    phrasePeak       : PITCH             // Highest pitch reached so far
    phraseFloor      : PITCH             // Lowest pitch reached so far
    climaxDelivered  : BOOLEAN           // Has the planned climax been played?
    stepsAtPeak      : INTEGER           // Steps spent near peak — prevent camping
    lastLeapStep     : INTEGER
ENDSTATE

// ═══════════════════════════════════════════════════════════════════════
// RHYTHMIC COHESION
// Extracts and locks a rhythmic identity for the phrase.
// ═══════════════════════════════════════════════════════════════════════

STATE RhythmicCohesion
    motif            : ARRAY[0..3] OF BOOLEAN  // Active/rest pattern of first 4 steps
    established      : BOOLEAN
    syncopationUsed  : INTEGER           // Count of syncopations this phrase
    syncopationBudget: INTEGER           // Max syncopations per phrase (genre-dependent)
    lastNoteDuration : FLOAT
    hemiolaActive    : BOOLEAN
ENDSTATE

// ─────────────────────────────────────────────────────────────────────
// SCALE DEGREE TENDENCY WEIGHTS (major/Ionian context, moveable do)
// Higher absolute value = stronger pull. Negative = avoidance weight.
// ─────────────────────────────────────────────────────────────────────

CONST TENDENCY : MAP<SCALE_DEG, STRUCT{pull: FLOAT, direction: INTEGER}> := {
    1 → {pull: 0.00,  dir:  0},  // Tonic: stable, no tendency
    2 → {pull: 0.40,  dir: -1},  // Supertonic: mild pull to 1
    3 → {pull: 0.10,  dir:  0},  // Mediant: relatively stable
    4 → {pull: 0.65,  dir: -1},  // Subdominant: strong pull to 3 (tritone with 7)
    5 → {pull: 0.10,  dir:  0},  // Dominant: stable (as chord root)
    6 → {pull: 0.30,  dir: -1},  // Submediant: pull to 5
    7 → {pull: 0.95,  dir: +1}   // Leading tone: extreme pull to 1
}

// Additional scale flavors override specific entries:
// Dorian: 6 → {pull: 0.05, dir: 0}  (major 6th is characteristic and stable)
// Mixolydian: 7 → {pull: 0.30, dir: -1}  (flat 7, resolves downward)
// Phrygian: 2 → {pull: 0.80, dir: -1}  (half-step above 1, strong pull)

CONST NCT_DISSONANCE_WEIGHT : MAP<NCT_TYPE, FLOAT> := {
    PASSING_TONE     → 0.20,   // Smoothest; directional
    NEIGHBOR_TONE    → 0.25,   // Gentle decoration
    ESCAPE_TONE      → 0.45,   // Step then leap — slightly more jarring
    ANTICIPATION     → 0.15,   // Early chord tone — very smooth
    SUSPENSION       → 0.70,   // Prepared dissonance — high expressive tension
    APPOGGIATURA     → 0.80,   // Unprepared leap to dissonance — most expressive NCT
    CAMBIATA         → 0.30,   // Archaic double neighbor — smooth in context
    RETARDATION      → 0.55    // Suspension resolving upward (less common)
}
```

---

## 3. Stage 0: Phrase Architecture Pre-computation

> **Called once before any step is generated.** Sets the architectural skeleton that all subsequent
> stages reference. Without this, melodies are collections of notes; with it, they are phrases.

```pascal
PROCEDURE PlanPhraseArchitecture(phraseIndex, settings, harmonyPlan)

    // ── Contour Selection ───────────────────────────────────────────────────
    // Arch contour is the most universally satisfying (Huron 1996 survey of
    // 6,000+ folk melodies globally). Alternate contours for variety.

    IF phraseIndex == 0 THEN
        arch := ARCH                         // First phrase almost always arch
    ELSE
        arch := SelectContour(phraseIndex, settings.style, previousPhraseContour)
        // ASCENDING for buildup phrases, DESCENDING for settling phrases,
        // CONVEX for development sections, INV_ARCH for question-like phrases
    ENDIF

    PhraseArchitecture.contourShape := arch

    // ── Phrase Type Assignment ──────────────────────────────────────────────
    // Enforce antecedent/consequent pairing for 8-bar periodic structure.
    // Sentence structure for shorter, more driving phrases.

    IF settings.phraseStructure == "period" THEN
        IF phraseIndex MOD 2 == 0 THEN
            PhraseArchitecture.phraseType := ANTECEDENT
            PhraseArchitecture.cadenceTarget := HALF
            PhraseArchitecture.cadenceMelodyDeg := 2   // End on ^2 over V
        ELSE
            PhraseArchitecture.phraseType := CONSEQUENT
            PhraseArchitecture.cadenceTarget := AUTHENTIC
            PhraseArchitecture.cadenceMelodyDeg := 1   // Resolve to ^1
        ENDIF
    ELSEIF settings.phraseStructure == "sentence" THEN
        IF phraseIndex MOD 2 == 0 THEN
            PhraseArchitecture.phraseType := SENTENCE_PRES   // Steps 0-7: idea + repeat
        ELSE
            PhraseArchitecture.phraseType := SENTENCE_CONT   // Steps 8-15: fragment + drive
            PhraseArchitecture.cadenceTarget := AUTHENTIC
        ENDIF
    ELSE
        PhraseArchitecture.phraseType := FREE
        PhraseArchitecture.cadenceTarget := RandomWeighted({
            AUTHENTIC → 0.50, HALF → 0.25, DECEPTIVE → 0.15, PLAGAL → 0.10
        })
    ENDIF

    // ── Climax Placement ────────────────────────────────────────────────────
    // The climax note is the most important single pitch decision.
    // It should arrive slightly past the midpoint (golden ratio ~0.618 works well),
    // be the highest pitch of the phrase (or lowest for inverted arch),
    // and be approached by step or small leap, then resolved stepwise.

    IF arch == ARCH OR arch == ASCENDING THEN
        climaxRatio := 0.55 + rng.next() * 0.15    // Between 55%-70% through the phrase
    ELSEIF arch == CONVEX THEN
        climaxRatio := 0.30 + rng.next() * 0.15    // Earlier peak for multi-arch
    ELSEIF arch == INV_ARCH THEN
        climaxRatio := 0.50                         // Nadir at midpoint
    ELSE
        climaxRatio := 0.60
    ENDIF

    PhraseArchitecture.climaxStep := ROUND(climaxRatio * PhraseArchitecture.phraseLengthSteps)

    // Climax pitch: choose a pitch that is 5-10 semitones above the tessitura center,
    // on a chord tone or strong scale degree (^1, ^3, ^5 preferred for stability,
    // ^2 or ^4 for tension-hold climaxes — extremely expressive)
    baseRange := GetScaleRange(settings.scale, settings.rangeMin, settings.rangeMax)
    climaxCandidates := FilterPitches(baseRange,
        minSemitones: tessituraCenter + 5,
        preferScaleDegrees: [1, 3, 5],            // Strong, satisfying
        alternateScaleDegrees: [2, 6]             // Tense, aching — use with TENSION climax
    )
    PhraseArchitecture.climaxPitch := ChooseWeightedClimaxPitch(climaxCandidates, settings)

    // ── Tension Curve Generation ────────────────────────────────────────────
    // Maps a target tension [0.0..1.0] to each step.
    // Curve shape mirrors the contour shape, with peak at climaxStep.
    // Cadential steps are always high tension → resolution.

    PhraseArchitecture.tensionCurve := GenerateTensionCurve(
        length: PhraseArchitecture.phraseLengthSteps,
        shape: arch,
        climaxAt: PhraseArchitecture.climaxStep,
        cadenceStartAt: PhraseArchitecture.cadenceStartStep,
        cadenceType: PhraseArchitecture.cadenceTarget
    )

    // ── Asymmetrical Phrase Length ───────────────────────────────────────────
    // Square 4-bar (16-step) phrases are predictable. Great melodies breathe
    // with 10, 12, 14, or 18-step phrases that catch the listener off-guard.
    IF settings.allowAsymmetry AND rng.next() < 0.25 THEN
        PhraseArchitecture.phraseLengthSteps := RandomFrom([10, 12, 14, 18])
    ELSE
        PhraseArchitecture.phraseLengthSteps := 16
    ENDIF

    // ── Register Tracker Init ──────────────────────────────────────────────
    RegisterTracker.phrasePeak    := settings.rangeMin
    RegisterTracker.phraseFloor   := settings.rangeMax
    RegisterTracker.climaxDelivered := FALSE
    RegisterTracker.stepsAtPeak   := 0

ENDPROC
```

---

## 4. Stage 1: Rhythmic Intelligence

> **Enhancement over legacy**: Locks the first 4-step rhythm pattern as a motif and enforces
> (with controlled variation) its repetition across the phrase. Adds syncopation budget,
> hemiola detection, and varied note-length distribution.

```pascal
PROCEDURE DetermineRhythm(step, settings)

    // ── Lock Rhythmic Motif (Steps 0-3) ─────────────────────────────────────
    // The legacy system re-randomizes rhythm every step. Instead, extract
    // the rhythmic identity of steps 0-3 and reuse it — this is what makes
    // a melody feel like *a melody* rather than improvised noise.

    isPlaying := FALSE

    IF NOT RhythmicCohesion.established AND step < 4 THEN
        // Generate normally for first 4 steps
        playProb := 0.25 + settings.density * 0.2
        isPlaying := rng.next() < playProb AND rng.next() >= settings.restProbability
        RhythmicCohesion.motif[step] := isPlaying
        IF step == 3 THEN
            RhythmicCohesion.established := TRUE
        ENDIF

    ELSEIF RhythmicCohesion.established THEN
        // Mirror motif for steps 4-7 (exact), 8-11 (with variation), 12-15 (cadential)
        motifStep := step MOD 4
        baseIsPlaying := RhythmicCohesion.motif[motifStep]

        // Allow small probability of deviation after the first repetition
        deviationProb := 0.0
        IF step >= 8 AND step < 12 THEN
            deviationProb := 0.20    // Development section: moderate deviation
        ELSEIF step >= 12 THEN
            deviationProb := 0.35    // Cadential area: more rhythmic drive/variation
        ENDIF

        IF rng.next() < deviationProb THEN
            // Deviate: introduce syncopation or fill
            isPlaying := IntroduceSyncopation(step, settings)
        ELSE
            isPlaying := baseIsPlaying AND rng.next() >= settings.restProbability
        ENDIF

    ELSE
        // Fallback
        playProb := 0.25 + settings.density * 0.2
        isPlaying := rng.next() < playProb AND rng.next() >= settings.restProbability
    ENDIF

    RETURN isPlaying
ENDPROC

FUNCTION IntroduceSyncopation(step, settings) → BOOLEAN
    // Only add syncopation if budget allows
    IF RhythmicCohesion.syncopationUsed >= RhythmicCohesion.syncopationBudget THEN
        RETURN FALSE
    ENDIF

    // Syncopation: anticipate the next beat by an eighth note (place note on "and")
    // This is most effective just before downbeats (steps 3, 7, 11)
    IF (step MOD 4 == 3) AND NOT IsNextStepActive(step + 1) THEN
        ScheduleEarlyEntry(step, offsetFraction: -0.5)   // Half-step early
        RhythmicCohesion.syncopationUsed += 1
        RETURN TRUE
    ENDIF

    RETURN FALSE
ENDFUNC

FUNCTION DetermineNoteDuration(step, nextActiveStep, isNearCadence) → FLOAT
    // Avoid uniform note lengths — great melodies mix long and short values.
    // Tendency: longer notes on strong beats, shorter on weak beats,
    // very long notes at the phrase peak (breath and weight).

    stepsToNext := nextActiveStep - step
    baseDuration := stepsToNext * settings.stepDuration

    IF step == PhraseArchitecture.climaxStep THEN
        // Climax note: hold slightly longer than written (agogic accent)
        RETURN baseDuration * 1.25

    ELSEIF isNearCadence AND PhraseArchitecture.cadenceTarget == AUTHENTIC THEN
        // Slow into authentic cadence (ritardando implied)
        RETURN baseDuration * 1.10

    ELSEIF step MOD 4 == 0 THEN
        // Downbeat: slightly longer
        RETURN baseDuration * RandomBetween(1.0, 1.15)

    ELSE
        RETURN baseDuration
    ENDIF
ENDFUNC
```

---

## 5. Stage 2: Full Non-Chord Tone Taxonomy

> **Enhancement over legacy**: The legacy system recognizes only "isolated" (chord tone only) and
> "passing context" (allows color tones). This is a severe simplification. The full NCT taxonomy
> provides 8 distinct types, each with specific preparation, treatment, and resolution rules.
> Using them correctly is the difference between textbook and breathtaking.

```pascal
// ─────────────────────────────────────────────────────────────────────────
// NON-CHORD TONE TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────
//
//  PASSING_TONE (PT): Stepwise motion between two chord tones of different pitch.
//    • Requires: prev=chord tone, next=chord tone, all stepwise, directional
//    • Both accented (strong beat) and unaccented (weak beat) forms valid
//    • Most common NCT — use freely in passing contexts
//
//  NEIGHBOR_TONE (NT): Step away from a chord tone and back to the same tone.
//    • Upper neighbor: C → D → C
//    • Lower neighbor: C → B → C
//    • Requires: bracketed by same pitch (or same chord tone)
//    • Strongly decorative; excellent for melodic ornament
//
//  ESCAPE_TONE (ET): Step in one direction, then leap in the opposite direction.
//    • e.g. E → F (step up) → C (leap down)
//    • The "F" is the escape tone — unresolved in expected direction
//    • Use for surprise, forward momentum, jazz-influenced lines
//
//  ANTICIPATION (ANT): A note arrived at early — it's a chord tone of the NEXT chord,
//    sounding before the harmonic change.
//    • Requires: pitch matches a chord tone of nextChord
//    • Very common in blues/gospel/jazz ("pushing")
//    • Typically short in duration
//
//  SUSPENSION (SUS): A chord tone from the previous chord held over into the new
//    chord, creating dissonance, then resolving DOWNWARD by step.
//    • Common types: 9-8 (major 2nd resolving to unison), 7-6, 4-3, 2-1
//    • Requires: preparation on chord tone, dissonance with new chord, stepwise resolution
//    • Highest expressive weight of all NCTs — use at phrase peaks and cadences
//
//  APPOGGIATURA (APP): An unprepared dissonance approached by leap, resolved by step.
//    • e.g. Leap up to a non-chord tone, then step down to chord tone
//    • Unlike suspension, it is NOT prepared — it just lands
//    • Extremely expressive; associated with longing, sighing
//    • Overuse destroys its effect — reserve for important structural moments
//
//  CAMBIATA: A four-note figure with double neighbor character.
//    • Pattern: C → D → B → C (step up, step down twice, step up) or inversions
//    • Common in Renaissance/Baroque; useful in classical and neo-romantic styles
//
//  RETARDATION: Like a suspension but resolves UPWARD by step.
//    • e.g. 7th of chord held over, resolves to octave (^7 → ^8/^1)
//    • Less common; effective at authentic cadences for upward momentum

PROCEDURE DetermineHarmonicPregate(step, prevPitch, nextPlayedStep, activeChord, nextChord, settings)

    validPitches := GetScalePitches(settings.scale, settings.range)
    effectivePitches := validPitches

    // ── Determine Step Context ────────────────────────────────────────────
    isIsolated        := IsStepIsolated(step)
    isOnDownbeat      := (step MOD 4 == 0)
    isOnMidbeat       := (step MOD 4 == 2)
    isOnWeakBeat      := (step MOD 4 == 1 OR step MOD 4 == 3)
    isNearCadence     := (step >= PhraseArchitecture.cadenceStartStep)
    prevWasChordTone  := IsChordTone(prevPitch, activeChord)
    nextWillBeChordTone := (nextPlayedStep != NULL AND IsChordTone(nextPlayedStep.pitch, activeChord))

    // ── NCT Eligibility Tests ─────────────────────────────────────────────

    canUsePassingTone :=
        prevWasChordTone AND
        NOT isIsolated AND
        IsDirectionallyBetween(prevPitch, nextPlayedStep?.pitch)

    canUseNeighborTone :=
        prevWasChordTone AND
        nextPlayedStep != NULL AND
        Absolute(nextPlayedStep.pitch - prevPitch) <= 2 AND   // Will return near
        isOnWeakBeat                                          // Neighbors on weak beats

    canUseEscapeTone :=
        prevWasChordTone AND
        isOnWeakBeat AND
        NOT isIsolated AND
        settings.genre IN ["jazz", "contemporary"]

    canUseAnticipation :=
        NOT isIsolated AND
        isOnWeakBeat AND
        nextChord != NULL AND
        HasChordToneBetween(validPitches, nextChord)         // Pitch exists in next chord

    canUseSuspension :=
        prevWasChordTone AND
        isOnDownbeat AND                                      // Suspensions land on strong beats
        NOT isNearCadence AND                                 // Too close to cadence gets messy
        TensionTracker.value >= 0.4                          // Only in moderate-to-high tension

    canUseAppoggiatura :=
        isOnDownbeat AND                                      // Appoggiaturas land with weight
        step == PhraseArchitecture.climaxStep AND             // Reserve for climax/structural moments
        settings.style IN ["romantic", "classical", "neo-romantic"]

    canUseCambiata :=
        step + 3 <= PhraseArchitecture.phraseLengthSteps AND // Needs 4 steps
        settings.style IN ["classical", "baroque", "folk"]

    // ── Build Effective Pitch Set ─────────────────────────────────────────

    IF isIsolated THEN
        // Legacy rule preserved: chord tones only
        effectivePitches := FilterToChordTones(validPitches, activeChord)

    ELSEIF isOnDownbeat AND NOT isNearCadence THEN
        // Downbeats: chord tones freely; suspensions and appoggiaturas by eligibility
        IF canUseSuspension AND rng.next() < 0.20 THEN
            effectivePitches := GetSuspensionPitches(prevPitch, activeChord)
            MarkNCTType(SUS, resolvesTo: prevPitch - SEMITONE, onStep: step + 1)
        ELSEIF canUseAppoggiatura AND rng.next() < 0.15 THEN
            effectivePitches := GetAppoggiaturaPitches(prevPitch, activeChord, range: 3..5)
            MarkNCTType(APP, resolvesTo: NearestChordTone(activeChord, pitch), onStep: step + 1)
        ELSE
            effectivePitches := FilterToChordTones(validPitches, activeChord)
        ENDIF

    ELSEIF isOnWeakBeat THEN
        // Weak beats: most NCT types available
        IF canUsePassingTone AND rng.next() < 0.50 THEN
            effectivePitches := GetPassingTonePitches(prevPitch, nextPlayedStep?.pitch, validPitches)

        ELSEIF canUseNeighborTone AND rng.next() < 0.25 THEN
            // Upper or lower neighbor (prefer upper neighbor in ascending contexts)
            neighborDir := IF TensionTracker.value > 0.5 THEN +1 ELSE -1
            effectivePitches := [prevPitch + (neighborDir * SEMITONE),
                                  prevPitch + (neighborDir * WHOLE_TONE)]

        ELSEIF canUseAnticipation AND rng.next() < 0.20 THEN
            effectivePitches := FilterToChordTones(validPitches, nextChord)
            MarkNCTType(ANT)

        ELSEIF canUseEscapeTone AND rng.next() < 0.10 THEN
            // Step in one direction, plan a leap opposite for next note
            effectivePitches := GetEscapeTonePitches(prevPitch, validPitches)
            MarkPendingLeap(awayFrom: escapePitch, direction: -Sign(escapePitch - prevPitch))

        ELSE
            // Fallback: diatonic scale tones, prefer chord tones weighted 2:1
            effectivePitches := WeightedMerge(
                high: FilterToChordTones(validPitches, activeChord),
                low: validPitches,
                highWeight: 0.65
            )
        ENDIF

    ELSEIF isOnMidbeat THEN
        // Midbeats (beat 2 and 4 in 4/4): moderate restriction
        IF canUsePassingTone THEN
            effectivePitches := GetPassingTonePitches(prevPitch, nextPlayedStep?.pitch, validPitches)
        ELSE
            effectivePitches := FilterToInScaleAndChordTones(validPitches, activeChord)
        ENDIF
    ENDIF

    // ── Foreshadowing (from legacy, preserved + extended) ─────────────────
    IF ClusterRole(step) == "foreshadow_note" THEN
        nextChordTones := GetChordTones(nextChord)
        effectivePitches := Intersect(effectivePitches, nextChordTones) OR effectivePitches
        // "Foreshadow" by giving 30% weight to next chord's tones in blended pitch set

    ELSEIF ClusterRole(step) == "commontone" THEN
        effectivePitches := Intersect(
            GetChordTones(activeChord),
            GetChordTones(nextChord)
        ) OR FilterToChordTones(validPitches, activeChord)   // Fallback if no common tones
    ENDIF

    RETURN effectivePitches
ENDPROC

// ─────────────────────────────────────────────────────────────────────
// CAMBIATA SCHEDULING
// Must be scheduled as a 4-step block when conditions are met.
// ─────────────────────────────────────────────────────────────────────
PROCEDURE MaybeScheduleCambiata(step, prevPitch, validPitches, activeChord)
    IF NOT canUseCambiata THEN RETURN ENDIF

    IF rng.next() < 0.08 THEN
        // Classic Renaissance cambiata: up by step, down by third, down by step, up by step
        // C → D → B → C — locks next 3 steps
        root := NearestChordTone(activeChord, prevPitch)
        cambiataBlock := [root + WHOLE_TONE, root - SEMITONE, root, root + SEMITONE]
        ScheduleFixedBlock(step, step+3, cambiataBlock)
        MarkNCTType(CAMBIATA, steps: [step..step+3])
    ENDIF
ENDPROC
```

---

## 6. Stage 3: Voice Leading + Register Architecture

> **Enhancement over legacy**: Adds contour guidance toward the planned climax, scale degree
> tendency gravity, sequence detection/promotion, and register-distribution enforcement.

```pascal
PROCEDURE SelectPitch(step, prevPitch, effectivePitches, settings)

    pitch := prevPitch

    // ── Forced Resolutions Take Priority ─────────────────────────────────
    IF HasForcedResolution() THEN
        resTarget := GetForcedResolutionPitch()
        pitch := FindClosest(resTarget, effectivePitches)
        ClearForcedResolution()
        RETURN pitch
    ENDIF

    // ── Contour Guidance ─────────────────────────────────────────────────
    // Pull the pitch selection toward the planned arch shape.
    // Before climaxStep: bias upward. After climaxStep: bias downward.
    // This replaces the legacy "settings.contour" single-value parameter.

    contourTarget := ComputeContourTarget(
        step,
        climaxStep: PhraseArchitecture.climaxStep,
        climaxPitch: PhraseArchitecture.climaxPitch,
        shape: PhraseArchitecture.contourShape,
        prevPitch: prevPitch,
        phraseLengthSteps: PhraseArchitecture.phraseLengthSteps
    )
    // contourTarget is a pitch value — FindClosest steers toward it below

    // ── Climax Delivery Gate ─────────────────────────────────────────────
    // When we reach the climax step, deliver the planned climax pitch
    // (if it's in effectivePitches; snap to nearest chord tone if not).
    IF step == PhraseArchitecture.climaxStep AND NOT RegisterTracker.climaxDelivered THEN
        IF PhraseArchitecture.climaxPitch IN effectivePitches THEN
            RegisterTracker.climaxDelivered := TRUE
            TensionTracker.pendingResolution := TRUE
            TensionTracker.resolutionDir := -1    // Climax resolves downward
            RETURN PhraseArchitecture.climaxPitch
        ELSE
            snapTarget := FindClosest(PhraseArchitecture.climaxPitch, effectivePitches)
            RegisterTracker.climaxDelivered := TRUE
            RETURN snapTarget
        ENDIF
    ENDIF

    // ── Sequence Detection & Promotion ──────────────────────────────────
    // If the last 2-3 steps have followed a consistent interval pattern,
    // continue the sequence. Sequences are one of the most powerfully
    // compelling devices in all of tonal music.

    IF MotifRegistry.sequenceStreak >= 2 THEN
        sequencePitch := prevPitch + MotifRegistry.lastSequenceInterval
        IF sequencePitch IN effectivePitches THEN
            MotifRegistry.sequenceStreak += 1
            // Cap sequences at 3-4 repetitions before varying
            IF MotifRegistry.sequenceStreak <= 4 THEN
                pitch := sequencePitch
                GOTO ApplyTendencyAndRegisterCheck
            ELSE
                MotifRegistry.sequenceStreak := 0    // Break the sequence
            ENDIF
        ENDIF
    ELSE
        DetectSequence(step, prevPitch, effectivePitches)
    ENDIF

    // ── Scale Degree Tendency Gravity ────────────────────────────────────
    // Weight pitches by their tendency to resolve toward stable tones.
    // This is what makes melodies feel *directed* rather than wandering.
    // High-tension steps: lean into tendency; low-tension: allow more freedom.

    tendencyWeightedPitches := ApplyTendencyWeights(
        effectivePitches, activeChord, TensionTracker.value
    )

    // ── Conjunct Motion Preference (Legacy, preserved) ───────────────────
    targetPitch := FindClosest(contourTarget, tendencyWeightedPitches)

    // Apply step-wise preference: small intervals get a probability boost
    pitch := SelectByIntervalWeight(
        from: prevPitch,
        candidates: tendencyWeightedPitches,
        preferredMaxInterval: 2,        // Semitones for "step"
        stepWeight: 0.70,               // 70% chance of conjunct motion
        leapWeight: 0.30,               // 30% allows leaps for interest
        contourBias: contourTarget
    )

    // ── Leap Resolution (Legacy, enhanced) ──────────────────────────────
    leapSize := Absolute(pitch - prevPitch)
    IF leapSize >= 4 THEN
        // After a leap, REQUIRE contrary stepwise resolution on next note
        SetForcedResolution(
            direction: -Sign(pitch - prevPitch),
            maxInterval: 2,
            onStep: step + 1
        )
        TensionTracker.consecutiveLeaps += 1
        RegisterTracker.lastLeapStep := step

        // Two consecutive large leaps in same direction: flag as instability
        IF TensionTracker.consecutiveLeaps >= 2 THEN
            SetForcedResolution(
                direction: -Sign(pitch - prevPitch),
                maxInterval: 3,
                mustBeChordTone: TRUE,
                onStep: step + 1
            )
        ENDIF
    ELSE
        TensionTracker.consecutiveLeaps := 0
    ENDIF

    // ── Register Distribution Check ──────────────────────────────────────
    // Prevent the melody from camping in one register too long.
    // After 4+ consecutive steps in the upper third of the range, pull back.
    ::ApplyTendencyAndRegisterCheck::

    avgRecent := Average(RegisterTracker.recent)
    IF RegisterTracker.stepsAtPeak >= 4 AND pitch > avgRecent THEN
        // Force a step downward — the melody needs to breathe
        lowerCandidates := Filter(effectivePitches, lambda p: p < prevPitch)
        IF NOT Empty(lowerCandidates) THEN
            pitch := FindClosest(prevPitch - WHOLE_TONE, lowerCandidates)
        ENDIF
    ENDIF

    // Update register tracker
    RegisterTracker.recent.Enqueue(pitch)
    IF pitch >= PhraseArchitecture.climaxPitch - 2 THEN
        RegisterTracker.stepsAtPeak += 1
    ELSE
        RegisterTracker.stepsAtPeak := 0
    ENDIF

    // ── Microtonal Collision Prevention (Legacy, preserved) ─────────────
    IF settings.divisions > 12 THEN
        IF Absolute(pitch - prevPitch) < SEMITONE THEN
            pitch := NudgeApart(pitch, prevPitch, effectivePitches)
        ENDIF
    ENDIF

    RETURN pitch
ENDPROC

FUNCTION ApplyTendencyWeights(pitches, chord, tensionLevel) → WEIGHTED_LIST
    // Higher tensionLevel → stronger tendency gravity
    result := []
    FOR EACH p IN pitches DO
        deg := GetScaleDegree(p, chord.root, settings.scale)
        tendency := TENDENCY[deg]
        baseWeight := 1.0

        // Increase weight for tones that move in the expected direction
        IF tensionLevel > 0.5 AND tendency.pull > 0.3 THEN
            // Strong pull tones get DOWN-weighted (they need to resolve, not be chosen again)
            // EXCEPT if this is the resolution step
            IF IsResolutionStep(step) THEN
                baseWeight += tendency.pull * tensionLevel    // Reward resolution targets
            ELSE
                baseWeight -= tendency.pull * 0.5 * tensionLevel   // Penalize stuck tendency tones
            ENDIF
        ENDIF

        result.Append({pitch: p, weight: Max(0.05, baseWeight)})
    ENDFOR
    RETURN result
ENDFUNC
```

---

## 7. Stage 4: Blues/Jazz + Chromatic Enclosures + Guide Tones

> **Enhancement over legacy**: Adds chromatic enclosure (bebop vocabulary), guide-tone line tracking
> (3rd and 7th of each chord), altered dominant colors (♭9, ♯9, ♭5, ♯5), and tritone substitution
> awareness. The ♭5/♭3 rules from the legacy system are preserved and corrected.

```pascal
PROCEDURE ApplyJazzChromaticInflections(step, pitch, prevPitch, activeChord, nextChord, settings)

    // ── Legacy Rules (preserved + corrected) ────────────────────────────
    // b5 and b3 rules from legacy are correct in principle but needed fixes:
    // 1. b5 check should verify BOTH neighbors, not just prev
    // 2. b3 resolution should be tracked for 2 steps (may have an intervening note)

    IF settings.genre IN ["blues", "jazz"] AND NOT TensionTracker.blueNoteDebt THEN

        semitone := 12 / settings.divisions
        chordRoot := activeChord.key
        proposedBlue := pitch - semitone
        proposedPc := (proposedBlue - chordRoot) MOD 12

        isB5 := (proposedPc == 6)
        isB3 := (proposedPc == 3)

        IF isB5 AND prevPitch != NULL AND nextPlayedStep != NULL THEN
            prevDistance := Absolute(prevPitch - proposedBlue)
            nextDistance := Absolute(nextPlayedStep.pitch - proposedBlue)
            // b5 ONLY valid as chromatic passing tone between 4 and 5 (or reverse)
            IF prevDistance == semitone AND nextDistance == semitone THEN
                pitch := proposedBlue
                TensionTracker.blueNoteDebt := TRUE
            ENDIF

        ELSEIF isB3 THEN
            pitch := proposedBlue
            SetForcedResolution(pitch: proposedBlue + semitone, onStep: step + 1)
            TensionTracker.blueNoteDebt := TRUE
        ENDIF

    ELSE
        TensionTracker.blueNoteDebt := FALSE
    ENDIF

    // ── Chromatic Enclosure (Bebop Jazz) ────────────────────────────────
    // An enclosure approaches a target chord tone from both sides chromatically:
    //   Target = D → play E♭ → C♯ → D (or C♯ → E♭ → D)
    // Extremely effective for bebop lines; the target lands on the strong beat.
    // Enclosure always resolves on the next DOWNBEAT.

    IF settings.genre == "jazz" AND isOnWeakBeat AND step + 2 <= phraseLengthSteps THEN
        nextDownbeat := NextDownbeatStep(step)
        targetGuideTone := GetGuideTone(nextChord OR activeChord)   // 3rd or 7th of chord

        IF rng.next() < 0.15 THEN   // Enclosures are effective but not every step
            enclosurePattern := GenerateEnclosure(
                target: targetGuideTone,
                currentStep: step,
                targetStep: nextDownbeat,
                direction: RandomFrom(["above-below", "below-above"])
            )
            // Lock steps [step, step+1] to enclosure pitches; step+2 = target
            IF enclosurePattern != NULL THEN
                ScheduleFixedBlock(step, nextDownbeat, enclosurePattern)
                RETURN enclosurePattern[0]    // Return first note of enclosure
            ENDIF
        ENDIF
    ENDIF

    // ── Guide Tone Line ─────────────────────────────────────────────────
    // Guide tones are the 3rd and 7th of each chord — they define the harmonic
    // color and move smoothly between chords (usually by half or whole step).
    // Privileging guide tones at chord changes makes the harmony sing.

    IF step == ChordChangeStep(activeChord) THEN
        guideTones := [GetChordTone(activeChord, THIRD), GetChordTone(activeChord, SEVENTH)]
        closestGuide := FindClosest(prevPitch, guideTones)
        distToGuide := Absolute(closestGuide - prevPitch)

        IF distToGuide <= 2 THEN    // Only if within a step of a guide tone
            // Boost probability of landing on guide tone
            IF rng.next() < 0.45 THEN
                pitch := closestGuide
            ENDIF
        ENDIF
    ENDIF

    // ── Altered Dominant Colors ─────────────────────────────────────────
    // On dominant chords (V7), jazz practice allows altered extensions:
    // ♭9 (pc=1), ♯9 (pc=3), ♯11/♭5 (pc=6), ♭13 (pc=8)
    // These create maximum tension that demands resolution to I.
    // Use ONLY when approaching authentic cadence.

    IF activeChord.function == DOMINANT AND isNearCadence AND settings.genre == "jazz" THEN
        alteredOptions := []
        chordRoot := activeChord.key

        IF rng.next() < 0.25 THEN
            alteredPc := RandomFrom([
                (chordRoot + 1) MOD 12,    // ♭9
                (chordRoot + 3) MOD 12,    // ♯9
                (chordRoot + 6) MOD 12,    // ♯11 / ♭5
                (chordRoot + 8) MOD 12     // ♭13
            ])
            alteredPitch := FindPitchWithPC(alteredPc, settings.range)
            IF alteredPitch IN effectivePitches OR settings.allowAltered THEN
                pitch := alteredPitch
                TensionTracker.value := Min(1.0, TensionTracker.value + 0.3)
                SetForcedResolution(
                    toChordTone: nextChord,
                    onStep: step + 1
                )
            ENDIF
        ENDIF
    ENDIF

    RETURN pitch
ENDPROC
```

---

## 8. Stage 5: Ornaments + Approach Notes + Cambiata

> **Enhancement over legacy**: Adds proper approach-note types (diatonic, chromatic, indirect),
> extended ornament vocabulary (mordent, turn, trill fragment), and conditional grace-note
> timing that accounts for tempo.

```pascal
PROCEDURE ApplyOrnaments(step, pitch, prevPitch, settings)

    // ── Grace Notes (Legacy, enhanced) ──────────────────────────────────
    IF settings.genre IN ["classical", "baroque"] AND HasSpaceBefore(step, 0.08) THEN

        // Classical: chromatic lower grace note (appoggiatura grace)
        IF rng.next() < 0.20 THEN
            graceInterval := -SEMITONE    // Lower chromatic neighbor
            IF IsChordTone(pitch - WHOLE_TONE, activeChord) THEN
                graceInterval := -WHOLE_TONE   // Prefer diatonic lower grace
            ENDIF
            ScheduleGraceNote(pitch + graceInterval, step.time - 0.05)
        ENDIF

        // Turn ornament: pitch → pitch+step → pitch → pitch-step → pitch
        // Use before long notes on strong beats (very Baroque/Classical)
        IF isOnDownbeat AND step.duration >= 0.25 AND rng.next() < 0.10 THEN
            ScheduleTurn(
                center: pitch,
                upper: pitch + WHOLE_TONE,
                lower: pitch - SEMITONE,
                startTime: step.time,
                compression: 0.20          // Each turn note = 20% of main note duration
            )
        ENDIF

        // Mordent: pitch → pitch+semitone → pitch (compressed)
        IF NOT isOnDownbeat AND rng.next() < 0.08 THEN
            ScheduleMordent(pitch, step.time, stepFraction: 0.15)
        ENDIF

    ENDIF

    // ── Approach Notes (Classical/Jazz) ─────────────────────────────────
    // Approach notes land a fraction of a beat BEFORE the main note,
    // giving a sense of leaning into the arrival.
    // Types: chromatic approach (1 semitone), diatonic (1 scale step),
    //        indirect approach (leap, then approach from opposite side)

    IF settings.allowApproachNotes AND isOnDownbeat AND HasSpaceBefore(step, 0.06) THEN
        approachInterval := 0
        IF rng.next() < 0.25 THEN
            approachType := SelectApproachType(settings.genre, pitch, prevPitch, activeChord)

            IF approachType == CHROMATIC THEN
                // Come from a semitone above or below (whichever is more tensionful)
                approachInterval := IF TensionTracker.value > 0.5 THEN +SEMITONE ELSE -SEMITONE

            ELSEIF approachType == DIATONIC THEN
                // Come from the diatonic step below
                approachInterval := -WHOLE_TONE

            ELSEIF approachType == INDIRECT THEN
                // Leap away, then step back into the target
                // Schedule extra pre-approach note
                ScheduleIndirectApproach(pitch, step.time, direction: Sign(pitch - prevPitch))
            ENDIF

            IF approachInterval != 0 THEN
                ScheduleGraceNote(pitch + approachInterval, step.time - 0.04)
            ENDIF
        ENDIF
    ENDIF

    // ── Motivic Flexing (Legacy, enhanced) ──────────────────────────────
    // Whole-step intervals split into passing half-steps (fills)
    IF Absolute(pitch - prevPitch) == WHOLE_TONE AND HasSpaceBetween(prevStep, step, 0.12) THEN
        fillPitch := prevPitch + SEMITONE * Sign(pitch - prevPitch)
        IF fillPitch IN scaleNotes THEN
            ScheduleFill(fillPitch, midpoint(prevStep.time, step.time))
        ENDIF
    ENDIF

    RETURN pitch
ENDPROC
```

---

## 9. Stage 6: Scale Degree Tendency & Tension Lifecycle

> **New stage**: Manages tension as an explicit arc rather than a side effect. Updates the tension
> tracker and enforces resolution when dissonance has accumulated above a threshold.

```pascal
PROCEDURE ManageTensionLifecycle(step, pitch, activeChord, settings)

    targetTension := PhraseArchitecture.tensionCurve[step]

    // ── Update Tension Value ─────────────────────────────────────────────
    // Tension sources:
    //   - Non-chord tone (by NCT type weight)
    //   - High register (above tessitura center + 7 semitones)
    //   - Leap size
    //   - Chromatic alteration (blue note, altered tension)
    //   - Rhythmic density (faster = more tension)

    currentTension := 0.0

    IF NOT IsChordTone(pitch, activeChord) THEN
        nctType := GetActiveNCTType(step)
        currentTension += NCT_DISSONANCE_WEIGHT[nctType]
    ENDIF

    IF pitch > tessituraCenter + 7 THEN
        currentTension += 0.15 + (pitch - tessituraCenter - 7) * 0.05
    ENDIF

    IF Absolute(pitch - prevPitch) >= 4 THEN
        currentTension += 0.10 * (Absolute(pitch - prevPitch) / 12.0)
    ENDIF

    IF TensionTracker.blueNoteDebt THEN
        currentTension += 0.25
    ENDIF

    // Smooth toward target (tension doesn't jump instantaneously)
    TensionTracker.value := Lerp(TensionTracker.value, currentTension, 0.3)

    // ── Enforce Resolution ───────────────────────────────────────────────
    // If tension has been > 0.7 for 3+ consecutive steps, FORCE resolution
    // on the next step regardless of other constraints.

    IF TensionTracker.value > 0.7 AND TensionTracker.pendingResolution THEN
        TensionTracker.dissonanceDebt += TensionTracker.value - 0.7
    ENDIF

    IF TensionTracker.dissonanceDebt > 1.5 THEN
        SetForcedResolution(
            toChordTone: activeChord,
            direction: TensionTracker.resolutionDir,
            onStep: step + 1,
            mustBeChordTone: TRUE
        )
        TensionTracker.dissonanceDebt := 0.0
    ENDIF

    // ── Scale Degree Tendency Enforcement (Strong Beats) ─────────────────
    // Leading tone (^7) on a downbeat MUST resolve to tonic on next played note.
    // Subdominant (^4) on a downbeat gets a soft resolution push to ^3.
    IF isOnDownbeat THEN
        deg := GetScaleDegree(pitch, activeChord.root, settings.scale)
        tendency := TENDENCY[deg]

        IF deg == 7 THEN   // Leading tone: non-negotiable
            SetForcedResolution(
                semitones: +1,               // Up by semitone to tonic
                onStep: step + 1,
                priority: HARD
            )
        ELSEIF deg == 4 AND TensionTracker.value > 0.4 THEN
            SetForcedResolution(
                semitones: -1,               // Down by semitone to major 3rd
                onStep: step + 1,
                priority: SOFT               // Can be overridden by strong contour need
            )
        ENDIF
    ENDIF

ENDPROC
```

---

## 10. Stage 7: Motivic Development Engine

> **New stage**: Extracts melodic cells from the first 4 steps and applies development operations
> across the phrase. This is the single biggest factor separating professional from procedural melody.

```pascal
PROCEDURE RunMotifDevelopmentEngine(step, pitch, prevPitch, effectivePitches, settings)

    // ── Extraction Phase (Steps 0-3) ─────────────────────────────────────
    IF step < 4 THEN
        MotifBuffer.Append(pitch)
        IF step == 3 THEN
            newMotif := Motif {
                intervalPattern: ExtractIntervals(MotifBuffer),
                rhythmPattern:   ExtractRhythm(MotifBuffer),
                contourSig:      ExtractContour(MotifBuffer),
                useCount:        0,
                firstHeardStep:  0
            }
            IF IsDistinctMotif(newMotif, MotifRegistry.stored) THEN
                MotifRegistry.stored.Append(newMotif)
                MotifRegistry.active := newMotif
            ENDIF
        ENDIF
        RETURN pitch    // No modification during extraction
    ENDIF

    // ── Development Phase (Steps 4+) ────────────────────────────────────
    IF MotifRegistry.active == NULL OR MotifRegistry.barsSinceReuse < 2 THEN
        MotifRegistry.barsSinceReuse += 1
        RETURN pitch
    ENDIF

    m := MotifRegistry.active
    op := SelectDevelopmentOperation(step, m, settings, PhraseArchitecture)

    SWITCH op
        CASE EXACT_REPEAT:
            // Replay the motif at the same pitch level
            // Effective for immediate reiteration (bars 0-1 of sentence)
            proposedPitches := TransposeMotif(m, by: 0, from: step)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, m.rhythmPattern)
            ENDIF

        CASE TONAL_SEQUENCE:
            // Transpose motif up or down by a diatonic step (scale degree shift)
            // e.g. C-D-E → D-E-F (in C major), each interval re-mapped to scale
            seqDir := IF step < PhraseArchitecture.climaxStep THEN +1 ELSE -1
            seqInterval := GetNextScaleDegreeOffset(prevPitch, seqDir, settings.scale)
            proposedPitches := TransposeMotifDiatonically(m, seqInterval, settings.scale)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, m.rhythmPattern)
                MotifRegistry.sequenceStreak += 1
                MotifRegistry.lastSequenceInterval := seqInterval
            ENDIF

        CASE INVERSION:
            // Mirror the interval pattern: +2, -1 becomes -2, +1
            invertedIntervals := Negate(m.intervalPattern)
            proposedPitches := ApplyIntervals(prevPitch, invertedIntervals)
            proposedPitches := SnapToScale(proposedPitches, settings.scale)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, m.rhythmPattern)
            ENDIF

        CASE RETROGRADE:
            // Reverse the interval pattern
            // Use sparingly — retrograde is hard to perceive but creates
            // a sense of "looking back" — excellent in development sections
            retroIntervals := Reverse(m.intervalPattern)
            proposedPitches := ApplyIntervals(prevPitch, retroIntervals)
            proposedPitches := SnapToScale(proposedPitches, settings.scale)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, m.rhythmPattern)
            ENDIF

        CASE AUGMENTATION:
            // Double the duration of each note in the motif
            // Powerful for slowing the sense of time — best at phrase peaks
            augRhythm := MultiplyRhythm(m.rhythmPattern, factor: 2.0)
            proposedPitches := [pitch] // Only one pitch fits in augmented form per step block
            ScheduleAugmentedMotif(step, m.intervalPattern, augRhythm)

        CASE DIMINUTION:
            // Halve the duration — creates urgency, forward drive
            // Best in cadential section (steps 12-15)
            dimRhythm := MultiplyRhythm(m.rhythmPattern, factor: 0.5)
            ScheduleMotifBlock(step, TransposeMotif(m, by: 0, from: step), dimRhythm)

        CASE FRAGMENTATION:
            // Use only the first 2 notes of the motif — then sequence or vary
            // Classic technique in sentence continuation (Beethoven, bars 5-8)
            fragmentIntervals := m.intervalPattern[0..1]
            fragmentRhythm := m.rhythmPattern[0..1]
            proposedPitches := ApplyIntervals(prevPitch, fragmentIntervals)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, fragmentRhythm)
            ENDIF

        CASE RHYTHMIC_DISPLACEMENT:
            // Same pitches, shifted to start on a different beat
            // Creates rhythmic surprise while preserving pitch identity
            shiftAmt := RandomFrom([-1, +1])    // Shift by one step
            ScheduleMotifBlock(step + shiftAmt, TransposeMotif(m, by: 0, from: step), m.rhythmPattern)

        CASE MUTATION:
            // Change one pitch of the motif (chromatic neighbor or scale inflection)
            // Preserves identity while introducing novelty
            mutateIndex := RandomFrom([0, 1, Length(m.intervalPattern) - 1])
            mutatedIntervals := Copy(m.intervalPattern)
            mutatedIntervals[mutateIndex] += RandomFrom([-1, +1])    // Semitone inflection
            proposedPitches := ApplyIntervals(prevPitch, mutatedIntervals)
            IF AllReachable(proposedPitches, effectivePitches) THEN
                ScheduleMotifBlock(step, proposedPitches, m.rhythmPattern)
            ENDIF

        DEFAULT:
            RETURN pitch    // No operation this step
    ENDSWITCH

    MotifRegistry.active.useCount += 1
    MotifRegistry.barsSinceReuse := 0
    RETURN pitch

ENDPROC

FUNCTION SelectDevelopmentOperation(step, motif, settings, arch) → OPERATION
    // Choose the most musically appropriate operation given context.
    // Operations are weighted by phrase position and style.

    weights := {
        EXACT_REPEAT          → IF step < 8 THEN 0.30 ELSE 0.05,
        TONAL_SEQUENCE        → IF step < arch.climaxStep THEN 0.35 ELSE 0.15,
        INVERSION             → IF step > 8 THEN 0.20 ELSE 0.05,
        RETROGRADE            → IF step > 10 THEN 0.10 ELSE 0.02,
        AUGMENTATION          → IF step == arch.climaxStep - 1 THEN 0.30 ELSE 0.05,
        DIMINUTION            → IF step >= arch.cadenceStartStep THEN 0.30 ELSE 0.05,
        FRAGMENTATION         → IF arch.phraseType == SENTENCE_CONT THEN 0.35 ELSE 0.10,
        RHYTHMIC_DISPLACEMENT → 0.10,
        MUTATION              → 0.12,
        NONE                  → 0.20
    }

    RETURN WeightedRandomSelect(weights)
ENDFUNC
```

---

## 11. Stage 8: Cadential Shaping & Phrase Endings

> **New stage**: Shapes the final 3-4 steps of every phrase toward the planned cadential formula.
> Without this, melody "dies" at phrase endings rather than arriving. Cadences are not just
> harmonic — the *melody* must cadence convincingly.

```pascal
PROCEDURE ApplyCadentialShaping(step, pitch, effectivePitches, activeChord, settings)

    IF step < PhraseArchitecture.cadenceStartStep THEN
        RETURN pitch    // Too early for cadential shaping
    ENDIF

    stepsFromEnd := PhraseArchitecture.phraseLengthSteps - step
    targetDeg := PhraseArchitecture.cadenceMelodyDeg

    // ── Cadential Formula Library ────────────────────────────────────────

    SWITCH PhraseArchitecture.cadenceTarget

        CASE AUTHENTIC:
            // Strong close: melody arrives on ^1 (or ^3 for incomplete authentic)
            // Approach path: ^2 → ^1 (most common), ^7 → ^1, ^3 → ^2 → ^1
            IF stepsFromEnd == 2 THEN
                // Penultimate: get to ^2 (supertonic above tonic)
                supertonic := GetScalePitch(2, activeChord.root, settings.scale, settings.range)
                IF supertonic IN effectivePitches THEN
                    SetForcedResolution(pitch: supertonic, onStep: step, priority: HARD)
                ENDIF
            ELSEIF stepsFromEnd == 1 THEN
                // Final step: arrive on tonic
                tonic := GetScalePitch(1, activeChord.root, settings.scale, settings.range)
                IF tonic IN effectivePitches THEN
                    SetForcedResolution(pitch: tonic, onStep: step, priority: HARD)
                ENDIF
            ELSEIF stepsFromEnd == 3 THEN
                // Pre-cadential: can use a neighbor or passing motion toward ^2
                // No hard force — let voice leading get there naturally
            ENDIF

        CASE HALF:
            // Open close: melody arrives on ^2 (over V chord) or ^5 (on V chord)
            // Creates expectation, incompleteness — antecedent phrases
            IF stepsFromEnd == 1 THEN
                halfDeg := IF activeChord.function == DOMINANT THEN 5 ELSE 2
                halfTarget := GetScalePitch(halfDeg, activeChord.root, settings.scale, settings.range)
                SetForcedResolution(pitch: halfTarget, onStep: step, priority: HARD)
            ENDIF

        CASE DECEPTIVE:
            // Surprise close: V resolves to vi instead of I
            // Melody: expect ^1 but go to ^3 or ^6 — deeply expressive
            IF stepsFromEnd == 1 AND nextChord.function == SUBMEDIANT THEN
                deceptivePitch := GetScalePitch(3, activeChord.root, settings.scale, settings.range)
                IF rng.next() < 0.70 THEN
                    SetForcedResolution(pitch: deceptivePitch, onStep: step, priority: MEDIUM)
                ENDIF
            ENDIF

        CASE PLAGAL:
            // "Amen" cadence: IV → I
            // Melody: ^6 or ^4 → ^5 or ^1 — gentle, spiritual, retrospective
            IF stepsFromEnd == 1 THEN
                plagalTarget := GetScalePitch(1, activeChord.root, settings.scale, settings.range)
                SetForcedResolution(pitch: plagalTarget, onStep: step, priority: MEDIUM)
            ENDIF

    ENDSWITCH

    // ── Cadential Rhythmic Broadening ────────────────────────────────────
    // Great melodies slow into cadences (agogic broadening).
    // Lengthen the final 2 notes by 10-20% (implied ritardando).
    IF stepsFromEnd <= 2 THEN
        ScheduleDurationMultiplier(step, 1.12 + (0.08 * (2 - stepsFromEnd)))
    ENDIF

    RETURN pitch
ENDPROC
```

---

## 12. Helper Procedures

```pascal
// ─────────────────────────────────────────────────────────────────────────
FUNCTION ComputeContourTarget(step, climaxStep, climaxPitch, shape, prevPitch, totalSteps) → PITCH
    progress := step / totalSteps
    climaxProgress := climaxStep / totalSteps

    SWITCH shape
        CASE ARCH:
            IF progress < climaxProgress THEN
                t := progress / climaxProgress
                RETURN Lerp(tessituraCenter, climaxPitch, EaseInQuad(t))
            ELSE
                t := (progress - climaxProgress) / (1.0 - climaxProgress)
                RETURN Lerp(climaxPitch, tessituraCenter - 2, EaseOutQuad(t))
            ENDIF

        CASE ASCENDING:
            RETURN Lerp(tessituraCenter - 3, climaxPitch, EaseInCubic(progress))

        CASE DESCENDING:
            RETURN Lerp(climaxPitch, tessituraCenter - 5, EaseOutQuad(progress))

        CASE INV_ARCH:
            // Nadir at midpoint
            IF progress < 0.5 THEN
                RETURN Lerp(tessituraCenter, tessituraCenter - 8, EaseInQuad(progress * 2))
            ELSE
                RETURN Lerp(tessituraCenter - 8, tessituraCenter, EaseOutQuad((progress - 0.5) * 2))
            ENDIF

        CASE CONVEX:
            // Multiple peaks — sinusoidal approximation
            RETURN tessituraCenter + Sin(progress * TWO_PI * 1.5) * 6

        DEFAULT:
            RETURN prevPitch   // Hover: no bias
    ENDSWITCH
ENDFUNC

// ─────────────────────────────────────────────────────────────────────────
FUNCTION GenerateTensionCurve(length, shape, climaxAt, cadenceStartAt, cadenceType) → FLOAT[]
    curve := Array[length] OF FLOAT

    FOR step := 0 TO length - 1 DO
        progress := step / length
        climaxProgress := climaxAt / length

        baseTension := 0.0
        SWITCH shape
            CASE ARCH: baseTension := Sin(progress * PI)             // Rises and falls
            CASE ASCENDING: baseTension := EaseInCubic(progress)     // Builds
            CASE DESCENDING: baseTension := 1.0 - progress           // Fades
            CASE INV_ARCH: baseTension := 1.0 - Sin(progress * PI)  // Inverted arch
            DEFAULT: baseTension := 0.4 + Sin(progress * TWO_PI) * 0.2
        ENDSWITCH

        // Cadential spike: tension rises then falls to resolution
        IF step >= cadenceStartAt THEN
            cadenceProgress := (step - cadenceStartAt) / (length - cadenceStartAt)
            IF cadenceType == AUTHENTIC THEN
                cadenceTension := Sin(cadenceProgress * PI)  // Rise then fall to resolution
            ELSEIF cadenceType == HALF THEN
                cadenceTension := cadenceProgress            // Unresolved — stays elevated
            ELSE
                cadenceTension := Sin(cadenceProgress * PI * 0.8)
            ENDIF
            baseTension := Max(baseTension, cadenceTension)
        ENDIF

        curve[step] := Clamp(baseTension, 0.0, 1.0)
    ENDFOR

    RETURN curve
ENDFUNC

// ─────────────────────────────────────────────────────────────────────────
FUNCTION SelectContour(phraseIndex, style, prevContour) → CONTOUR_SHAPE
    // Avoid repeating the same contour — maintain variety across phrases
    excluded := {prevContour}

    weights := {
        ARCH       → 0.35,   // Most naturally satisfying; use frequently
        INV_ARCH   → 0.15,   // Question-like; good for antecedents
        ASCENDING  → 0.20,   // Building tension; good for development
        DESCENDING → 0.15,   // Settling; good for consequents
        HOVERING   → 0.05,   // Decorative only; use sparingly
        CONVEX     → 0.10    // Multi-peak; good for complex sections
    }

    // Style-specific adjustments
    IF style == "blues" THEN
        weights[DESCENDING] += 0.10    // Blues often descends/resolves
        weights[HOVERING]   += 0.05
    ELSEIF style == "baroque" THEN
        weights[ASCENDING]  += 0.10    // Baroque sequences often build
        weights[ARCH]       += 0.05
    ENDIF

    RETURN WeightedRandomSelect(weights, excluding: excluded)
ENDFUNC

// ─────────────────────────────────────────────────────────────────────────
FUNCTION GenerateEnclosure(target, currentStep, targetStep, direction) → PITCH[] OR NULL
    // Chromatic enclosure: approach target from above AND below
    // Returns 2 pitches [above_neighbor, below_neighbor] to schedule before target
    stepsAvailable := targetStep - currentStep
    IF stepsAvailable < 2 THEN RETURN NULL ENDIF

    IF direction == "above-below" THEN
        RETURN [target + SEMITONE, target - SEMITONE]
    ELSE
        RETURN [target - SEMITONE, target + SEMITONE]
    ENDIF
ENDFUNC
```

---

## 13. Optimization Notes & Known Tradeoffs

### Architecture Changes

| Decision | Rationale |
|---|---|
| Stage 0 pre-computation is mandatory | Removing it collapses all arch/climax/cadence logic. It is not optional. |
| Tension curve is authoritative | Voice leading and NCT stages should CHECK tension, not set it. |
| Motif extraction requires Steps 0-3 to play | If density is very low, motif may not be extracted. Set a minimum density floor of 0.40 for Steps 0-3 to guarantee extraction. |
| Forced resolutions use a priority stack | HARD > MEDIUM > SOFT — only one HARD forced resolution can be active at a time. |

### Genre Configuration Recommendations

```pascal
CONST GENRE_DEFAULTS : MAP<GENRE, SettingsOverride> := {
    "blues"        → {syncopationBudget: 5,  allowApproachNotes: FALSE, phraseStructure: "free"},
    "jazz"         → {syncopationBudget: 8,  allowApproachNotes: TRUE,  allowAltered: TRUE},
    "classical"    → {syncopationBudget: 2,  allowApproachNotes: TRUE,  phraseStructure: "period"},
    "baroque"      → {syncopationBudget: 1,  allowApproachNotes: TRUE,  phraseStructure: "period"},
    "folk"         → {syncopationBudget: 2,  allowApproachNotes: FALSE, phraseStructure: "period"},
    "contemporary" → {syncopationBudget: 6,  allowApproachNotes: TRUE,  phraseStructure: "sentence"},
    "romantic"     → {syncopationBudget: 3,  allowApproachNotes: TRUE,  contourBias: ARCH}
}
```

### Known Tradeoffs

- **Motif development vs. freshness**: Sequences longer than 4 repetitions become predictable. The `sequenceStreak` cap at 4 prevents this but can feel abrupt — add a deliberate "break" pitch (escape tone or chromatic neighbor) when capping.
- **Tension curves and restProbability**: High `restProbability` in Stage 1 can puncture the tension curve mid-climb. Consider reducing `restProbability` proportionally as the tension target rises: `effectiveRestProb := restProbability * (1.0 - tensionTarget)`.
- **Asymmetrical phrase lengths and rhythmic motif lock**: A 10-step phrase has only 2.5 repetitions of the 4-step motif. Handle the trailing steps explicitly as a cadential tag rather than a partial motif repeat.
- **Suspension preparation**: Suspensions require the suspended pitch to be a chord tone of the **previous** chord. Add a lookback to the previous active chord when evaluating `canUseSuspension`.
- **Performance note**: Stage 0 is O(n) over phrase length and runs once per phrase — negligible cost. Motif registry operations (extraction, comparison, scheduling) are O(m × k) where m = stored motifs and k = motif length. Keep stored motifs capped at 5-8 per session.

---

*References: Aldwell & Schachter — Harmony and Voice Leading; Huron — The Melodic Arch in Western Folksongs (1996); Schoenberg — Fundamentals of Musical Composition; Caplin — Classical Form; Baker — Jazz Improvisation; Nettles & Graf — The Chord Scale Theory & Jazz Harmony.*
