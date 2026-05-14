import { CONFIG } from './config.js';

export const SYNTH_REGISTRY = {
    'sine': (ctx, freq, startTime, duration, dest, onCleanup) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + duration - safeRelease);
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
    'sawtooth': (ctx, freq, startTime, duration, dest, onCleanup) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + duration - safeRelease);
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
    'sawtooth-bass': (ctx, freq, startTime, duration, dest, onCleanup) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL * 0.8, startTime + safeAttack);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL * 0.8, startTime + duration - safeRelease);
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
    'fm': (ctx, freq, startTime, duration, dest, onCleanup) => {
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const mainGain = ctx.createGain();

        carrier.type = 'sine';
        carrier.frequency.value = freq;

        // 2:1 ratio creates classic FM electric piano/bell timbres
        modulator.type = 'sine';
        modulator.frequency.value = freq * 2; 

        const maxModIndex = freq * 3; // Modulation depth
        modGain.gain.setValueAtTime(0, startTime);
        modGain.gain.linearRampToValueAtTime(maxModIndex, startTime + Math.min(CONFIG.ATTACK_TIME, duration * 0.1));
        // Use Math.max to prevent exponentialRamp from crashing on 0
        modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, maxModIndex * 0.1), startTime + duration);

        const safeAttack = Math.min(CONFIG.ATTACK_TIME, duration * 0.3);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL, startTime + safeAttack);
        mainGain.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL * 0.8, startTime + duration - safeRelease);
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
    'plucked-square': (ctx, freq, startTime, duration, dest, onCleanup) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        osc.type = 'square';
        osc.frequency.value = freq;

        const safeAttack = Math.min(CONFIG.ATTACK_TIME * 0.5, duration * 0.1);
        const safeRelease = Math.min(CONFIG.RELEASE_TIME, duration * 0.5);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.SUSTAIN_LEVEL * 0.7, startTime + safeAttack);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, CONFIG.SUSTAIN_LEVEL * 0.1), startTime + Math.min(0.4, duration * 0.5));
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(CONFIG.SYNTH_LPF_CUTOFF * 4, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(Math.max(20, CONFIG.SYNTH_LPF_CUTOFF * 0.5), startTime + Math.min(0.3, duration * 0.4));
        filterNode.Q.value = 1.5; // Slight resonance for the pluck

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
    }
};