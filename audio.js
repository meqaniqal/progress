import { getChordNotes, applyVoiceLeading } from './theory.js';
import { CONFIG } from './config.js';

let audioCtx;
let activeOscillators = [];
let uiTimeouts = [];
let masterCompressor;

// --- Dynamic Scheduler Variables ---
const LOOKAHEAD_MS = 25; // Interval to wake up and check for scheduling
const SCHEDULE_AHEAD_SEC = 0.1; // How far into the future to schedule audio
let nextNoteTime = 0.0;
let currentChordIndexRel = 0; // Relative to the currently sliced/looped bounds
let schedulerTimerId = null;
let isPlayingState = false;
let globalGetState = null;
let globalOnHighlight = null;
let globalOnComplete = null;

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

// --- Dynamic Lookahead Scheduler ---
function getBounds(state) {
    let { currentProgression, isLooping, loopStart, loopEnd } = state;
    let start = isLooping ? (typeof loopStart === 'number' ? loopStart : 0) : 0;
    let end = isLooping ? (typeof loopEnd === 'number' ? loopEnd : currentProgression.length) : currentProgression.length;
    if (end <= start) end = start + 1;
    if (end > currentProgression.length) end = currentProgression.length;
    return { start, end };
}

function scheduleNote(chordIndexRel, time) {
    const state = globalGetState();
    const bounds = getBounds(state);
    const sliceLength = bounds.end - bounds.start;
    
    if (sliceLength === 0) return;
    
    // Safety bound: if user deleted a chord while playing and shrunk the array
    if (chordIndexRel >= sliceLength) {
        chordIndexRel %= sliceLength;
    }

    const absIndex = bounds.start + chordIndexRel;
    const sliceToPlay = state.currentProgression.slice(bounds.start, bounds.end);
    
    // Dynamically recalculate voicings for the current slice shape
    let notesToPlay = [];
    if (state.useVoiceLeading) {
        const vlSlice = applyVoiceLeading(sliceToPlay);
        notesToPlay = vlSlice[chordIndexRel];
    } else {
        notesToPlay = getChordNotes(sliceToPlay[chordIndexRel].symbol, sliceToPlay[chordIndexRel].key);
    }
    
    if (!notesToPlay) return;

    const chordDuration = 60 / state.bpm;

    // Play Chords (Track 1)
    notesToPlay.forEach(note => playTone(midiToFreq(note), time, chordDuration, 'sine'));
    
    // Play Bass (Track 2)
    const rootSymbol = sliceToPlay[chordIndexRel].symbol;
    const rootKey = sliceToPlay[chordIndexRel].key;
    const rootChordNotes = getChordNotes(rootSymbol, rootKey);
    if (rootChordNotes) {
        const rootNoteMidi = rootChordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
        playTone(midiToFreq(rootNoteMidi), time, chordDuration, 'triangle');
    }

    // Schedule UI Highlight perfectly synchronized with Web Audio Time
    const delayMs = (time - audioCtx.currentTime) * 1000;
    const highlightId = setTimeout(() => {
        if (globalOnHighlight) globalOnHighlight(absIndex);
        // Clean self up to prevent memory leaks during long loops
        uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
    }, Math.max(0, delayMs));
    
    uiTimeouts.push(highlightId);
}

function advanceNote() {
    const state = globalGetState();
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
    if (!isPlayingState) return;
    
    const state = globalGetState();
    if (state.currentProgression.length === 0) {
        stopProgression(globalOnHighlight);
        if (globalOnComplete) globalOnComplete();
        return;
    }

    // Look ahead and schedule notes precisely right before they need to play
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
        scheduleNote(currentChordIndexRel, nextNoteTime);
        const keepGoing = advanceNote();
        
        if (!keepGoing) {
            // Schedule playback end exactly when the final note finishes
            const remainingTimeMs = (nextNoteTime - audioCtx.currentTime) * 1000;
            setTimeout(() => {
                stopProgression(globalOnHighlight);
                if (globalOnComplete) globalOnComplete();
            }, Math.max(0, remainingTimeMs));
            return; 
        }
    }

    schedulerTimerId = setTimeout(scheduler, LOOKAHEAD_MS);
}

export function playProgression(getState, onHighlight, onComplete) {
    initAudio();
    stopProgression(onHighlight); // Clean any existing artifacts

    const state = getState();
    if (state.currentProgression.length === 0) return;

    // Store references for the running loop
    globalGetState = getState;
    globalOnHighlight = onHighlight;
    globalOnComplete = onComplete;
    isPlayingState = true;

    currentChordIndexRel = 0;
    nextNoteTime = audioCtx.currentTime + 0.05; // Buffer 50ms ahead to ensure a clean start
    
    scheduler();
}

export function stopProgression(onHighlight) {
    isPlayingState = false;
    if (schedulerTimerId) clearTimeout(schedulerTimerId);
    schedulerTimerId = null;

    uiTimeouts.forEach(clearTimeout);
    uiTimeouts = [];
    if (onHighlight) onHighlight(-1); // Clear all highlights

    activeOscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch (e) {
            // Ignore InvalidStateError: thrown if the oscillator has already stopped naturally
        }
    });
    activeOscillators = [];
}