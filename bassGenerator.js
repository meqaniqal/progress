import { generateId } from './patternUtils.js';

/**
 * Generates a bassline rhythm that algorithmically responds to the drum pattern.
 */
export function generateIntelligentBassline(drumPattern, chordPattern, options = {}) {
    const avoidKick = options.avoidKick || false;
    const pitchStyle = options.pitchStyle || 'root'; // 'root', 'octaves', 'fifths'
    const lengthBeats = options.lengthBeats || 4;

    const instances = [];
    const beatRatio = 1 / lengthBeats; 
    const eighthNoteRatio = 0.5 * beatRatio; // Standard punchy 8th note duration
    
    // 1. Extract unique kick drum timestamps
    let kickTimes = [];
    if (drumPattern && Array.isArray(drumPattern.hits)) {
        const uniqueTimes = new Set();
        drumPattern.hits.forEach(h => {
            if (h.row === 'kick') uniqueTimes.add(h.time);
        });
        kickTimes = Array.from(uniqueTimes);
    }

    // 2. Extract chord slice timestamps
    let chordTimes = [];
    if (chordPattern && Array.isArray(chordPattern.instances)) {
        // Only use chord times if the user actually sliced it, or if there are no kicks at all
        if (chordPattern.instances.length > 1 || kickTimes.length === 0) {
            chordPattern.instances.forEach(inst => chordTimes.push(inst.startTime));
        }
    }

    // 3. Merge timelines and apply Kick Avoidance syncopation
    let combinedTimes = new Set([...chordTimes, ...kickTimes]);
    let activeTriggers = Array.from(combinedTimes).sort((a, b) => a - b);

    // 4. Deduplicate close triggers (floating point safety)
    const uniqueTriggers = [];
    activeTriggers.forEach(t => {
        if (t >= 1.0) return; // ignore out of bounds
        if (uniqueTriggers.length === 0 || Math.abs(t - uniqueTriggers[uniqueTriggers.length - 1]) > 0.01) {
            uniqueTriggers.push(t);
        }
    });

    // 5. Generate Bass Instances
    if (uniqueTriggers.length > 0) {
        uniqueTriggers.forEach((startTime, index) => {
            let duration = eighthNoteRatio * 0.9; // Make it slightly staccato for punchiness
            
            // Truncate if it bleeds into the next trigger
            if (index < uniqueTriggers.length - 1) {
                const nextTime = uniqueTriggers[index + 1];
                if (startTime + duration > nextTime) {
                    duration = (nextTime - startTime) * 0.9;
                }
            }
            
            if (startTime + duration > 1.0) {
                duration = 1.0 - startTime;
            }
            
            if (duration > 0.001) {
            instances.push({
                id: generateId(),
                    startTime,
                    duration,
                    type: 'chord',
                pitchOffset: _getPitchOffset(pitchStyle, index),
                    isSelected: false,
                arpSettings: null,
                    probability: 1.0
            });
            }
        });
    } else {
        // Fallback: Generate a driving 8th-note pulsing bassline
        const numEighthNotes = lengthBeats * 2;
        let pitchIndex = 0;
        
        for (let i = 0; i < numEighthNotes; i++) {
            const isQuarterBeat = i % 2 === 0;
            // Simple groove: Drop some off-beats for bounce, unless it's octaves/fifths
            if (!isQuarterBeat && pitchStyle === 'root' && i % 4 !== 3) continue;
            
            instances.push({
                id: generateId(),
                startTime: i * eighthNoteRatio,
                duration: eighthNoteRatio * 0.8, // Make it staccato/punchy
                type: 'chord',
                pitchOffset: _getPitchOffset(pitchStyle, pitchIndex++),
                isSelected: false,
                arpSettings: null,
                probability: 1.0
            });
        }
    }

    return { isLocalOverride: false, avoidKick, instances };
}

function _getPitchOffset(style, index) {
    if (style === 'octaves') return index % 2 === 0 ? 0 : 12;
    if (style === 'fifths') return index % 2 === 0 ? 0 : 7;
    return 0;
}