import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { resolvePattern } from './patternResolver.js';

export function exportToMidi(state) {
    if (state.currentProgression.length === 0) {
        alert("Please add some chords to the progression first!");
        return;
    }

    let midiNotesToWrite = [];

    if (state.useVoiceLeading) {
        midiNotesToWrite = getPlayableNotes(state.currentProgression, state);
    } else {
        // Just use block root position chords
        // Drop by 1 octave (-12) to match the pad register warmth used in audio playback
        midiNotesToWrite = state.currentProgression.map(chord => getChordNotes(chord.symbol, chord.key).map(n => n - 12));
    }

    // Initialize MidiWriterJS (assumes MidiWriter is available globally)
    const track = new MidiWriter.Track();
    track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1})); // Acoustic Grand Piano

    let currentTick = 0;
    let slotStartTick = 0;
    
    const chordsVol = state.volumes ? state.volumes.chords : 0.8;
    const bassVol = state.volumes ? state.volumes.bass : 0.8;
    const drumsVol = state.volumes ? state.volumes.drums : 0.8;

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        // Add polyrhythmic chords and arpeggios to track
        state.currentProgression.forEach((chord, index) => {
            const chordNotes = midiNotesToWrite[index];
            
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

            // Sort instances by startTime to ensure sequential MIDI rendering
            const instances = [...pattern.instances].sort((a, b) => a.startTime - b.startTime);

            instances.forEach(instance => {
                const instanceStartTick = slotStartTick + Math.round(instance.startTime * slotTicks);
                const instanceDurationTicks = Math.round(instance.duration * slotTicks);
                const instanceDurationSec = instance.duration * chordDurationSec;

                if (instance.arpSettings) {
                    const arpEvents = generateArpNotes({
                        notesToPlay: chordNotes,
                        arpSettings: instance.arpSettings,
                        instanceDuration: instanceDurationSec,
                        bpm: Number(state.bpm)
                    });

                    arpEvents.forEach(event => {
                        const noteStartTick = instanceStartTick + Math.round(event.startTime * (state.bpm / 60) * 128);
                        const noteDurationTicks = Math.max(1, Math.round(event.duration * (state.bpm / 60) * 128));
                        const waitTicks = Math.max(0, noteStartTick - currentTick);
                        
                        track.addEvent(new MidiWriter.NoteEvent({
                            pitch: [event.note],
                            duration: `T${noteDurationTicks}`,
                            wait: `T${waitTicks}`,
                            velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8)))
                        }));
                        currentTick += waitTicks + noteDurationTicks;
                    });
                } else {
                    const noteStartTick = instanceStartTick;
                    const noteDurationTicks = Math.round(instanceDurationTicks * 0.95);
                    const waitTicks = Math.max(0, noteStartTick - currentTick);

                    track.addEvent(new MidiWriter.NoteEvent({
                        pitch: chordNotes,
                        duration: `T${noteDurationTicks}`,
                        wait: `T${waitTicks}`,
                        velocity: Math.min(127, Math.round(CONFIG.MIDI_CHORD_VELOCITY * (chordsVol / 0.8)))
                    }));
                    currentTick += waitTicks + noteDurationTicks;
                }
            });
            
            slotStartTick += slotTicks;
        });
    }

    // Add a bass line! (Root notes played down two octaves)
    const bassTrack = new MidiWriter.Track();
    let currentBassGlobalTick = 0;
    let bassSlotStartTick = 0;

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        state.currentProgression.forEach(chord => {
            const rootNote = getChordNotes(chord.symbol, chord.key)[0] + CONFIG.BASS_OCTAVE_DROP; 
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
                const instanceStartTick = bassSlotStartTick + Math.round(instance.startTime * slotTicks);
                const instanceDurationTicks = Math.round(instance.duration * slotTicks * 0.95);
                const waitTicks = Math.max(0, instanceStartTick - currentBassGlobalTick);

                const finalBassNote = rootNote + (instance.pitchOffset || 0);

                bassTrack.addEvent(new MidiWriter.NoteEvent({ 
                    pitch: [finalBassNote], 
                    duration: `T${instanceDurationTicks}`, 
                    wait: `T${waitTicks}`,
                    velocity: Math.min(127, Math.round(CONFIG.MIDI_BASS_VELOCITY * (bassVol / 0.8)))
                }));
                currentBassGlobalTick += waitTicks + instanceDurationTicks;
            });

            bassSlotStartTick += slotTicks;
        });
    }

    // --- Add Drum Track (Channel 10) ---
    const drumTrack = new MidiWriter.Track();
    // MIDI Channel 10 is reserved for Percussion (MidiWriter uses 1-based indexing, so channel: 10)
    let currentDrumGlobalTick = 0;
    let drumSlotStartTick = 0;
    let currentDrumBeat = 0;
    
    const DRUM_MIDI_MAP = {
        'kick': 36, // C1 (General MIDI Bass Drum 1)
        'snare': 38, // D1 (General MIDI Acoustic Snare)
        'chh': 42,  // F#1 (General MIDI Closed Hi-Hat)
        'ohh': 46   // A#1 (General MIDI Open Hi-Hat)
    };

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        state.currentProgression.forEach(chord => {
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

    const write = new MidiWriter.Writer([track, bassTrack, drumTrack], { tempo: state.bpm });
    const dataUri = write.dataUri();

    // Trigger download
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = 'Harmonic_Progression.mid';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}