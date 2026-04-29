import { saveState, loadState } from './storage.js?v=3';
import { calculateLoopBounds } from './stateUtils.js?v=3';
import { initChordPattern } from './patternUtils.js?v=3';

export const state = {
    currentProgression: [],
    temporarySwaps: {}, // Map of index -> temporary chord string (e.g. { 1: 'vi' })
    history: [], // Stores progression snapshots for Undo
    baseKey: 60, // C4
    bpm: 120,
    isLooping: true,
    useVoiceLeading: true,
    loopStart: 0,
    loopEnd: 0,
    theme: 'light',
    mode: 'major'
};

// Resolves the progression with any active temporary swaps applied
export function getActiveProgression() {
    return state.currentProgression.map((chord, index) => {
        if (state.temporarySwaps[index] !== undefined) {
            // Safely merge the underlying rhythm pattern onto the temporary swapped chord
            return { ...state.temporarySwaps[index], pattern: chord.pattern, duration: state.temporarySwaps[index].duration || chord.duration || 2 };
        }
        return chord;
    });
}

export function applyLoopBounds() {
    const bounds = calculateLoopBounds(state.currentProgression.length, state.loopStart, state.loopEnd);
    state.loopStart = bounds.start;
    state.loopEnd = bounds.end;
}

// --- History & Undo ---
export function saveHistoryState() {
    state.history.push({
        currentProgression: JSON.parse(JSON.stringify(state.currentProgression)),
        temporarySwaps: JSON.parse(JSON.stringify(state.temporarySwaps)),
        loopStart: state.loopStart,
        loopEnd: state.loopEnd
    });
    if (state.history.length > 50) state.history.shift(); // Max 50 undos
}

export function undoState() {
    if (state.history.length === 0) return false;
    const previousState = state.history.pop();
    state.currentProgression = previousState.currentProgression;
    state.temporarySwaps = previousState.temporarySwaps;
    state.loopStart = previousState.loopStart;
    state.loopEnd = previousState.loopEnd;
    applyLoopBounds();
    persistAppState();
    return true;
}

export function persistAppState() {
    saveState(state);
}

export function loadAndApplyInitialState() {
    const savedState = loadState();
    if (savedState) {
        // 1. Sanitize Primitives
        if (typeof savedState.baseKey === 'number') state.baseKey = Math.max(0, Math.min(127, savedState.baseKey));
        
        if (savedState.bpm !== undefined) {
            const parsedBpm = parseInt(savedState.bpm, 10);
            if (!isNaN(parsedBpm)) state.bpm = Math.max(40, Math.min(300, parsedBpm));
        }
        
        state.isLooping = Boolean(savedState.isLooping ?? savedState.loop ?? state.isLooping);
        state.useVoiceLeading = Boolean(savedState.useVoiceLeading ?? savedState.voiceLeading ?? state.useVoiceLeading);
        state.theme = savedState.theme === 'dark' ? 'dark' : 'light';
        state.mode = savedState.mode === 'minor' ? 'minor' : 'major';
        
        if (typeof savedState.loopStart === 'number') state.loopStart = Math.max(0, savedState.loopStart);
        if (typeof savedState.loopEnd === 'number') state.loopEnd = Math.max(0, savedState.loopEnd);

        // 2. Sanitize Progression Array (Prevent XSS and malformed structures)
        if (Array.isArray(savedState.currentProgression)) {
            state.currentProgression = savedState.currentProgression.map(item => {
                const chordObj = typeof item === 'string' ? { symbol: item, key: state.baseKey } : { ...item };
                
                // Escape HTML/quotes in symbol to prevent DOM injection
                chordObj.symbol = typeof chordObj.symbol === 'string' ? chordObj.symbol.replace(/[<>"]/g, '').substring(0, 20) : 'I';
                chordObj.key = typeof chordObj.key === 'number' ? Math.max(0, Math.min(127, chordObj.key)) : state.baseKey;
                chordObj.duration = typeof chordObj.duration !== 'undefined' ? Math.max(0.25, Number(chordObj.duration) || 2) : 2;

                if (!chordObj.pattern || !Array.isArray(chordObj.pattern.instances)) {
                    chordObj.pattern = initChordPattern();
                } else {
                    // Sanitize rhythm pattern instances
                    chordObj.pattern.instances = chordObj.pattern.instances.map(inst => ({
                        ...inst,
                        // Strip quotes/brackets from IDs to prevent DOM attribute breakout
                        id: typeof inst.id === 'string' ? inst.id.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 10),
                        startTime: typeof inst.startTime !== 'undefined' ? Number(inst.startTime) : 0,
                        duration: typeof inst.duration !== 'undefined' ? Number(inst.duration) : 1,
                        isSelected: Boolean(inst.isSelected)
                    }));
                }
                return chordObj;
            });
        }

        // 3. Sanitize Temporary Swaps
        if (savedState.temporarySwaps && typeof savedState.temporarySwaps === 'object') {
            state.temporarySwaps = {};
            Object.entries(savedState.temporarySwaps).forEach(([k, v]) => {
                const idx = parseInt(k, 10);
                if (!isNaN(idx) && v && typeof v.symbol === 'string') {
                    state.temporarySwaps[idx] = {
                        symbol: v.symbol.replace(/[<>"]/g, '').substring(0, 20),
                        key: typeof v.key === 'number' ? Math.max(0, Math.min(127, v.key)) : state.baseKey,
                        duration: typeof v.duration !== 'undefined' ? Math.max(0.25, Number(v.duration) || 2) : 2
                    };
                }
            });
        }
    }
    applyLoopBounds();
}