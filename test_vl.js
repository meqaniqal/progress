import { getPlayableNotes } from './voiceLeading.js';
const prog = [
    { symbol: 'I', key: 60, duration: 4 },
    { symbol: 'ii', key: 60, duration: 4 },
    { symbol: 'v°', key: 60, duration: 4 }
];
const state = { baseKey: 60, divisions: 12, globalVoicing: 'auto' };
console.log('playable notes:', getPlayableNotes(prog, state));
