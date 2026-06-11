import { CONFIG } from './config.js';
import { SYNTH_REGISTRY } from './synthEngines.js';
import { DRUM_REGISTRY } from './drumEngines.js';
import { saveDrumSample, loadDrumSample, clearAllDrumSamples, deleteDrumSample } from './db.js';
import { state } from './store.js';

let audioCtx;
let decodeCtx; // Used to decode audio on page load without triggering Autoplay warnings
let activeOscillators = [];
let masterCompressor; // Module-scoped, but only initialized once

let masterGain, chordsGain, bassGain, bassHarmonicGain, drumsGain, melodyGain, countermelodyGain;
let bassShaper, bassHarmonicShaper;
let bassDriveGain, bassHarmonicDriveGain;
export let customBassBuffer = null;
export let customChordBuffer = null;
export let customMelodyBuffer = null;
export let customCountermelodyBuffer = null;
let trackVolumes = { master: 1.0, chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8, melody: 0.8, countermelody: 0.0 };

function makeSoftClipCurve(drive) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
}

export let currentSynthParams = { 
    fm: { ratio: 2, modIndex: 3, attack: 0.1, release: 0.5 },
    'plucked-square': { waveform: 'square', cutoff: 4, resonance: 1.5, decay: 0.4 }
};

export function setSynthParam(synthType, paramName, value) {
    if (!currentSynthParams[synthType]) currentSynthParams[synthType] = {};
    currentSynthParams[synthType][paramName] = value;
}

export function setTrackVolume(track, vol) {
    const cleanVol = typeof vol === 'number' && !isNaN(vol) ? vol : (track === 'master' ? 1.0 : (track === 'bassHarmonic' || track === 'countermelody' ? 0.0 : 0.8));
    trackVolumes[track] = cleanVol;
    if (audioCtx) {
        const time = audioCtx.currentTime;
        if (track === 'master' && masterGain) masterGain.gain.setTargetAtTime(cleanVol, time, 0.05);
        if (track === 'chords' && chordsGain) chordsGain.gain.setTargetAtTime(cleanVol, time, 0.05);
        if (track === 'bass' && bassGain) bassGain.gain.setTargetAtTime(cleanVol, time, 0.05);
        if (track === 'bassHarmonic' && bassHarmonicGain) {
            const mappedVol = Math.pow(cleanVol, 2.5);
            bassHarmonicGain.gain.setTargetAtTime(mappedVol, time, 0.05);
        }
        if (track === 'drums' && drumsGain) drumsGain.gain.setTargetAtTime(cleanVol, time, 0.05);
        if (track === 'melody' && melodyGain) melodyGain.gain.setTargetAtTime(cleanVol, time, 0.05);
        if (track === 'countermelody' && countermelodyGain) countermelodyGain.gain.setTargetAtTime(cleanVol, time, 0.05);
    }
}

export let noiseBuffer = null; // Pre-allocated for drum synthesis
export const customDrumBuffers = { kick: null, snare: null, chh: null, ohh: null };
export const customDrumPeaks = { kick: null, snare: null, chh: null, ohh: null };

export function getCustomDrumPeaks(type) {
    return customDrumPeaks[type];
}

export function hasCustomDrumSamples() {
    return !!(customDrumBuffers.kick || customDrumBuffers.snare || customDrumBuffers.chh || customDrumBuffers.ohh);
}

// Helper to calculate waveform peaks once upon decoding, saving the UI from doing heavy math
function extractWaveformPeaks(buffer, resolution = 50) {
    if (!buffer) return null;
    const channelData = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / resolution));
    const peaks = [];
    let globalMax = 0;
    for (let i = 0; i < resolution; i++) {
        let max = 0;
        const start = i * blockSize;
        const end = Math.min(start + blockSize, channelData.length);
        for (let j = start; j < end; j++) {
            const val = Math.abs(channelData[j]);
            if (val > max) max = val;
        }
        peaks.push(max);
        if (max > globalMax) globalMax = max;
    }
    
    if (globalMax > 0) {
        for (let i = 0; i < peaks.length; i++) {
            peaks[i] = peaks[i] / globalMax;
        }
    }
    return peaks;
}

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
        
        masterGain = audioCtx.createGain();
        masterGain.gain.value = trackVolumes.master;
        
        masterCompressor.connect(masterGain);
        masterGain.connect(audioCtx.destination);
        
        // Setup individual track buses
        if (!chordsGain) {
            chordsGain = audioCtx.createGain();
            bassGain = audioCtx.createGain();
            bassHarmonicGain = audioCtx.createGain();
            drumsGain = audioCtx.createGain();
            melodyGain = audioCtx.createGain();
            countermelodyGain = audioCtx.createGain();
            
            // Setup Soft Clippers to add analog-like saturation at higher volumes
            bassShaper = audioCtx.createWaveShaper();
            bassShaper.curve = makeSoftClipCurve(2.0);
            bassShaper.oversample = '4x';
            
            bassHarmonicShaper = audioCtx.createWaveShaper();
            bassHarmonicShaper.curve = makeSoftClipCurve(3.0);
            bassHarmonicShaper.oversample = '4x';
            
            bassDriveGain = audioCtx.createGain();
            bassDriveGain.gain.value = state.bassDrive !== undefined ? state.bassDrive : 1.0;
            
            bassHarmonicDriveGain = audioCtx.createGain();
            bassHarmonicDriveGain.gain.value = state.bassHarmonicDrive !== undefined ? state.bassHarmonicDrive : 1.0;
            
            chordsGain.gain.value = typeof trackVolumes.chords === 'number' && !isNaN(trackVolumes.chords) ? trackVolumes.chords : 0.8;
            bassGain.gain.value = typeof trackVolumes.bass === 'number' && !isNaN(trackVolumes.bass) ? trackVolumes.bass : 0.8;
            
            const rawBassHarmonic = typeof trackVolumes.bassHarmonic === 'number' && !isNaN(trackVolumes.bassHarmonic) ? trackVolumes.bassHarmonic : 0.0;
            bassHarmonicGain.gain.value = Math.pow(rawBassHarmonic, 2.5);
            
            drumsGain.gain.value = typeof trackVolumes.drums === 'number' && !isNaN(trackVolumes.drums) ? trackVolumes.drums : 0.8;
            melodyGain.gain.value = typeof trackVolumes.melody === 'number' && !isNaN(trackVolumes.melody) ? trackVolumes.melody : 0.8;
            countermelodyGain.gain.value = typeof trackVolumes.countermelody === 'number' && !isNaN(trackVolumes.countermelody) ? trackVolumes.countermelody : 0.0;
            
            chordsGain.connect(masterCompressor);
            
            // Route: Drive -> Shaper -> Volume -> Master
            bassDriveGain.connect(bassShaper);
            bassShaper.connect(bassGain);
            bassGain.connect(masterCompressor);
            
            bassHarmonicDriveGain.connect(bassHarmonicShaper);
            bassHarmonicShaper.connect(bassHarmonicGain);
            bassHarmonicGain.connect(masterCompressor);
            
            drumsGain.connect(masterCompressor);
            melodyGain.connect(masterCompressor);
            countermelodyGain.connect(masterCompressor);
        }
        
        // Pre-allocate a reusable 2-second white noise buffer for Snare/Hats
        // Creating buffers dynamically inside a tight sequencer loop causes CPU spikes.
        const bufferSize = audioCtx.sampleRate * 2.0;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }
    if (audioCtx.state === 'suspended') {
        const resumePromise = audioCtx.resume();
        if (resumePromise !== undefined) {
            resumePromise.catch(() => { /* Silently ignore autoplay warnings */ });
        }
    }
}

export async function decodeCustomDrumSample(type, arrayBuffer, saveToDb = true) {
    if (!decodeCtx) {
        // Use OfflineAudioContext to decode. This bypasses the browser's Autoplay Policy
        // which blocks the standard AudioContext from starting without a user gesture.
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        // Guarantee at least 1 second of buffer length to prevent browser-specific decoding aborts
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate, sampleRate);
    }
    try {
        if (saveToDb) {
            // Clone the buffer before decoding, as decodeAudioData detaches the original ArrayBuffer
            await saveDrumSample(type, arrayBuffer.slice(0)); 
        }
        customDrumBuffers[type] = await decodeCtx.decodeAudioData(arrayBuffer);
        customDrumPeaks[type] = extractWaveformPeaks(customDrumBuffers[type]);
    } catch (e) {
        console.error("Failed to decode custom drum sample:", e);
    }
}

export async function loadPersistedDrumSamples() {
    const types = ['kick', 'snare', 'chh', 'ohh'];
    for (const type of types) {
        try {
            const buffer = await loadDrumSample(type);
            if (buffer) {
                await decodeCustomDrumSample(type, buffer, false); // Pass false to prevent infinite re-saving
                
                // Validate/clamp pitch parameter for the sample drum to 1.0 if it exceeds the maximum sample playback rate (3.0)
                if (state.drumParams && state.drumParams[type]) {
                    if (state.drumParams[type].pitch === undefined || state.drumParams[type].pitch > 3.0) {
                        state.drumParams[type].pitch = 1.0;
                    }
                }
            }
        } catch (e) {
            console.warn(`Could not load ${type} from IndexedDB`, e);
        }
    }
    await loadPersistedBassSample();
    await loadPersistedChordSample();
    await loadPersistedMelodySample();
    await loadPersistedCountermelodySample();
}

export async function clearCustomDrumSamples() {
    customDrumBuffers.kick = null;
    customDrumBuffers.snare = null;
    customDrumBuffers.chh = null;
    customDrumBuffers.ohh = null;
    customDrumPeaks.kick = null;
    customDrumPeaks.snare = null;
    customDrumPeaks.chh = null;
    customDrumPeaks.ohh = null;
    await clearAllDrumSamples();
}

export async function clearCustomDrumSample(type) {
    customDrumBuffers[type] = null;
    customDrumPeaks[type] = null;
    await deleteDrumSample(type);
}

export function getAudioCurrentTime() {
    return audioCtx ? audioCtx.currentTime : 0;
}

export function midiToFreq(m) {
    return Math.pow(2, (m - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ;
}

export function playTone(freq, startTime, duration, type = 'sine', destBus = null, pan = 0, vol = 1.0) {
    const engine = SYNTH_REGISTRY[type];
    if (!engine) return;

    let targetGainNode = bassDriveGain || bassGain;
    if (destBus === 'chords') targetGainNode = chordsGain;
    else if (destBus === 'bass') targetGainNode = bassDriveGain || bassGain;
    else if (destBus === 'bassHarmonic') targetGainNode = bassHarmonicDriveGain || bassHarmonicGain;
    else if (destBus === 'melody') targetGainNode = melodyGain;
    else if (destBus === 'countermelody') targetGainNode = countermelodyGain;
    else {
        // Legacy fallback
        if (type === 'sawtooth') targetGainNode = chordsGain;
        if (type === 'sawtooth-bass') targetGainNode = bassHarmonicDriveGain || bassHarmonicGain;
    }

    let finalDest = targetGainNode;
    let panner = null;
    
    if (pan !== 0 && audioCtx.createStereoPanner) {
        panner = audioCtx.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(targetGainNode);
        finalDest = panner;
    }

    let volBoost = 1.0;
    if (destBus === 'melody' || destBus === 'countermelody') {
        volBoost = 2.0;
    }
    const engineParams = { ...(currentSynthParams[type] || {}), vol: vol * volBoost };
    if (type === 'sample-bass') {
        engineParams.buffer = customBassBuffer;
        engineParams.adsr = state.bassAdsr;
        const rootMidi = 48; // C3
        const rootFreq = midiToFreq(rootMidi);
        const pitchShift = state.bassAdsr ? (state.bassAdsr.pitch || 0) : 0;
        const octaveShift = state.bassAdsr && state.bassAdsr.octaveDrop ? -24 : 0;
        engineParams.playbackRate = (freq / rootFreq) * Math.pow(2, (pitchShift + octaveShift) / 12);
    }
    if (type === 'sample-chords') {
        engineParams.buffer = customChordBuffer;
        engineParams.adsr = state.chordAdsr;
        const rootMidi = 60; // C4
        const rootFreq = midiToFreq(rootMidi);
        const pitchShift = state.chordAdsr ? (state.chordAdsr.pitch || 0) : 0;
        engineParams.playbackRate = (freq / rootFreq) * Math.pow(2, pitchShift / 12);
    }
    if (type === 'sample-melody') {
        engineParams.buffer = customMelodyBuffer;
        engineParams.adsr = state.melodyAdsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
        const rootMidi = 60; // C4
        const rootFreq = midiToFreq(rootMidi);
        const pitchShift = state.melodyAdsr ? (state.melodyAdsr.pitch || 0) : 0;
        engineParams.playbackRate = (freq / rootFreq) * Math.pow(2, pitchShift / 12);
    }
    if (type === 'sample-countermelody') {
        engineParams.buffer = customCountermelodyBuffer;
        engineParams.adsr = state.countermelodyAdsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
        const rootMidi = 60; // C4
        const rootFreq = midiToFreq(rootMidi);
        const pitchShift = state.countermelodyAdsr ? (state.countermelodyAdsr.pitch || 0) : 0;
        engineParams.playbackRate = (freq / rootFreq) * Math.pow(2, pitchShift / 12);
    }
    if (type === 'karplus-strong') {
        engineParams.damping = state.bassKsDamping !== undefined ? state.bassKsDamping : 400;
        engineParams.decay = state.bassKsDecay !== undefined ? state.bassKsDecay : 0.95;
    }

    const osc = engine(audioCtx, freq, startTime, duration, finalDest, (deadOsc) => {
        activeOscillators = activeOscillators.filter(o => o !== deadOsc);
        if (panner) panner.disconnect();
    }, engineParams);
    
    if (osc) activeOscillators.push(osc);
}

export function playDrum(type, startTime, velocity = 1.0, customCtx = null, customDest = null) {
    if (!audioCtx && !customCtx) initAudio();
    
    const ctx = customCtx || audioCtx;
    const dest = customDest || drumsGain;
    if (!ctx) return;

    try {
        const params = (state.drumParams && state.drumParams[type]) ? state.drumParams[type] : {};
        if (customDrumBuffers[type]) {
            const engine = DRUM_REGISTRY['sample'];
            if (engine) {
                const nodes = engine(ctx, startTime, velocity, dest, customDrumBuffers[type], (deadNode) => {
                    activeOscillators = activeOscillators.filter(o => o !== deadNode);
                }, params);
                if (nodes) activeOscillators.push(...nodes);
            }
            return;
        }

        const engine = DRUM_REGISTRY[type];
        if (engine) {
            const nodes = engine(ctx, startTime, velocity, dest, noiseBuffer, (deadNode) => {
                activeOscillators = activeOscillators.filter(o => o !== deadNode);
            }, params);
            if (nodes) activeOscillators.push(...nodes);
        }
    } catch (e) {
        console.warn(`Failed to play drum: ${type}`, e);
    }
}

export function stopOscillators() {
    activeOscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch (e) { /* Ignore InvalidStateError */ }
    });
    activeOscillators = [];
}

export function setBassDrive(driveVal) {
    if (audioCtx && bassDriveGain) {
        bassDriveGain.gain.setTargetAtTime(driveVal, audioCtx.currentTime, 0.05);
    }
}

export function setBassHarmonicDrive(driveVal) {
    if (audioCtx && bassHarmonicDriveGain) {
        bassHarmonicDriveGain.gain.setTargetAtTime(driveVal, audioCtx.currentTime, 0.05);
    }
}

export async function decodeCustomBassSample(arrayBuffer, saveToDb = true) {
    if (!decodeCtx) {
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate, sampleRate);
    }
    try {
        if (saveToDb) {
            await saveDrumSample('bassSample', arrayBuffer.slice(0)); 
        }
        customBassBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to decode custom bass sample:", e);
    }
}

export async function loadPersistedBassSample() {
    try {
        const buffer = await loadDrumSample('bassSample');
        if (buffer) {
            await decodeCustomBassSample(buffer, false);
        }
    } catch (e) {
        console.warn(`Could not load bass sample from IndexedDB`, e);
    }
}

export async function clearCustomBassSample() {
    customBassBuffer = null;
    await deleteDrumSample('bassSample');
}

export async function decodeCustomChordSample(arrayBuffer, saveToDb = true) {
    if (!decodeCtx) {
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate, sampleRate);
    }
    try {
        if (saveToDb) {
            await saveDrumSample('chordSample', arrayBuffer.slice(0)); 
        }
        customChordBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to decode custom chord sample:", e);
    }
}

export async function loadPersistedChordSample() {
    try {
        const buffer = await loadDrumSample('chordSample');
        if (buffer) {
            await decodeCustomChordSample(buffer, false);
        }
    } catch (e) {
        console.warn(`Could not load chord sample from IndexedDB`, e);
    }
}

export async function clearCustomChordSample() {
    customChordBuffer = null;
    await deleteDrumSample('chordSample');
}

export async function decodeCustomMelodySample(arrayBuffer, saveToDb = true) {
    if (!decodeCtx) {
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate, sampleRate);
    }
    try {
        if (saveToDb) {
            await saveDrumSample('melodySample', arrayBuffer.slice(0)); 
        }
        customMelodyBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to decode custom melody sample:", e);
    }
}

export async function loadPersistedMelodySample() {
    try {
        const buffer = await loadDrumSample('melodySample');
        if (buffer) {
            await decodeCustomMelodySample(buffer, false);
        }
    } catch (e) {
        console.warn(`Could not load melody sample from IndexedDB`, e);
    }
}

export async function clearCustomMelodySample() {
    customMelodyBuffer = null;
    await deleteDrumSample('melodySample');
}

export async function decodeCustomCountermelodySample(arrayBuffer, saveToDb = true) {
    if (!decodeCtx) {
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, sampleRate, sampleRate);
    }
    try {
        if (saveToDb) {
            await saveDrumSample('countermelodySample', arrayBuffer.slice(0)); 
        }
        customCountermelodyBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to decode custom countermelody sample:", e);
    }
}

export async function loadPersistedCountermelodySample() {
    try {
        const buffer = await loadDrumSample('countermelodySample');
        if (buffer) {
            await decodeCustomCountermelodySample(buffer, false);
        }
    } catch (e) {
        console.warn(`Could not load countermelody sample from IndexedDB`, e);
    }
}

export async function clearCustomCountermelodySample() {
    customCountermelodyBuffer = null;
    await deleteDrumSample('countermelodySample');
}