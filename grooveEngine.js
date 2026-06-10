/**
 * grooveEngine.js
 * Centralized groove templates, swing calculations, and MIDI groove parsing.
 */

export const GROOVE_PRESETS = {
    none: { name: 'Straight', offsets: Array(16).fill(0) },
    swing: { name: '16th Swing', type: 'math' }, // Calculated mathematically
    shuffle: { name: '8th Shuffle', type: 'math' }, // Calculated mathematically
    latin: { 
        name: 'Latin Clave', 
        offsets: [
            0, 0, 0.02, -0.025,
            0, 0.015, 0.02, -0.02,
            0, 0, 0.015, -0.025,
            0, 0.02, 0.02, -0.015
        ] 
    },
    african: { 
        name: 'African Poly', 
        offsets: [
            0, 0.01, -0.02, 0.03,
            0, -0.025, 0.015, 0,
            -0.01, 0.02, -0.03, 0.025,
            0, -0.02, 0.01, 0
        ] 
    }
};

/**
 * Calculates the micro-timing offset (in beats) for a given beat position.
 * @param {number} beatPos - The absolute scheduled beat position.
 * @param {object} state - The global app state containing grooveSettings.
 * @returns {number} Offset in beats to add to the scheduled timing.
 */
export function getGrooveOffset(beatPos, state) {
    const swing = state.swing ?? 0.0;
    const preset = state.groovePreset ?? 'none';

    if (swing === 0.0 || preset === 'none') {
        return 0;
    }

    // Mathematical Swing
    if (preset === 'swing') {
        // 16th-note swing delays the offbeats (ending in 0.25 or 0.75 beats)
        const posInBeat = beatPos % 1.0;
        const tolerance = 0.01;
        
        // Check if we are close to an odd 16th step (0.25 or 0.75)
        const isOffbeat16th = Math.abs(posInBeat - 0.25) < tolerance || Math.abs(posInBeat - 0.75) < tolerance;
        if (isOffbeat16th) {
            // Maximum shift is 1/3 of a 16th note, which is 1/12 of a beat (~0.0833 beats)
            return swing * 0.0833;
        }
        return 0;
    }

    if (preset === 'shuffle') {
        // 8th-note shuffle delays the offbeats (ending in 0.5 beats)
        const posInBeat = beatPos % 1.0;
        const tolerance = 0.01;
        const isOffbeat8th = Math.abs(posInBeat - 0.5) < tolerance;
        if (isOffbeat8th) {
            // Maximum shift is 1/3 of an 8th note, which is 1/6 of a beat (~0.1667 beats)
            return swing * 0.1667;
        }
        return 0;
    }

    // Template-based grooves (presets or custom MIDI)
    let offsets = null;
    if (preset === 'custom' && Array.isArray(state.grooveTemplate)) {
        offsets = state.grooveTemplate.map(t => t.offset);
    } else if (GROOVE_PRESETS[preset] && GROOVE_PRESETS[preset].offsets) {
        offsets = GROOVE_PRESETS[preset].offsets;
    }

    if (offsets && offsets.length > 0) {
        // Map beat position to 16th step index
        const stepIndex = Math.round(beatPos * 4) % offsets.length;
        const rawOffset = offsets[stepIndex] || 0;
        // Scale the template offset by swing amount (intensity)
        return rawOffset * swing;
    }

    return 0;
}

/**
 * Parses a MIDI file (ArrayBuffer) to extract note-on timings for a groove template.
 * @param {ArrayBuffer} arrayBuffer - The binary MIDI file contents.
 * @returns {Array<{step: number, offset: number, velocityScale: number}>} Normalized 16-step groove template.
 */
export function parseMidiGroove(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    
    // 1. Verify Header
    if (view.byteLength < 14) throw new Error('Invalid MIDI file: too short');
    const headerSet = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (headerSet !== 'MThd') throw new Error('Invalid MIDI file: MThd header not found');

    const headerLength = view.getUint32(4);
    const format = view.getUint16(8);
    const numTracks = view.getUint16(10);
    const ticksPerQuarter = view.getUint16(12);

    if (ticksPerQuarter & 0x8000) {
        // Timecode format - not supported for simple groove templates
        throw new Error('SMPTE timecode in MIDI is not supported for grooves');
    }

    let offset = 8 + headerLength;
    const noteOnEvents = []; // Array of absolute beats and velocities

    // Helper to read variable length values
    function readVarLen(dataView, currentOffset) {
        let val = 0;
        let bytesRead = 0;
        while (true) {
            const b = dataView.getUint8(currentOffset + bytesRead);
            bytesRead++;
            val = (val << 7) | (b & 0x7F);
            if (!(b & 0x80)) break;
        }
        return { value: val, bytesRead };
    }

    // 2. Parse Tracks
    for (let t = 0; t < numTracks; t++) {
        if (offset >= view.byteLength) break;
        const trackHeader = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
        if (trackHeader !== 'MTrk') {
            // Skip invalid chunk
            offset += 8 + view.getUint32(offset + 4);
            continue;
        }
        const trackLength = view.getUint32(offset + 4);
        let trackOffset = offset + 8;
        const trackEnd = trackOffset + trackLength;

        let absoluteTicks = 0;
        let runningStatus = 0;

        while (trackOffset < trackEnd && trackOffset < view.byteLength) {
            // Delta time
            const deltaRes = readVarLen(view, trackOffset);
            trackOffset += deltaRes.bytesRead;
            absoluteTicks += deltaRes.value;

            let status = view.getUint8(trackOffset);
            if (status & 0x80) {
                runningStatus = status;
                trackOffset++;
            } else {
                status = runningStatus;
            }

            const eventType = status & 0xF0;
            const channel = status & 0x0F;

            if (eventType === 0x90) { // Note On
                const note = view.getUint8(trackOffset);
                const velocity = view.getUint8(trackOffset + 1);
                trackOffset += 2;

                const beatTime = absoluteTicks / ticksPerQuarter;
                if (velocity > 0) {
                    noteOnEvents.push({ beat: beatTime, velocity: velocity / 127 });
                }
            } else if (eventType === 0x80) { // Note Off
                trackOffset += 2;
            } else if (eventType === 0xA0) { // Poly Key Pressure
                trackOffset += 2;
            } else if (eventType === 0xB0) { // Control Change
                trackOffset += 2;
            } else if (eventType === 0xC0) { // Program Change
                trackOffset += 1;
            } else if (eventType === 0xD0) { // Channel Pressure
                trackOffset += 1;
            } else if (eventType === 0xE0) { // Pitch Bend
                trackOffset += 2;
            } else if (status === 0xFF) { // Meta Event
                const type = view.getUint8(trackOffset);
                trackOffset++;
                const lenRes = readVarLen(view, trackOffset);
                trackOffset += lenRes.bytesRead + lenRes.value;
            } else if (status === 0xF0 || status === 0xF7) { // Sysex
                const lenRes = readVarLen(view, trackOffset);
                trackOffset += lenRes.bytesRead + lenRes.value;
            } else {
                // Unknown status, skip one byte to avoid getting stuck
                trackOffset++;
            }
        }
        offset = trackEnd;
    }

    if (noteOnEvents.length === 0) {
        throw new Error('No note-on events found in MIDI file');
    }

    // 3. Construct 16-step template (4 beats loop)
    const template = Array(16).fill(null).map((_, i) => ({
        step: i,
        offset: 0,
        velocityScale: 1.0
    }));

    // Group notes by nearest 16th-note step within a 4-beat window
    const stepBinned = Array(16).fill(null).map(() => []);
    
    noteOnEvents.forEach(e => {
        const beatInLoop = e.beat % 4.0;
        const nearestStep = Math.round(beatInLoop * 4) % 16;
        const stepTargetBeat = nearestStep / 4.0;
        
        // Calculate deviation in beats
        let deviation = beatInLoop - stepTargetBeat;
        // Handle wrap-around boundary cases (e.g. 3.98 close to 0)
        if (deviation > 0.5) deviation -= 4.0;
        if (deviation < -0.5) deviation += 4.0;

        stepBinned[nearestStep].push({ deviation, velocity: e.velocity });
    });

    // Average the deviations and velocities for each step
    for (let i = 0; i < 16; i++) {
        const events = stepBinned[i];
        if (events.length > 0) {
            const avgDeviation = events.reduce((sum, ev) => sum + ev.deviation, 0) / events.length;
            const avgVelocity = events.reduce((sum, ev) => sum + ev.velocity, 0) / events.length;
            // Clamp offset to maximum of +/- half a 16th note (+/- 0.125 beats) to avoid steps crossing each other
            template[i].offset = Math.max(-0.125, Math.min(0.125, avgDeviation));
            template[i].velocityScale = avgVelocity;
        }
    }

    return template;
}
