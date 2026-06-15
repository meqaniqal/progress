import { CONFIG } from './config.js';

function getEnvelopeTimes(duration, adsr, gapAfter = 999) {
    const attack = adsr ? adsr.attack : CONFIG.ATTACK_TIME;
    const decay = adsr ? adsr.decay : 0.2;
    const sustain = adsr ? adsr.sustain : CONFIG.SUSTAIN_LEVEL;
    const release = adsr ? adsr.release : CONFIG.RELEASE_TIME;

    const isShort = duration < 0.15;
    const hasSpace = gapAfter >= 0.05;

    if (isShort && !hasSpace) {
        return {
            attack: 0.002,
            decay: 0,
            sustain: 1.0,
            release: 0.008,
            releaseStartsAtDuration: true
        };
    }

    if (hasSpace) {
        const safeAttack = Math.min(attack, duration * 0.25);
        const safeDecay = Math.min(decay, duration * 0.25);
        const safeRelease = Math.max(0.015, Math.min(release, gapAfter - 0.01));
        return {
            attack: safeAttack,
            decay: safeDecay,
            sustain,
            release: safeRelease,
            releaseStartsAtDuration: false
        };
    } else {
        const safeRelease = Math.max(0.015, Math.min(release, duration * 0.5));
        const safeAttack = Math.min(attack, (duration - safeRelease) * 0.5);
        const safeDecay = Math.min(decay, (duration - safeRelease) * 0.5);
        return {
            attack: safeAttack,
            decay: safeDecay,
            sustain,
            release: safeRelease,
            releaseStartsAtDuration: true
        };
    }
}

function getSampleEnvelopeTimes(adsr, bufferDuration, playbackRate) {
    const attack = adsr ? adsr.attack : 0.05;
    const decayRaw = adsr ? adsr.decay : 0.2;
    const sustain = adsr ? adsr.sustain : 0.8;
    const releaseRaw = adsr ? adsr.release : 0.3;

    const sampleLength = bufferDuration / (playbackRate || 1.0);
    const decayRatio = Math.min(1.0, decayRaw / 2.0);
    const releaseRatio = Math.min(1.0, releaseRaw / 2.0);

    const availableTime = Math.max(0.01, sampleLength - attack);
    const releaseTime = releaseRatio * availableTime;
    const decayTime = decayRatio * (availableTime - releaseTime);

    return {
        attack: Math.min(attack, sampleLength * 0.1),
        decay: Math.max(0.01, decayTime),
        sustain,
        release: Math.max(0.01, releaseTime)
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
        
        const env = getEnvelopeTimes(duration, { attack: attackTime, decay: 0.2, sustain: CONFIG.SUSTAIN_LEVEL, release: releaseTime }, params.gapAfter);
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

        const env = getEnvelopeTimes(duration, { attack: CONFIG.ATTACK_TIME * 0.5, decay: decayTime, sustain: 0.1, release: CONFIG.RELEASE_TIME }, params.gapAfter);
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
    'karplus-strong': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const period = 1.0 / freq;
        const sampleRate = ctx.sampleRate;
        const burstLength = Math.max(128, Math.floor(sampleRate * Math.min(0.02, period)));
        const buffer = ctx.createBuffer(1, burstLength, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < burstLength; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const burstSource = ctx.createBufferSource();
        burstSource.buffer = buffer;
        
        const delayNode = ctx.createDelay(1.0);
        delayNode.delayTime.setValueAtTime(period, startTime);
        
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        const dampingFreq = params.damping !== undefined ? params.damping : 600;
        filterNode.frequency.setValueAtTime(dampingFreq, startTime);
        
        const feedbackGain = ctx.createGain();
        const decayTime = params.decay !== undefined ? params.decay : 0.8;
        const feedbackCoeff = Math.min(0.99, Math.pow(0.001, period / decayTime));
        feedbackGain.gain.setValueAtTime(feedbackCoeff, startTime);
        
        const outputGain = ctx.createGain();
        const vol = params.vol !== undefined ? params.vol : 1.0;
        outputGain.gain.setValueAtTime(vol * 0.3, startTime);
        
        const env = getEnvelopeTimes(duration, null, params.gapAfter);
        const releaseTime = env.release;
        
        if (env.releaseStartsAtDuration) {
            outputGain.gain.setValueAtTime(vol * 0.3, startTime + duration - releaseTime);
            outputGain.gain.linearRampToValueAtTime(0, startTime + duration);
        } else {
            outputGain.gain.setValueAtTime(vol * 0.3, startTime + duration);
            outputGain.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
        }
        
        burstSource.connect(delayNode);
        delayNode.connect(filterNode);
        filterNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        delayNode.connect(outputGain);
        outputGain.connect(dest);
        
        burstSource.start(startTime);
        burstSource.stop(startTime + period);
        
        const dummyOsc = ctx.createOscillator();
        dummyOsc.connect(ctx.destination);
        dummyOsc.start(startTime);
        
        if (env.releaseStartsAtDuration) {
            dummyOsc.stop(startTime + duration + 0.05);
        } else {
            dummyOsc.stop(startTime + duration + releaseTime + 0.05);
        }
        
        dummyOsc.onended = () => {
            dummyOsc.disconnect();
            burstSource.disconnect();
            delayNode.disconnect();
            filterNode.disconnect();
            feedbackGain.disconnect();
            outputGain.disconnect();
            if (onCleanup) onCleanup(dummyOsc);
        };
        const endTime = startTime + duration + (env.releaseStartsAtDuration ? 0 : env.release);
        dummyOsc.gainNode = outputGain;
        dummyOsc.startTime = startTime;
        dummyOsc.endTime = endTime;
        return dummyOsc;
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