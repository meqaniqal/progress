import { getChordNotes, getPlayableNotes, segmentMicrotonalCluster, snapToGrid, getEffectiveTuning, getBassNote, getPitchEditorTuning } from './theory.js';
import { CONFIG } from './config.js';
import { generateArpNotes } from './arp.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, stopOscillators, playDrum } from './synth.js';
import { resolvePattern } from './patternResolver.js';
import { state, getActiveProgression } from './store.js';
import { isSongTrayOpen, getActiveSequenceIndex } from './songController.js';
import { evaluateVoiceEvents, applyInstanceOffsets } from './transitionEvaluator.js';
import { scheduleMelody, clearMelodyMemory } from './melodyGenerator.js';
import { getGrooveOffset } from './grooveEngine.js';

let uiTimeouts = [];
let sequenceHighlightTimeouts = [];

// Voice-leading memoization cache
let cachedPlayableNotes = null;
let cachedPlayableNotesKey = null;

let lastProgressionRef = null;
let lastChordRefs = [];
let lastDivisions = null;
let lastUseVoiceLeading = null;
let lastGlobalVoicing = null;
let lastCustomTuning = null;

export function clearVoiceLeadingCache() {
    cachedPlayableNotes = null;
    cachedPlayableNotesKey = null;
    lastProgressionRef = null;
    lastChordRefs = [];
    lastDivisions = null;
    lastUseVoiceLeading = null;
    lastGlobalVoicing = null;
    lastCustomTuning = null;
}

function getCachedPlayableNotes(progression, appState) {
    const customTuning = appState.customTuning || (typeof window !== 'undefined' ? window.__customTuning : null);
    
    let hasChanged = !cachedPlayableNotes ||
                     progression !== lastProgressionRef ||
                     progression.length !== lastChordRefs.length ||
                     appState.divisions !== lastDivisions ||
                     appState.useVoiceLeading !== lastUseVoiceLeading ||
                     appState.globalVoicing !== lastGlobalVoicing ||
                     customTuning !== lastCustomTuning;

    if (!hasChanged) {
        for (let i = 0; i < progression.length; i++) {
            if (progression[i] !== lastChordRefs[i]) {
                hasChanged = true;
                break;
            }
        }
    }

    if (hasChanged) {
        lastProgressionRef = progression;
        lastChordRefs = [...progression];
        lastDivisions = appState.divisions;
        lastUseVoiceLeading = appState.useVoiceLeading;
        lastGlobalVoicing = appState.globalVoicing;
        lastCustomTuning = customTuning;
        
        cachedPlayableNotes = getPlayableNotes(progression, appState);
    }
    return cachedPlayableNotes;
}


function clearSequenceHighlights() {
    sequenceHighlightTimeouts.forEach(clearTimeout);
    sequenceHighlightTimeouts = [];
    import('./ui.js').then(m => m.highlightChordInUI(-1));
}

export function auditionChord(chordSymbol, baseKey, specificNotes = null, divisions = null) {
    if (!chordSymbol) return;
    
    initAudio();

    const tuning = getEffectiveTuning(chordSymbol, divisions || state.divisions || 12);
    const now = getAudioCurrentTime();
    const chordInst = state.instruments && state.instruments.chords ? state.instruments.chords : 'sawtooth';
    const bassInst = 'sine';

    const panL = state.autoPanLeading ? -0.75 : 0;
    const panR = state.autoPanLeading ? 0.75 : 0;

    // Case 1: Tray Auditioning (Structured sequence object passed as specificNotes)
    if (specificNotes && typeof specificNotes === 'object' && specificNotes.chordSlices) {
        const { chord, voicedNotes, chordSlices, bassSlices } = specificNotes;
        
        // Duration of the chord at a standard 120 BPM
        const beats = Number(chord.duration) || 2;
        const totalDuration = beats * 0.5; // 0.5s per beat (120 BPM)

        // Schedule Chord Slices
        chordSlices.forEach(slice => {
            const sliceStart = now + slice.startTime * totalDuration;
            const sliceDur = slice.duration * totalDuration;
            const segmented = segmentMicrotonalCluster(slice.notes);
            segmented.core.forEach(note => playTone(midiToFreq(note), sliceStart, sliceDur, chordInst, 'chords', 0));
            segmented.frictionLeft.forEach(note => playTone(midiToFreq(note), sliceStart, sliceDur, chordInst, 'chords', panL));
            segmented.frictionRight.forEach(note => playTone(midiToFreq(note), sliceStart, sliceDur, chordInst, 'chords', panR));
        });

        // Schedule Bass Slices
        bassSlices.forEach(slice => {
            const sliceStart = now + slice.startTime * totalDuration;
            const sliceDur = slice.duration * totalDuration;
            playTone(midiToFreq(slice.pitch), sliceStart, sliceDur, bassInst, 'bass');
        });
        return;
    }

    // Case 2: Chord Chooser / Palette Auditioning (Single chord / no slices)
    let chordNotes = Array.isArray(specificNotes) ? specificNotes : null;
    let isVoiced = !!chordNotes;
    
    if (!chordNotes) {
        // Voice it relative to the selected chord in the tray, or last chord, or around 60 (C4)
        const activeProg = getActiveProgression();
        if (activeProg.length > 0) {
            const refIdx = state.selectedChordIndex !== null && state.selectedChordIndex < activeProg.length
                ? state.selectedChordIndex 
                : activeProg.length - 1;
            const refChord = activeProg[refIdx];
            const tempProg = [
                refChord,
                { symbol: chordSymbol, key: baseKey, divisions: divisions || state.divisions || 12 }
            ];
            const voiced = getPlayableNotes(tempProg, state);
            if (voiced && voiced[1] && voiced[1].length > 0) {
                chordNotes = voiced[1];
                isVoiced = true;
            }
        }
        
        if (!isVoiced) {
            const tempProg = [{ symbol: chordSymbol, key: baseKey, divisions: divisions || state.divisions || 12 }];
            const voiced = getPlayableNotes(tempProg, state);
            if (voiced && voiced[0] && voiced[0].length > 0) {
                chordNotes = voiced[0];
                isVoiced = true;
            }
        }
    }

    if (!chordNotes) {
        chordNotes = getChordNotes(chordSymbol, baseKey, tuning.divisions);
    }
    if (!chordNotes) return;

    const rawChordNotes = getChordNotes(chordSymbol, baseKey, tuning.divisions);
    const rootNoteMidi = getBassNote(rawChordNotes || chordNotes, tuning);

    const dropSize = tuning.periodSize > 14 ? 12.0 : tuning.periodSize;
    const notesToPlay = isVoiced ? chordNotes : chordNotes.map(n => n - dropSize);

    // Play chord and bass note
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
    if (state.editorState?.isSolo && state.editorState.activeIndex !== null && state.editorState.activeIndex < secState.progression.length) {
        const idx = state.editorState.activeIndex;
        return { start: idx, end: idx + 1 };
    }
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
    stopAllAudio(onHighlight, true);

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
    const isMgen = initialState.melodySettings && initialState.melodySettings.enabled && initialState.melodySettings.engine === 'mgen';
    nextNoteTime = getAudioCurrentTime() + (isMgen ? 0.15 : 0.05); // Buffer 150ms ahead for clean start in mgen, 50ms otherwise

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
        const absBeatStart = getAbsoluteBeatPos(activeProg, absIndex);
        
        // Must calculate from the full progression to get proper voice leading and inversion context
        const allPlayableNotes = getCachedPlayableNotes(activeProg, state);
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
        const bassInst = 'sine';

        // Evaluate prev/next context for transitions
        const prevAbsIndex = (absIndex - 1 + activeProg.length) % activeProg.length;
        const nextAbsIndex = (absIndex + 1) % activeProg.length;
        const nextChordObj = activeProg[nextAbsIndex];
        const prevChordObj = activeProg[prevAbsIndex];

        const prevNotes = allPlayableNotes[prevAbsIndex] || notesToPlay;
        const nextNotes = allPlayableNotes[nextAbsIndex] || notesToPlay;

        const editorTuning = getPitchEditorTuning(chordObj.symbol, chordObj.divisions || state.divisions || 12);

        // --- Schedule Chord Slice UI Highlights ---
        if (onSlicePlay && pattern.instances) {
            pattern.instances.forEach(instance => {
                const relativeBeat = instance.startTime * beats;
                const offsetBeats = getGrooveOffset(absBeatStart + relativeBeat, state);
                const offsetSec = offsetBeats * (60.0 / Number(state.bpm));
                const instanceStartTime = time + (instance.startTime * chordSlotDuration) + offsetSec;
                const durationMs = instance.duration * chordSlotDuration * 1000;
                const delayMs = (instanceStartTime - getAudioCurrentTime()) * 1000;
                const tId = setTimeout(() => {
                    onSlicePlay(instance.id, durationMs, absIndex);
                    uiTimeouts = uiTimeouts.filter(id => id !== tId);
                }, Math.max(0, delayMs));
                uiTimeouts.push(tId);
            });
        }

        let drumHits = [];
        const activeDrumPat = chordObj.drumPattern;
        if (activeDrumPat && activeDrumPat.isLocalOverride) {
            drumHits = activeDrumPat.hits || [];
        } else if (secState.globalPatterns && secState.globalPatterns.drumPattern) {
            drumHits = secState.globalPatterns.drumPattern.hits || [];
        }

        const voiceEvents = evaluateVoiceEvents(
            pattern.instances,
            pattern.transitions || [],
            notesToPlay,
            prevNotes,
            nextNotes,
            editorTuning,
            state.autoPanLeading,
            chordSlotDuration,
            drumHits,
            chordObj,
            nextChordObj,
            prevChordObj
        );

        voiceEvents.forEach(ev => {
            if (ev.type === 'arp_slice') {
                const instance = ev.slice;
                const instanceRelativeBeat = instance.startTime * beats;
                const instanceStartTime = time + (instance.startTime * chordSlotDuration);
                const instanceDuration = instance.duration * chordSlotDuration;
                
                const arpEvents = generateArpNotes({
                    notesToPlay: instance.adjustedNotes,
                    arpSettings: instance.arpSettings,
                    instanceDuration,
                    bpm: Number(state.bpm)
                });

                arpEvents.forEach(event => {
                    const eventRelativeBeat = instanceRelativeBeat + (event.startTime * Number(state.bpm) / 60.0);
                    const offsetBeats = getGrooveOffset(absBeatStart + eventRelativeBeat, state);
                    const offsetSec = offsetBeats * (60.0 / Number(state.bpm));
                    playTone(midiToFreq(event.note), instanceStartTime + event.startTime + offsetSec, event.duration, chordInst, 'chords');
                });
            } else {
                const relativeBeat = ev.startTime * beats;
                const offsetBeats = getGrooveOffset(absBeatStart + relativeBeat, state);
                const offsetSec = offsetBeats * (60.0 / Number(state.bpm));
                const instanceStartTime = time + (ev.startTime * chordSlotDuration) + offsetSec;
                const instanceDuration = ev.duration * chordSlotDuration;
                const gateDuration = instanceDuration * 0.95; // Slight gate so contiguous chops are distinctly audible
                playTone(midiToFreq(ev.pitch), instanceStartTime, gateDuration, chordInst, 'chords', ev.pan);
            }
        });
        
        const rootSymbol = chordObj.symbol;
        const rootKey = chordObj.key;
        const tuning = getEffectiveTuning(rootSymbol, chordObj.divisions || state.divisions || 12);
        const rootChordNotes = getChordNotes(chordObj, rootKey, tuning.divisions);
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

                const relativeBeat = instance.startTime * beats;
                const offsetBeats = getGrooveOffset(absBeatStart + relativeBeat, state);
                const offsetSec = offsetBeats * (60.0 / Number(state.bpm));

                const instanceStartTime = time + (instance.startTime * chordSlotDuration) + offsetSec;
                const instanceDuration = instance.duration * chordSlotDuration;
                
                // --- Schedule Bass Slice UI Highlights ---
                if (onSlicePlay && instance.id) {
                    const delayMs = (instanceStartTime - getAudioCurrentTime()) * 1000;
                    const durationMs = instanceDuration * 1000;
                    const tId = setTimeout(() => {
                        onSlicePlay(instance.id, durationMs, absIndex);
                        uiTimeouts = uiTimeouts.filter(id => id !== tId);
                    }, Math.max(0, delayMs));
                    uiTimeouts.push(tId);
                }
                
                const gateDuration = instanceDuration * 0.95;
                const editorTuning = getPitchEditorTuning(rootSymbol, chordObj.divisions || state.divisions || 12);
                const snappedOffset = snapToGrid(60 + (instance.pitchOffset || 0), editorTuning) - 60;
                const finalBassNote = rootNoteMidi + snappedOffset;
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, 'sine', 'bass');
                playTone(midiToFreq(finalBassNote), instanceStartTime, gateDuration, state.instruments.bassSecondary || 'sawtooth', 'bassHarmonic');
            });
        }

        // --- Schedule Melody & Countermelody with Groove Offset Wrapper ---
        const wrappedPlayTone = (freq, stepTime, duration, inst, bus, pan) => {
            const relTimeSec = stepTime - time;
            const relBeat = relTimeSec / (60.0 / Number(state.bpm));
            const offsetBeats = getGrooveOffset(absBeatStart + relBeat, state);
            const offsetSec = offsetBeats * (60.0 / Number(state.bpm));
            playTone(freq, stepTime + offsetSec, duration, inst, bus, pan);
        };

        scheduleMelody(
            time,
            chordObj,
            nextChordObj,
            prevChordObj,
            chordSlotDuration,
            beats,
            Number(state.bpm),
            absIndex,
            activeProg.length,
            notesToPlay,
            wrappedPlayTone,
            voiceEvents
        );
        
        // --- Schedule Drums ---
        const drumPat = chordObj.drumPattern;
        
        if (drumPat && drumPat.isLocalOverride) {
            // Local Punch-In
            if (drumPat.hits) {
                for (const hit of drumPat.hits) {
                    if (hit.probability != null && Math.random() > hit.probability) continue;

                    const relativeBeat = hit.time * beats;
                    const offsetBeats = getGrooveOffset(absBeatStart + relativeBeat, state);
                    const offsetSec = offsetBeats * (60.0 / Number(state.bpm));

                    const hitTimeSec = time + (hit.time * beats * (60.0 / Number(state.bpm))) + offsetSec;
                    playDrum(hit.row, hitTimeSec, hit.velocity || 1.0);
                    if (onDrumPlay && hit.id) {
                        const delayMs = (hitTimeSec - getAudioCurrentTime()) * 1000;
                        const tId = setTimeout(() => {
                            onDrumPlay(hit.id, absIndex);
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
                    
                    if (absoluteHitBeat < absBeatStartRounded) {
                        absoluteHitBeat += gLength;
                    }
                    
                    while (absoluteHitBeat < chordEndBeatRounded) {
                        const beatWithinChord = absoluteHitBeat - absBeatStartRounded;
                        const hitAbsoluteBeat = absBeatStart + beatWithinChord;
                        const offsetBeats = getGrooveOffset(hitAbsoluteBeat, state);
                        const offsetSec = offsetBeats * (60.0 / Number(state.bpm));

                        const hitTimeSec = time + (beatWithinChord * (60.0 / Number(state.bpm))) + offsetSec;
                        if (hit.probability === undefined || Math.random() <= hit.probability) {
                            playDrum(hit.row, hitTimeSec, hit.velocity || 1.0);
                            if (onDrumPlay && hit.id) {
                                const delayMs = (hitTimeSec - getAudioCurrentTime()) * 1000;
                                const tId = setTimeout(() => {
                                    onDrumPlay(hit.id, absIndex);
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
            
            // Regenerate mgen melody on loop wrap-around
            if (state.melodySettings && state.melodySettings.enabled && state.melodySettings.engine === 'mgen') {
                import('./mgenEngine.js').then(m => m.pregenerateMgenMelody(state)).catch(err => console.error('Error regenerating mgen melody on loop:', err));
            }
            
            if (state.editorState?.isSolo) {
                // If in solo mode, keep looping the active chord within the active section
                return true;
            }
            
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
        clearMelodyMemory();
    }

    scheduler(); // Start the scheduler

    return stopThisPlayback; // Return the stop function for this instance
}

// Export a general stop function that can be called if no specific playback instance is available
export function stopAllAudio(onHighlightCallback, keepMelodyCache = false) {
    uiTimeouts.forEach(clearTimeout);
    uiTimeouts = [];
    clearSequenceHighlights();
    if (onHighlightCallback) onHighlightCallback(-1);

    stopOscillators();
    if (!keepMelodyCache) {
        clearMelodyMemory();
    }
}

function scheduleChordAudition(chordSymbol, baseKey, specificNotes, divisions, startTime, duration) {
    if (!chordSymbol) return;
    const tuning = getEffectiveTuning(chordSymbol, divisions || state.divisions || 12);
    let chordNotes = specificNotes;
    if (!chordNotes) {
        chordNotes = getChordNotes(chordSymbol, baseKey, tuning.divisions);
    }
    if (!chordNotes) return;

    const rawChordNotes = getChordNotes(chordSymbol, baseKey, tuning.divisions);
    const rootNoteMidi = getBassNote(rawChordNotes || chordNotes, tuning);
    const dropSize = tuning.periodSize > 14 ? 12.0 : tuning.periodSize;
    const notesToPlay = specificNotes || chordNotes.map(n => n - dropSize);

    const chordInst = state.instruments?.chords || 'sawtooth';
    const bassInst = 'sine';

    const panL = state.autoPanLeading ? -0.75 : 0;
    const panR = state.autoPanLeading ? 0.75 : 0;

    const segmented = segmentMicrotonalCluster(notesToPlay);
    segmented.core.forEach(note => playTone(midiToFreq(note), startTime, duration, chordInst, 'chords', 0));
    segmented.frictionLeft.forEach(note => playTone(midiToFreq(note), startTime, duration, chordInst, 'chords', panL));
    segmented.frictionRight.forEach(note => playTone(midiToFreq(note), startTime, duration, chordInst, 'chords', panR));

    playTone(midiToFreq(rootNoteMidi), startTime, duration, bassInst, 'bass');
}

function getAuditionNotesForSeq(progression, idx, appState) {
    let notesToPlay = getCachedPlayableNotes(progression, appState)[idx];
    if (!notesToPlay) return null;
    
    const chord = progression[idx];
    let pattern = chord.chordPattern;
    if (pattern && !pattern.isLocalOverride && appState.globalPatterns && appState.globalPatterns.chordPattern) {
        pattern = appState.globalPatterns.chordPattern;
    }
    
    if (pattern && pattern.instances && pattern.instances.length > 0) {
        let targetInstance = null;
        if (appState.editorState && appState.editorState.activeIndex === idx) {
            targetInstance = pattern.instances.find(inst => inst.isSelected);
        }
        if (!targetInstance) {
            const instances = [...pattern.instances].sort((a, b) => a.startTime - b.startTime);
            targetInstance = instances[0];
        }
        if (targetInstance) {
            const tuning = getEffectiveTuning(chord.symbol, chord.divisions || appState.divisions || 12);
            notesToPlay = applyInstanceOffsets(notesToPlay, targetInstance, chord, tuning);
        }
    }
    return notesToPlay;
}

export function auditionThreeChordSequence(index, substituteSymbol, targetKey, state) {
    initAudio();
    stopAllAudio();

    const bpm = state.bpm || 120;
    const beatLen = 60.0 / bpm;
    // Comfortably paced duration for each chord in sequence
    const chordDuration = CONFIG.VL_GATE_DURATION_SEC; 

    // Build the temporary progression to voice lead the substitute chord correctly,
    // using the active progression (with other temporary swaps active) as context.
    const activeProg = getActiveProgression();
    const tempProg = activeProg.map((c, idx) => {
        if (idx === index) {
            const swapKey = targetKey !== undefined ? targetKey : c.key;
            return { ...c, symbol: substituteSymbol, key: swapKey };
        }
        return c;
    });

    const now = getAudioCurrentTime() + 0.05; // 50ms scheduling buffer
    let currentTime = now;
    const audioTime = getAudioCurrentTime();

    // Helper to queue highlights matching the audition timing
    const scheduleHighlight = (chordIdx, startTime) => {
        const delayMs = Math.max(0, (startTime - audioTime) * 1000);
        const t = setTimeout(() => {
            import('./ui.js').then(m => m.highlightChordInUI(chordIdx));
        }, delayMs);
        sequenceHighlightTimeouts.push(t);
    };

    // 1. Preceding Chord
    if (index > 0) {
        scheduleHighlight(index - 1, currentTime);
        const precChord = tempProg[index - 1];
        const precNotes = getAuditionNotesForSeq(tempProg, index - 1, state);
        scheduleChordAudition(precChord.symbol, precChord.key, precNotes, precChord.divisions, currentTime, chordDuration);
        currentTime += chordDuration;
    }

    // 2. Substitute Chord
    scheduleHighlight(index, currentTime);
    const subNotes = getAuditionNotesForSeq(tempProg, index, state);
    scheduleChordAudition(substituteSymbol, targetKey !== undefined ? targetKey : activeProg[index].key, subNotes, activeProg[index].divisions, currentTime, chordDuration);
    currentTime += chordDuration;

    // 3. Following Chord
    if (index < tempProg.length - 1) {
        scheduleHighlight(index + 1, currentTime);
        const follChord = tempProg[index + 1];
        const follNotes = getAuditionNotesForSeq(tempProg, index + 1, state);
        scheduleChordAudition(follChord.symbol, follChord.key, follNotes, follChord.divisions, currentTime, chordDuration);
        currentTime += chordDuration;
    }

    // Clear highlight at the end of the sequence
    const endTimeout = setTimeout(() => {
        import('./ui.js').then(m => m.highlightChordInUI(-1));
    }, Math.max(0, (currentTime - audioTime) * 1000));
    sequenceHighlightTimeouts.push(endTimeout);
}