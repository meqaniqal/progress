import { getChordNotes, applyVoiceLeading } from './theory.js';
import { CONFIG } from './config.js';

let audioCtx;
let activeOscillators = [];
let uiTimeouts = [];
let masterCompressor; // Module-scoped, but only initialized once

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Setup Master Bus with a Compressor to prevent clipping
        masterCompressor = audioCtx.createDynamicsCompressor();
        masterCompressor.threshold.setValueAtTime(CONFIG.COMPRESSOR_THRESHOLD, audioCtx.currentTime);
        masterCompressor.knee.setValueAtTime(CONFIG.COMPRESSOR_KNEE, audioCtx.currentTime);
        masterCompressor.ratio.setValueAtTime(CONFIG.COMPRESSOR_RATIO, audioCtx.currentTime);
        masterCompressor.attack.setValueAtTime(CONFIG.COMPRESSOR_ATTACK, audioCtx.currentTime);
        masterCompressor.release.setValueAtTime(CONFIG.COMPRESSOR_RELEASE, audioCtx.currentTime);
        
        masterCompressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function midiToFreq(m) {
    return Math.pow(2, (m - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ;
}

function playTone(freq, startTime, duration, type = 'sine') {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    // Envelope to avoid clicks: Attack -> Sustain -> Release
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + CONFIG.ATTACK_TIME); // Attack
    gainNode.gain.setValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + duration - CONFIG.RELEASE_TIME); // Sustain
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release

    osc.connect(gainNode);
    gainNode.connect(masterCompressor); // Route to master bus

    osc.start(startTime);
    osc.stop(startTime + duration);

    // Prevent memory leaks by letting the oscillator clean itself up when finished
    osc.onended = () => {
        activeOscillators = activeOscillators.filter(o => o !== osc);
    };

    activeOscillators.push(osc);
}

export function auditionChord(chordSymbol, baseKey) {
    initAudio();

    const chordNotes = getChordNotes(chordSymbol, baseKey);
    if (!chordNotes) return;

    const rootNoteMidi = chordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
    const now = audioCtx.currentTime;

    // Play chord and bass note without interrupting main playback loop
    chordNotes.forEach(note => playTone(midiToFreq(note - 12), now, CONFIG.AUDITION_DURATION_SEC, 'sine'));
    playTone(midiToFreq(rootNoteMidi), now, CONFIG.AUDITION_DURATION_SEC, 'triangle');
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
    nextNoteTime = audioCtx.currentTime + 0.05; // Buffer 50ms ahead for clean start

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
            notesToPlay = getChordNotes(sliceToPlay[chordIndexRel].symbol, sliceToPlay[chordIndexRel].key);
        }
        
        if (!notesToPlay) return;

        const chordDuration = 60 / state.bpm;

        notesToPlay.forEach(note => playTone(midiToFreq(note), time, chordDuration, 'sine'));
        
        const rootSymbol = sliceToPlay[chordIndexRel].symbol;
        const rootKey = sliceToPlay[chordIndexRel].key;
        const rootChordNotes = getChordNotes(rootSymbol, rootKey);
        if (rootChordNotes) {
            const rootNoteMidi = rootChordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
            playTone(midiToFreq(rootNoteMidi), time, chordDuration, 'triangle');
        }

        const delayMs = (time - audioCtx.currentTime) * 1000;
        const highlightId = setTimeout(() => {
            if (onHighlight) onHighlight(absIndex);
            uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
        }, Math.max(0, delayMs));
        
        uiTimeouts.push(highlightId);
    }

    function advanceNote() {
        const state = getState();
        const chordDuration = 60.0 / state.bpm;
        nextNoteTime += chordDuration;

        const bounds = getBounds(state);
        const sliceLength = bounds.end - bounds.start;

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

        while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
            scheduleNote(currentChordIndexRel, nextNoteTime);
            const keepGoing = advanceNote();
            
            if (!keepGoing) {
                const remainingTimeMs = (nextNoteTime - audioCtx.currentTime) * 1000;
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

        activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch (e) { /* Ignore InvalidStateError */ }
        });
        activeOscillators = [];
    }

    scheduler(); // Start the scheduler

    return stopThisPlayback; // Return the stop function for this instance
}

// Export a general stop function that can be called if no specific playback instance is available
export function stopAllAudio(onHighlightCallback) {
    uiTimeouts.forEach(clearTimeout);
    uiTimeouts = [];
    if (onHighlightCallback) onHighlightCallback(-1);

    activeOscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch (e) { /* Ignore InvalidStateError */ }
    });
    activeOscillators = [];
}