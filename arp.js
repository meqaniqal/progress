/**
 * Sorts notes based on the arpeggiator style.
 * @param {number[]} notes - Array of MIDI note numbers.
 * @param {string} style - 'up', 'down', 'upDown', 'downUp', 'random'.
 * @returns {number[]} - Sorted array of MIDI note numbers.
 */
function sortNotes(notes, style) {
    const sorted = [...notes].sort((a, b) => a - b);
    switch (style) {
        case 'up':
            return sorted;
        case 'down':
            return sorted.reverse();
        case 'upDown':
            // e.g., [C, E, G] -> [C, E, G, E]
            if (sorted.length < 3) return sorted;
            return [...sorted, ...sorted.slice(1, -1).reverse()];
        case 'downUp':
            // e.g., [C, E, G] -> [G, E, C, E]
            if (sorted.length < 3) return sorted.slice().reverse();
            const reversed = sorted.slice().reverse();
            return [...reversed, ...reversed.slice(1, -1).reverse()];
        case 'random':
            // Fisher-Yates shuffle
            const shuffled = [...sorted];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        default:
            return sorted;
    }
}

/**
 * Generates a sequence of arpeggiated note events.
 * @param {object} params
 * @param {number[]} params.notesToPlay - The base chord notes (MIDI).
 * @param {object} params.arpSettings - The arp settings object { style, rate, gate }.
 * @param {number} params.instanceDuration - The total duration of the instance in seconds.
 * @param {number} params.bpm - The current tempo.
 * @returns {Array<{note: number, startTime: number, duration: number}>} - An array of note events relative to the instance start.
 */
export function generateArpNotes({ notesToPlay, arpSettings, instanceDuration, bpm }) {
    if (!notesToPlay || notesToPlay.length === 0) return [];

    const { style = 'up', rate = 'segment', gate = 0.9 } = arpSettings;
    const orderedNotes = sortNotes(notesToPlay, style);
    const noteCount = orderedNotes.length;
    if (noteCount === 0) return [];

    let stepDuration;

    if (rate === 'segment') {
        stepDuration = instanceDuration / noteCount;
    } else {
        const beatsPerSecond = bpm / 60;
        const quarterNoteDuration = 1 / beatsPerSecond;
        
        const match = rate.match(/(\d+)\/(\d+)(t)?/);
        if (match) {
            const division = parseInt(match[2], 10);
            const isTriplet = !!match[3];
            
            let noteDuration = (4 / division) * quarterNoteDuration;
            if (isTriplet) {
                noteDuration *= (2 / 3);
            }
            stepDuration = noteDuration;
        } else {
            stepDuration = instanceDuration / noteCount; // Fallback
        }
    }

    const events = [];
    let currentTime = 0;
    let noteIndex = 0;

    // If step duration is zero or negative, we can't proceed.
    if (stepDuration <= 0) return [];

    while (currentTime < instanceDuration) {
        const note = orderedNotes[noteIndex % noteCount];
        const remainingTime = instanceDuration - currentTime;
        
        // If the next step would be tiny, just break
        if (remainingTime < 0.001) break;

        const playDuration = Math.min(stepDuration, remainingTime) * gate;

        events.push({
            note: note,
            startTime: currentTime,
            duration: playDuration
        });

        currentTime += stepDuration;
        noteIndex++;

        // For segment mode, we should only play the sequence once.
        if (rate === 'segment' && noteIndex >= noteCount) {
            break;
        }
    }

    return events;
}