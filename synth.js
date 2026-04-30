import { CONFIG } from './config.js';

let audioCtx;
let activeOscillators = [];
let masterCompressor; // Module-scoped, but only initialized once
export let noiseBuffer = null; // Pre-allocated for drum synthesis

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
        audioCtx.resume();
    }
}

export function getAudioCurrentTime() {
    return audioCtx ? audioCtx.currentTime : 0;
}

export function midiToFreq(m) {
    return Math.pow(2, (m - CONFIG.A4_MIDI) / 12) * CONFIG.A4_FREQ;
}

export function playTone(freq, startTime, duration, type = 'sine') {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    let filterNode = null;

    osc.type = type;
    osc.frequency.value = freq;

    // Protect envelopes from breaking on very short chopped/arp notes
    const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
    const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

    // Envelope to avoid clicks: Attack -> Sustain -> Release
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + safeAttack); // Attack
    gainNode.gain.setValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + duration - safeRelease); // Sustain
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release

    // Apply Low-Pass Filter specifically for sawtooth pad chords
    if (type === 'sawtooth') {
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        // Smooth filter envelope: starts a bit brighter, decays to warm sustain
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 1.5, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(CONFIG.SYNTH_LPF_CUTOFF, startTime + safeAttack);
        filterNode.Q.value = CONFIG.SYNTH_LPF_RESONANCE;

        osc.connect(filterNode);
        filterNode.connect(gainNode);
    } else {
        osc.connect(gainNode);
    }
    gainNode.connect(masterCompressor); // Route to master bus

    osc.start(startTime);
    osc.stop(startTime + duration);

    // Prevent memory leaks by letting the oscillator clean itself up when finished
    osc.onended = () => {
        activeOscillators = activeOscillators.filter(o => o !== osc);
    };

    activeOscillators.push(osc);
}

function _playKick(time, velocity, ctx, dest) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Pitch envelope for the "thump"
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);

    // Volume envelope
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + 0.4);
}

function _playSnare(time, velocity, ctx, dest) {
    if (!ctx || !noiseBuffer) return;
    // Noise component for the "snap"
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    const noiseGain = ctx.createGain();

    noiseGain.gain.setValueAtTime(velocity * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);

    // Body component for the "thwack"
    const body = ctx.createOscillator();
    body.type = 'triangle';
    const bodyGain = ctx.createGain();
    
    body.frequency.setValueAtTime(100, time);
    bodyGain.gain.setValueAtTime(velocity * 0.7, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    body.connect(bodyGain);
    bodyGain.connect(dest);

    noise.start(time);
    noise.stop(time + 0.2);
    body.start(time);
    body.stop(time + 0.1);
}

function _playHat(time, velocity, duration, ctx, dest) {
    if (!ctx || !noiseBuffer) return;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 7000;
    const noiseGain = ctx.createGain();

    noiseGain.gain.setValueAtTime(velocity * 0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);

    noise.start(time);
    noise.stop(time + duration);
}

export function playDrum(type, startTime, velocity = 1.0, customCtx = null, customDest = null) {
    if (!audioCtx && !customCtx) initAudio();
    
    const ctx = customCtx || audioCtx;
    const dest = customDest || masterCompressor;
    if (!ctx) return;

    switch (type) {
        case 'kick':
            _playKick(startTime, velocity, ctx, dest);
            break;
        case 'snare':
            _playSnare(startTime, velocity, ctx, dest);
            break;
        case 'chh': // Closed Hi-Hat
            _playHat(startTime, velocity, 0.05, ctx, dest);
            break;
        case 'ohh': // Open Hi-Hat
            _playHat(startTime, velocity, 0.3, ctx, dest);
            break;
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