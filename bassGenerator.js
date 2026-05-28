import { generateId } from './patternUtils.js';
import { getChordNotes, getEffectiveTuning, getBassNote } from './theory.js';

/**
 * Generates a bassline rhythm that algorithmically responds to the drum pattern and surrounding chords.
 */
export function generateIntelligentBassline(drumPattern, chordPattern, options = {}) {
    const avoidKick = options.avoidKick || false;
    const pitchStyle = options.pitchStyle || 'root'; // 'root', 'octaves', 'fifths', 'walking'
    const lengthBeats = options.lengthBeats || 4;
    const { currentChord, nextChord, globalDivisions = 12 } = options;

    const instances = [];
    const beatRatio = 1 / lengthBeats; 
    const eighthNoteRatio = 0.5 * beatRatio; // Standard punchy 8th note duration
    
    // --- Context Analysis ---
    let currentRoot = 0;
    let nextRoot = 0;
    let chordNotesOffsets = [0, 7]; // Default to Root/Fifth if analysis fails
    
    if (currentChord) {
        const tuning = getEffectiveTuning(currentChord.symbol, currentChord.divisions || globalDivisions);
        const notes = getChordNotes(currentChord.symbol, currentChord.key, tuning.divisions);
        if (notes && notes.length > 0) {
            currentRoot = getBassNote(notes, tuning);
            chordNotesOffsets = notes.map(n => n - notes[0]); // Exact semitone offsets from the root
        }
    }
    
    if (nextChord) {
        const tuning = getEffectiveTuning(nextChord.symbol, nextChord.divisions || globalDivisions);
        const notes = getChordNotes(nextChord.symbol, nextChord.key, tuning.divisions);
        if (notes && notes.length > 0) {
            nextRoot = getBassNote(notes, tuning);
        }
    } else {
        nextRoot = currentRoot; // No context, loop back to self
    }

    let rootDiff = nextRoot - currentRoot; 
    
    // Normalize rootDiff to choose the closest melodic path (e.g., C -> G could be +7 or -5)
    if (rootDiff > 6) rootDiff -= 12;
    if (rootDiff < -6) rootDiff += 12;

    // --- Walking Bass Generation (Passing Tones) ---
    if (pitchStyle === 'walking') {
        const numQuarterNotes = Math.floor(lengthBeats);
        
        for (let i = 0; i < numQuarterNotes; i++) {
            let pitchOffset = 0;
            let duration = beatRatio * 0.95; // Legato feel for walking bass
            
            if (i === 0) {
                pitchOffset = 0; // Beat 1: Always anchor the root
            } else if (i === numQuarterNotes - 1) {
                // Last beat: Chromatic or diatonic approach leading into the next chord
                pitchOffset = rootDiff > 0 ? rootDiff - 1 : rootDiff + 1;
                
                // If it's a unison (same chord next), approach from a half-step away to keep motion alive
                if (rootDiff === 0) pitchOffset = i % 2 === 0 ? 1 : -1;
            } else {
                // Middle beats: Walk up/down internal chord tones
                if (i === 1 && chordNotesOffsets.length > 1) {
                    pitchOffset = chordNotesOffsets[1]; // Typically the 3rd
                } else if (i === 2 && chordNotesOffsets.length > 2) {
                    pitchOffset = chordNotesOffsets[2]; // Typically the 5th
                } else {
                    pitchOffset = chordNotesOffsets[i % chordNotesOffsets.length];
                }
            }

            instances.push({
                id: generateId(),
                startTime: i * beatRatio,
                duration,
                type: 'chord',
                pitchOffset: pitchOffset,
                isSelected: false,
                arpSettings: null,
                probability: 1.0
            });
        }
        
        return { isLocalOverride: false, avoidKick, instances };
    }

    // --- Rhythm-Informed Generation (Root / Octaves / Fifths) ---
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
        if (chordPattern.instances.length > 1 || kickTimes.length === 0) {
            chordPattern.instances.forEach(inst => chordTimes.push(inst.startTime));
        }
    }

    // 3. Merge timelines and apply Kick Avoidance syncopation
    let combinedTimes = new Set([...chordTimes, ...kickTimes]);
    let activeTriggers = Array.from(combinedTimes).sort((a, b) => a - b);

    const uniqueTriggers = [];
    activeTriggers.forEach(t => {
        if (t >= 1.0) return; // ignore out of bounds
        if (uniqueTriggers.length === 0 || Math.abs(t - uniqueTriggers[uniqueTriggers.length - 1]) > 0.01) {
            uniqueTriggers.push(t);
        }
    });

    // Determine interval offset function dynamically using actual chord tones
    const getPitchOffset = (index) => {
        if (pitchStyle === 'octaves') return index % 2 === 0 ? 0 : 12;
        if (pitchStyle === 'fifths') return index % 2 === 0 ? 0 : (chordNotesOffsets.length > 2 ? chordNotesOffsets[2] : 7);
        return 0;
    };

    // 5. Generate Bass Instances
    if (uniqueTriggers.length > 1) {
        uniqueTriggers.forEach((startTime, index) => {
            let duration = eighthNoteRatio * 0.9; // Make it slightly staccato for punchiness
            
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
                    pitchOffset: getPitchOffset(index),
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
            if (!isQuarterBeat && pitchStyle === 'root' && i % 4 !== 3) continue;
            
            instances.push({
                id: generateId(),
                startTime: i * eighthNoteRatio,
                duration: eighthNoteRatio * 0.8, // Make it staccato/punchy
                type: 'chord',
                pitchOffset: getPitchOffset(pitchIndex++),
                isSelected: false,
                arpSettings: null,
                probability: 1.0
            });
        }
    }

    return { isLocalOverride: false, avoidKick, instances };
}