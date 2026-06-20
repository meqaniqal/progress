import { determineAestheticMode, planCountermelodyDirection, handleSongForm, resolveMotifFamily, getSectionNameType } from './melodyMacro.js';
import { defaultContext } from './melodyContext.js';
import { state } from './store.js';

describe('melodyMacro Phrase and Song Form Planning', () => {
    let context;
    let settings;

    beforeEach(() => {
        context = defaultContext();
        settings = {
            genre: 'classical',
            density: 0.5,
            restProbability: 0.1,
            shortestNoteLimit: 16,
            variationDepth: 0.5,
            macroPlannerEnabled: false,
            tensionCurve: 'flat',
            motifRecurrence: 0.8
        };
    });

    test('determineAestheticMode determines aesthetic mode based on chord quality', () => {
        const chordObj = { symbol: 'I', duration: 4 };
        determineAestheticMode(context, 0, 4, settings, chordObj, 12, 60);

        expect(context.activeAestheticMode).toBeDefined();
        // Since absIndex % 4 === 0, it should initialize narrativeState.phraseSubdivisions
        expect(context.narrativeState.phraseSubdivisions.length).toBe(16);
    });

    test('planCountermelodyDirection sets countermelody direction bias', () => {
        context.globalPrevAnchor = 72;
        planCountermelodyDirection(context, 0, 60); // keyRoot 60, incoming keyRoot + 12 = 72. equal to outgoing.
        expect(context.counterPhraseStepsRemaining).toBe(6);
        expect(context.counterPhraseDirectionBias).toBeDefined();
    });

    test('handleSongForm stores Section A material and recalls in A_prime', () => {
        const initialMotifs = {
            hook: [60, 62, 64],
            connector: [64, 62, 60],
            cadence: [60, 60],
            hookRhythm: [4, 4, 4]
        };

        context.songFormSection = 'A';
        context.phraseRhythmTemplate = [1, 0, 1, 0];
        context.activeAestheticMode = 'cantabile';

        const outputA = handleSongForm(
            context,
            0,
            60,
            60,
            12,
            settings,
            [60, 62, 64, 65, 67, 69, 71, 72],
            [60, 62, 64, 65, 67, 69, 71, 72],
            initialMotifs
        );

        expect(context.sectionAMotifFamily).toBeDefined();
        expect(context.sectionAMotifFamily.hook).toEqual([60, 62, 64]);
        expect(outputA).toBe(initialMotifs);

        // Transition to A_prime
        context.songFormSection = 'A_prime';
        const outputAPrime = handleSongForm(
            context,
            4,
            62, // root shifts up by 2 semitones
            60,
            12,
            settings,
            [60, 62, 64, 65, 67, 69, 71, 72],
            [60, 62, 64, 65, 67, 69, 71, 72],
            initialMotifs
        );

        expect(outputAPrime).not.toBe(initialMotifs);
        expect(outputAPrime.hook).toBeDefined();
        expect(context.phraseRhythmTemplate).toEqual([1, 0, 1, 0]);
    });

    test('getSectionNameType maps section names to types', () => {
        const mockChord = { symbol: 'I' };
        const mockState = {
            sections: {
                'sec-1': { name: 'Verse 1', progression: [mockChord] }
            }
        };
        const type = getSectionNameType(mockState, mockChord);
        expect(type).toBe('verse');
    });

    test('resolveMotifFamily resets motif library when genre changes', () => {
        context.motifCache = { 'verse_60_major': {} };
        context.previousGenre = 'classical';

        const newSettings = { ...settings, genre: 'jazz' };
        const mockChord = { symbol: 'I' };
        const mockState = {
            baseKey: 60,
            mode: 'major',
            sections: {
                'sec-1': { name: 'Verse 1', progression: [mockChord] }
            }
        };

        const result = resolveMotifFamily(
            context,
            mockState,
            newSettings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChord,
            context.narrativeState
        );

        // Motif cache should have been cleared, previousGenre updated, and new motif generated
        expect(context.previousGenre).toBe('jazz');
        expect(context.motifCache['verse_60_major']).toBe(result);
    });

    test('Section-based Motif Sharing: verse1 and verse2 share motifs, bridge is distinct', () => {
        const mockChordVerse1 = { symbol: 'I' };
        const mockChordVerse2 = { symbol: 'IV' };
        const mockChordBridge = { symbol: 'V' };

        const mockState = {
            baseKey: 60,
            mode: 'major',
            sections: {
                'sec-v1': { name: 'Verse 1', progression: [mockChordVerse1] },
                'sec-v2': { name: 'Verse 2', progression: [mockChordVerse2] },
                'sec-br': { name: 'Bridge', progression: [mockChordBridge] }
            }
        };

        // Enforce motif recurrence to prevent random regeneration
        settings.motifRecurrence = 1.0;
        
        // 1. Resolve motif for Verse 1 (populates cache)
        const motifV1 = resolveMotifFamily(
            context,
            mockState,
            settings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChordVerse1,
            context.narrativeState
        );

        // 2. Resolve motif for Verse 2 (should share/retrieve from the same verse cache entry)
        // Ensure rng returns > 0.1 to avoid cross-type mixing for this check
        let originalNext = context.rng.next;
        context.rng.next = () => 0.5;

        const motifV2 = resolveMotifFamily(
            context,
            mockState,
            settings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChordVerse2,
            context.narrativeState
        );

        expect(motifV2).toBe(motifV1); // shared!

        // 3. Resolve motif for Bridge (should be distinct)
        const motifBridge = resolveMotifFamily(
            context,
            mockState,
            settings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChordBridge,
            context.narrativeState
        );

        expect(motifBridge).not.toBe(motifV1); // distinct!
        context.rng.next = originalNext;
    });

    test('Cross-type motif mixing: 10% chance retrieves from other sections', () => {
        const mockChordVerse = { symbol: 'I' };
        const mockChordChorus = { symbol: 'IV' };

        const mockState = {
            baseKey: 60,
            mode: 'major',
            sections: {
                'sec-v': { name: 'Verse', progression: [mockChordVerse] },
                'sec-c': { name: 'Chorus', progression: [mockChordChorus] }
            }
        };

        settings.motifRecurrence = 1.0;

        // Populate chorus motif
        const motifChorus = resolveMotifFamily(
            context,
            mockState,
            settings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChordChorus,
            context.narrativeState
        );

        // Force rng.next() to return < 0.1 to trigger cross-mixing when resolving Verse
        let callCount = 0;
        context.rng.next = () => {
            callCount++;
            if (callCount === 1) return 0.05; // Force cross-mixing chance check to pass (< 0.10)
            return 0.5; // Defaults for other checks
        };

        const motifVerseMixed = resolveMotifFamily(
            context,
            mockState,
            settings,
            [60, 62, 64],
            [],
            [60, 62, 64],
            { divisions: 12, periodSize: 12 },
            context.rng,
            mockChordVerse,
            context.narrativeState
        );

        expect(motifVerseMixed).toBe(motifChorus); // Verse mixed in Chorus motif!
    });
});

