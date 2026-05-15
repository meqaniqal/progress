import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, stopOscillators, playDrum } from './synth.js';
import { resolvePattern } from './patternResolver.js';
import { isSongTrayOpen, getActiveSequenceIndex } from './songController.js';

let uiTimeouts = [];

export function auditionChord(chordSymbol, baseKey, specificNotes = null, stateObj = null) {
    initAudio();

    const chordNotes = getChordNotes(chordSymbol, baseKey);
    if (!chordNotes) return;

    const rootNoteMidi = chordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
    const now = getAudioCurrentTime();
    const notesToPlay = specificNotes || chordNotes.map(n => n - 12);
    const chordEngine = stateObj && stateObj.instruments ? stateObj.instruments.chords : 'sawtooth';
    const bassEngine = stateObj && stateObj.instruments ? stateObj.instruments.bass : 'sine';

    // Play chord and bass note without interrupting main playback loop
    notesToPlay.forEach(note => playTone(midiToFreq(note), now, CONFIG.AUDITION_DURATION_SEC, chordEngine, 'chords'));
    playTone(midiToFreq(rootNoteMidi), now, CONFIG.AUDITION_DURATION_SEC, bassEngine, 'bass');
    playTone(midiToFreq(rootNoteMidi), now, CONFIG.AUDITION_DURATION_SEC, 'sawtooth-bass', 'bassHarmonic');
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
        beats += Number(progression[i].duration) || 4;
    }
    return beats;
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

    let playhead = {
        isMacro: false,
        macroIndex: 0,
        chordIndex: 0,
        chordIndexRel: 0
    };

    // Immediately stop any currently playing audio from this module
    // This ensures only one progression plays at a time from this module's API.
    stopAllAudio(onHighlight);

    const initialState = getState();
    
    playhead.isMacro = isSongTrayOpen;
    if (playhead.isMacro) {
        if (initialState.songSequence.length === 0) return () => {};
        
        const activeMacroIndex = getActiveSequenceIndex();
        if (activeMacroIndex !== null && activeMacroIndex < initialState.songSequence.length) {
            playhead.macroIndex = activeMacroIndex;
        } else {
            playhead.macroIndex = Math.max(0, initialState.songSequence.indexOf(initialState.activeSectionId));
        }
        
        const activeSecId = initialState.songSequence[playhead.macroIndex];
        const activeSec = initialState.sections[activeSecId];
        playhead.chordIndex = activeSec ? (activeSec.loopStart ?? 0) : 0;
    } else {
        if (initialState.currentProgression.length === 0) return () => {};
        playhead.chordIndexRel = 0;
    }

    nextNoteTime = getAudioCurrentTime() + (CONFIG.PLAYBACK_START_DELAY || 0.05); // Buffer 50ms ahead for clean start

    function scheduleNote(time) {
        const state = getState(); // Always get the latest state
        let chordObj, globalPatterns, sectionId, absIndex, progressionToUse;
        let currentMacroIndex = playhead.macroIndex; // Capture exact index at schedule time to prevent lookahead desync

        if (playhead.isMacro) {
            if (state.songSequence.length === 0) return;
            if (playhead.macroIndex >= state.songSequence.length) playhead.macroIndex = 0;
            sectionId = state.songSequence[playhead.macroIndex];
            const section = state.sections[sectionId];
            if (!section) return;
            
            progressionToUse = section.progression.map((chord, i) => {
                if (section.temporarySwaps && section.temporarySwaps[i]) return { ...chord, ...section.temporarySwaps[i] };
                // Check global swaps if rendering the actively edited section
                if (sectionId === state.activeSectionId && state.temporarySwaps && state.temporarySwaps[i]) return { ...chord, ...state.temporarySwaps[i] };
                return chord;
            });
            
            absIndex = playhead.chordIndex;
            chordObj = progressionToUse[absIndex];
            globalPatterns = section.globalPatterns;

            // Empty section handling (Pauses playback natively by scheduling no notes)
            if (progressionToUse.length === 0) {
                const delayMs = (time - getAudioCurrentTime()) * 1000;
                const highlightId = setTimeout(() => {
                    if (onHighlight) onHighlight(-1, sectionId, currentMacroIndex);
                    uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
                }, Math.max(0, delayMs));
                uiTimeouts.push(highlightId);
                return;
            }
        } else {
            const bounds = getBounds(state);
            const sliceLength = bounds.end - bounds.start;
            if (sliceLength === 0) return;
            
            let rel = playhead.chordIndexRel;
            if (rel >= sliceLength) rel %= sliceLength;
            absIndex = bounds.start + rel;
            
            progressionToUse = state.currentProgression.map((chord, i) => {
                 if (state.temporarySwaps && state.temporarySwaps[i]) return { ...chord, ...state.temporarySwaps[i] };
                 return chord;
            });
            chordObj = progressionToUse[absIndex];
            globalPatterns = state.globalPatterns;
            sectionId = null;
        }
        
        if (!chordObj) return;
        
        let notesToPlay = [];
        if (state.useVoiceLeading) {
            const allPlayableNotes = getPlayableNotes(progressionToUse, state);
            notesToPlay = allPlayableNotes[absIndex];
        } else {
            notesToPlay = getChordNotes(chordObj.symbol, chordObj.key).map(n => n - 12);
        }
        
        if (!notesToPlay) return;

        const beats = Number(chordObj.duration) || 4;
        const chordSlotDuration = (60.0 / Number(state.bpm)) * beats;
        
        let pattern = chordObj.chordPattern;
        let isGlobalChord = false;
        if (pattern && !pattern.isLocalOverride && globalPatterns && globalPatterns.chordPattern) {
            pattern = globalPatterns.chordPattern;
            isGlobalChord = true;
        }

        let isGlobalDrum = false;
        let drumPatForDucking = chordObj.drumPattern;
        if (drumPatForDucking && !drumPatForDucking.isLocalOverride && globalPatterns && globalPatterns.drumPattern) {
            drumPatForDucking = globalPatterns.drumPattern;
            isGlobalDrum = true;
        }
        pattern = pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
        pattern = resolvePattern(pattern, isGlobalChord, beats, null, drumPatForDucking, isGlobalDrum);

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
                    playTone(midiToFreq(event.note), instanceStartTime + event.startTime, event.duration, state.instruments.chords || 'sawtooth', 'chords');
                });
            } else {
                const gateDuration = instanceDuration * (CONFIG.GATE_RATIO || 0.95); // Slight gate so contiguous chops are distinctly audible
                notesToPlay.forEach(note => playTone(midiToFreq(note), instanceStartTime, gateDuration, state.instruments.chords || 'sawtooth', 'chords'));
            }
        });
        
        const rootSymbol = chordObj.symbol;
        const rootKey = chordObj.key;
        const rootChordNotes = getChordNotes(rootSymbol, rootKey);
        if (rootChordNotes) {
            const rootNoteMidi = rootChordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
            
            let bPattern = chordObj.bassPattern;
            let isGlobalBass = false;
            if (bPattern && !bPattern.isLocalOverride && globalPatterns && globalPatterns.bassPattern) {
                bPattern = globalPatterns.bassPattern;
                isGlobalBass = true;
            }
            bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            bPattern = resolvePattern(bPattern, isGlobalBass, beats, null, drumPatForDucking, isGlobalDrum);
            
            bPattern.instances.forEach(instance => {
                if (instance.probability !== undefined && Math.random() > instance.probability) return;

                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const instanceDuration = instance.duration * chordSlotDuration;
                const gateDuration = instanceDuration * (CONFIG.GATE_RATIO || 0.95);
                const finalBassNote = rootNoteMidi + (instance.pitchOffset || 0);
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, state.instruments.bass || 'sine', 'bass');
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, 'sawtooth-bass', 'bassHarmonic');
            });
        }
        
        // --- Schedule Drums ---
        const absBeatStart = getAbsoluteBeatPos(progressionToUse, absIndex);
        const drumPat = chordObj.drumPattern;
        
        if (drumPat && drumPat.isLocalOverride) {
            // Local Punch-In
            if (drumPat.hits) {
                for (const hit of drumPat.hits) {
                    if (hit.probability !== undefined && Math.random() > hit.probability) continue;

                    const hitTimeSec = time + (hit.time * beats * (60.0 / Number(state.bpm)));
                    playDrum(hit.row, hitTimeSec, hit.velocity || 1.0, null, null, state.instruments.drums || 'synth');
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
        } else if (globalPatterns && globalPatterns.drumPattern) {
            // Global Continuous Loop
            const globalDrumPat = globalPatterns.drumPattern;
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
                            playDrum(hit.row, hitTimeSec, hit.velocity || 1.0, null, null, state.instruments.drums || 'synth');
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
            if (onHighlight) onHighlight(absIndex, sectionId, currentMacroIndex);
            uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
        }, Math.max(0, delayMs));
        
        uiTimeouts.push(highlightId);
    }

    function advanceNote() {
        const state = getState();
        let beats = 4;
        
        if (playhead.isMacro) {
            if (state.songSequence.length === 0) return false;
            const sectionId = state.songSequence[playhead.macroIndex];
            const section = state.sections[sectionId];
            if (!section) return false;

            if (section.progression.length === 0) {
                beats = 8; // Default pause for empty sections
                playhead.chordIndex = 9999;
            } else {
                const chordObj = section.progression[playhead.chordIndex];
                beats = chordObj ? (Number(chordObj.duration) || 4) : 4;
                playhead.chordIndex++;
            }
            
            nextNoteTime += (60.0 / Number(state.bpm)) * beats;

            const loopEnd = section.loopEnd ?? section.progression.length;
            if (playhead.chordIndex >= loopEnd || section.progression.length === 0) {
                playhead.macroIndex++;
                if (playhead.macroIndex >= state.songSequence.length) {
                    if (state.isLooping) playhead.macroIndex = 0;
                    else return false;
                }
                const nextSectionId = state.songSequence[playhead.macroIndex];
                const nextSection = state.sections[nextSectionId];
                playhead.chordIndex = nextSection ? (nextSection.loopStart ?? 0) : 0;
            }
            return true;
        } else {
            const bounds = getBounds(state);
            const sliceLength = bounds.end - bounds.start;

            const chordObj = state.currentProgression[bounds.start + playhead.chordIndexRel];
            beats = chordObj ? (Number(chordObj.duration) || 4) : 4;
            nextNoteTime += (60.0 / Number(state.bpm)) * beats;

            playhead.chordIndexRel++;
            if (playhead.chordIndexRel >= sliceLength) {
                if (state.isLooping) playhead.chordIndexRel = 0;
                else return false;
            }
            return true;
        }
    }

    function scheduler() {
        if (!isPlaying) return;
        
        const state = getState();
        if (state.currentProgression.length === 0) {
            stopThisPlayback(); // Use local stop function
            if (onComplete) onComplete();
            return;
        }

        while (nextNoteTime < getAudioCurrentTime() + CONFIG.SCHEDULE_AHEAD_SEC) {
            scheduleNote(nextNoteTime);
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

        schedulerTimerId = setTimeout(scheduler, CONFIG.LOOKAHEAD_MS);
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