import { getHarmonicProfile } from './theory.js';
import { KEY_NAMES } from './ui.js';

// --- AI Prompt Generation ---
export function generateAIPrompt(progression, bpm, keyName, mode = 'major') {
    if (!progression || progression.length === 0) return "No progression defined.";

    let progressionStringElements = [];
    let currentKey = progression[0].key;

    let hasBorrowed = false;
    let hasExtensions = false;
    let hasAltered = false;
    let totalTension = 0;

    progression.forEach(chord => {
        if (chord.key !== currentKey) {
            const newKeyName = KEY_NAMES[chord.key] || 'Unknown';
            progressionStringElements.push(`[Modulates to ${newKeyName}]`);
            currentKey = chord.key;
        }
        progressionStringElements.push(chord.symbol);

        const profile = getHarmonicProfile(chord.symbol, mode, chord.key);
        totalTension += profile.tension;
        if (profile.isBorrowed) hasBorrowed = true;
        if (/(9|11|13|maj7)/.test(chord.symbol)) hasExtensions = true;
        if (/(#9|b13|aug|dim)/.test(chord.symbol)) hasAltered = true;
    });

    const progressionString = progressionStringElements.join(' - ');

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