export const DRUM_REGISTRY = {
    'kick': (ctx, time, velocity, dest, noiseBuffer, onCleanup) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        // Pitch envelope for the "thump"
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);

        // Volume envelope
        gain.gain.setValueAtTime(velocity * 0.5, time); // Balanced against synth headroom
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(time);
        osc.stop(time + 0.4);

        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        
        return [osc];
    },
    'snare': (ctx, time, velocity, dest, noiseBuffer, onCleanup) => {
        if (!noiseBuffer) return [];
        
        // Noise component for the "snap"
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        const noiseGain = ctx.createGain();

        noiseGain.gain.setValueAtTime(velocity * 0.4, time); // Balanced against synth headroom
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(dest);

        // Body component for the "thwack"
        const body = ctx.createOscillator();
        body.type = 'triangle';
        const bodyGain = ctx.createGain();
        
        body.frequency.setValueAtTime(100, time);
        bodyGain.gain.setValueAtTime(velocity * 0.35, time); // Balanced against synth headroom
        bodyGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        body.connect(bodyGain);
        bodyGain.connect(dest);

        noise.start(time);
        noise.stop(time + 0.2);
        body.start(time);
        body.stop(time + 0.1);

        noise.onended = () => {
            noise.disconnect();
            noiseFilter.disconnect();
            noiseGain.disconnect();
            if (onCleanup) onCleanup(noise);
        };
        body.onended = () => {
            body.disconnect();
            bodyGain.disconnect();
            if (onCleanup) onCleanup(body);
        };
        
        return [noise, body];
    },
    'chh': (ctx, time, velocity, dest, noiseBuffer, onCleanup) => {
        return _playHat(ctx, time, velocity, 0.05, dest, noiseBuffer, onCleanup);
    },
    'ohh': (ctx, time, velocity, dest, noiseBuffer, onCleanup) => {
        return _playHat(ctx, time, velocity, 0.3, dest, noiseBuffer, onCleanup);
    },
    'sample': (ctx, time, velocity, dest, buffer, onCleanup) => {
        if (!buffer) return [];
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(velocity, time);
        source.connect(gain);
        gain.connect(dest);
        source.start(time);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            if (onCleanup) onCleanup(source);
        };
        return [source];
    }
};

// Internal helper for hi-hats
function _playHat(ctx, time, velocity, duration, dest, noiseBuffer, onCleanup) {
    if (!noiseBuffer) return [];
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 7000;
    const noiseGain = ctx.createGain();

    noiseGain.gain.setValueAtTime(velocity * 0.2, time); // Balanced against synth headroom
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);

    noise.start(time);
    noise.stop(time + duration);

    noise.onended = () => {
        noise.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
        if (onCleanup) onCleanup(noise);
    };
    
    return [noise];
}