import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, stopOscillators, playDrum } from './synth.js';
import { resolvePattern } from './patternResolver.js';
import { isSongTrayOpen } from './songController.js';
import { getExportState } from './store.js';

let uiTimeouts = [];

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export function auditionChord(chordSymbol, baseKey, specificNotes = null) {
    if (!chordSymbol) return;
    
    initAudio();

    const chordNotes = getChordNotes(chordSymbol, baseKey);
    if (!chordNotes) return;

    const rootNoteMidi = chordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
    const now = getAudioCurrentTime();
    const notesToPlay = specificNotes || chordNotes.map(n => n - 12);

    // Play chord and bass note without interrupting main playback loop
    notesToPlay.forEach(note => playTone(midiToFreq(note), now, CONFIG.AUDITION_DURATION_SEC, 'sawtooth'));
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

function getAbsoluteBeatPos(progression, index) {
    let beats = 0;
    for (let i = 0; i < index; i++) {
        beats += Number(progression[i].duration) || 2;
    }
    return beats;
}

function getActive(state) {
    if (!state.temporarySwaps) return state.currentProgression;
    return state.currentProgression.map((chord, index) => {
        if (state.temporarySwaps[index] !== undefined) {
            return { ...chord, ...state.temporarySwaps[index] };
        }
        return chord;
    });
}

/**
 * Starts playback of a progression. Returns a function to stop this specific playback instance.
 * @param {function} getState - Function to get the current application state.
 * @param {function} onHighlight - Callback to highlight the current chord in the UI.
 * @param {function} onComplete - Callback when playback finishes (if not looping).
 * @returns {function} A function that, when called, stops this playback instance.
 */
export function playProgression(getState, onHighlight, onComplete, onDrumPlay) {
    initAudio();

    let nextNoteTime = 0.0;
    let currentChordIndexRel = 0;
    let schedulerTimerId = null;
    let isPlaying = true; // Local state for this playback instance

    // Immediately stop any currently playing audio from this module
    // This ensures only one progression plays at a time from this module's API.
    stopAllAudio(onHighlight);

    let cachedMacroState = null;
    let macroLookup = [];
    let lastHistoryLength = -1;

    let cachedPlayableNotes = null;
    let lastActiveProgStr = null;

    function getLiveState() {
        const rawState = getState();
        if (isSongTrayOpen) {
            // "Tricky Buffering": Use history length and bounds as a highly efficient cache invalidator
            if (!cachedMacroState || 
                rawState.history.length !== lastHistoryLength || 
                rawState.macroLoopStart !== cachedMacroState.macroLoopStart || 
                rawState.macroLoopEnd !== cachedMacroState.macroLoopEnd ||
                rawState.songSequence.length !== cachedMacroState.songSequence.length) 
            {
                cachedMacroState = getExportState(true);
                lastHistoryLength = rawState.history.length;
                
                // Build a lookup table to map the flattened playback array back to the UI
                macroLookup = [];
                let macStart = rawState.macroLoopStart ?? 0;
                let macEnd = rawState.macroLoopEnd > 0 ? rawState.macroLoopEnd : rawState.songSequence.length;
                if (macEnd > rawState.songSequence.length) macEnd = rawState.songSequence.length;
                
                for (let i = macStart; i < macEnd; i++) {
                    const sectionId = rawState.songSequence[i];
                    const section = rawState.sections[sectionId];
                    if (!section) continue;
                    
                    let secStart = (sectionId === rawState.activeSectionId) ? rawState.loopStart : (section.loopStart ?? 0);
                    let secEnd = (sectionId === rawState.activeSectionId) ? rawState.loopEnd : (section.loopEnd ?? section.progression.length);
                    
                    for (let j = secStart; j < secEnd; j++) {
                        macroLookup.push({ sectionId, localIndex: j, macroIndex: i });
                    }
                }
            }
            return cachedMacroState;
        }
        cachedMacroState = null;
        macroLookup = [];
        return rawState;
    }

    const startState = getLiveState();
    if (startState.currentProgression.length === 0) {
        return () => {}; // Return a no-op stop function if nothing to play
    }

    currentChordIndexRel = 0; // Start from the beginning of the slice
    nextNoteTime = getAudioCurrentTime() + 0.05; // Buffer 50ms ahead for clean start

    function scheduleNote(chordIndexRel, time) {
        const state = getLiveState(); // Automatically swap between Local or Macro state
        const activeProg = getActive(state);
        const bounds = getBounds(state);
        const sliceLength = bounds.end - bounds.start;
        
        if (sliceLength === 0) return;
        
        // Safety bound: if user deleted a chord while playing and shrunk the array
        if (chordIndexRel >= sliceLength) {
            chordIndexRel %= sliceLength;
        }

        const absIndex = bounds.start + chordIndexRel;
        
        let notesToPlay = [];
        if (state.useVoiceLeading) {
            // Performance cache: generate hash to avoid recalculating voice leading on every tick
            const progStr = activeProg.map(c => `${c.symbol}-${c.key}-${c.inversionOffset||0}-${c.voicingType||'global'}`).join(',') + `|${state.isLooping}`;
            
            if (!cachedPlayableNotes || lastActiveProgStr !== progStr) {
                let allPlayableNotes = [];
                if (isSongTrayOpen) {
                    // Isolate voice leading per section so macro playback sounds identical to local playback
                    let currentChunk = [];
                    for (let i = 0; i < activeProg.length; i++) {
                        if (activeProg[i]._isSectionStart && currentChunk.length > 0) {
                            allPlayableNotes = allPlayableNotes.concat(getPlayableNotes(currentChunk, state));
                            currentChunk = [];
                        }
                        currentChunk.push(activeProg[i]);
                    }
                    if (currentChunk.length > 0) {
                        allPlayableNotes = allPlayableNotes.concat(getPlayableNotes(currentChunk, state));
                    }
                } else {
                    allPlayableNotes = getPlayableNotes(activeProg, state);
                }
                cachedPlayableNotes = allPlayableNotes;
                lastActiveProgStr = progStr;
            }
            
            notesToPlay = cachedPlayableNotes[absIndex];
        } else {
            // Drop by 1 octave (-12) to match standard audition and pad register warmth
            notesToPlay = getChordNotes(activeProg[absIndex].symbol, activeProg[absIndex].key).map(n => n - 12);
        }
        
        if (!notesToPlay) return;

        const chordObj = activeProg[absIndex];
        const beats = Number(chordObj.duration) || 2;
        const chordSlotDuration = (60.0 / Number(state.bpm)) * beats;
        
        let pattern = chordObj.chordPattern;
        let isGlobalChord = false;
        if (pattern && !pattern.isLocalOverride && state.globalPatterns && state.globalPatterns.chordPattern) {
            pattern = state.globalPatterns.chordPattern;
            isGlobalChord = true;
        }
        pattern = pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
        pattern = resolvePattern(pattern, isGlobalChord, beats);

        // Render each rhythmic slice instance inside the chord slot
        pattern.instances.forEach(instance => {
            if (instance.probability !== undefined && Math.random() > instance.probability) return;

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
            
            let bPattern = chordObj.bassPattern;
            let isGlobalBass = false;
            if (bPattern && !bPattern.isLocalOverride && state.globalPatterns && state.globalPatterns.bassPattern) {
                bPattern = state.globalPatterns.bassPattern;
                isGlobalBass = true;
            }
            bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            bPattern = resolvePattern(bPattern, isGlobalBass, beats);
            
            bPattern.instances.forEach(instance => {
                if (instance.probability !== undefined && Math.random() > instance.probability) return;

                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const instanceDuration = instance.duration * chordSlotDuration;
                const gateDuration = instanceDuration * 0.95;
                const finalBassNote = rootNoteMidi + (instance.pitchOffset || 0);
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, 'sine');
            });
        }
        
        // --- Schedule Drums ---
        const absBeatStart = getAbsoluteBeatPos(activeProg, absIndex);
        const drumPat = chordObj.drumPattern;
        
        if (drumPat && drumPat.isLocalOverride) {
            // Local Punch-In
            if (drumPat.hits) {
                for (const hit of drumPat.hits) {
                    if (hit.probability !== undefined && Math.random() > hit.probability) continue;

                    const hitTimeSec = time + (hit.time * beats * (60.0 / Number(state.bpm)));
                    playDrum(hit.row, hitTimeSec, hit.velocity || 1.0);
                    if (onDrumPlay && hit.id) {
                        const delayMs = (hitTimeSec - getAudioCurrentTime()) * 1000;
                        const tId = setTimeout(() => {
                            onDrumPlay(hit.id);
                            uiTimeouts = uiTimeouts.filter(id => id !== tId);
                        }, Math.max(0, delayMs));
                        uiTimeouts.push(tId);
                    }
                }
            }
        } else if (state.globalPatterns && state.globalPatterns.drumPattern) {
            // Global Continuous Loop
            const globalDrumPat = state.globalPatterns.drumPattern;
            const gLength = globalDrumPat.lengthBeats || 4;
            
            if (globalDrumPat.hits) {
                for (const hit of globalDrumPat.hits) {
                    if (hit.time >= 1.0) continue; // Non-destructive truncation
                    const hitBeatOffset = hit.time * gLength;
                    let loopStartBeat = Math.floor(absBeatStart / gLength) * gLength;
                    
                    let absoluteHitBeat = Math.round((loopStartBeat + hitBeatOffset) * 10000) / 10000;
                    let absBeatStartRounded = Math.round(absBeatStart * 10000) / 10000;
                    let chordEndBeatRounded = Math.round((absBeatStart + beats) * 10000) / 10000;
                    
                    if (absoluteHitBeat < absBeatStartRounded) absoluteHitBeat += gLength;
                    
                    while (absoluteHitBeat < chordEndBeatRounded) {
                        const beatWithinChord = absoluteHitBeat - absBeatStartRounded;
                        const hitTimeSec = time + (beatWithinChord * (60.0 / Number(state.bpm)));
                        if (hit.probability === undefined || Math.random() <= hit.probability) {
                            playDrum(hit.row, hitTimeSec, hit.velocity || 1.0);
                            if (onDrumPlay && hit.id) {
                                const delayMs = (hitTimeSec - getAudioCurrentTime()) * 1000;
                                const tId = setTimeout(() => {
                                    onDrumPlay(hit.id);
                                    uiTimeouts = uiTimeouts.filter(id => id !== tId);
                                }, Math.max(0, delayMs));
                                uiTimeouts.push(tId);
                            }
                        }
                        absoluteHitBeat += gLength;
                        absoluteHitBeat = Math.round(absoluteHitBeat * 10000) / 10000;
                    }
                }
            }
        }

        const delayMs = (time - getAudioCurrentTime()) * 1000;
        const highlightId = setTimeout(() => {
            if (isSongTrayOpen && macroLookup[absIndex]) {
                const { sectionId, localIndex, macroIndex } = macroLookup[absIndex];
                if (onHighlight) onHighlight(localIndex, sectionId, macroIndex);
            } else {
                if (onHighlight) onHighlight(absIndex);
            }
            uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
        }, Math.max(0, delayMs));
        
        uiTimeouts.push(highlightId);
    }

    function advanceNote() {
        const state = getLiveState();
        const activeProg = getActive(state);
        const bounds = getBounds(state);
        const sliceLength = bounds.end - bounds.start;

        const chordObj = activeProg[bounds.start + currentChordIndexRel];
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
        
        const state = getLiveState();
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