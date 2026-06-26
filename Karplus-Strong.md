# Karplus-Strong Synthesis Algorithm Archive

The following code is the original implementation of the `karplus-strong` synthesis engine in `synthEngines.js`, archived for future reference if it is re-enabled.

```javascript
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
```
