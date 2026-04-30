import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';

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

    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        // Add polyrhythmic chords and arpeggios to track
        state.currentProgression.forEach((chord, index) => {
            const chordNotes = midiNotesToWrite[index];
            const pattern = chord.pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
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
                            velocity: CONFIG.MIDI_CHORD_VELOCITY
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
                        velocity: CONFIG.MIDI_CHORD_VELOCITY 
                    }));
                    currentTick += waitTicks + noteDurationTicks;
                }
            });
            
            slotStartTick += slotTicks;
        });
    }

    // Add a bass line! (Root notes played down two octaves)
    const bassTrack = new MidiWriter.Track();
    for (let pass = 0; pass < (state.exportPasses || 1); pass++) {
        state.currentProgression.forEach(chord => {
            const rootNote = getChordNotes(chord.symbol, chord.key)[0] + CONFIG.BASS_OCTAVE_DROP; 
            const beats = Number(chord.duration) || 2;
            const durationTicks = beats * 128;
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rootNote], duration: `T${durationTicks}`, velocity: CONFIG.MIDI_BASS_VELOCITY }));
        });
    }

    const write = new MidiWriter.Writer([track, bassTrack], { tempo: state.bpm });
    const dataUri = write.dataUri();

    // Trigger download
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = 'Harmonic_Progression.mid';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}