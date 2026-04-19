import { chordDictionary, applyVoiceLeading } from './theory.js';
import { CONFIG } from './config.js';

export function exportToMidi(state) {
    if (state.currentProgression.length === 0) {
        alert("Please add some chords to the progression first!");
        return;
    }

    let midiNotesToWrite = [];

    if (state.useVoiceLeading) {
        midiNotesToWrite = applyVoiceLeading(state.currentProgression);
    } else {
        // Just use block root position chords
        midiNotesToWrite = state.currentProgression.map(c => chordDictionary[c]);
    }

    // Initialize MidiWriterJS (assumes MidiWriter is available globally)
    const track = new MidiWriter.Track();
    track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1})); // Acoustic Grand Piano

    // Add chords to track (Whole notes, length '1')
    midiNotesToWrite.forEach(notes => {
        const chordEvent = new MidiWriter.NoteEvent({
            pitch: notes,
            duration: '1',
            velocity: CONFIG.MIDI_CHORD_VELOCITY 
        });
        track.addEvent(chordEvent);
    });

    // Add a bass line! (Root notes played down two octaves)
    const bassTrack = new MidiWriter.Track();
    state.currentProgression.forEach(chordSymbol => {
        const rootNote = chordDictionary[chordSymbol][0] + CONFIG.BASS_OCTAVE_DROP; 
        bassTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [rootNote],
            duration: '1',
            velocity: CONFIG.MIDI_BASS_VELOCITY
        }));
    });

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