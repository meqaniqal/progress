import { getPlayableNotes } from '../voiceLeading.js';

const progression = [
    { symbol: 'I', key: 60, inversionOffset: 0 },
    { symbol: 'I', key: 60, inversionOffset: 1 },
    { symbol: 'I', key: 60, inversionOffset: -1 },
    { symbol: 'I', key: 60, inversionOffset: 2 },
    { symbol: 'I', key: 60, inversionOffset: -2 }
];

const notes = getPlayableNotes(progression, { useVoiceLeading: true });
console.log("Playable Notes:", notes);
