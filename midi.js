import { getChordNotes, getPlayableNotes, getEffectiveTuning, snapToGrid, getBassNote, getPitchEditorTuning } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { resolvePattern } from './patternResolver.js';
import { evaluateVerticalSlices } from './transitionEvaluator.js';
import { state as appState, getActiveProgression } from './store.js';
import { isSongTrayOpen } from './songController.js';

function getMpePitchBend(floatPitch, bendRange = 2) {
    const intNote = Math.round(floatPitch);
    const bendSemitones = floatPitch - intNote;
    // 14-bit MIDI pitch bend: 0 to 16383, center is 8192.
    // Formula: center + (bend_in_semitones / max_bend_range) * center
    const bendValue = Math.round(8192 + (bendSemitones / bendRange) * 8192);
    return { 
        intNote, 
        bendValue: Math.max(0, Math.min(16383, bendValue)) 
    };
}

function getLinearMidiKey(floatPitch, tuning) {
    return 60 + Math.round((floatPitch - 60) * (tuning.divisions / tuning.periodSize));
}

export function exportScalaFile(divisions) {
    let periodCents = 1200;
    let name = `${divisions}-TET`;

    if (divisions === 13) {
        periodCents = 1200 * Math.log2(3); // 1901.955
        name = `Bohlen-Pierce_13-ED3`;
    } else if (divisions === 5) {
        name = `Slendro_5-EDO`;
    } else if (divisions !== 12) {
        name = `${divisions}-EDO`;
    } else {
        name = `12-TET_Standard`;
    }

    let content = `! ${name}.scl\n!\nProgress App Generated Tuning\n ${divisions}\n!\n`;
    const stepCents = periodCents / divisions;
    for (let i = 1; i <= divisions; i++) {
        content += ` ${(i * stepCents).toFixed(5)}\n`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.scl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function exportTunFile(divisions) {
    let periodCents = 1200;
    let name = `${divisions}-TET`;

    if (divisions === 13) {
        periodCents = 1200 * Math.log2(3);
        name = `Bohlen-Pierce_13-ED3`;
    } else if (divisions === 5) {
        name = `Slendro_5-EDO`;
    } else if (divisions !== 12) {
        name = `${divisions}-EDO`;
    } else {
        name = `12-TET_Standard`;
    }

    let content = `; ${name}\n[Scale Begin]\nFormat= "AnaMark-TUN"\nFormatVersion= 200\n\n[Info]\nName= "${name}"\n\n[Exact Tuning]\n`;
    const stepCents = periodCents / divisions;
    for (let i = 0; i < 128; i++) {
        const cents = 6000 + (i - 60) * stepCents;
        content += `note ${i}= ${cents.toFixed(6)}\n`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.tun`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function exportToMidi(state) {
    if (state.currentProgression.length === 0) {
        alert("Please add some chords to the progression first!");
        return;
    }

    let midiNotesToWrite = [];
    let exportProgression = [];
    let trueStartIndex = 0;
    let trueProgressionLength = state.currentProgression.length;

    if (!isSongTrayOpen) {
        const fullProgression = getActiveProgression();
        midiNotesToWrite = getPlayableNotes(fullProgression, state);
        trueStartIndex = appState.loopStart ?? 0;
        trueProgressionLength = fullProgression.length;
        exportProgression = state.currentProgression;
    } else {
        let currentChunk = [];
        for (let i = 0; i < state.currentProgression.length; i++) {
            const chord = state.currentProgression[i];
            if (chord._isSectionStart && currentChunk.length > 0) {
                midiNotesToWrite = midiNotesToWrite.concat(getPlayableNotes(currentChunk, state));
                currentChunk = [];
            }
            currentChunk.push(chord);
        }
        if (currentChunk.length > 0) {
            midiNotesToWrite = midiNotesToWrite.concat(getPlayableNotes(currentChunk, state));
        }
        const startIndex = state.loopStart ?? 0;
        const endIndex = (state.loopEnd > startIndex) ? state.loopEnd : state.currentProgression.length;
        exportProgression = state.currentProgression.slice(startIndex, endIndex);
        trueStartIndex = startIndex;
        trueProgressionLength = state.currentProgression.length;
    }

    const isMultiTrack = state.midiExportRouting === 'multi-track';
    const isClean = state.midiExportRouting === 'clean';
    let chordTracks = [];
    let currentChordTicks = [];

    function getChordTrack(idx) {
        if (!chordTracks[idx]) {
            const trk = new MidiWriter.Track();
            trk.addTrackName(isMultiTrack ? `Progress chords ${idx + 1}` : 'Progress chords');
            trk.addEvent(new MidiWriter.ProgramChangeEvent({instrument: CONFIG.MIDI_INSTRUMENT_PIANO}));
            trk.setTempo(state.bpm);
            trk.addEvent(new MidiWriter.TimeSignatureEvent(4, 4, 24, 8));
            chordTracks[idx] = trk;
            currentChordTicks[idx] = 0;
        }
        return chordTracks[idx];
    }

    // Ensure at least 1 track exists for MPE mode to inherit the tempo event
    getChordTrack(0);

    let slotStartTick = 0;
    
    const chordsVol = state.volumes ? state.volumes.chords : 0.8;
    const bassVol = state.volumes ? state.volumes.bass : 0.8;
    const drumsVol = state.volumes ? state.volumes.drums : 0.8;

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        // Add polyrhythmic chords and arpeggios to track
        exportProgression.forEach((chord, index) => {
            const isLastMacroChord = pass === (state.exportPasses || 1) - 1 && index === exportProgression.length - 1;
            const absIndex = trueStartIndex + index;
            const chordNotes = midiNotesToWrite[absIndex];
            
            const globalTuning = getEffectiveTuning(null, state.divisions || 12);
            const chordTuning = getEffectiveTuning(chord.symbol, chord.divisions || state.divisions || 12);
            const cleanTuning = globalTuning; // Clean MIDI must map all chords to the global .tun file grid
            
            let pattern = chord.chordPattern;
            let isGlobalChord = false;
            if (pattern && !pattern.isLocalOverride && state.globalPatterns && state.globalPatterns.chordPattern) {
                pattern = state.globalPatterns.chordPattern;
                isGlobalChord = true;
            }
            pattern = pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            pattern = resolvePattern(pattern, isGlobalChord, Number(chord.duration) || 2);
            
            const beats = Number(chord.duration) || 2;
            const slotTicks = beats * 128;
            const chordDurationSec = (60.0 / Number(state.bpm)) * beats;

            const prevNotes = midiNotesToWrite[(absIndex - 1 + trueProgressionLength) % trueProgressionLength] || chordNotes;
            const nextNotes = midiNotesToWrite[(absIndex + 1) % trueProgressionLength] || chordNotes;

            const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || state.divisions || 12);

            const slicedInstances = evaluateVerticalSlices(
                pattern.instances,
                pattern.transitions || [],
                chordNotes,
                prevNotes,
                nextNotes,
                editorTuning,
                false,
                chordDurationSec
            );

            // Sort instances by startTime to ensure sequential MIDI rendering
            const instances = [...slicedInstances].sort((a, b) => a.startTime - b.startTime);

            let currentChannel = 2; // MPE Channels 2-15

            instances.forEach(instance => {
                if (!instance.willPlay) return;
                const isLastInstance = instance === instances[instances.length - 1];
                const useFullDuration = isLastMacroChord && isLastInstance;

                const instanceStartTick = slotStartTick + Math.round(instance.startTime * slotTicks);
                const instanceDurationTicks = Math.round(instance.duration * slotTicks);
                const instanceDurationSec = instance.duration * chordDurationSec;
                
                const adjustedChordNotes = instance.adjustedNotes;

                if (instance.arpSettings) {
                    const arpEvents = generateArpNotes({
                        notesToPlay: adjustedChordNotes,
                        arpSettings: instance.arpSettings,
                        instanceDuration: instanceDurationSec,
                        bpm: Number(state.bpm)
                    });

                    arpEvents.forEach(event => {
                        const noteStartTick = instanceStartTick + Math.round(event.startTime * (state.bpm / 60) * 128);
                        const noteDurationTicks = Math.max(1, Math.round(event.duration * (state.bpm / 60) * 128));
                        const { intNote, bendValue } = getMpePitchBend(event.note);

                        let arpPitch = intNote;
                        if (isClean) {
                            arpPitch = getLinearMidiKey(event.note, cleanTuning);
                            arpPitch = Math.max(0, Math.min(127, arpPitch));
                        }

                        const targetTrack = getChordTrack(0);
                        const targetChannel = isMultiTrack ? 1 : currentChannel;
                        if (!isMultiTrack) currentChannel = currentChannel >= 15 ? 2 : currentChannel + 1;

                        const waitTicks = Math.max(0, noteStartTick - currentChordTicks[0]);
                        const events = [];
                        if (!isClean) {
                            events.push(new MidiWriter.PitchBendEvent({
                                bend: bendValue,
                                channel: targetChannel,
                                wait: `T${waitTicks}`
                            }));
                        }

                        events.push(new MidiWriter.NoteEvent({
                            pitch: [arpPitch],
                            duration: `T${noteDurationTicks}`,
                            wait: `T${waitTicks}`,
                            velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8))),
                            channel: targetChannel
                        }));
                        targetTrack.addEvent(events, {sequential: false});
                        currentChordTicks[0] += waitTicks + noteDurationTicks;
                    });
                } else {
                    const noteStartTick = instanceStartTick;
                    const actualNoteDurationTicks = useFullDuration ? instanceDurationTicks : Math.round(instanceDurationTicks * 0.95);

                    if (isMultiTrack) {
                        adjustedChordNotes.forEach((floatNote, noteIdx) => {
                            const targetTrack = getChordTrack(noteIdx);
                            const waitTicks = Math.max(0, noteStartTick - currentChordTicks[noteIdx]);
                            const { intNote, bendValue } = getMpePitchBend(floatNote);
                            
                            let multiPitch = intNote;
                            if (isClean) {
                                multiPitch = getLinearMidiKey(floatNote, cleanTuning);
                                multiPitch = Math.max(0, Math.min(127, multiPitch));
                            }

                            const events = [];
                            if (!isClean) {
                                events.push(new MidiWriter.PitchBendEvent({ bend: bendValue, channel: 1, wait: `T${waitTicks}` }));
                            }
                            events.push(new MidiWriter.NoteEvent({
                                pitch: [multiPitch], duration: `T${actualNoteDurationTicks}`, wait: `T${waitTicks}`,
                                velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8))), channel: 1
                            }));
                            
                            targetTrack.addEvent(events, {sequential: false});
                            currentChordTicks[noteIdx] += waitTicks + actualNoteDurationTicks;
                        });
                    } else {
                        const targetTrack = getChordTrack(0);
                        const waitTicks = Math.max(0, noteStartTick - currentChordTicks[0]);
                        const events = [];

                        if (isClean) {
                            const pitches = adjustedChordNotes.map(n => {
                                let p = getLinearMidiKey(n, cleanTuning);
                                return Math.max(0, Math.min(127, p));
                            });
                            
                            events.push(new MidiWriter.NoteEvent({
                                pitch: pitches,
                                duration: `T${actualNoteDurationTicks}`,
                                wait: `T${waitTicks}`,
                                velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8))),
                                channel: 1
                            }));
                        } else {
                            adjustedChordNotes.forEach((floatNote, idx) => {
                                const { intNote, bendValue } = getMpePitchBend(floatNote);
                                const targetChannel = currentChannel;
                                currentChannel = currentChannel >= 15 ? 2 : currentChannel + 1;
                                const isLast = idx === adjustedChordNotes.length - 1;

                                events.push(new MidiWriter.PitchBendEvent({ bend: bendValue, channel: targetChannel, wait: `T${waitTicks}` }));
                                events.push(new MidiWriter.NoteEvent({
                                    pitch: [intNote], duration: `T${actualNoteDurationTicks}`, wait: `T${waitTicks}`,
                                    velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8))), channel: targetChannel,
                                }));
                            });
                        }
                        
                        targetTrack.addEvent(events, {sequential: false});
                        currentChordTicks[0] += waitTicks + actualNoteDurationTicks;
                    }
                }
            });
            
            slotStartTick += slotTicks;
        });
    }

    // Add a bass line! (Root notes played down two octaves)
    const bassTrack = new MidiWriter.Track();
    bassTrack.addTrackName('Progress bass');
    bassTrack.setTempo(state.bpm);
    let currentBassGlobalTick = 0;
    let bassSlotStartTick = 0;
    let hasBassNotes = false;

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        exportProgression.forEach((chord, index) => {
            const isLastMacroChord = pass === (state.exportPasses || 1) - 1 && index === exportProgression.length - 1;
            
            const chordTuning = getEffectiveTuning(chord.symbol, chord.divisions || state.divisions || 12);
            const cleanTuning = getEffectiveTuning(null, state.divisions || 12);
            
            const rootChordNotes = getChordNotes(chord.symbol, chord.key, chordTuning.divisions);
            if (!rootChordNotes) return;
            const rootNote = getBassNote(rootChordNotes, chordTuning); 
            const beats = Number(chord.duration) || 2;
            const slotTicks = beats * 128;
            
            let bPattern = chord.bassPattern;
            let isGlobalBass = false;
            if (bPattern && !bPattern.isLocalOverride && state.globalPatterns && state.globalPatterns.bassPattern) {
                bPattern = state.globalPatterns.bassPattern;
                isGlobalBass = true;
            }
            bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            bPattern = resolvePattern(bPattern, isGlobalBass, beats);

            const instances = [...bPattern.instances].sort((a, b) => a.startTime - b.startTime);
            
            instances.forEach(instance => {
                hasBassNotes = true;

                const isLastInstance = instance === instances[instances.length - 1];
                const useFullDuration = isLastMacroChord && isLastInstance;

                const instanceStartTick = bassSlotStartTick + Math.round(instance.startTime * slotTicks);
                const instanceDurationTicks = useFullDuration ? Math.round(instance.duration * slotTicks) : Math.round(instance.duration * slotTicks * 0.95);
                const waitTicks = Math.max(0, instanceStartTick - currentBassGlobalTick);

                const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || state.divisions || 12);
                const snappedOffset = snapToGrid(60 + (instance.pitchOffset || 0), editorTuning) - 60;
                const finalBassNote = rootNote + snappedOffset;
                const { intNote, bendValue } = getMpePitchBend(finalBassNote);

                let bassPitch = intNote;
                if (isClean) {
                    // Shift the float pitch up exactly 2 octaves (+24.0) to guarantee positive MIDI keys.
                    // This perfectly preserves the linear intervals. The user simply lowers Serum by -2 Octaves.
                    const safeFloatPitch = finalBassNote + 24.0;
                    bassPitch = getLinearMidiKey(safeFloatPitch, cleanTuning);
                    bassPitch = Math.max(0, Math.min(127, bassPitch));
                }

                const events = [];
                if (!isClean) {
                    events.push(new MidiWriter.PitchBendEvent({
                        bend: bendValue,
                        channel: 1,
                        wait: `T${waitTicks}`
                    }));
                }

                events.push(new MidiWriter.NoteEvent({ 
                    pitch: [bassPitch], 
                    duration: `T${instanceDurationTicks}`, 
                    wait: `T${waitTicks}`,
                    velocity: Math.min(127, Math.round(CONFIG.MIDI_BASS_VELOCITY * (bassVol / 0.8))),
                    channel: 1
                }));
                bassTrack.addEvent(events, {sequential: false});
                currentBassGlobalTick += waitTicks + instanceDurationTicks;
            });

            bassSlotStartTick += slotTicks;
        });
    }

    // --- Add Drum Track (Channel 10) ---
    const drumTrack = new MidiWriter.Track();
    drumTrack.addTrackName('Progress drums');
    drumTrack.setTempo(state.bpm);
    // MIDI Channel 10 is reserved for Percussion (MidiWriter uses 1-based indexing, so channel: 10)
    let currentDrumGlobalTick = 0;
    let drumSlotStartTick = 0;
    let currentDrumBeat = 0;
    let hasDrumNotes = false;
    
    const DRUM_MIDI_MAP = {
        'kick': 36, // C1 (General MIDI Bass Drum 1)
        'snare': 38, // D1 (General MIDI Acoustic Snare)
        'chh': 42,  // F#1 (General MIDI Closed Hi-Hat)
        'ohh': 46   // A#1 (General MIDI Open Hi-Hat)
    };

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        exportProgression.forEach(chord => {
            const beats = Number(chord.duration) || 2;
            const slotTicks = beats * 128;
            const drumPat = chord.drumPattern;
            
            let hitsToPlay = [];

            if (drumPat && drumPat.isLocalOverride) {
                if (drumPat.hits) {
                    for (const hit of drumPat.hits) {
                        hitsToPlay.push({ ...hit, absBeat: hit.time * beats });
                    }
                }
            } else if (state.globalPatterns && state.globalPatterns.drumPattern) {
                const globalDrumPat = state.globalPatterns.drumPattern;
                const gLength = globalDrumPat.lengthBeats || 4;
                
                if (globalDrumPat.hits) {
                    for (const hit of globalDrumPat.hits) {
                        if (hit.time >= 1.0) continue; // Non-destructive truncation
                        const hitBeatOffset = hit.time * gLength;
                        let loopStartBeat = Math.floor(currentDrumBeat / gLength) * gLength;
                        
                        let absoluteHitBeat = Math.round((loopStartBeat + hitBeatOffset) * 10000) / 10000;
                        let currentDrumBeatRounded = Math.round(currentDrumBeat * 10000) / 10000;
                        let chordEndBeatRounded = Math.round((currentDrumBeat + beats) * 10000) / 10000;
                        
                        if (absoluteHitBeat < currentDrumBeatRounded) absoluteHitBeat += gLength;
                        
                        while (absoluteHitBeat < chordEndBeatRounded) {
                            hitsToPlay.push({ ...hit, absBeat: absoluteHitBeat - currentDrumBeatRounded });
                            absoluteHitBeat += gLength;
                            absoluteHitBeat = Math.round(absoluteHitBeat * 10000) / 10000;
                        }
                    }
                }
            }

            // Group simultaneous hits to avoid sequential offset issues in MidiWriterJS
            const groupedHits = {};
            hitsToPlay.forEach(hit => {
                const tick = drumSlotStartTick + Math.round(hit.absBeat * 128);
                if (!groupedHits[tick]) groupedHits[tick] = { pitches: [], velocity: 0 };
                groupedHits[tick].pitches.push(DRUM_MIDI_MAP[hit.row] || 36);
                groupedHits[tick].velocity = Math.min(127, Math.max(groupedHits[tick].velocity, Math.round((hit.velocity || 1.0) * 100 * (drumsVol / 0.8))));
            });

            const sortedTicks = Object.keys(groupedHits).map(Number).sort((a, b) => a - b);

            sortedTicks.forEach(tick => {
                hasDrumNotes = true;

                const waitTicks = Math.max(0, tick - currentDrumGlobalTick);
                const noteDurationTicks = 16; // Short crisp hit duration (1/32 note)
                
                drumTrack.addEvent(new MidiWriter.NoteEvent({
                    pitch: groupedHits[tick].pitches,
                    duration: `T${noteDurationTicks}`,
                    wait: `T${waitTicks}`,
                    velocity: groupedHits[tick].velocity,
                    channel: 10
                }));
                currentDrumGlobalTick += waitTicks + noteDurationTicks;
            });

            drumSlotStartTick += slotTicks;
            currentDrumBeat += beats;
        });
    }

    // Force perfect loop boundaries by padding the tracks to the exact final tick
    const forceEndTick = slotStartTick;
    
    chordTracks.forEach((trk, idx) => {
        if (forceEndTick > currentChordTicks[idx]) {
            trk.addEvent(new MidiWriter.NoteEvent({pitch: [0], duration: 'T1', wait: `T${forceEndTick - currentChordTicks[idx] - 1}`, velocity: 1, channel: 1}));
        }
    });

    if (hasBassNotes && forceEndTick > currentBassGlobalTick) {
        bassTrack.addEvent(new MidiWriter.NoteEvent({pitch: [0], duration: 'T1', wait: `T${forceEndTick - currentBassGlobalTick - 1}`, velocity: 1, channel: 1}));
    }
    if (hasDrumNotes && forceEndTick > currentDrumGlobalTick) {
        drumTrack.addEvent(new MidiWriter.NoteEvent({pitch: [0], duration: 'T1', wait: `T${forceEndTick - currentDrumGlobalTick - 1}`, velocity: 1, channel: 10}));
    }

    const finalTracks = [...chordTracks];
    if (hasBassNotes) finalTracks.push(bassTrack);
    if (hasDrumNotes) finalTracks.push(drumTrack);

    const write = new MidiWriter.Writer(finalTracks);
    const dataUri = write.dataUri();

    // Trigger download
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = 'Harmonic_Progression.mid';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}