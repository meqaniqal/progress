import { getPlayableNotes } from './voiceLeading.js';
const prog = [
    { symbol: 'I', key: 60, duration: 4 },
    { symbol: 'ii', key: 60, duration: 4 },
    { symbol: 'v°', key: 60, duration: 4 },
    { symbol: 'I', key: 60, duration: 4 },
    { symbol: 'ii', key: 60, duration: 4 },
    { symbol: 'IIsus4', key: 60, duration: 4 },
    { symbol: 'III7', key: 67, duration: 4 },
    { symbol: 'I7', key: 60, duration: 4 },
    { symbol: 'IVmaj7', key: 60, duration: 4 },
    { symbol: 'i7', key: 60, duration: 4 }
];
const state = { baseKey: 60, divisions: 12, globalVoicing: 'auto' };
const notes = getPlayableNotes(prog, state);
notes.forEach((n, i) => {
    console.log(`Slot ${i}: ${prog[i].symbol} -> [${n.join(', ')}]`);
});
