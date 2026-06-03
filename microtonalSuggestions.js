import { getMicrotonalChord, getMicrotonalDiatonicChords, MICRO_TUNINGS } from './microtonalDictionary.js';

/**
 * Calculates mathematically close alternatives for a microtonal chord
 * using floating-point modulo math and Least Squares Distance algorithms.
 */
export function getMicrotonalAlternatives(chordSymbol, baseKey, mode) {
    if (!mode) return [];
    
    // Extract tuning key (e.g., 'BP' from 'bpLambda')
    const match = mode.match(/^([a-z0-9]+)([A-Z][a-zA-Z]*)$/);
    if (!match) return [];
    
    const tuningKey = match[1].toUpperCase();
    const tuning = MICRO_TUNINGS[tuningKey];
    if (!tuning) return [];
    
    const periodSize = tuning.periodSize; // e.g., 19.01955 for Tritave
    
    const sourceNotes = getMicrotonalChord(chordSymbol, baseKey);
    if (!sourceNotes) return [];
    
    // Convert to wrapped float pitch classes
    const sourcePcs = sourceNotes.map(n => ((n % periodSize) + periodSize) % periodSize);
    
    const candidates = getMicrotonalDiatonicChords(mode) || [];
    const scoredAlternatives = [];
    
    for (const targetSymbol of candidates) {
        if (targetSymbol === chordSymbol) continue;
        
        const targetNotes = getMicrotonalChord(targetSymbol, baseKey);
        if (!targetNotes) continue;
        
        const targetPcs = targetNotes.map(n => ((n % periodSize) + periodSize) % periodSize);
        
        // 1. Count shared tones (using epsilon for float safety)
        let sharedTones = 0;
        const EPSILON = 0.05; // 5 cents tolerance
        
        for (const spc of sourcePcs) {
            for (const tpc of targetPcs) {
                const diff = Math.abs(spc - tpc);
                // Account for wrap-around (e.g. 0.0 and 19.019 are the same pitch class)
                if (diff < EPSILON || Math.abs(diff - periodSize) < EPSILON) {
                    sharedTones++;
                    break;
                }
            }
        }
        
        // 2. Least Squares Distance for voice leading smoothness
        let lsDistance = 0;
        const sortedSource = [...sourcePcs].sort((a, b) => a - b);
        const sortedTarget = [...targetPcs].sort((a, b) => a - b);
        
        for (let i = 0; i < Math.min(sortedSource.length, sortedTarget.length); i++) {
            let diff = Math.abs(sortedSource[i] - sortedTarget[i]);
            if (diff > periodSize / 2) diff = periodSize - diff; // Shortest path around the period circle
            lsDistance += (diff * diff);
        }
        
        // If they share at least 1 note, it is a valid structural pivot
        if (sharedTones >= 1) {
            scoredAlternatives.push({
                symbol: targetSymbol,
                shared: sharedTones,
                distance: lsDistance
            });
        }
    }
    
    // Sort by shared tones (descending), then by lowest distance (ascending)
    return scoredAlternatives
        .sort((a, b) => {
            if (b.shared !== a.shared) return b.shared - a.shared;
            return a.distance - b.distance;
        })
        .map(alt => alt.symbol)
        .slice(0, 12);
}

/**
 * Suggests microtonal chords that strongly pull toward the target chord.
 * In microtonal space, we maximize Least Squares Distance to create intense resolution movement.
 */
export function getMicrotonalTurnarounds(targetSymbol, baseKey, mode) {
    // Turnarounds require a high degree of tension/movement into the target chord.
    // We can piggy-back off the alternatives logic, but invert the distance scoring to find chords furthest away structurally!
    const alts = getMicrotonalAlternatives(targetSymbol, baseKey, mode);
    return alts.reverse().slice(0, 3);
}