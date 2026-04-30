import { getChordNotes, getPlayableNotes } from './theory.js';
import { CONFIG } from './config.js';
import { audioBufferToWav } from './wavEncoder.js';
import { generateArpNotes } from './arp.js';

// --- Layer 1: Pure Timeline Calculator (Testable) ---
export function calculateAudioTimeline(progression, bpm, useVoiceLeading, exportPasses = 1, globalOptions = {}) {
    const timeline = [];
    let currentTime = 0;

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
            const pattern = chord.pattern || { instances: [{ startTime: 0.0, duration: 1.0 }] };
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
                timeline.push({
                    midiNote: bassNote,
                    freq: Math.pow(2, (bassNote - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ,
                    startTime: currentTime,
                    duration: duration,
                    type: 'sine' // Sub bass
                });
            }
            currentTime += duration;
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