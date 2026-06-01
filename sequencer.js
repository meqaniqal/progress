import { getChordNotes, getPlayableNotes, segmentMicrotonalCluster, snapToGrid, getEffectiveTuning, getBassNote, getPitchEditorTuning } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, stopOscillators, playDrum } from './synth.js';
import { resolvePattern } from './patternResolver.js';
import { state } from './store.js';
import { isSongTrayOpen, getActiveSequenceIndex } from './songController.js';
import { evaluateVoiceEvents } from './transitionEvaluator.js';

let uiTimeouts = [];

export function auditionChord(chordSymbol, baseKey, specificNotes = null, divisions = null) {
    if (!chordSymbol) return;
    
    initAudio();

    const tuning = getEffectiveTuning(chordSymbol, divisions || state.divisions || 12);
    const chordNotes = getChordNotes(chordSymbol, baseKey, tuning.divisions);
    if (!chordNotes) return;

    const rootNoteMidi = getBassNote(chordNotes, tuning);
    const now = getAudioCurrentTime();
    const dropSize = tuning.periodSize > 14 ? 12.0 : tuning.periodSize;
    const notesToPlay = specificNotes || chordNotes.map(n => n - dropSize);

    const chordInst = state.instruments && state.instruments.chords ? state.instruments.chords : 'sawtooth';
    const bassInst = state.instruments && state.instruments.bass ? state.instruments.bass : 'sine';

    const panL = state.autoPanLeading ? -0.75 : 0;
    const panR = state.autoPanLeading ? 0.75 : 0;

    // Play chord and bass note without interrupting main playback loop
    const segmented = segmentMicrotonalCluster(notesToPlay);
    segmented.core.forEach(note => playTone(midiToFreq(note), now, CONFIG.AUDITION_DURATION_SEC, chordInst, 'chords', 0));
    segmented.frictionLeft.forEach(note => playTone(midiToFreq(note), now, CONFIG.AUDITION_DURATION_SEC, chordInst, 'chords', panL));
    segmented.frictionRight.forEach(note => playTone(midiToFreq(note), now, CONFIG.AUDITION_DURATION_SEC, chordInst, 'chords', panR));

    playTone(midiToFreq(rootNoteMidi), now, CONFIG.AUDITION_DURATION_SEC, bassInst, 'bass');
}

function getSectionState(state, macroIndex) {
    if (isSongTrayOpen && state.songSequence && state.songSequence.length > 0) {
        const secId = state.songSequence[macroIndex];
        if (secId && state.sections[secId]) {
            const sec = state.sections[secId];
            return {
                progression: sec.progression,
                globalPatterns: sec.globalPatterns,
                temporarySwaps: state.activeSectionId === secId ? state.temporarySwaps : (sec.temporarySwaps || {}),
                loopStart: state.activeSectionId === secId ? state.loopStart : (sec.loopStart ?? 0),
                loopEnd: state.activeSectionId === secId ? state.loopEnd : (sec.loopEnd ?? sec.progression.length),
                sectionId: secId
            };
        }
    }
    return {
        progression: state.currentProgression,
        globalPatterns: state.globalPatterns,
        temporarySwaps: state.temporarySwaps,
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
        sectionId: state.activeSectionId
    };
}

function getBounds(secState, isLooping) {
    let start = isLooping ? (typeof secState.loopStart === 'number' ? secState.loopStart : 0) : 0;
    let end = isLooping ? (typeof secState.loopEnd === 'number' ? secState.loopEnd : secState.progression.length) : secState.progression.length;
    if (end <= start) end = start + 1;
    if (end > secState.progression.length) end = secState.progression.length;
    start = Math.max(0, Math.min(start, secState.progression.length));
    end = Math.max(start, Math.min(end, secState.progression.length));
    return { start, end };
}

function getAbsoluteBeatPos(progression, index) {
    let beats = 0;
    for (let i = 0; i < index; i++) {
        beats += Number(progression[i].duration) || 2;
    }
    return beats;
}

function getActive(secState) {
    if (!secState.temporarySwaps) return secState.progression;
    return secState.progression.map((chord, index) => {
        if (secState.temporarySwaps[index] !== undefined) {
            return { ...chord, ...secState.temporarySwaps[index] };
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
export function playProgression(getState, onHighlight, onComplete, onDrumPlay, onSlicePlay) {
    initAudio();

    let nextNoteTime = 0.0;
    let currentChordIndexRel = 0;
    let currentMacroIndex = 0;
    let schedulerTimerId = null;
    let isPlaying = true; // Local state for this playback instance

    // Immediately stop any currently playing audio from this module
    // This ensures only one progression plays at a time from this module's API.
    stopAllAudio(onHighlight);

    const initialState = getState();
    
    if (isSongTrayOpen && initialState.songSequence.length > 0) {
        currentMacroIndex = getActiveSequenceIndex();
        if (currentMacroIndex === null || currentMacroIndex < 0 || currentMacroIndex >= initialState.songSequence.length) {
            currentMacroIndex = initialState.macroLoopStart ?? 0;
        }
        const mStart = initialState.macroLoopStart ?? 0;
        const mEnd = initialState.macroLoopEnd > 0 ? initialState.macroLoopEnd : initialState.songSequence.length;
        if (currentMacroIndex < mStart || currentMacroIndex >= mEnd) {
            currentMacroIndex = mStart;
        }
    }

    const initialSecState = getSectionState(initialState, currentMacroIndex);
    if (initialSecState.progression.length === 0 && (!isSongTrayOpen || initialState.songSequence.length === 0)) {
        return () => {}; // Return a no-op stop function if nothing to play
    }

    currentChordIndexRel = 0; // Start from the beginning of the slice
    nextNoteTime = getAudioCurrentTime() + 0.05; // Buffer 50ms ahead for clean start

    function scheduleNote(chordIndexRel, time) {
        const state = getState(); // Always get the latest state
        const secState = getSectionState(state, currentMacroIndex);
        const activeProg = getActive(secState);
        const bounds = getBounds(secState, state.isLooping);
        const sliceLength = bounds.end - bounds.start;
        
        if (sliceLength === 0) {
            const delayMs = (time - getAudioCurrentTime()) * 1000;
            const highlightId = setTimeout(() => {
                if (onHighlight) onHighlight(-1, secState.sectionId, currentMacroIndex);
                uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
            }, Math.max(0, delayMs));
            uiTimeouts.push(highlightId);
            return;
        }
        
        // Safety bound: if user deleted a chord while playing and shrunk the array
        if (chordIndexRel >= sliceLength) {
            chordIndexRel %= sliceLength;
        }

        const absIndex = bounds.start + chordIndexRel;
        
        // Must calculate from the full progression to get proper voice leading and inversion context
        const allPlayableNotes = getPlayableNotes(activeProg, state);
        const notesToPlay = allPlayableNotes[absIndex];
        
        if (!notesToPlay) return;

        const chordObj = activeProg[absIndex];
        const beats = Number(chordObj.duration) || 2;
        const chordSlotDuration = (60.0 / Number(state.bpm)) * beats;
        
        let pattern = chordObj.chordPattern;
        let isGlobalChord = false;
        if (pattern && !pattern.isLocalOverride && secState.globalPatterns && secState.globalPatterns.chordPattern) {
            pattern = secState.globalPatterns.chordPattern;
            isGlobalChord = true;
        }
        pattern = pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
        pattern = resolvePattern(pattern, isGlobalChord, beats);

        const chordInst = state.instruments && state.instruments.chords ? state.instruments.chords : 'sawtooth';
        const bassInst = state.instruments && state.instruments.bass ? state.instruments.bass : 'sine';

        // Evaluate prev/next context for transitions
        const prevAbsIndex = (absIndex - 1 + activeProg.length) % activeProg.length;
        const nextAbsIndex = (absIndex + 1) % activeProg.length;

        const prevNotes = allPlayableNotes[prevAbsIndex] || notesToPlay;
        const nextNotes = allPlayableNotes[nextAbsIndex] || notesToPlay;

        const editorTuning = getPitchEditorTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);

        // --- Schedule Chord Slice UI Highlights ---
        if (onSlicePlay && pattern.instances) {
            pattern.instances.forEach(instance => {
                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const durationMs = instance.duration * chordSlotDuration * 1000;
                const delayMs = (instanceStartTime - getAudioCurrentTime()) * 1000;
                const tId = setTimeout(() => {
                    onSlicePlay(instance.id, durationMs);
                    uiTimeouts = uiTimeouts.filter(id => id !== tId);
                }, Math.max(0, delayMs));
                uiTimeouts.push(tId);
            });
        }

        const voiceEvents = evaluateVoiceEvents(
            pattern.instances,
            pattern.transitions || [],
            notesToPlay,
            prevNotes,
            nextNotes,
            editorTuning,
            state.autoPanLeading
        );

        voiceEvents.forEach(ev => {
            if (ev.type === 'arp_slice') {
                const instance = ev.slice;
                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const instanceDuration = instance.duration * chordSlotDuration;
                
                const arpEvents = generateArpNotes({
                    notesToPlay: instance.adjustedNotes,
                    arpSettings: instance.arpSettings,
                    instanceDuration,
                    bpm: Number(state.bpm)
                });

                arpEvents.forEach(event => {
                    playTone(midiToFreq(event.note), instanceStartTime + event.startTime, event.duration, chordInst, 'chords');
                });
            } else {
                const instanceStartTime = time + (ev.startTime * chordSlotDuration);
                const instanceDuration = ev.duration * chordSlotDuration;
                const gateDuration = instanceDuration * 0.95; // Slight gate so contiguous chops are distinctly audible
                playTone(midiToFreq(ev.pitch), instanceStartTime, gateDuration, chordInst, 'chords', ev.pan);
            }
        });
        
        const rootSymbol = chordObj.symbol;
        const rootKey = chordObj.key;
        const tuning = getEffectiveTuning(rootSymbol, chordObj.divisions || state.divisions || 12);
        const rootChordNotes = getChordNotes(rootSymbol, rootKey, tuning.divisions);
        if (rootChordNotes) {
            const rootNoteMidi = getBassNote(rootChordNotes, tuning);
            
            let bPattern = chordObj.bassPattern;
            let isGlobalBass = false;
            if (bPattern && !bPattern.isLocalOverride && secState.globalPatterns && secState.globalPatterns.bassPattern) {
                bPattern = secState.globalPatterns.bassPattern;
                isGlobalBass = true;
            }
            bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            bPattern = resolvePattern(bPattern, isGlobalBass, beats);
            
            bPattern.instances.forEach(instance => {
                if (instance.probability != null && Math.random() > instance.probability) return;

                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const instanceDuration = instance.duration * chordSlotDuration;
                
                // --- Schedule Bass Slice UI Highlights ---
                if (onSlicePlay && instance.id) {
                    const delayMs = (instanceStartTime - getAudioCurrentTime()) * 1000;
                    const durationMs = instanceDuration * 1000;
                    const tId = setTimeout(() => {
                        onSlicePlay(instance.id, durationMs);
                        uiTimeouts = uiTimeouts.filter(id => id !== tId);
                    }, Math.max(0, delayMs));
                    uiTimeouts.push(tId);
                }
                
                const gateDuration = instanceDuration * 0.95;
                const editorTuning = getPitchEditorTuning(rootSymbol, chordObj.divisions || state.divisions || 12);
                const snappedOffset = snapToGrid(60 + (instance.pitchOffset || 0), editorTuning) - 60;
                const finalBassNote = rootNoteMidi + snappedOffset;
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, bassInst, 'bass');
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, 'sawtooth-bass', 'bassHarmonic');
            });
        }
        
        // --- Schedule Drums ---
        const absBeatStart = getAbsoluteBeatPos(activeProg, absIndex);
        const drumPat = chordObj.drumPattern;
        
        if (drumPat && drumPat.isLocalOverride) {
            // Local Punch-In
            if (drumPat.hits) {
                for (const hit of drumPat.hits) {
                    if (hit.probability != null && Math.random() > hit.probability) continue;

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
        } else if (secState.globalPatterns && secState.globalPatterns.drumPattern) {
            // Global Continuous Loop
            const globalDrumPat = secState.globalPatterns.drumPattern;
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
        const highlightSectionId = secState.sectionId;
        const highlightMacroIndex = currentMacroIndex;
        const highlightId = setTimeout(() => {
            if (onHighlight) onHighlight(absIndex, highlightSectionId, highlightMacroIndex);
            uiTimeouts = uiTimeouts.filter(id => id !== highlightId);
        }, Math.max(0, delayMs));
        
        uiTimeouts.push(highlightId);
    }

    function advanceNote() {
        const state = getState();
        const secState = getSectionState(state, currentMacroIndex);
        const activeProg = getActive(secState);
        const bounds = getBounds(secState, state.isLooping);
        const sliceLength = bounds.end - bounds.start;

        const chordObj = activeProg[bounds.start + currentChordIndexRel];
        const beats = chordObj ? (Number(chordObj.duration) || 2) : 2;
        const chordDuration = (60.0 / Number(state.bpm)) * beats;
        nextNoteTime += chordDuration;

        currentChordIndexRel++;
        if (currentChordIndexRel >= sliceLength || sliceLength === 0) {
            currentChordIndexRel = 0; // Wrap around for looping
            
            if (isSongTrayOpen && state.songSequence.length > 0) {
                currentMacroIndex++;
                let mStart = state.macroLoopStart ?? 0;
                let mEnd = state.macroLoopEnd > 0 ? state.macroLoopEnd : state.songSequence.length;
                
                if (currentMacroIndex >= mEnd) {
                    if (state.isLooping) {
                        currentMacroIndex = mStart;
                    } else {
                        return false;
                    }
                }
            } else {
                if (!state.isLooping) {
                    return false; // Reached end of unlooped progression
                }
            }
        }
        return true;
    }

    function scheduler() {
        if (!isPlaying) {
            return;
        }
        
        const state = getState();
        const secState = getSectionState(state, currentMacroIndex);
        if (secState.progression.length === 0 && (!isSongTrayOpen || state.songSequence.length === 0)) {
            stopThisPlayback(); // Use local stop function
            if (onComplete) onComplete();
            return;
        }

        while (nextNoteTime < getAudioCurrentTime() + CONFIG.SCHEDULE_AHEAD_SEC) {
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