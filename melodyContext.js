/**
 * State context manager for the Melody Generator.
 * Isolates playback and generator state from global module scopes.
 */

export const defaultContext = (rng = null) => ({
    rng: rng || { next: () => Math.random() },
    motifCache: {},
    previousGenre: null,
    counterPhraseDirectionBias: 0,
    counterPhraseStepsRemaining: 0,
    counterLastPitch: null,
    songFormSection: 'A',
    sectionAMotifFamily: null,
    sectionARhythmTemplate: null,
    sectionAAestheticMode: null,
    sectionAChordRootPitch: null,
    stepsSinceLastSurprise: 10,
    noteCountThisPhrase: 0,
    forceContraryNext: false,
    forceTonicNext: false,
    globalPrevPitch: null,
    globalPrevCounterPitch: null,
    globalLastInterval: 0,
    globalMelodyHistory: [],
    phraseLocalScaleOffset: -1,
    globalPrevPitchIsColor: false,
    macroTargetPlan: null,
    phraseHighestPitch: null,
    songHighestPitch: null,
    peakPitchHitsCount: 0,
    activeAestheticMode: 'cantabile',
    phraseActivityCurve: [],
    phraseRhythmTemplate: [],
    phraseCounterRhythmTemplate: [],
    globalPrevAnchor: null,
    phraseRhythmicMotif: null,
    previousAbsIndex: -1,
    progressionLoopCounter: 0,
    prevSlotEndedWithRun: false,
    prevSlotRunRemainingLength: 0,
    prevSlotLastPitch: null,
    globalLastMelodyNoteTime: -999,
    globalLastCountermelodyNoteTime: -999,
    narrativeState: {
        consecutiveSteps: 0,
        lowRegisterBars: 0,
        motifRepeats: 0,
        phraseSubdivisions: []
    },
    // Professional Melody Generator State
    proPhraseArch: {
        climaxStep: null,
        climaxPitch: null,
        contourShape: null,
        phraseType: null,
        tensionCurve: [],
        cadenceTarget: null,
        cadenceMelodyDeg: null,
        cadenceStartStep: null,
        phraseLengthSteps: 16
    },
    proMotifRegistry: {
        stored: [],
        active: null,
        barsSinceReuse: 0,
        lastOperation: 'NONE',
        sequenceStreak: 0,
        lastSequenceInterval: 0
    },
    proTensionTracker: {
        value: 0.0,
        target: 0.0,
        consecutiveLeaps: 0,
        stepsInHighReg: 0,
        pendingResolution: false,
        resolutionDir: 0,
        dissonanceDebt: 0.0,
        blueNoteDebt: false
    },
    proRegisterTracker: {
        recent: [],
        phrasePeak: null,
        phraseFloor: null,
        climaxDelivered: false,
        stepsAtPeak: 0,
        lastLeapStep: -1
    },
    proRhythmicCohesion: {
        motif: [],
        established: false,
        syncopationUsed: 0,
        syncopationBudget: 4,
        lastNoteDuration: 0.0,
        hemiolaActive: false
    }
});
