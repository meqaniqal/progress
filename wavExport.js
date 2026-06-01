import { getChordNotes, getPlayableNotes, segmentMicrotonalCluster, snapToGrid, getEffectiveTuning, getBassNote, getPitchEditorTuning } from './theory.js';
import { CONFIG } from './config.js';
import { audioBufferToWav } from './wavEncoder.js';
import { generateArpNotes } from './arp.js';
import { resolvePattern } from './patternResolver.js';
import { playDrum, initAudio } from './synth.js';
import { SYNTH_REGISTRY } from './synthEngines.js';
import { evaluateVoiceEvents } from './transitionEvaluator.js';
import { state as appState, getActiveProgression } from './store.js';
import { isSongTrayOpen } from './songController.js';

// --- Layer 1: Pure Timeline Calculator (Testable) ---
export function calculateAudioTimeline(progression, bpm, useVoiceLeading, exportPasses = 1, globalOptions = {}) {
    const timeline = [];
    let currentTime = 0;
    let currentBeat = 0;

    let notesArray = [];
    let exportProgression = [];
    let trueStartIndex = 0;
    let trueProgressionLength = progression.length;

    if (!isSongTrayOpen && globalOptions.currentProgression) {
        const fullProgression = getActiveProgression();
        notesArray = getPlayableNotes(fullProgression, globalOptions);
        trueStartIndex = appState.loopStart ?? 0;
        trueProgressionLength = fullProgression.length;
        exportProgression = progression;
    } else {
        let currentChunk = [];
        for (let i = 0; i < progression.length; i++) {
            const chord = progression[i];
            if (chord._isSectionStart && currentChunk.length > 0) {
                notesArray = notesArray.concat(getPlayableNotes(currentChunk, globalOptions));
                currentChunk = [];
            }
            currentChunk.push(chord);
        }
        if (currentChunk.length > 0) {
            notesArray = notesArray.concat(getPlayableNotes(currentChunk, globalOptions));
        }
        const startIndex = globalOptions.loopStart ?? 0;
        const endIndex = (globalOptions.loopEnd > startIndex) ? globalOptions.loopEnd : progression.length;
        exportProgression = progression.slice(startIndex, endIndex);
        trueStartIndex = startIndex;
        trueProgressionLength = progression.length;
    }

    const chordInst = globalOptions.instruments && globalOptions.instruments.chords ? globalOptions.instruments.chords : 'sawtooth';
    const bassInst = globalOptions.instruments && globalOptions.instruments.bass ? globalOptions.instruments.bass : 'sine';

    for (let pass = 0; pass < exportPasses; pass++) {
        exportProgression.forEach((chord, index) => {
            const absIndex = trueStartIndex + index;
            const chordNotes = notesArray[absIndex];
            
            let pattern = chord.chordPattern;
            let isGlobalChord = false;
            if (pattern && !pattern.isLocalOverride && globalOptions.globalPatterns && globalOptions.globalPatterns.chordPattern) {
                pattern = globalOptions.globalPatterns.chordPattern;
                isGlobalChord = true;
            }
            pattern = pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
            pattern = resolvePattern(pattern, isGlobalChord, Number(chord.duration) || 2);
            
            const beats = Number(chord.duration) || 2;
            const duration = (60.0 / Number(bpm)) * beats;

            if (chordNotes) {
                const prevNotes = notesArray[(absIndex - 1 + trueProgressionLength) % trueProgressionLength] || chordNotes;
                const nextNotes = notesArray[(absIndex + 1) % trueProgressionLength] || chordNotes;

                const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);

                const voiceEvents = evaluateVoiceEvents(
                    pattern.instances,
                    pattern.transitions || [],
                    chordNotes,
                    prevNotes,
                    nextNotes,
                    editorTuning,
                    globalOptions.autoPanLeading !== false,
                    duration
                );

                voiceEvents.forEach(ev => {
                    if (ev.type === 'arp_slice') {
                        const instance = ev.slice;
                        const instanceStartTime = currentTime + (instance.startTime * duration);
                        const instanceDuration = instance.duration * duration;
                        
                        const arpEvents = generateArpNotes({
                            notesToPlay: instance.adjustedNotes,
                            arpSettings: instance.arpSettings,
                            instanceDuration: instanceDuration,
                            bpm: Number(bpm)
                        });
                        
                        arpEvents.forEach(event => {
                            timeline.push({
                                midiNote: event.note,
                                freq: Math.pow(2, (event.note - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                                startTime: instanceStartTime + event.startTime,
                                duration: event.duration, // generateArpNotes handles the exact gate logic
                                type: chordInst,
                                track: 'chords',
                                pan: 0
                            });
                        });
                    } else {
                        const instanceStartTime = currentTime + (ev.startTime * duration);
                        const instanceDuration = ev.duration * duration;
                        const gateDuration = instanceDuration * 0.95; // Slight gate
                        
                        timeline.push({
                            midiNote: ev.pitch,
                            freq: Math.pow(2, (ev.pitch - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                            startTime: instanceStartTime,
                            duration: gateDuration,
                            type: chordInst,
                            track: 'chords',
                            pan: ev.pan
                        });
                    }
                });
            }
            
            // Add Bass Note
            const tuning = getEffectiveTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);
            const rootChordNotes = getChordNotes(chord.symbol, chord.key, tuning.divisions);
            if (rootChordNotes) {
                const bassNote = getBassNote(rootChordNotes, tuning);
                
                let bPattern = chord.bassPattern;
                let isGlobalBass = false;
                if (bPattern && !bPattern.isLocalOverride && globalOptions.globalPatterns && globalOptions.globalPatterns.bassPattern) {
                    bPattern = globalOptions.globalPatterns.bassPattern;
                    isGlobalBass = true;
                }
                bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
                bPattern = resolvePattern(bPattern, isGlobalBass, Number(chord.duration) || 2);

                bPattern.instances.forEach(instance => {
                    if (instance.probability !== undefined && Math.random() > instance.probability) return;

                    const instanceStartTime = currentTime + (instance.startTime * duration);
                    const instanceDuration = instance.duration * duration;
                    const gateDuration = instanceDuration * 0.95;

                    const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || globalOptions.divisions || 12);
                    const snappedOffset = snapToGrid(60 + (instance.pitchOffset || 0), editorTuning) - 60;
                    const finalBassNote = bassNote + snappedOffset;

                    timeline.push({
                        midiNote: finalBassNote,
                        freq: Math.pow(2, (finalBassNote - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                        startTime: instanceStartTime,
                        duration: gateDuration,
                        type: bassInst,
                        track: 'bass',
                        pan: 0
                    });

                    // --- Bass Harmonic Layer (Sawtooth Enhance) ---
                    timeline.push({
                        midiNote: finalBassNote,
                        freq: Math.pow(2, (finalBassNote - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                        startTime: instanceStartTime,
                        duration: gateDuration,
                        type: 'sawtooth-bass',
                        track: 'bassHarmonic',
                        pan: 0
                    });
                });
            }
            
            // Add Drums
            const drumPat = chord.drumPattern;
            if (drumPat && drumPat.isLocalOverride) {
                if (drumPat.hits) {
                    for (const hit of drumPat.hits) {
                        if (hit.probability !== undefined && Math.random() > hit.probability) continue;

                        const hitTimeSec = currentTime + (hit.time * beats * (60.0 / Number(bpm)));
                        timeline.push({
                            type: 'drum',
                            drumType: hit.row,
                            startTime: hitTimeSec,
                            velocity: hit.velocity || 1.0,
                            duration: 0.5 // Safe max length bound
                        });
                    }
                }
            } else if (globalOptions.globalPatterns && globalOptions.globalPatterns.drumPattern) {
                const globalDrumPat = globalOptions.globalPatterns.drumPattern;
                const gLength = globalDrumPat.lengthBeats || 4;
                
                if (globalDrumPat.hits) {
                    for (const hit of globalDrumPat.hits) {
                        if (hit.time >= 1.0) continue; // Non-destructive truncation
                        const hitBeatOffset = hit.time * gLength;
                        let loopStartBeat = Math.floor(currentBeat / gLength) * gLength;
                        
                        let absoluteHitBeat = Math.round((loopStartBeat + hitBeatOffset) * 10000) / 10000;
                        let currentBeatRounded = Math.round(currentBeat * 10000) / 10000;
                        let chordEndBeatRounded = Math.round((currentBeat + beats) * 10000) / 10000;
                        
                        if (absoluteHitBeat < currentBeatRounded) absoluteHitBeat += gLength;
                        
                        while (absoluteHitBeat < chordEndBeatRounded) {
                            const beatWithinChord = absoluteHitBeat - currentBeatRounded;
                            const hitTimeSec = currentTime + (beatWithinChord * (60.0 / Number(bpm)));
                            if (hit.probability === undefined || Math.random() <= hit.probability) {
                                timeline.push({
                                    type: 'drum',
                                    drumType: hit.row,
                                    startTime: hitTimeSec,
                                velocity: hit.velocity || 1.0,
                                duration: 0.5 // Safe max length bound
                                });
                            }
                            absoluteHitBeat += gLength;
                            absoluteHitBeat = Math.round(absoluteHitBeat * 10000) / 10000;
                        }
                    }
                }
            }
            
            currentTime += duration;
            currentBeat += beats;
        });
    }
    return timeline;
}

// --- Layer 2: Browser Audio Renderer (Integration) ---
export async function exportToWav(state, buttonElement) {
    if (!state.currentProgression || state.currentProgression.length === 0) {
        alert("Please add some chords to the progression first!");
        return;
    }

    const originalText = buttonElement ? buttonElement.textContent : 'Exporting...';
    if (buttonElement) buttonElement.textContent = 'Rendering...';

    try {
        initAudio(); // Ensures the global noise buffer exists for snare/hi-hats
        const timeline = calculateAudioTimeline(state.currentProgression, state.bpm, state.useVoiceLeading, state.exportPasses, state);
        if (timeline.length === 0) return;

        const startIndex = state.loopStart ?? 0;
        const endIndex = (state.loopEnd > startIndex) ? state.loopEnd : state.currentProgression.length;
        const totalBeats = state.currentProgression.slice(startIndex, endIndex).reduce((sum, chord) => sum + (Number(chord.duration) || 2), 0) * (state.exportPasses || 1);
        const exactRenderDurationSec = (60.0 / state.bpm) * totalBeats;
        
        const sampleRate = 44100;
        const lengthFrames = Math.max(1, Math.ceil(sampleRate * exactRenderDurationSec));
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, lengthFrames, sampleRate);

        const masterCompressor = offlineCtx.createDynamicsCompressor();
        masterCompressor.threshold.value = CONFIG.COMPRESSOR_THRESHOLD;
        masterCompressor.knee.value = CONFIG.COMPRESSOR_KNEE;
        masterCompressor.ratio.value = CONFIG.COMPRESSOR_RATIO;
        masterCompressor.attack.value = CONFIG.COMPRESSOR_ATTACK;
        masterCompressor.release.value = CONFIG.COMPRESSOR_RELEASE;
        masterCompressor.connect(offlineCtx.destination);
        
        const chordsGain = offlineCtx.createGain(); chordsGain.gain.value = state.volumes.chords ?? 0.8;
        const bassGain = offlineCtx.createGain(); bassGain.gain.value = state.volumes.bass ?? 0.8;
        const bassHarmonicGain = offlineCtx.createGain(); bassHarmonicGain.gain.value = state.volumes.bassHarmonic ?? 0.0;
        const drumsGain = offlineCtx.createGain(); drumsGain.gain.value = state.volumes.drums ?? 0.8;
        
        chordsGain.connect(masterCompressor);
        bassGain.connect(masterCompressor);
        bassHarmonicGain.connect(masterCompressor);
        drumsGain.connect(masterCompressor);

        timeline.forEach(ev => {
            if (ev.type === 'drum') {
                playDrum(ev.drumType, ev.startTime, ev.velocity, offlineCtx, drumsGain);
                return;
            }

            let targetGainNode = bassGain;
            if (ev.track === 'chords') targetGainNode = chordsGain;
            else if (ev.track === 'bassHarmonic') targetGainNode = bassHarmonicGain;

            let finalDest = targetGainNode;
            if (ev.pan && ev.pan !== 0 && offlineCtx.createStereoPanner) {
                const panner = offlineCtx.createStereoPanner();
                panner.pan.value = ev.pan;
                panner.connect(targetGainNode);
                finalDest = panner;
            }

            const engine = SYNTH_REGISTRY[ev.type];
            if (engine) {
                engine(offlineCtx, ev.freq, ev.startTime, ev.duration, finalDest, null);
            }
        });

        const renderedBuffer = await offlineCtx.startRendering();
        
        const wavData = audioBufferToWav(renderedBuffer);
        
        const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Harmonic_Progression.wav';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("WAV Export failed:", err);
        alert("Failed to render audio. Your browser may not support OfflineAudioContext.");
    } finally {
        if (buttonElement) buttonElement.textContent = originalText;
    }
}