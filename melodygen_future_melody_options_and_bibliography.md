These are future enhancement directions grounded in current research. Each is a potential major feature with its own implementation cycle.

### 9.1 — Statistical Expectation Model (IDyOM)

Marcus Pearce's IDyOM (Information Dynamics of Music) model learns melodic expectation statistically from a corpus of melodies. It outputs a surprise value (information content in bits) for each note. This is the most empirically validated model of melodic expectation in cognitive musicology.

Implementation path: train a simple n-gram model on a curated corpus (Bach chorales, jazz standards, folk melodies segmented by genre). Use it to weight pitch selection toward statistically expected continuations, with a "surprise budget" per phrase that controls how often the generator deflects expectations. High surprise budget → more interesting but riskier; low budget → more predictable but safer.

*Reference: Pearce & Wiggins (2006). "Expectation in Melody." Music Perception 22(2). Pearce (2005). "The Construction and Evaluation of Statistical Models of Melodic Structure." PhD thesis, City University London.*

### 9.2 — Tonal Pitch Space Tension Curves

Fred Lerdahl's Tonal Pitch Space model quantifies the psychological distance between any two pitch classes or chords, producing a precise tension value at every moment in a piece. Implementing even a simplified version would allow the generator to compute melodic tension more precisely than the current heuristic `tension * 0.4 + tcVal * 0.6` formula.

Implementation path: implement the basic pitch-class hierarchy (tonic → fifth → diatonic → chromatic) as a lookup table, compute distance from current melodic pitch to tonic, and use that as the primary tension value driving the arc planner.

*Reference: Lerdahl, F. (2001). Tonal Pitch Space. Oxford University Press. Lerdahl, F. & Krumhansl, C. (2007). "Modeling Tonal Tension." Music Perception 24(4).*

### 9.3 — Hierarchical Motif Trees (Schenkerian Structure)

Heinrich Schenker's analytical theory proposes that tonal music has a hierarchical structure — at the deepest level, every tonal melody is a stepwise descent from the 3rd, 5th, or 8th degree to the tonic (the Urlinie). Above this background structure sits a middleground of prolongation and embellishment, and above that the foreground surface melody.

Implementation path: pre-plan the deepest structural skeleton (e.g., `5̂–4̂–3̂–2̂–1̂`) before any other generation, then generate foreground detail that elaborates this skeleton. Every note in the foreground should either be a structural note (part of the Urlinie) or an embellishment of one. This produces the large-scale coherence that characterizes the most enduring tonal melodies.

*Reference: Schenker, H. (1935/1979). Free Composition. Longman. Cadwallader, A. & Gagné, D. (2010). Analysis of Tonal Music: A Schenkerian Approach. Oxford University Press.*

### 9.4 — Embodied Cognition and Groove

Vijay Iyer's embodied music cognition research proposes that rhythmic experience is fundamentally physical — we feel music in our bodies before we analyze it in our minds. Groove emerges from micro-timing deviations that suggest physical gesture. The generator currently produces grid-quantized rhythms; adding controlled micro-timing would make phrases feel inhabited rather than mechanical.

Implementation path: add a `microTimingProfile` parameter to `scheduleMelody()` that offsets note onset times by genre-specific amounts (jazz: anticipate beats 2 and 4 by ~20ms; blues: push beat 4; bossa nova: specific syncopation patterns). This requires timing offsets rather than grid changes.

*Reference: Iyer, V. (2002). "Embodied Mind, Situated Cognition, and Expressive Microtiming in African-American Music." Music Perception 19(3). Keil, C. (1987). "Participatory Discrepancies and the Power of Music." Cultural Anthropology 2(3).*

### 9.5 — Cross-Cultural Melodic Universals

Savage et al. (2015) and Mehr et al. (2019) identified statistical universals across 304 and 86 world societies respectively: melodies in all cultures use a small number of pitch classes (5–7 per octave), tend to use conjunct motion, have a predominant rhythmic pulse, and show arch-shaped contours. These universals can inform defaults — the generator's baseline behavior should be consistent with cross-cultural melodic intuition, with genre deviations building on top.

The most actionable universal: **arch-shaped contour with a climax at ~60–75% of phrase length** appears in folk song across all sampled cultures. The `classical` archetype in Phase 6 reflects this, and it should be the generator's true default.

*Reference: Savage, P.E., Brown, S., Sakai, E. & Currie, T.E. (2015). "Statistical universals reveal the structures and functions of human music." PNAS 112(29). Mehr, S.A. et al. (2019). "Universality and diversity in human song." Science 366(6468).*

### 9.6 — Musical Frisson and Dopamine Triggers

Valorie Salimpoor's neuroimaging research (2011) showed that musical chills (frisson) — the physical response to particularly moving musical moments — are associated with dopamine release in the nucleus accumbens, and that dopamine release peaks *before* the emotional climax (during anticipation), not at it. This is direct neuroscientific evidence for the importance of expectation management: the pleasure is in the anticipation, not just the delivery.

Compositional implications: the most emotionally powerful moments are those where expectation has been maximally built and then precisely fulfilled. The `ListenerExpectation` system's `payoff` operation corresponds directly to the conditions that trigger frisson: accumulated expectation, slight delay, then fulfillment on a rhythmically strong position.

*Reference: Salimpoor, V.N., Benovoy, M., Larcher, K., Dagher, A. & Zatorre, R.J. (2011). "Anatomically distinct dopamine release during anticipation and experience of peak emotion to music." Nature Neuroscience 14, 257–262.*

### 9.7 — Working Memory and Phrase Length

Bob Snyder's music and memory research (2000) proposes three timescales of musical processing: echoic memory (~250ms), short-term melodic memory (~8 seconds), and long-term musical memory. Phrases longer than 8 seconds are processed as multiple chunks rather than single events, which is why most melodic phrases in all cultures are 2–8 seconds long.

Implementation: add a `phraseCoherence` check that warns (or adjusts density) when a phrase at the current tempo would exceed 8 seconds, suggesting subdivision into shorter call/response units.

*Reference: Snyder, B. (2000). Music and Memory: An Introduction. MIT Press.*

### 9.8 — Music Transformer and Relative Attention

Huang et al.'s Music Transformer (2018) applied relative self-attention to symbolic music generation, enabling the model to learn long-range dependencies between musical events (motif recall across 8+ bars) that prior RNN-based models couldn't capture. The key insight was that music is fundamentally *relational* — events matter in relation to other events, not in isolation.

This research validates the MotifRecaller approach architecturally: what the Music Transformer learned statistically, the MotifRecaller implements deterministically. A future direction would be using a lightweight Music Transformer to dynamically weight which transformation to apply at each phrase boundary, informed by what has been generated so far.

*Reference: Huang, C.A. et al. (2018). "Music Transformer: Generating Music with Long-Term Structure." ICLR 2019. arXiv:1809.04281.*

### 9.9 — Adaptive Tension Curves and Emotional Trajectory

Klaus Scherer's research on music and emotion proposes that melodies communicate emotion through a combination of structural cues (tempo, mode, register, contour) and the history of those cues over time. A slow descent in minor mode following a rapid ascent in major has a different emotional character than the reverse — even if the notes are identical.

Implementation path: add a `EmotionalTrajectoryPlanner` that sequences aesthetic modes (cantabile → declamatory → sighs → cantabile) according to a target emotional arc (e.g., hope → urgency → grief → acceptance), rather than deriving modes purely from chord quality and tension values.

*Reference: Scherer, K.R. & Zentner, M.R. (2001). "Emotional effects of music: Production rules." In P.N. Juslin & J.A. Sloboda (Eds.), Music and Emotion. Oxford University Press.*

### 9.10 — Insights from the Most Enduring Works

The following compositional principles, extracted from analytical study of the most enduring works in Western and world music history, can each be implemented as generator behaviors:

**Bach (chorales, inventions, fugues):**
- Every phrase serves a harmonic function (tonic prolongation, dominant preparation, or cadential confirmation). Map phrase roles to harmonic function explicitly.
- Melodic sequences (the same motif repeated at a different pitch level) provide both variety and coherence simultaneously. The `applySequence` transform already exists; ensure it's used at `build` phrase roles.
- Affektenlehre: specific musical gestures reliably evoke specific affects (rising major sixth = joy; falling minor second = grief). Consider adding an `affekt` parameter to the aesthetic mode system.

**Beethoven (symphonies, piano sonatas):**
- Motivic economy: the entire first movement of the 5th Symphony derives from a 4-note cell. The generator's motif family is already this concept; reinforce by ensuring `fragmentMotif` (using only 2–3 notes) is used aggressively at `build` and `climax` roles.
- Surprising harmonizations of a simple melodic line create more interest than complex melodies over static harmony.
- Sketchbooks show iterative refinement — always trying simpler alternatives first. The generator should generate 2–3 candidates for structural skeleton and pick the one with the best voice-leading score.

**Schubert (Lieder, string quartets):**
- Phrase asymmetry (5-bar phrases, 7-bar phrases) creates a sense of genuine expressive searching rather than mechanical regularity. Add a `phraseAsymmetry` parameter that allows 5- and 7-step phrase structures.
- Chromatic mediant relationships (moving to a chord a major third away) sound more inevitable than they are. These are natural neighbors in `deduceChordRootAndQuality`.

**Brahms (symphonies, chamber music):**
- Developing variation means no two appearances of a motif are identical. The `mutateMotifFamily` function implements this; ensure mutation rate is always > 0 even at `statement` roles.
- Hemiola (3+3 against 2+2+2) creates rhythmic ambiguity that sounds searching. Consider adding hemiola as a rhythmic template option in `melodyRhythm.js`.

**Debussy (Préludes, La Mer):**
- Non-functional harmony means melodic notes don't need to resolve in traditional ways — they can float above static harmonic surfaces. This is the natural mode for `genre === 'ambient'` and certain microtonal tunings.
- Color over motion: sometimes staying on the same pitch with subtle ornament is more expressive than moving. Add a `pedal` option to the motif library where `directions` stays at 0 for multiple steps.

**Charlie Parker / Bebop:**
- The guide-tone line (Phase 7) is the core. Layer chromatic approach notes and enclosures above it.
- "Playing changes" means outlining each chord's specific identity rather than staying in a key. The `stableTones`-based generation already points this direction; bebop vocabulary pushes further.
- Rhythmic displacement: starting a phrase on beat 2 or the and-of-1 rather than the downbeat. Add this as an option in `generateRhythmTemplate`.

**Miles Davis (Kind of Blue, Sketches of Spain):**
- Negative space: what you don't play. The generator currently fills gaps; jazz phrasing often lets silence be expressive. Weight gaps more heavily in jazz mode, especially in `sighs` aesthetic mode.
- Modal not functional: melody doesn't need to "go somewhere" in a tonal sense. Over static Dorian or Mixolydian, melody explores the color of the mode rather than creating harmonic motion.

**Coltrane (A Love Supreme, Giant Steps):**
- "Sheets of sound": rapid scalar passages that imply multiple harmonies simultaneously. In generator terms: at high density in `virtuoso` mode, allow the scale pool to draw from both the current chord and the next chord simultaneously.
- Giant Steps uses II-V-I cycles in three tonal centers simultaneously. This is already a chord progression concern, but the melody needs to trace each tonal center's guide tones rapidly.

**The Beatles (Revolver, Abbey Road):**
- Single highest note: statistical analysis of Beatles melodies confirms that the highest note in a song almost always appears exactly once, creating a moment of maximum intensity. The register ceiling in Phase 4 enforces this directly.
- Surprising chord tones: landing on a 9th or 13th on a downbeat instead of the root creates freshness without dissonance. Weight `stableTones` to occasionally include tensions as structural notes.

**Stevie Wonder (Songs in the Key of Life, Innervisions):**
- Rhythmic displacement of melody against the beat — the melody's natural accent falls against the harmonic rhythm. Use `applyRhythmicVariation`'s shift feature to displace phrase starts by one or two steps.
- Modal mixture: freely drawing from parallel major and minor scales. Support this in `getLocalScaleMode` by allowing a `modalMixture` flag.

**Arvo Pärt (Spiegel im Spiegel, Für Alina):**
- Tintinnabuli method: one voice traces the tonic triad (the tintinnabuli voice), while another moves stepwise above or below. This is a specific two-voice texture where the melody is always triadic, never dissonant. Relevant for `genre === 'none'` ambient implementations.

**Harry Partch / Ben Johnston / La Monte Young (microtonal composers):**
- Partch's 43-tone system was built around just intonation harmonics. His melodies are inseparable from the tuning — each scale step has a specific consonant or dissonant identity relative to the harmonic series. The generator's `divisions` system supports this in principle; a future direction would be adding `justIntonation` as a mode where interval sizes are rational ratios rather than equal divisions.
- Ben Johnston's extended just intonation uses prime-limit ratios up to the 31-limit. The `buildScalePitches` function's `periodSize` parameter could support non-octave period sizes (Bohlen-Pierce uses 3:1, for example).




Bibliography:
## Research Reference Library

This section is a permanent reference for future enhancement ideas. Every entry below has direct implications for melody generation that have not yet been fully exploited.

### Music Cognition and Psychology

- **Huron, D. (2006). *Sweet Anticipation: Music and the Psychology of Expectation.* MIT Press.** — The foundational text for Phase 3.5. ITPRA model. Essential.
- **Meyer, L.B. (1956). *Emotion and Meaning in Music.* University of Chicago Press.** — Emotional meaning arises from expectation and its manipulation. Grandfather of all expectation models.
- **Narmour, E. (1990). *The Analysis and Cognition of Basic Melodic Structures.* University of Chicago Press.** — Implication-Realization model: specific melodic intervals imply specific continuations. Drives the voice-leading bias system.
- **Lerdahl, F. & Jackendoff, R. (1983). *A Generative Theory of Tonal Music.* MIT Press.** — Hierarchical phrase structure, grouping, and metrical theory. Basis for phrase grammar.
- **Snyder, B. (2000). *Music and Memory: An Introduction.* MIT Press.** — Working memory constraints on phrase length and musical chunking.
- **London, J. (2004). *Hearing in Time: Psychological Aspects of Musical Meter.* Oxford University Press.** — Rhythmic expectation and meter perception.
- **Krumhansl, C.L. (1990). *Cognitive Foundations of Musical Pitch.* Oxford University Press.** — Tonal hierarchy and key-finding. The empirical basis for weighting stable tones.
- **Deutsch, D. (Ed.) (2013). *The Psychology of Music.* 3rd ed. Academic Press.** — Comprehensive reference across all areas of music cognition.
- **Sloboda, J. (1985). *The Musical Mind: The Cognitive Psychology of Music.* Oxford University Press.** — How musicians conceptualize and produce music.
- **Bregman, A.S. (1990). *Auditory Scene Analysis: The Perceptual Organization of Sound.* MIT Press.** — Auditory streaming and Gestalt principles. Why voice-leading rules exist perceptually.
- **Clarke, E.F. (2005). *Ways of Listening: An Ecological Approach to the Perception of Musical Meaning.* Oxford University Press.** — Listening as active perception, not passive reception.
- **Zbikowski, L. (2002). *Conceptualizing Music: Cognitive Structure, Theory, and Analysis.* Oxford University Press.** — Conceptual blending and image schemas in music.

### Psychoacoustics and Neuroscience

- **Salimpoor, V.N. et al. (2011). "Anatomically distinct dopamine release during anticipation and experience of peak emotion to music." *Nature Neuroscience* 14, 257–262.** — Neuroimaging evidence that expectation, not mere stimulus, drives musical pleasure. Core justification for Phase 3.5.
- **Koelsch, S. (2011). *Brain and Music.* Wiley-Blackwell.** — Comprehensive neuroscience of music processing.
- **Zatorre, R.J. & Salimpoor, V.N. (2013). "From perception to pleasure: Music and its neural substrates." *PNAS* 110(Suppl. 2), 10430–10437.** — The pleasure circuit in musical experience.
- **Peretz, I. & Coltheart, M. (2003). "Modularity of music processing." *Nature Neuroscience* 6, 688–691.** — Pitch and rhythm are processed by separable cognitive modules.

### Information Theory and Probabilistic Models

- **Temperley, D. (2007). *Music and Probability.* MIT Press.** — Bayesian models of music perception and cognition.
- **Pearce, M.T. & Wiggins, G.A. (2006). "Expectation in Melody: The Influence of Context and Learning." *Music Perception* 22(2), 5–33.** — Empirical validation of IDyOM expectation model.
- **Pearce, M.T. (2005). *The Construction and Evaluation of Statistical Models of Melodic Structure in Music Perception and Composition.* PhD thesis, City University London.** — Full IDyOM specification.
- **Conklin, D. & Witten, I.H. (1995). "Multiple viewpoint systems for music prediction." *Journal of New Music Research* 24(1), 51–73.** — Multiple viewpoint framework for melodic prediction.
- **Shannon, C.E. (1951). "Prediction and entropy of printed English." *Bell System Technical Journal* 30(1), 50–64.** — Information theory applied to sequences; the intellectual ancestor of all statistical music models.

### Voice Leading and Music Theory

- **Tymoczko, D. (2011). *A Geometry of Music: Harmony and Counterpoint in the Extended Common Practice.* Oxford University Press.** — Voice leading as movement through pitch-class space. Geometric framework for Phase 5.
- **Lerdahl, F. (2001). *Tonal Pitch Space.* Oxford University Press.** — Quantifies psychological distance between pitches and chords. Basis for Phase 9.2.
- **Huron, D. (2001). "Tone and Voice: A Derivation of the Rules of Voice-Leading from Perceptual Principles." *Music Perception* 19(1), 1–64.** — Every classical voice-leading rule has a perceptual explanation. Essential for Phase 5.
- **Schoenberg, A. (1967). *Fundamentals of Musical Composition.* Faber & Faber.** — Developing variation as compositional method.
- **Cadwallader, A. & Gagné, D. (2010). *Analysis of Tonal Music: A Schenkerian Approach.* Oxford University Press.** — Accessible introduction to hierarchical melodic structure for Phase 9.3.

### Cross-Cultural Research

- **Savage, P.E., Brown, S., Sakai, E. & Currie, T.E. (2015). "Statistical universals reveal the structures and functions of human music." *PNAS* 112(29), 8987–8992.** — Universals across 304 world societies. Informs defaults.
- **Mehr, S.A. et al. (2019). "Universality and diversity in human song." *Science* 366(6468).** — 86-society study. Confirms arch contour and small pitch sets as universal.
- **Lomax, A. (1968). *Folk Song Style and Culture.* American Association for the Advancement of Science.** — Cantometrics: cross-cultural analysis of folk song style.
- **Nettl, B. (1983). *The Study of Ethnomusicology.* University of Illinois Press.** — Foundational ethnomusicology; non-Western melodic systems.

### Embodied Cognition and Groove

- **Iyer, V. (2002). "Embodied Mind, Situated Cognition, and Expressive Microtiming in African-American Music." *Music Perception* 19(3), 387–414.** — Groove as physical gesture. Basis for Phase 9.4.
- **Keil, C. (1987). "Participatory Discrepancies and the Power of Music." *Cultural Anthropology* 2(3), 275–283.** — Micro-timing deviations ("discrepancies") as the source of groove.
- **Pressing, J. (2002). "Black Atlantic Rhythm: Its Computational and Transcultural Foundations." *Music Perception* 19(3), 285–310.** — Rhythmic structures in African diaspora music.

### AI and Computational Music

- **Huang, C.A. et al. (2018). "Music Transformer: Generating Music with Long-Term Structure." *ICLR 2019.* arXiv:1809.04281.** — Relative self-attention for musical sequences. Validates and informs Phase 9.8.
- **Briot, J.P., Hadjeres, G. & Pachet, F.D. (2020). *Deep Learning Techniques for Music Generation.* Springer.** — Comprehensive survey of neural music generation.
- **Thickstun, J., Hall, D., Donahue, C. & Liang, P. (2023). "Anticipatory Music Transformer." arXiv:2306.08620.** — Infilling and anticipation in symbolic music generation.
- **Pachet, F. (2003). "The Continuator: Musical Interaction with Style." *Journal of New Music Research* 32(3), 333–341.** — Markov-based style continuation; Band-in-a-Box's intellectual cousin.
- **Fernández, J.D. & Vico, F. (2013). "AI Methods in Algorithmic Composition: A Comprehensive Survey." *Journal of Artificial Intelligence Research* 48, 513–582.** — Survey of all major algorithmic composition approaches.

### Microtonal Music

- **Partch, H. (1949/1974). *Genesis of a Music.* Da Capo Press.** — 43-tone just intonation system; philosophical and practical foundation for microtonal melody.
- **Johnston, B. (2006). *"Maximum Clarity" and Other Writings on Music.* University of Illinois Press.** — Extended just intonation up to 31-limit primes.
- **Helmholtz, H. (1877/1954). *On the Sensations of Tone.* Dover.** — The original scientific study of tuning, consonance, and dissonance. Still relevant.
- **Sethares, W.A. (1998). *Tuning, Timbre, Spectrum, Scale.* Springer.** — The relationship between timbre and tuning: consonance depends on which overtones are present, not just interval ratios. Directly relevant to microtonal melody with microtonal timbres.
- **Milne, A., Sethares, W. & Plamondon, J. (2007). "Isomorphic Controllers and Dynamic Tuning." *Computer Music Journal* 31(4).** — Generalizing scale theory to arbitrary tuning systems.

### Compositional Psychology

- **Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row.** — The psychological state of creative absorption; relevant to composing tool design.
- **Weisberg, R.W. (2006). *Creativity: Understanding Innovation in Problem Solving, Science, Invention, and the Arts.* Wiley.** — Beethoven's sketchbooks analyzed as evidence of iterative compositional process.
- **Sloboda, J. (2005). *Exploring the Musical Mind.* Oxford University Press.** — Essays on musical ability, development, and expertise.

### Emotion and Expression

- **Juslin, P.N. & Sloboda, J.A. (Eds.) (2010). *Handbook of Music and Emotion.* Oxford University Press.** — Comprehensive reference on music and emotion mechanisms.
- **Scherer, K.R. & Zentner, M.R. (2001). "Emotional effects of music: Production rules." In Juslin & Sloboda (Eds.), *Music and Emotion.*** — Structural cues that reliably evoke specific emotions.
- **Gabrielsson, A. (2011). "The relationship between musical structure and perceived expression." In Juslin & Sloboda (Eds.)** — How structural features map to expressive content.
