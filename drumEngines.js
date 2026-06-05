// Waveshaper distortion curve generator for drum drive/saturation
function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

// Noise generators (White noise buffer is provided; pink/metallic is simulated here)
function filterNoiseBuffer(ctx, time, duration, dest, noiseBuffer, type = 'white', cutoff = 1000) {
    if (!noiseBuffer) return [];

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    
    if (type === 'pink') {
        // Pink noise has a -3dB/octave slope; we approximate this with a lowpass filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff * 0.7, time);
        filter.Q.value = 0.5;
    } else if (type === 'metallic') {
        // Bandpass filter to create a metallic clang
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(cutoff, time);
        filter.Q.value = 8.0;
    } else {
        // Standard highpass for white noise snap
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(cutoff, time);
    }

    source.connect(filter);
    filter.connect(dest);
    return [source, filter];
}

export const DRUM_REGISTRY = {
    'kick': (ctx, time, velocity, dest, noiseBuffer, onCleanup, params = {}) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const decay = params.decay !== undefined ? params.decay : 0.4;
        const basePitch = params.pitch !== undefined ? params.pitch : 50;
        const drive = params.drive !== undefined ? params.drive : 0;
        const volume = params.volume !== undefined ? params.volume : 1.0;

        osc.type = 'sine';
        // Pitch envelope for the "thump"
        osc.frequency.setValueAtTime(basePitch * 3, time);
        osc.frequency.exponentialRampToValueAtTime(basePitch, time + 0.1);

        // Volume envelope
        gain.gain.setValueAtTime(velocity * 2.0 * volume, time); // Balanced against synth headroom, scaled 4x (0.5 * 4 = 2.0)
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        let lastNode = gain;
        let shaper = null;
        if (drive > 0) {
            shaper = ctx.createWaveShaper();
            shaper.curve = makeDistortionCurve(drive * 12);
            shaper.oversample = '4x';
            gain.connect(shaper);
            shaper.connect(dest);
            lastNode = shaper;
        } else {
            gain.connect(dest);
        }

        osc.connect(gain);
        osc.start(time);
        osc.stop(time + decay);

        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
            if (shaper) shaper.disconnect();
            if (onCleanup) onCleanup(osc);
        };
        
        return shaper ? [osc, shaper] : [osc];
    },
    'snare': (ctx, time, velocity, dest, noiseBuffer, onCleanup, params = {}) => {
        if (!noiseBuffer) return [];

        const decay = params.decay !== undefined ? params.decay : 0.2;
        const basePitch = params.pitch !== undefined ? params.pitch : 181;
        const cutoff = params.cutoff !== undefined ? params.cutoff : 1900;
        const drive = params.drive !== undefined ? params.drive : 1.5;
        const noiseType = params.noiseType || 'white';
        const volume = params.volume !== undefined ? params.volume : 1.0;

        const mixGain = ctx.createGain();
        
        // Noise component
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(velocity * 1.6 * volume, time); // Balanced, scaled 4x (0.4 * 4 = 1.6)
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + decay);

        const noiseNodes = filterNoiseBuffer(ctx, time, decay, noiseGain, noiseBuffer, noiseType, cutoff);
        noiseGain.connect(mixGain);

        // Body component
        const body = ctx.createOscillator();
        body.type = 'triangle';
        const bodyGain = ctx.createGain();
        
        body.frequency.setValueAtTime(basePitch, time);
        bodyGain.gain.setValueAtTime(velocity * 1.4 * volume, time); // Balanced, scaled 4x (0.35 * 4 = 1.4)
        bodyGain.gain.exponentialRampToValueAtTime(0.01, time + decay * 0.5);

        body.connect(bodyGain);
        bodyGain.connect(mixGain);

        let shaper = null;
        if (drive > 0) {
            shaper = ctx.createWaveShaper();
            shaper.curve = makeDistortionCurve(drive * 12);
            shaper.oversample = '4x';
            mixGain.connect(shaper);
            shaper.connect(dest);
        } else {
            mixGain.connect(dest);
        }

        if (noiseNodes.length > 0) noiseNodes[0].start(time);
        if (noiseNodes.length > 0) noiseNodes[0].stop(time + decay);
        body.start(time);
        body.stop(time + decay * 0.5);

        if (noiseNodes.length > 0) {
            noiseNodes[0].onended = () => {
                noiseNodes.forEach(node => node.disconnect());
                noiseGain.disconnect();
                mixGain.disconnect();
                if (shaper) shaper.disconnect();
                if (onCleanup) onCleanup(noiseNodes[0]);
            };
        }
        body.onended = () => {
            body.disconnect();
            bodyGain.disconnect();
            if (onCleanup) onCleanup(body);
        };
        
        const returnNodes = [body, mixGain];
        if (shaper) returnNodes.push(shaper);
        if (noiseNodes.length > 0) returnNodes.push(...noiseNodes);
        return returnNodes;
    },
    'chh': (ctx, time, velocity, dest, noiseBuffer, onCleanup, params = {}) => {
        const decay = params.decay !== undefined ? params.decay : 0.05;
        return _playHat(ctx, time, velocity, decay, dest, noiseBuffer, onCleanup, params);
    },
    'ohh': (ctx, time, velocity, dest, noiseBuffer, onCleanup, params = {}) => {
        const decay = params.decay !== undefined ? params.decay : 0.3;
        return _playHat(ctx, time, velocity, decay, dest, noiseBuffer, onCleanup, params);
    },
    'sample': (ctx, time, velocity, dest, buffer, onCleanup, params = {}) => {
        if (!buffer) return [];
        const decay = params.decay !== undefined ? params.decay : 1.0;
        const speed = params.pitch !== undefined ? params.pitch : 1.0;
        const cutoff = params.cutoff !== undefined ? params.cutoff : 20000;
        const drive = params.drive !== undefined ? params.drive : 0;
        const volume = params.volume !== undefined ? params.volume : 1.0;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(speed, time);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(velocity * volume * 4.0, time); // Scaled 4x
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, time);

        source.connect(filter);
        filter.connect(gain);

        let shaper = null;
        if (drive > 0) {
            shaper = ctx.createWaveShaper();
            shaper.curve = makeDistortionCurve(drive * 12);
            shaper.oversample = '4x';
            gain.connect(shaper);
            shaper.connect(dest);
        } else {
            gain.connect(dest);
        }

        source.start(time);
        source.stop(time + decay);

        source.onended = () => {
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
            if (shaper) shaper.disconnect();
            if (onCleanup) onCleanup(source);
        };
        return shaper ? [source, filter, gain, shaper] : [source, filter, gain];
    }
};

// Internal helper for hi-hats
function _playHat(ctx, time, velocity, duration, dest, noiseBuffer, onCleanup, params = {}) {
    if (!noiseBuffer) return [];
    
    const cutoff = params.cutoff !== undefined ? params.cutoff : 7000;
    const drive = params.drive !== undefined ? params.drive : 0;
    const noiseType = params.noiseType || 'white';
    const volume = params.volume !== undefined ? params.volume : 1.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity * 0.8 * volume, time); // Balanced, scaled 4x (0.2 * 4 = 0.8)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    const noiseNodes = filterNoiseBuffer(ctx, time, duration, noiseGain, noiseBuffer, noiseType, cutoff);

    let shaper = null;
    if (drive > 0) {
        shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(drive * 12);
        shaper.oversample = '4x';
        noiseGain.connect(shaper);
        shaper.connect(dest);
    } else {
        noiseGain.connect(dest);
    }

    if (noiseNodes.length > 0) noiseNodes[0].start(time);
    if (noiseNodes.length > 0) noiseNodes[0].stop(time + duration);

    if (noiseNodes.length > 0) {
        noiseNodes[0].onended = () => {
            noiseNodes.forEach(node => node.disconnect());
            noiseGain.disconnect();
            if (shaper) shaper.disconnect();
            if (onCleanup) onCleanup(noiseNodes[0]);
        };
    }
    
    const returnNodes = [noiseGain];
    if (shaper) returnNodes.push(shaper);
    if (noiseNodes.length > 0) returnNodes.push(...noiseNodes);
    return returnNodes;
}