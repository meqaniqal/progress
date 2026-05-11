import { generateId } from './patternUtils.js';

/**
 * Generates a bassline rhythm that algorithmically responds to the drum pattern.
 */
export function generateIntelligentBassline(drumPattern, chordPattern, options = {}) {
    const avoidKick = options.avoidKick || false;
    const pitchStyle = options.pitchStyle || 'root'; // 'root', 'octaves', 'fifths'
    const lengthBeats = options.lengthBeats || 4;

    const instances = [];
    let kickHits = [];
    
    // Extract unique kick drum timestamps
    if (drumPattern && Array.isArray(drumPattern.hits)) {
        const uniqueTimes = new Set();
        drumPattern.hits.forEach(h => {
            if (h.row === 'kick') uniqueTimes.add(h.time);
        });
        kickHits = Array.from(uniqueTimes).sort((a, b) => a - b);
    }

    const beatRatio = 1 / lengthBeats; 
    const eighthNoteRatio = 0.5 * beatRatio; // Standard punchy 8th note duration

    if (kickHits.length > 0) {
        kickHits.forEach((kickTime, index) => {
            let startTime = kickTime;
            let duration = eighthNoteRatio; 

            // Syncopate! Push the bass entirely off the kick drum to prevent frequency clash.
            if (avoidKick) {
                startTime += eighthNoteRatio;
            }

            // Prevent slices from falling off the edge of the pattern loop
            if (startTime >= 1.0) return;
            if (startTime + duration > 1.0) {
                duration = 1.0 - startTime;
            }

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
        });
    } else if (chordPattern && Array.isArray(chordPattern.instances) && chordPattern.instances.length > 0) {
        // Fallback: Mirror the chord pattern but assign new bass pitches
        chordPattern.instances.forEach((inst, index) => {
            instances.push({
                ...inst,
                id: generateId(),
                pitchOffset: _getPitchOffset(pitchStyle, index),
                arpSettings: null,
            });
        });
    }

    return { isLocalOverride: false, instances };
}

function _getPitchOffset(style, index) {
    if (style === 'octaves') return index % 2 === 0 ? 0 : 12;
    if (style === 'fifths') return index % 2 === 0 ? 0 : 7;
    return 0;
}