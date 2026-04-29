import { CONFIG } from './config.js';

let audioCtx;
let activeOscillators = [];
let masterCompressor; // Module-scoped, but only initialized once

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

export function stopOscillators() {
    activeOscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch (e) { /* Ignore InvalidStateError */ }
    });
    activeOscillators = [];
}