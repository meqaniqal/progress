import { getChordNotes, applyVoiceLeading } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, stopOscillators } from './synth.js';

let uiTimeouts = [];

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export function auditionChord(chordSymbol, baseKey) {
    initAudio();

    const chordNotes = getChordNotes(chordSymbol, baseKey);
    if (!chordNotes) return;

    const rootNoteMidi = chordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
    const now = getAudioCurrentTime();

    // Play chord and bass note without interrupting main playback loop
    chordNotes.forEach(note => playTone(midiToFreq(note - 12), now, CONFIG.AUDITION_DURATION_SEC, 'sawtooth'));
    playTone(midiToFreq(rootNoteMidi), now, CONFIG.AUDITION_DURATION_SEC, 'sine');
}

function getBounds(state) {
    let { currentProgression, isLooping, loopStart, loopEnd } = state;
    let start = isLooping ? (typeof loopStart === 'number' ? loopStart : 0) : 0;
    let end = isLooping ? (typeof loopEnd === 'number' ? loopEnd : currentProgression.length) : currentProgression.length;
    if (end <= start) end = start + 1;
    if (end > currentProgression.length) end = currentProgression.length;
    // Ensure bounds are within the actual progression length
    start = Math.max(0, Math.min(start, currentProgression.length));
    end = Math.max(start, Math.min(end, currentProgression.length));
    return { start, end };
}

/**
 * Starts playback of a progression. Returns a function to stop this specific playback instance.
 * @param {function} getState - Function to get the current application state.
 * @param {function} onHighlight - Callback to highlight the current chord in the UI.
 * @param {function} onComplete - Callback when playback finishes (if not looping).
 * @returns {function} A function that, when called, stops this playback instance.
 */
export function playProgression(getState, onHighlight, onComplete) {
    initAudio();

    let nextNoteTime = 0.0;
    let currentChordIndexRel = 0;
    let schedulerTimerId = null;
    let isPlaying = true; // Local state for this playback instance

    // Immediately stop any currently playing audio from this module
    // This ensures only one progression plays at a time from this module's API.
    stopAllAudio(onHighlight);

    const initialState = getState();
    if (initialState.currentProgression.length === 0) {
        return () => {}; // Return a no-op stop function if nothing to play
    }

    currentChordIndexRel = 0; // Start from the beginning of the slice
    nextNoteTime = getAudioCurrentTime() + 0.05; // Buffer 50ms ahead for clean start

    function scheduleNote(chordIndexRel, time) {
        const state = getState(); // Always get the latest state
        const bounds = getBounds(state);
        const sliceLength = bounds.end - bounds.start;
        
        if (sliceLength === 0) return;
        
        // Safety bound: if user deleted a chord while playing and shrunk the array
        if (chordIndexRel >= sliceLength) {
            chordIndexRel %= sliceLength;
        }

        const absIndex = bounds.start + chordIndexRel;
        const sliceToPlay = state.currentProgression.slice(bounds.start, bounds.end);
        
        let notesToPlay = [];
        if (state.useVoiceLeading) {
            const vlSlice = applyVoiceLeading(sliceToPlay);
            notesToPlay = vlSlice[chordIndexRel];
        } else {
            // Drop by 1 octave (-12) to match standard audition and pad register warmth
            notesToPlay = getChordNotes(sliceToPlay[chordIndexRel].symbol, sliceToPlay[chordIndexRel].key).map(n => n - 12);
        }
        
        if (!notesToPlay) return;

        const chordObj = sliceToPlay[chordIndexRel];
        const beats = Number(chordObj.duration) || 2;
        const chordSlotDuration = (60.0 / Number(state.bpm)) * beats;
        const pattern = chordObj.pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };

        // Render each rhythmic slice instance inside the chord slot
        pattern.instances.forEach(instance => {
            const instanceStartTime = time + (instance.startTime * chordSlotDuration);
            const instanceDuration = instance.duration * chordSlotDuration;

            if (instance.arpSettings) {
                const arpEvents = generateArpNotes({
                    notesToPlay,
                    arpSettings: instance.arpSettings,
                    instanceDuration,
                    bpm: Number(state.bpm)
                });

                arpEvents.forEach(event => {
                    playTone(midiToFreq(event.note), instanceStartTime + event.startTime, event.duration, 'sawtooth');
                });
            } else {
                const gateDuration = instanceDuration * 0.95; // Slight gate so contiguous chops are distinctly audible
                notesToPlay.forEach(note => playTone(midiToFreq(note), instanceStartTime, gateDuration, 'sawtooth'));
            }
        });
        
        const rootSymbol = chordObj.symbol;
        const rootKey = chordObj.key;
        const rootChordNotes = getChordNotes(rootSymbol, rootKey);
        if (rootChordNotes) {
            const rootNoteMidi = rootChordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
            playTone(midiToFreq(rootNoteMidi), time, chordSlotDuration, 'sine'); // Solid bass holding the root for the whole slot
        }

        const delayMs = (time - getAudioCurrentTime()) * 1000;
        const highlightId = setTimeout(() => {
            if (onHighlight) onHighlight(absIndex);
            uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
        }, Math.max(0, delayMs));
        
        uiTimeouts.push(highlightId);
    }

    function advanceNote() {
        const state = getState();
        const bounds = getBounds(state);
        const sliceLength = bounds.end - bounds.start;

        const chordObj = state.currentProgression[bounds.start + currentChordIndexRel];
        const beats = chordObj ? (Number(chordObj.duration) || 2) : 2;
        const chordDuration = (60.0 / Number(state.bpm)) * beats;
        nextNoteTime += chordDuration;

        currentChordIndexRel++;
        if (currentChordIndexRel >= sliceLength) {
            if (state.isLooping) {
                currentChordIndexRel = 0; // Wrap around for looping
            } else {
                return false; // Reached end of unlooped progression
            }
        }
        return true;
    }

    function scheduler() {
        if (!isPlaying) return;
        
        const state = getState();
        if (state.currentProgression.length === 0) {
            stopThisPlayback(); // Use local stop function
            if (onComplete) onComplete();
            return;
        }

        while (nextNoteTime < getAudioCurrentTime() + SCHEDULE_AHEAD_SEC) {
            scheduleNote(currentChordIndexRel, nextNoteTime);
            const keepGoing = advanceNote();
            
            if (!keepGoing) {
                const remainingTimeMs = (nextNoteTime - getAudioCurrentTime()) * 1000;
                setTimeout(() => {
                    stopThisPlayback();
                    if (onComplete) onComplete();
                }, Math.max(0, remainingTimeMs));
                return; 
            }
        }

        schedulerTimerId = setTimeout(scheduler, LOOKAHEAD_MS);
    }

    function stopThisPlayback() {
        isPlaying = false;
        if (schedulerTimerId) clearTimeout(schedulerTimerId);
        schedulerTimerId = null;

        uiTimeouts.forEach(clearTimeout);
        uiTimeouts = [];
        if (onHighlight) onHighlight(-1); // Clear all highlights

        stopOscillators();
    }

    scheduler(); // Start the scheduler

    return stopThisPlayback; // Return the stop function for this instance
}

// Export a general stop function that can be called if no specific playback instance is available
export function stopAllAudio(onHighlightCallback) {
    uiTimeouts.forEach(clearTimeout);
    uiTimeouts = [];
    if (onHighlightCallback) onHighlightCallback(-1);

    stopOscillators();
}