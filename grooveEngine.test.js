import { getGrooveOffset, parseMidiGroove, GROOVE_PRESETS } from './grooveEngine.js';

describe('Groove Engine Logic', () => {
    describe('getGrooveOffset', () => {
        it('should return 0 when swing is 0 or preset is none', () => {
            const state1 = { swing: 0.0, groovePreset: 'swing' };
            const state2 = { swing: 0.5, groovePreset: 'none' };
            expect(getGrooveOffset(0.25, state1)).toBe(0);
            expect(getGrooveOffset(0.25, state2)).toBe(0);
        });

        it('should calculate 16th swing correctly on offbeats', () => {
            const state = { swing: 1.0, groovePreset: 'swing' };
            // On-beats should have no offset
            expect(getGrooveOffset(0.0, state)).toBe(0);
            expect(getGrooveOffset(0.5, state)).toBe(0);
            expect(getGrooveOffset(1.0, state)).toBe(0);

            // Offbeat 16ths (ending in 0.25 or 0.75) should be delayed
            expect(getGrooveOffset(0.25, state)).toBeCloseTo(0.0833);
            expect(getGrooveOffset(0.75, state)).toBeCloseTo(0.0833);

            // Half-swing should scale the offset
            const halfState = { swing: 0.5, groovePreset: 'swing' };
            expect(getGrooveOffset(0.25, halfState)).toBeCloseTo(0.04165);
        });

        it('should calculate 8th shuffle correctly on offbeats', () => {
            const state = { swing: 1.0, groovePreset: 'shuffle' };
            // On-beats and offbeat 16ths that are not 8ths should have no offset
            expect(getGrooveOffset(0.0, state)).toBe(0);
            expect(getGrooveOffset(0.25, state)).toBe(0);
            expect(getGrooveOffset(0.75, state)).toBe(0);

            // Offbeat 8ths (ending in 0.5) should be delayed
            expect(getGrooveOffset(0.5, state)).toBeCloseTo(0.1667);
            expect(getGrooveOffset(1.5, state)).toBeCloseTo(0.1667);

            // Half-swing should scale the offset
            const halfState = { swing: 0.5, groovePreset: 'shuffle' };
            expect(getGrooveOffset(0.5, halfState)).toBeCloseTo(0.08335);
        });

        it('should fetch and scale preset template offsets correctly', () => {
            const state = { swing: 0.5, groovePreset: 'latin' };
            const rawPresetOffsets = GROOVE_PRESETS.latin.offsets;

            // Step 2 corresponds to beat 0.5 (2 / 4)
            const expectedOffset = rawPresetOffsets[2] * 0.5;
            expect(getGrooveOffset(0.5, state)).toBeCloseTo(expectedOffset);
        });
    });

    describe('parseMidiGroove', () => {
        it('should parse a minimal valid MIDI buffer and return a 16-step template', () => {
            // Construct a minimal type 0 MIDI file in memory
            // Header: 'MThd' (4 bytes), length (4 bytes = 6), format (2 bytes = 0), tracks (2 bytes = 1), division (2 bytes = 96)
            const header = [
                0x4d, 0x54, 0x68, 0x64, // MThd
                0x00, 0x00, 0x00, 0x06, // length
                0x00, 0x00,             // format 0
                0x00, 0x01,             // 1 track
                0x00, 0x60              // 96 ticks per quarter note
            ];

            // Track: 'MTrk' (4 bytes), length (4 bytes)
            // Let's create track data:
            // Delta-time = 0, Note On: status 0x90, note 60, velocity 100
            // Delta-time = 96 (0x60, one beat), Note On: status 0x90, note 60, velocity 100
            // Delta-time = 96, Note Off: status 0x80, note 60, velocity 0
            const trackData = [
                0x00,                   // delta 0
                0x90, 0x3c, 0x64,       // note on, C4, vel 100
                0x60,                   // delta 96 (var-length 0x60)
                0x90, 0x3c, 0x64,       // note on, C4, vel 100
                0x60,                   // delta 96
                0x80, 0x3c, 0x00        // note off, C4, vel 0
            ];

            const trackLength = trackData.length;
            const trackHeader = [
                0x4d, 0x54, 0x72, 0x6b, // MTrk
                (trackLength >> 24) & 0xff,
                (trackLength >> 16) & 0xff,
                (trackLength >> 8) & 0xff,
                trackLength & 0xff
            ];

            const midiBytes = new Uint8Array([...header, ...trackHeader, ...trackData]);
            const template = parseMidiGroove(midiBytes.buffer);

            expect(template.length).toBe(16);
            expect(template[0].step).toBe(0);
            expect(template[4].step).toBe(4);
            expect(template[0].velocityScale).toBeCloseTo(100 / 127);
        });

        it('should throw error on invalid headers', () => {
            const badBuffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
            expect(() => parseMidiGroove(badBuffer.buffer)).toThrow();
        });
    });
});
