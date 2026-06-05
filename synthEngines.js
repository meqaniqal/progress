import { CONFIG } from './config.js';

export const SYNTH_REGISTRY = {
    'sine': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);
        const vol = params.vol !== undefined ? params.vol : 1.0;
        const sustain = CONFIG.SUSTAIN_LEVEL * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + duration - safeRelease);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        osc.connect(gainNode);
        gainNode.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        return osc;
    },
    'sawtooth': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);
        const vol = params.vol !== undefined ? params.vol : 1.0;
        const sustain = CONFIG.SUSTAIN_LEVEL * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + duration - safeRelease);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 1.5, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(CONFIG.SYNTH_LPF_CUTOFF, startTime + safeAttack);
        filterNode.Q.value = CONFIG.SYNTH_LPF_RESONANCE;

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        return osc;
    },
    'sawtooth-bass': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);
        const vol = params.vol !== undefined ? params.vol : 1.0;
        const sustain = CONFIG.SUSTAIN_LEVEL * 0.8 * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + duration - safeRelease);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 2.5, startTime);

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
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
        const sustain = CONFIG.SUSTAIN_LEVEL * vol;

        carrier.type = 'sine';
        carrier.frequency.value = freq;

        // 2:1 ratio creates classic FM electric piano/bell timbres
        modulator.type = 'sine';
        modulator.frequency.value = freq * ratio; 

        const maxModIndex = freq * modIndexMultiplier; // Modulation depth
        modGain.gain.setValueAtTime(0, startTime);
        modGain.gain.linearRampToValueAtTime(maxModIndex, startTime + Math.min(attackTime, duration * 0.1));
        // Use Math.max to prevent exponentialRamp from crashing on 0
        modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, maxModIndex * 0.1), startTime + duration);

        const safeAttack = Math.min(attackTime, duration * 0.3);
        const safeRelease = Math.min(releaseTime, duration * 0.5);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.linearRampToValueAtTime(sustain, startTime + safeAttack);
        mainGain.gain.linearRampToValueAtTime(sustain * 0.8, startTime + duration - safeRelease);
        mainGain.gain.linearRampToValueAtTime(0, startTime + duration);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency); // Route modulator into carrier pitch
        carrier.connect(mainGain);
        mainGain.connect(dest);

        modulator.start(startTime);
        carrier.start(startTime);

        modulator.stop(startTime + duration + 0.1);
        carrier.stop(startTime + duration + 0.1);

        carrier.onended = () => {
            carrier.disconnect();
            modulator.disconnect();
            modGain.disconnect();
            mainGain.disconnect();
            if (onCleanup) onCleanup(carrier);
        };
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

        const safeAttack = Math.min(CONFIG.ATTACK_TIME * 0.5, duration * 0.1);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL * 0.7 * vol, startTime + safeAttack);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, CONFIG.SUSTAIN_LEVEL * 0.1 * vol), startTime + Math.min(decayTime, duration * 0.5));
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * cutoffMultiplier, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(Math.max(20, CONFIG.SYNTH_LPF_CUTOFF * 0.5), startTime + Math.min(decayTime * 0.75, duration * 0.4));
        filterNode.Q.value = resonance;

        osc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            osc.disconnect();
            filterNode.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        return osc;
    },
    'square': (ctx, freq, startTime, duration, dest, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);
        const vol = params.vol !== undefined ? params.vol : 1.0;
        const sustain = CONFIG.SUSTAIN_LEVEL * vol;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + duration - safeRelease);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        osc.connect(gainNode);
        gainNode.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (onCleanup) onCleanup(osc);
        };
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
        // Compute feedback coefficient based on target decay time in seconds
        const decayTime = params.decay !== undefined ? params.decay : 0.8;
        const feedbackCoeff = Math.min(0.99, Math.pow(0.001, period / decayTime));
        feedbackGain.gain.setValueAtTime(feedbackCoeff, startTime);
        
        const outputGain = ctx.createGain();
        const vol = params.vol !== undefined ? params.vol : 1.0;
        outputGain.gain.setValueAtTime(vol * 0.3, startTime);
        outputGain.gain.setValueAtTime(vol * 0.3, startTime + duration - 0.02);
        outputGain.gain.linearRampToValueAtTime(0, startTime + duration);
        
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
        dummyOsc.stop(startTime + duration + 0.2);
        
        dummyOsc.onended = () => {
            dummyOsc.disconnect();
            burstSource.disconnect();
            delayNode.disconnect();
            filterNode.disconnect();
            feedbackGain.disconnect();
            outputGain.disconnect();
            if (onCleanup) onCleanup(dummyOsc);
        };
        
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
        source.playbackRate.setValueAtTime(params.playbackRate || 1.0, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const sampleLen = buffer.duration;
        
        const attack = Math.min(adsr.attack, sampleLen * 0.5);
        const decay = Math.min(adsr.decay, sampleLen * 0.5);
        const release = Math.min(adsr.release, sampleLen * 0.5);
        const sustain = adsr.sustain;
        
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attack);
        adsrGain.gain.setValueAtTime(vol, startTime + attack);
        adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * sustain), startTime + attack + decay);
        
        const noteOffTime = startTime + duration;
        adsrGain.gain.setValueAtTime(vol * sustain, noteOffTime);
        adsrGain.gain.linearRampToValueAtTime(0, noteOffTime + release);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        
        source.start(startTime);
        source.stop(noteOffTime + release + 0.1);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        
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
        source.playbackRate.setValueAtTime(params.playbackRate || 1.0, startTime);
        
        const adsrGain = ctx.createGain();
        const adsr = params.adsr || { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
        const sampleLen = buffer.duration;
        
        const attack = Math.min(adsr.attack, sampleLen * 0.5);
        const decay = Math.min(adsr.decay, sampleLen * 0.5);
        const release = Math.min(adsr.release, sampleLen * 0.5);
        const sustain = adsr.sustain;
        
        const vol = params.vol !== undefined ? params.vol : 1.0;
        
        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(vol, startTime + attack);
        adsrGain.gain.setValueAtTime(vol, startTime + attack);
        adsrGain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * sustain), startTime + attack + decay);
        
        const noteOffTime = startTime + duration;
        adsrGain.gain.setValueAtTime(vol * sustain, noteOffTime);
        adsrGain.gain.linearRampToValueAtTime(0, noteOffTime + release);
        
        source.connect(adsrGain);
        adsrGain.connect(dest);
        
        source.start(startTime);
        source.stop(noteOffTime + release + 0.1);
        
        source.onended = () => {
            source.disconnect();
            adsrGain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        
        return source;
    }
};