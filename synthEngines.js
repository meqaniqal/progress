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
    }
};