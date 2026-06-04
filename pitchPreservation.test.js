import { getPlayableNotes } from './voiceLeading.js';
import { getChordNotes } from './theory.js';

describe('Pitch Offset Preservation on Chord Changes', () => {
    let mockState;
    
    beforeEach(() => {
        mockState = {
            baseKey: 60, // C
            divisions: 12,
            useVoiceLeading: false,
            currentProgression: [
                { symbol: 'I', key: 60, divisions: 12 }, // Index 0: C Major triad [60, 64, 67] -> plays [48, 52, 55] (12-TET baseKey=60)
                { symbol: 'IV', key: 60, divisions: 12 }  // Index 1: F Major triad [65, 69, 72] -> plays [53, 57, 60]
            ],
            temporarySwaps: {}
        };
    });

    it('should preserve pitches in unmodified slices and unchanged notes of modified slices during drag-rename', () => {
        const activeIndex = 0;
        const originalPlayable = getPlayableNotes(mockState.currentProgression, mockState)[activeIndex];
        // originalPlayable for C major (I) should be [48, 52, 55]
        expect(originalPlayable).toEqual([48, 52, 55]);

        // Simulate pattern with two instances (slices)
        // Instance 1: unmodified (all offsets 0, plays [48, 52, 55])
        const instUnmodified = { id: 'inst-unmod', pitchOffsets: [0, 0, 0], pitchOffset: 0 };
        // Instance 2: user modified index 1 (E -> Eb, 52 -> 51)
        const instModified = { id: 'inst-mod', pitchOffsets: [0, -1, 0], pitchOffset: 0 };

        // Calculate pitches for modified instance: [48, 51, 55] (C minor triad)
        const modifiedNotes = originalPlayable.map((n, i) => n + (instModified.pitchOffsets[i] || 0));
        expect(modifiedNotes).toEqual([48, 51, 55]);

        // Identify new chord name: 'i' (C minor)
        const newSymbol = 'i';
        mockState.temporarySwaps[activeIndex] = { symbol: newSymbol };

        // Get new playable notes under 'i' (C minor)
        const swappedProg = mockState.currentProgression.map((c, i) => {
            const swap = mockState.temporarySwaps[i];
            return swap ? { ...c, ...swap } : c;
        });
        const newPlayable = getPlayableNotes(swappedProg, mockState)[activeIndex];
        // 'i' should play C minor [48, 51, 55]
        expect(newPlayable).toEqual([48, 51, 55]);

        // Run the preservation logic for the unmodified instance
        const targetPitchesUnmodified = originalPlayable.map((n, i) => n + (instUnmodified.pitchOffsets[i] || 0)); // [48, 52, 55]
        const newOffsetsUnmodified = newPlayable.map((basePitch, i) => {
            const targetPitch = targetPitchesUnmodified[i] !== undefined ? targetPitchesUnmodified[i] : basePitch;
            return targetPitch - basePitch;
        });

        // The unmodified instance offsets should adjust to play the original [48, 52, 55] notes
        // Under 'i' ([48, 51, 55]), to play [48, 52, 55], offsets must be [0, 1, 0]
        expect(newOffsetsUnmodified).toEqual([0, 1, 0]);
        const resultingPitchesUnmodified = newPlayable.map((n, i) => n + newOffsetsUnmodified[i]);
        expect(resultingPitchesUnmodified).toEqual([48, 52, 55]); // Perfectly preserved!

        // Run the preservation logic for the modified instance
        const targetPitchesModified = originalPlayable.map((n, i) => n + (instModified.pitchOffsets[i] || 0)); // [48, 51, 55]
        const newOffsetsModified = newPlayable.map((basePitch, i) => {
            const targetPitch = targetPitchesModified[i] !== undefined ? targetPitchesModified[i] : basePitch;
            return targetPitch - basePitch;
        });

        // Under 'i' ([48, 51, 55]), to play [48, 51, 55], offsets must be [0, 0, 0]
        expect(newOffsetsModified).toEqual([0, 0, 0]);
        const resultingPitchesModified = newPlayable.map((n, i) => n + newOffsetsModified[i]);
        expect(resultingPitchesModified).toEqual([48, 51, 55]); // User's edit is preserved exactly!
    });

    it('should preserve pitches in all slices when changing chord name via dropdown', () => {
        const activeIndex = 0;
        const originalPlayable = getPlayableNotes(mockState.currentProgression, mockState)[activeIndex]; // [48, 52, 55]

        const inst1 = { id: 'inst-1', pitchOffsets: [0, 0, 0], pitchOffset: 0 };
        const inst2 = { id: 'inst-2', pitchOffsets: [1, 0, -1], pitchOffset: 0 }; // plays [49, 52, 54]

        // Swap base chord to 'IV' (F major) via dropdown simulation
        const newSymbol = 'IV';
        mockState.temporarySwaps[activeIndex] = { symbol: newSymbol };

        const swappedProg = mockState.currentProgression.map((c, i) => {
            const swap = mockState.temporarySwaps[i];
            return swap ? { ...c, ...swap } : c;
        });
        const newPlayable = getPlayableNotes(swappedProg, mockState)[activeIndex];
        // 'IV' under baseKey=60 is F Major (F A C) -> [53, 57, 60]
        expect(newPlayable).toEqual([53, 57, 60]);

        // Preservation calculation for inst1
        const targetPitches1 = originalPlayable.map((n, i) => n + (inst1.pitchOffsets[i] || 0)); // [48, 52, 55]
        const newOffsets1 = newPlayable.map((basePitch, i) => {
            const targetPitch = targetPitches1[i] !== undefined ? targetPitches1[i] : basePitch;
            return targetPitch - basePitch;
        });

        // To play [48, 52, 55] under IV base [53, 57, 60], offsets must be [-5, -5, -5]
        expect(newOffsets1).toEqual([-5, -5, -5]);
        expect(newPlayable.map((n, i) => n + newOffsets1[i])).toEqual([48, 52, 55]);

        // Preservation calculation for inst2
        const targetPitches2 = originalPlayable.map((n, i) => n + (inst2.pitchOffsets[i] || 0)); // [49, 52, 54]
        const newOffsets2 = newPlayable.map((basePitch, i) => {
            const targetPitch = targetPitches2[i] !== undefined ? targetPitches2[i] : basePitch;
            return targetPitch - basePitch;
        });

        // To play [49, 52, 54] under IV base [53, 57, 60], offsets must be [-4, -5, -6]
        expect(newOffsets2).toEqual([-4, -5, -6]);
        expect(newPlayable.map((n, i) => n + newOffsets2[i])).toEqual([49, 52, 54]);
    });

    it('should handle voice count changes gracefully when swapping between a triad and a seventh chord', () => {
        const activeIndex = 0;
        const originalPlayable = getPlayableNotes(mockState.currentProgression, mockState)[activeIndex]; // [48, 52, 55] (3 voices)

        const inst = { id: 'inst', pitchOffsets: [0, 2, 0], pitchOffset: 0 }; // plays [48, 54, 55]

        // Swap to 'Imaj7' (4 voices)
        const newSymbol = 'Imaj7';
        mockState.temporarySwaps[activeIndex] = { symbol: newSymbol };

        const swappedProg = mockState.currentProgression.map((c, i) => {
            const swap = mockState.temporarySwaps[i];
            return swap ? { ...c, ...swap } : c;
        });
        const newPlayable = getPlayableNotes(swappedProg, mockState)[activeIndex];
        // 'Imaj7': C E G B (60, 64, 67, 71) dropped by 12 -> [48, 52, 55, 59]
        expect(newPlayable).toEqual([48, 52, 55, 59]);

        // Preservation calculation:
        const targetPitches = originalPlayable.map((n, i) => n + (inst.pitchOffsets[i] || 0)); // [48, 54, 55] (length 3)
        const newOffsets = newPlayable.map((basePitch, i) => {
            const targetPitch = targetPitches[i] !== undefined ? targetPitches[i] : basePitch;
            return targetPitch - basePitch;
        });

        // Under Imaj7 [48, 52, 55, 59]:
        // Voice 0 target is 48 -> offset 0
        // Voice 1 target is 54 -> offset 2
        // Voice 2 target is 55 -> offset 0
        // Voice 3 has no target (original only had 3 voices) -> defaults to target=basePitch -> offset 0
        expect(newOffsets).toEqual([0, 2, 0, 0]);
        expect(newPlayable.map((n, i) => n + newOffsets[i])).toEqual([48, 54, 55, 59]);
    });
});
