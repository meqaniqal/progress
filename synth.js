import { CONFIG } from './config.js';
import { SYNTH_REGISTRY } from './synthEngines.js';
import { DRUM_REGISTRY } from './drumEngines.js';
import { saveDrumSample, loadDrumSample, clearAllDrumSamples } from './db.js';

let audioCtx;
let decodeCtx; // Used to decode audio on page load without triggering Autoplay warnings
let activeOscillators = [];
let masterCompressor; // Module-scoped, but only initialized once

let masterGain, chordsGain, bassGain, bassHarmonicGain, drumsGain;
let trackVolumes = { master: 1.0, chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8 };

export function setTrackVolume(track, vol) {
    trackVolumes[track] = vol;
    if (audioCtx) {
        const time = audioCtx.currentTime;
        if (track === 'master' && masterGain) masterGain.gain.setTargetAtTime(vol, time, 0.05);
        if (track === 'chords' && chordsGain) chordsGain.gain.setTargetAtTime(vol, time, 0.05);
        if (track === 'bass' && bassGain) bassGain.gain.setTargetAtTime(vol, time, 0.05);
        if (track === 'bassHarmonic' && bassHarmonicGain) bassHarmonicGain.gain.setTargetAtTime(vol, time, 0.05);
        if (track === 'drums' && drumsGain) drumsGain.gain.setTargetAtTime(vol, time, 0.05);
    }
}

export let noiseBuffer = null; // Pre-allocated for drum synthesis
export const customDrumBuffers = { kick: null, snare: null, chh: null, ohh: null };

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
            chordsGain.gain.value = trackVolumes.chords;
            bassGain.gain.value = trackVolumes.bass;
            bassHarmonicGain.gain.value = trackVolumes.bassHarmonic;
            drumsGain.gain.value = trackVolumes.drums;
            chordsGain.connect(masterCompressor);
            bassGain.connect(masterCompressor);
            bassHarmonicGain.connect(masterCompressor);
            drumsGain.connect(masterCompressor);
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
        decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, sampleRate);
    }
    try {
        if (saveToDb) {
            // Clone the buffer before decoding, as decodeAudioData detaches the original ArrayBuffer
            await saveDrumSample(type, arrayBuffer.slice(0)); 
        }
        customDrumBuffers[type] = await decodeCtx.decodeAudioData(arrayBuffer);
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
            }
        } catch (e) {
            console.warn(`Could not load ${type} from IndexedDB`, e);
        }
    }
}

export async function clearCustomDrumSamples() {
    customDrumBuffers.kick = null;
    customDrumBuffers.snare = null;
    customDrumBuffers.chh = null;
    customDrumBuffers.ohh = null;
    await clearAllDrumSamples();
}

export function getAudioCurrentTime() {
    return audioCtx ? audioCtx.currentTime : 0;
}

export function midiToFreq(m) {
    return Math.pow(2, (m - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ;
}

export function playTone(freq, startTime, duration, type = 'sine', destBus = null) {
    const engine = SYNTH_REGISTRY[type];
    if (!engine) return;

    let targetGainNode = bassGain;
    if (destBus === 'chords') targetGainNode = chordsGain;
    else if (destBus === 'bass') targetGainNode = bassGain;
    else if (destBus === 'bassHarmonic') targetGainNode = bassHarmonicGain;
    else {
        // Legacy fallback
        if (type === 'sawtooth') targetGainNode = chordsGain;
        if (type === 'sawtooth-bass') targetGainNode = bassHarmonicGain;
    }

    const osc = engine(audioCtx, freq, startTime, duration, targetGainNode, (deadOsc) => {
        activeOscillators = activeOscillators.filter(o => o !== deadOsc);
    });
    
    if (osc) activeOscillators.push(osc);
}

export function playDrum(type, startTime, velocity = 1.0, customCtx = null, customDest = null, drumKit = 'synth') {
    if (!audioCtx && !customCtx) initAudio();
    
    const ctx = customCtx || audioCtx;
    const dest = customDest || drumsGain;
    if (!ctx) return;

    if (drumKit === 'custom' && customDrumBuffers[type]) {
        const engine = DRUM_REGISTRY['sample'];
        if (engine) {
            const nodes = engine(ctx, startTime, velocity, dest, customDrumBuffers[type], (deadNode) => {
                activeOscillators = activeOscillators.filter(o => o !== deadNode);
            });
            if (nodes) activeOscillators.push(...nodes);
        }
        return;
    }

    const engine = DRUM_REGISTRY[type];
    if (engine) {
        const nodes = engine(ctx, startTime, velocity, dest, noiseBuffer, (deadNode) => {
            activeOscillators = activeOscillators.filter(o => o !== deadNode);
        });
        if (nodes) activeOscillators.push(...nodes);
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