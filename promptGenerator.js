import { getHarmonicProfile } from './theory.js';

// --- AI Prompt Generation ---
export function generateAIPrompt(progression, bpm, keyName, mode = 'major') {
    if (!progression || progression.length === 0) return "No progression defined.";

    const symbols = progression.map(c => c.symbol);
    const progressionString = symbols.join(' - ');
    
    let hasBorrowed = false;
    let hasExtensions = false;
    let hasAltered = false;
    let totalTension = 0;

    progression.forEach(chord => {
        const profile = getHarmonicProfile(chord.symbol, mode, chord.key);
        totalTension += profile.tension;
        if (profile.isBorrowed) hasBorrowed = true;
        if (/(9|11|13|maj7)/.test(chord.symbol)) hasExtensions = true;
        if (/(#9|b13|aug|dim)/.test(chord.symbol)) hasAltered = true;
    });

    const avgTension = totalTension / progression.length;
    let mood = "balanced with a standard emotional pull";
    if (avgTension < -0.2) mood = "stable, grounded, and consonant";
    else if (avgTension > 0.3) mood = "dramatic, tense, and emotionally complex";

    let features = [];
    if (hasBorrowed) features.push("modal mixture (borrowed chords)");
    if (hasExtensions) features.push("lush extended voicings (7ths, 9ths, etc.)");
    if (hasAltered) features.push("altered/jazzy tensions");

    let featureString = features.length > 0 
        ? ` The harmony features ${features.join(', ')}.` 
        : ` The harmony relies on strong diatonic movement.`;

    return `Tempo: ${bpm} BPM\nKey: ${keyName}\nChord Progression: ${progressionString}\n\nMusical Characteristics: This sequence is ${mood}.${featureString} Focus on smooth voice-leading and clear harmonic transitions.`;
}