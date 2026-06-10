/**
 * midiPhraseSelector.js
 * Parses binary MIDI files and extracts monophonic or polyphonic note sequences (motifs)
 * based on selected extraction modes and crop windows.
 */

/**
 * Parses a binary MIDI file into a raw array of note events.
 * @param {ArrayBuffer} arrayBuffer - The raw MIDI binary data.
 * @returns {Array<{pitch: number, time: number, duration: number, velocity: number}>} Notes sorted by start time.
 */
export function parseMidiNotes(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 14) throw new Error('Invalid MIDI file: too short');
    
    const headerSet = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (headerSet !== 'MThd') throw new Error('Invalid MIDI file: MThd header not found');

    const headerLength = view.getUint32(4);
    const format = view.getUint16(8);
    const numTracks = view.getUint16(10);
    const ticksPerQuarter = view.getUint16(12);

    if (ticksPerQuarter & 0x8000) {
        throw new Error('SMPTE timecode in MIDI is not supported for motifs');
    }

    let offset = 8 + headerLength;
    const rawNotes = []; // Temp note events
    const activeNotes = {}; // Key: channel_note, Value: { startTime, velocity }

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

    for (let t = 0; t < numTracks; t++) {
        if (offset >= view.byteLength) break;
        const trackHeader = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
        if (trackHeader !== 'MTrk') {
            offset += 8 + view.getUint32(offset + 4);
            continue;
        }
        const trackLength = view.getUint32(offset + 4);
        let trackOffset = offset + 8;
        const trackEnd = trackOffset + trackLength;

        let absoluteTicks = 0;
        let runningStatus = 0;

        while (trackOffset < trackEnd && trackOffset < view.byteLength) {
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
                const noteKey = `${channel}_${note}`;

                if (velocity > 0) {
                    // If a note-on exists already, close it first
                    if (activeNotes[noteKey]) {
                        const active = activeNotes[noteKey];
                        rawNotes.push({
                            pitch: note,
                            time: active.startTime,
                            duration: Math.max(0.01, beatTime - active.startTime),
                            velocity: active.velocity
                        });
                    }
                    activeNotes[noteKey] = { startTime: beatTime, velocity: velocity / 127 };
                } else {
                    // Note On with velocity 0 is treated as Note Off
                    if (activeNotes[noteKey]) {
                        const active = activeNotes[noteKey];
                        rawNotes.push({
                            pitch: note,
                            time: active.startTime,
                            duration: Math.max(0.01, beatTime - active.startTime),
                            velocity: active.velocity
                        });
                        delete activeNotes[noteKey];
                    }
                }
            } else if (eventType === 0x80) { // Note Off
                const note = view.getUint8(trackOffset);
                const velocity = view.getUint8(trackOffset + 1);
                trackOffset += 2;

                const beatTime = absoluteTicks / ticksPerQuarter;
                const noteKey = `${channel}_${note}`;

                if (activeNotes[noteKey]) {
                    const active = activeNotes[noteKey];
                    rawNotes.push({
                        pitch: note,
                        time: active.startTime,
                        duration: Math.max(0.01, beatTime - active.startTime),
                        velocity: active.velocity
                    });
                    delete activeNotes[noteKey];
                }
            } else if (eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
                trackOffset += 2;
            } else if (eventType === 0xC0 || eventType === 0xD0) {
                trackOffset += 1;
            } else if (status === 0xFF) { // Meta Event
                const type = view.getUint8(trackOffset);
                trackOffset++;
                const lenRes = readVarLen(view, trackOffset);
                trackOffset += lenRes.bytesRead + lenRes.value;
            } else if (status === 0xF0 || status === 0xF7) { // Sysex
                const lenRes = readVarLen(view, trackOffset);
                trackOffset += lenRes.bytesRead + lenRes.value;
            } else {
                trackOffset++;
            }
        }
        offset = trackEnd;
    }

    // Flush any dangling notes at the end of the track
    for (const noteKey in activeNotes) {
        const parts = noteKey.split('_');
        const note = parseInt(parts[1], 10);
        const active = activeNotes[noteKey];
        rawNotes.push({
            pitch: note,
            time: active.startTime,
            duration: 0.5,
            velocity: active.velocity
        });
    }

    // Sort by time, then pitch descending
    return rawNotes.sort((a, b) => {
        if (Math.abs(a.time - b.time) < 0.001) {
            return b.pitch - a.pitch;
        }
        return a.time - b.time;
    });
}

/**
 * Extracts and filters a list of notes according to the specified extraction mode.
 * @param {Array<{pitch: number, time: number, duration: number, velocity: number}>} rawNotes - The raw parsed notes.
 * @param {string} mode - The extraction mode (highest, lowest, soprano, alto, tenor, bass, arpeggiate, polyphonic).
 * @returns {Array<{pitch: number, time: number, duration: number, velocity: number, voiceIndex: number}>} Extracted notes.
 */
export function extractMotifNotes(rawNotes, mode) {
    if (rawNotes.length === 0) return [];

    // Polyphonic mode keeps everything
    if (mode === 'polyphonic') {
        return rawNotes.map(n => ({ ...n, voiceIndex: 0 }));
    }

    // Group notes that overlap or start close to each other
    // A simple way is to bin notes by start time (within a small tolerance, e.g. 0.05 beats)
    const groups = [];
    rawNotes.forEach(note => {
        let placed = false;
        for (const group of groups) {
            // If the note starts at a similar time to this group
            if (Math.abs(group[0].time - note.time) < 0.08) {
                group.push(note);
                placed = true;
                break;
            }
        }
        if (!placed) {
            groups.push([note]);
        }
    });

    const extracted = [];

    if (mode === 'arpeggiate') {
        // Unfold notes sequentially
        let currentTime = 0;
        groups.forEach(group => {
            // Sort group notes from lowest to highest
            const sortedGroup = [...group].sort((a, b) => a.pitch - b.pitch);
            const stepDuration = 0.25; // 16th note spacing
            sortedGroup.forEach((note, index) => {
                extracted.push({
                    pitch: note.pitch,
                    time: currentTime,
                    duration: stepDuration,
                    velocity: note.velocity,
                    voiceIndex: 0
                });
                currentTime += stepDuration;
            });
        });
        return extracted;
    }

    // Monophonic modes: pick one note per group
    groups.forEach(group => {
        // Group notes are already sorted descending by pitch (see parseMidiNotes sort)
        let selected = null;
        if (mode === 'highest' || mode === 'soprano') {
            selected = group[0];
        } else if (mode === 'lowest' || mode === 'bass') {
            selected = group[group.length - 1];
        } else if (mode === 'alto') {
            selected = group[1] || group[0];
        } else if (mode === 'tenor') {
            selected = group[2] || group[group.length - 1];
        } else {
            selected = group[0];
        }

        if (selected) {
            extracted.push({
                pitch: selected.pitch,
                time: selected.time,
                duration: selected.duration,
                velocity: selected.velocity,
                voiceIndex: 0
            });
        }
    });

    return extracted;
}
