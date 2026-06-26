import { CONFIG } from './config.js';

function getEnvelopeTimes(duration, adsr, gapAfter = 999) {
    const attack = adsr ? adsr.attack : CONFIG.ATTACK_TIME;
    const decay = adsr ? adsr.decay : 0.2;
    const sustain = adsr ? adsr.sustain : CONFIG.SUSTAIN_LEVEL;
    const release = adsr ? adsr.release : CONFIG.RELEASE_TIME;

    // Relax clamping: threshold 50ms instead of 150ms
    const isShort = duration < 0.05;
    
    // Always start release at the nominal note duration (startTime + duration)
    // to keep note lengths consistent and prevent premature cutoff.
    const releaseStartsAtDuration = false;

    let safeAttack, safeDecay, safeRelease;

    if (isShort) {
        // Very short notes: clamp to small but proportional values with minimal decay
        safeAttack = Math.max(0.002, Math.min(attack, duration * 0.1));
        safeDecay = Math.max(0.002, Math.min(decay, duration * 0.1));
        safeRelease = Math.max(0.005, Math.min(release, Math.max(0.005, gapAfter)));
    } else {
        // Standard/longer notes: more breathing room for ADSR sliders
        safeAttack = Math.min(attack, duration * 0.40);
        safeDecay = Math.min(decay, duration * 0.40);
        // Release is capped at gapAfter to avoid overlapping the next note, or duration * 0.5 if no space
        const maxRelease = gapAfter !== 999 ? gapAfter : duration * 0.5;
        safeRelease = Math.max(0.008, Math.min(release, maxRelease));
    }

    return {
        attack: safeAttack,
        decay: safeDecay,
        sustain,
        release: safeRelease,
        releaseStartsAtDuration
    };
}

function getSampleEnvelopeTimes(adsr, bufferDuration, playbackRate) {
    const attack = adsr ? adsr.attack : 0.05;
    const decay = adsr ? adsr.decay : 0.2;
    const sustain = adsr ? adsr.sustain : 0.8;
    const release = adsr ? adsr.release : 0.3;

    const sampleLength = bufferDuration / (playbackRate || 1.0);

    // Absolute time mapping capped at a fraction of sample length
    const safeAttack = Math.min(attack, sampleLength * 0.2);
    const safeDecay = Math.min(decay, sampleLength * 0.4);
    const safeRelease = Math.min(release, sampleLength * 0.4);

    return {
        attack: safeAttack,
        decay: safeDecay,
        sustain,
        release: safeRelease
    };
}

export const SYNTH_REGISTRY = {
    'sine': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const vol = params.vol !== undefined ? params.vol : 1.0;
        const env = getEnvelopeTimes(duration, params.adsr, params.gapAfter);
        const sustainVal = env.sustain * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(vol, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        } else {
            gainNode.gain.setValueAtTime(vol, startTime + env.attack);
        }

        osc.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        const releaseTime = env.release;
        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - releaseTime;
            gainNode.gain.setValueAtTime(sustainVal, releaseStart);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
            osc.stop(startTime + duration + releaseTime + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },
    'triangle': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const vol = params.vol !== undefined ? params.vol : 1.0;
        const env = getEnvelopeTimes(duration, params.adsr, params.gapAfter);
        const sustainVal = env.sustain * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(vol, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        } else {
            gainNode.gain.setValueAtTime(vol, startTime + env.attack);
        }

        osc.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        const releaseTime = env.release;
        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - releaseTime;
            gainNode.gain.setValueAtTime(sustainVal, releaseStart);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
            osc.stop(startTime + duration + releaseTime + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },
    'sawtooth': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const vol = params.vol !== undefined ? params.vol : 1.0;
        const env = getEnvelopeTimes(duration, params.adsr, params.gapAfter);
        const sustainVal = env.sustain * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(vol, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        } else {
            gainNode.gain.setValueAtTime(vol, startTime + env.attack);
        }

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 1.5, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(CONFIG.SYNTH_LPF_CUTOFF, startTime + env.attack);
        filterNode.Q.value = CONFIG.SYNTH_LPF_RESONANCE;

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        const releaseTime = env.release;
        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - releaseTime;
            gainNode.gain.setValueAtTime(sustainVal, releaseStart);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
            osc.stop(startTime + duration + releaseTime + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },
    'sawtooth-bass': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const vol = params.vol !== undefined ? params.vol : 1.0;
        const env = getEnvelopeTimes(duration, params.adsr, params.gapAfter);
        const sustainVal = env.sustain * 0.8 * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(vol, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        } else {
            gainNode.gain.setValueAtTime(vol, startTime + env.attack);
        }

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 2.5, startTime);

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        const releaseTime = env.release;
        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - releaseTime;
            gainNode.gain.setValueAtTime(sustainVal, releaseStart);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
            osc.stop(startTime + duration + releaseTime + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },
    'fm': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const mainGain = ctx.createGain();

        const ratio = params.ratio !== undefined ? params.ratio : 2;
        const modIndexMultiplier = params.modIndex !== undefined ? params.modIndex : 3;
        const attackTime = params.attack !== undefined ? params.attack : CONFIG.ATTACK_TIME;
        const releaseTime = params.release !== undefined ? params.release : CONFIG.RELEASE_TIME;
        const vol = params.vol !== undefined ? params.vol : 1.0;

        carrier.type = 'sine';
        carrier.frequency.value = freq;

        modulator.type = 'sine';
        modulator.frequency.value = freq * ratio; 

        const maxModIndex = freq * modIndexMultiplier;
        
        const adsrParam = params.adsr || { attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime };
        const env = getEnvelopeTimes(duration, adsrParam, params.gapAfter);
        const sustainVal = env.sustain * vol;

        modGain.gain.setValueAtTime(0, startTime);
        modGain.gain.linearRampToValueAtTime(maxModIndex, startTime + env.attack);
        modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, maxModIndex * 0.1), startTime + duration);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.linearRampToValueAtTime(sustainVal, startTime + env.attack);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(mainGain);
        mainGain.connect(dest);

        modulator.start(startTime);
        carrier.start(startTime);

        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - env.release;
            mainGain.gain.linearRampToValueAtTime(sustainVal * 0.8, releaseStart);
            mainGain.gain.linearRampToValueAtTime(0, startTime + duration);
            modGain.gain.linearRampToValueAtTime(0, startTime + duration);
            carrier.stop(startTime + duration + 0.05);
            modulator.stop(startTime + duration + 0.05);
        } else {
            mainGain.gain.linearRampToValueAtTime(sustainVal * 0.8, startTime + duration);
            mainGain.gain.linearRampToValueAtTime(0, startTime + duration + env.release);
            modGain.gain.linearRampToValueAtTime(0, startTime + duration + env.release);
            carrier.stop(startTime + duration + env.release + 0.05);
            modulator.stop(startTime + duration + env.release + 0.05);
        }

        carrier.onended = () => {
            carrier.disconnect();
            modulator.disconnect();
            modGain.disconnect();
            mainGain.disconnect();
            if (onCleanup) onCleanup(carrier);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        carrier.gainNode = mainGain;
        carrier.startTime = startTime;
        carrier.endTime = endTime;
        return carrier;
    },
    'plucked-square': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        const waveform = params.waveform || 'square';
        const cutoffMultiplier = params.cutoff !== undefined ? params.cutoff : 4;
        const resonance = params.resonance !== undefined ? params.resonance : 1.5;
        const decayTime = params.decay !== undefined ? params.decay : 0.4;
        const vol = params.vol !== undefined ? params.vol : 1.0;

        osc.type = waveform;
        osc.frequency.value = freq;

        const adsrParam = params.adsr || { attack: CONFIG.ATTACK_TIME * 0.5, decay: decayTime, sustain: 0.1, release: CONFIG.RELEASE_TIME };
        const env = getEnvelopeTimes(duration, adsrParam, params.gapAfter);
        const peakVal = CONFIG.SUSTAIN_LEVEL * 0.7 * vol;
        const sustainVal = CONFIG.SUSTAIN_LEVEL * 0.1 * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(peakVal, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        }

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * cutoffMultiplier, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(Math.max(20, CONFIG.SYNTH_LPF_CUTOFF * 0.5), startTime + Math.min(decayTime * 0.75, duration * 0.4));
        filterNode.Q.value = resonance;

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        if (env.releaseStartsAtDuration) {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration - env.release);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + env.release);
            osc.stop(startTime + duration + env.release + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },
    'square': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;

        const vol = params.vol !== undefined ? params.vol : 1.0;
        const env = getEnvelopeTimes(duration, params.adsr, params.gapAfter);
        const sustainVal = env.sustain * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(vol, startTime + env.attack);
        if (env.decay > 0) {
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + env.attack + env.decay);
        } else {
            gainNode.gain.setValueAtTime(vol, startTime + env.attack);
        }

        osc.connect(gainNode);
        gainNode.connect(dest);
        osc.start(startTime);

        const releaseTime = env.release;
        if (env.releaseStartsAtDuration) {
            const releaseStart = startTime + duration - releaseTime;
            gainNode.gain.setValueAtTime(sustainVal, releaseStart);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.stop(startTime + duration + 0.05);
        } else {
            gainNode.gain.setValueAtTime(sustainVal, startTime + duration);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
            osc.stop(startTime + duration + releaseTime + 0.05);
        }

        osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        osc.gainNode = gainNode;
        osc.startTime = startTime;
        osc.endTime = endTime;
        return osc;
    },

    'sample-bass': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const buffer = params.buffer;
        if (!buffer) {
            const dummy = ctx.createOscillator();
            dummy.start(startTime);
            dummy.stop(startTime);
            dummy.onended = () => { if (onCleanup) onCleanup(dummy); };
            return dummy;
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const playbackRate = params.playbackRate || 1.0;
        source.playbackRate.setValueAtTime(playbackRate, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        const env = getSampleEnvelopeTimes(adsr, buffer.duration, playbackRate);
        const sustainVal = env.sustain * vol;
        
        let attackTime = env.attack;
        let decayTime = env.decay;
        
        if (duration < attackTime + decayTime) {
            const scale = duration / (attackTime + decayTime);
            attackTime *= scale;
            decayTime *= scale;
        }
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attackTime);
        if (decayTime > 0) {
            adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + attackTime + decayTime);
        } else {
            adsrGain.gain.setValueAtTime(vol, startTime + attackTime);
        }
        
        const sampleLength = buffer.duration / playbackRate;
        const releaseStart = Math.min(startTime + duration, startTime + sampleLength - env.release);
        const releaseEnd = Math.min(releaseStart + env.release, startTime + sampleLength);
        
        adsrGain.gain.setValueAtTime(sustainVal, Math.max(startTime + attackTime + decayTime, releaseStart));
        adsrGain.gain.linearRampToValueAtTime(0, releaseEnd);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        source.start(startTime);
        source.stop(releaseEnd + 0.05);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        source.gainNode = adsrGain;
        source.startTime = startTime;
        source.endTime = releaseEnd;
        return source;
    },
    'sample-chords': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const buffer = params.buffer;
        if (!buffer) {
            const dummy = ctx.createOscillator();
            dummy.start(startTime);
            dummy.stop(startTime);
            dummy.onended = () => { if (onCleanup) onCleanup(dummy); };
            return dummy;
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const playbackRate = params.playbackRate || 1.0;
        source.playbackRate.setValueAtTime(playbackRate, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        const env = getSampleEnvelopeTimes(adsr, buffer.duration, playbackRate);
        const sustainVal = env.sustain * vol;
        
        let attackTime = env.attack;
        let decayTime = env.decay;
        
        if (duration < attackTime + decayTime) {
            const scale = duration / (attackTime + decayTime);
            attackTime *= scale;
            decayTime *= scale;
        }
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attackTime);
        if (decayTime > 0) {
            adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + attackTime + decayTime);
        } else {
            adsrGain.gain.setValueAtTime(vol, startTime + attackTime);
        }
        
        const sampleLength = buffer.duration / playbackRate;
        const releaseStart = Math.min(startTime + duration, startTime + sampleLength - env.release);
        const releaseEnd = Math.min(releaseStart + env.release, startTime + sampleLength);
        
        adsrGain.gain.setValueAtTime(sustainVal, Math.max(startTime + attackTime + decayTime, releaseStart));
        adsrGain.gain.linearRampToValueAtTime(0, releaseEnd);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        source.start(startTime);
        source.stop(releaseEnd + 0.05);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        source.gainNode = adsrGain;
        source.startTime = startTime;
        source.endTime = releaseEnd;
        return source;
    },
    'sample-melody': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const buffer = params.buffer;
        if (!buffer) {
            const dummy = ctx.createOscillator();
            dummy.start(startTime);
            dummy.stop(startTime);
            dummy.onended = () => { if (onCleanup) onCleanup(dummy); };
            return dummy;
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const playbackRate = params.playbackRate || 1.0;
        source.playbackRate.setValueAtTime(playbackRate, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        const env = getSampleEnvelopeTimes(adsr, buffer.duration, playbackRate);
        const sustainVal = env.sustain * vol;
        
        let attackTime = env.attack;
        let decayTime = env.decay;
        
        if (duration < attackTime + decayTime) {
            const scale = duration / (attackTime + decayTime);
            attackTime *= scale;
            decayTime *= scale;
        }
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attackTime);
        if (decayTime > 0) {
            adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + attackTime + decayTime);
        } else {
            adsrGain.gain.setValueAtTime(vol, startTime + attackTime);
        }
        
        const sampleLength = buffer.duration / playbackRate;
        const releaseStart = Math.min(startTime + duration, startTime + sampleLength - env.release);
        const releaseEnd = Math.min(releaseStart + env.release, startTime + sampleLength);
        
        adsrGain.gain.setValueAtTime(sustainVal, Math.max(startTime + attackTime + decayTime, releaseStart));
        adsrGain.gain.linearRampToValueAtTime(0, releaseEnd);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        source.start(startTime);
        source.stop(releaseEnd + 0.05);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        source.gainNode = adsrGain;
        source.startTime = startTime;
        source.endTime = releaseEnd;
        return source;
    },
    'sample-countermelody': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const buffer = params.buffer;
        if (!buffer) {
            const dummy = ctx.createOscillator();
            dummy.start(startTime);
            dummy.stop(startTime);
            dummy.onended = () => { if (onCleanup) onCleanup(dummy); };
            return dummy;
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const playbackRate = params.playbackRate || 1.0;
        source.playbackRate.setValueAtTime(playbackRate, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        const env = getSampleEnvelopeTimes(adsr, buffer.duration, playbackRate);
        const sustainVal = env.sustain * vol;
        
        let attackTime = env.attack;
        let decayTime = env.decay;
        
        if (duration < attackTime + decayTime) {
            const scale = duration / (attackTime + decayTime);
            attackTime *= scale;
            decayTime *= scale;
        }
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attackTime);
        if (decayTime > 0) {
            adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainVal), startTime + attackTime + decayTime);
        } else {
            adsrGain.gain.setValueAtTime(vol, startTime + attackTime);
        }
        
        const sampleLength = buffer.duration / playbackRate;
        const releaseStart = Math.min(startTime + duration, startTime + sampleLength - env.release);
        const releaseEnd = Math.min(releaseStart + env.release, startTime + sampleLength);
        
        adsrGain.gain.setValueAtTime(sustainVal, Math.max(startTime + attackTime + decayTime, releaseStart));
        adsrGain.gain.linearRampToValueAtTime(0, releaseEnd);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        source.start(startTime);
        source.stop(releaseEnd + 0.05);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        source.gainNode = adsrGain;
        source.startTime = startTime;
        source.endTime = releaseEnd;
        return source;
    }
};