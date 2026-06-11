import { getPlayableNotes } from '../voiceLeading.js';

const mockState = {
    baseKey: 60,
    divisions: 12,
    useVoiceLeading: true,
    currentProgression: [
        { symbol: 'I', key: 60 },
        { symbol: 'II', key: 60 }
    ]
};

console.log(getPlayableNotes(mockState.currentProgression, mockState));
