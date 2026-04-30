import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { audioBufferToWav } from './wavEncoder.js';
import { generateArpNotes } from './arp.js';
import { resolvePattern } from './patternUtils.js';
import { playDrum, initAudio } from './synth.js';

// --- Layer 1: Pure Timeline Calculator (Testable) ---
export function calculateAudioTimeline(progression, bpm, useVoiceLeading, exportPasses = 1, globalOptions = {}) {
    const timeline = [];
    let currentTime = 0;
    let currentBeat = 0;

    let notesArray = [];
    if (useVoiceLeading) {
        notesArray = getPlayableNotes(progression, globalOptions);
    } else {
        // Drop by 1 octave (-12) to match the pad register warmth used in live playback
        notesArray = progression.map(chord => getChordNotes(chord.symbol, chord.key).map(n => n - 12));
    }

    for (let pass = 0; pass < exportPasses; pass++) {
        progression.forEach((chord, index) => {
            const chordNotes = notesArray[index];
            
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
                pattern.instances.forEach(instance => {
                    const instanceStartTime = currentTime + (instance.startTime * duration);
                    const instanceDuration = instance.duration * duration;

                    if (instance.arpSettings) {
                        const arpEvents = generateArpNotes({
                            notesToPlay: chordNotes,
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
                                type: 'sawtooth'
                            });
                        });
                    } else {
                        const gateDuration = instanceDuration * 0.95; // Slight gate
                        chordNotes.forEach(midiNote => {
                            timeline.push({
                                midiNote,
                                freq: Math.pow(2, (midiNote - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                                startTime: instanceStartTime,
                                duration: gateDuration,
                                type: 'sawtooth' // Chords pad
                            });
                        });
                    }
                });
            }
            
            // Add Bass Note
            const rootChordNotes = getChordNotes(chord.symbol, chord.key);
            if (rootChordNotes) {
                const bassNote = rootChordNotes[0] + CONFIG.BASS_OCTAVE_DROP;
                
                let bPattern = chord.bassPattern;
                let isGlobalBass = false;
                if (bPattern && !bPattern.isLocalOverride && globalOptions.globalPatterns && globalOptions.globalPatterns.bassPattern) {
                    bPattern = globalOptions.globalPatterns.bassPattern;
                    isGlobalBass = true;
                }
                bPattern = bPattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
                bPattern = resolvePattern(bPattern, isGlobalBass, Number(chord.duration) || 2);

                bPattern.instances.forEach(instance => {
                    const instanceStartTime = currentTime + (instance.startTime * duration);
                    const instanceDuration = instance.duration * duration;
                    const gateDuration = instanceDuration * 0.95;

                    timeline.push({
                        midiNote: bassNote,
                        freq: Math.pow(2, (bassNote - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                        startTime: instanceStartTime,
                        duration: gateDuration,
                        type: 'sine' // Sub bass
                    });
                });
            }
            
            // Add Drums
            const drumPat = chord.drumPattern;
            if (drumPat && drumPat.isLocalOverride) {
                if (drumPat.hits) {
                    for (const hit of drumPat.hits) {
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
                            timeline.push({
                                type: 'drum',
                                drumType: hit.row,
                                startTime: hitTimeSec,
                                velocity: hit.velocity || 1.0,
                                duration: 0.5 // Safe max length bound
                            });
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

        const totalDuration = timeline.reduce((max, ev) => Math.max(max, ev.startTime + ev.duration), 0);
        const renderDuration = totalDuration + CONFIG.RELEASE_TIME + 0.5; // Extra tail for release
        
        const sampleRate = 44100;
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, sampleRate * renderDuration, sampleRate);

        const masterCompressor = offlineCtx.createDynamicsCompressor();
        masterCompressor.threshold.value = CONFIG.COMPRESSOR_THRESHOLD;
        masterCompressor.knee.value = CONFIG.COMPRESSOR_KNEE;
        masterCompressor.ratio.value = CONFIG.COMPRESSOR_RATIO;
        masterCompressor.attack.value = CONFIG.COMPRESSOR_ATTACK;
        masterCompressor.release.value = CONFIG.COMPRESSOR_RELEASE;
        masterCompressor.connect(offlineCtx.destination);

        timeline.forEach(ev => {
            if (ev.type === 'drum') {
                playDrum(ev.drumType, ev.startTime, ev.velocity, offlineCtx, masterCompressor);
                return;
            }

            const osc = offlineCtx.createOscillator();
            const gainNode = offlineCtx.createGain();
            let filterNode = null;

            osc.type = ev.type;
            osc.frequency.value = ev.freq;

            const safeAttack = Math.min(CONFIG.ATTACK_TIME, ev.duration * 0.3);
            const safeRelease = Math.min(CONFIG.RELEASE_TIME, ev.duration * 0.5);

            gainNode.gain.setValueAtTime(0, ev.startTime);
            gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, ev.startTime + safeAttack);
            gainNode.gain.setValueAtTime(CONFIG.SUSTAIN_LEVEL, ev.startTime + ev.duration - safeRelease);
            gainNode.gain.linearRampToValueAtTime(0, ev.startTime + ev.duration);

            if (ev.type === 'sawtooth') {
                filterNode = offlineCtx.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 1.5, ev.startTime);
                filterNode.frequency.exponentialRampToValueAtTime(CONFIG.SYNTH_LPF_CUTOFF, ev.startTime + safeAttack);
                filterNode.Q.value = CONFIG.SYNTH_LPF_RESONANCE;

                osc.connect(filterNode);
                filterNode.connect(gainNode);
            } else {
                osc.connect(gainNode);
            }
            
            gainNode.connect(masterCompressor);
            osc.start(ev.startTime);
            osc.stop(ev.startTime + ev.duration);
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